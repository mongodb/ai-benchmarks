import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { bundle, renderPackedYaml } from "../pack-tests.js";
import {
  setupFakeAxRunQuery,
  teardownFakeAxRunQuery,
  uriEvents,
  variant,
} from "./harness.js";

const ROOT = join(import.meta.dirname, "..");
const YAML_PATH = join(ROOT, "mongodb-provisioning.yaml");

before(setupFakeAxRunQuery);
after(teardownFakeAxRunQuery);

describe("packer", () => {
  test("packed bundle invokes main via footer", () => {
    const js = bundle("tests/uri-reported.ts");
    const result = spawnSync("node", [], {
      encoding: "utf8",
      input: js,
      env: {
        ...process.env,
        PATH: process.env.PATH,
        AX_RUN_ID: "test-run",
        AX_VARIANT_ID: variant("docker"),
        AX_TEST_EVENTS: uriEvents("mongodb://localhost:27017"),
      },
    });
    assert.equal(result.status, 0, result.stderr);
  });

  test("bundle inlines lib helpers without relative requires", () => {
    const js = bundle("tests/uri-reported.ts");
    assert.match(js, /function axRunQuery/);
    assert.match(js, /function transcriptPayloads/);
    assert.match(js, /function extractMongoUris/);
    assert.doesNotMatch(js, /require\("\.\//);
    assert.doesNotMatch(js, /from "\.\//);
    assert.match(js, /process\.exit\(module\.exports\.main\(\)\)/);
  });

  test("packed YAML has no BASH_SOURCE or relative requires", () => {
    const packed = renderPackedYaml(readFileSync(YAML_PATH, "utf8"));
    assert.doesNotMatch(packed, /BASH_SOURCE/);
    assert.doesNotMatch(packed, /require\("\.\//);
    assert.match(packed, /# BEGIN PACKED:uri-reported/);
    assert.match(packed, /# BEGIN PACKED:connection-verified-in-agent/);
    assert.match(packed, /# BEGIN PACKED:method-constraint/);
    assert.match(packed, /AXP_PACKED_JS/);
  });

  test("packer --check detects drift without mutation", () => {
    const original = readFileSync(YAML_PATH, "utf8");
    const packed = renderPackedYaml(original);
    writeFileSync(YAML_PATH, packed);
    try {
      const stale = packed.replace(
        "# BEGIN PACKED:uri-reported",
        "# BEGIN PACKED:uri-reported\n      echo stale-packed-body",
      );
      writeFileSync(YAML_PATH, stale);
      const check = spawnSync("npm", ["run", "pack:check"], {
        cwd: ROOT,
        encoding: "utf8",
      });
      const after = readFileSync(YAML_PATH, "utf8");
      assert.notEqual(check.status, 0);
      assert.equal(after, stale);
    } finally {
      writeFileSync(YAML_PATH, packed);
    }
  });

  test("experiment YAML has no postgres/sqlite prompts or environment axis", () => {
    const text = readFileSync(YAML_PATH, "utf8");
    for (const required of [
      "id: docker",
      "id: atlas-ephemeral",
      "id: atlas-cli-local",
      "id: atlas-cli-cloud",
      "id: apt",
      "name: uri-reported",
      "name: connection-verified-in-agent",
      "name: method-constraint",
    ]) {
      assert.match(text, new RegExp(required));
    }
    assert.doesNotMatch(text, /id: postgresql/);
    assert.doesNotMatch(text, /id: sqlite/);
    assert.doesNotMatch(text, /^environments:/m);
  });
});
