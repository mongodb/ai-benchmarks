import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import {
  runMain,
  setupFakeAxRunQuery,
  teardownFakeAxRunQuery,
  testFixtureDir,
  uriEvents,
  variant,
  withEnv,
} from "./harness.js";
import { main } from "./uri-reported.js";

before(setupFakeAxRunQuery);
after(teardownFakeAxRunQuery);

describe("uri-reported", () => {
  test("MongoDB URI is found in transcript events", () => {
    assert.equal(runMain(main, uriEvents("Done: mongodb://localhost:27017"), "docker"), 0);
  });

  test("mongodb+srv URI is accepted", () => {
    assert.equal(
      runMain(
        main,
        uriEvents("Done: mongodb+srv://cluster0.abc.mongodb.net"),
        "atlas-cli-cloud",
      ),
      0,
    );
  });

  test("missing URI is rejected", () => {
    assert.equal(runMain(main, uriEvents("Done, database is ready"), "docker"), 1);
  });

  test("PostgreSQL URI is rejected", () => {
    assert.equal(
      runMain(main, uriEvents("Done: postgresql://localhost:5432/postgres"), "docker"),
      1,
    );
  });

  test("URI in a JSON message payload is accepted", () => {
    assert.equal(
      runMain(
        main,
        `${JSON.stringify({ payload: JSON.stringify({ kind: "message", text: "mongodb://localhost:27017" }) })}\n`,
        "apt",
      ),
      0,
    );
  });

  test("prompt_id from run context wins over variant id", () => {
    const contextPath = join(testFixtureDir(), "run-context.json");
    writeFileSync(contextPath, JSON.stringify({ prompt_id: "docker" }));
    const status = withEnv(
      {
        AX_RUN_ID: "test-run",
        AX_VARIANT_ID: variant("atlas-cli-cloud"),
        AX_RUN_CONTEXT_PATH: contextPath,
        AX_TEST_EVENTS: uriEvents("mongodb://localhost:27017"),
      },
      main,
    );
    assert.equal(status, 0);
  });

  test("skips invalid NDJSON and still finds a URI in a later message", () => {
    const events = [
      "<!DOCTYPE html><html><body class='leafygreen-ui-1'>docs</body></html>",
      JSON.stringify({ payload: "Connection URI: mongodb://127.0.0.1:27017" }),
    ].join("\n");
    assert.equal(runMain(main, events, "local-package-manager"), 0);
  });

  test("URI in an unknown agent_message payload is found", () => {
    const payload = JSON.stringify({
      kind: "unknown",
      original_kind: "event_msg:agent_message",
      value: {
        payload: {
          message:
            "MongoDB is running.\n\nConnection URI:\n\n```text\nmongodb://127.0.0.1:27017\n```",
        },
      },
    });
    assert.equal(
      runMain(main, `${JSON.stringify({ payload })}\n`, "local-package-manager"),
      0,
    );
  });

  test("HTML documentation dumps are not treated as a reported URI", () => {
    const html = `<!DOCTYPE html><html><body class="leafygreen-ui-1">Example mongodb://localhost:27017 in docs</body></html>`;
    assert.equal(runMain(main, uriEvents(html), "local-package-manager"), 1);
  });

  test("queries message events with a raised row limit", () => {
    const argsPath = join(testFixtureDir(), "query-args.txt");
    const status = runMain(main, uriEvents("mongodb://localhost:27017"), "docker", {
      AX_TEST_QUERY_ARGS: argsPath,
    });
    const args = readFileSync(argsPath, "utf8");
    assert.equal(status, 0);
    assert.match(args, /kind = 'message'/);
    assert.match(args, /tool_call/);
    assert.match(args, /--limit/);
    assert.match(args, /10000/);
  });

  test("missing run-scoped query access fails closed", () => {
    const status = withEnv(
      {
        AX_RUN_ID: undefined,
        AX_RUN_CONTEXT_PATH: undefined,
        AX_VARIANT_ID: variant("docker"),
        AX_TEST_EVENTS: uriEvents("mongodb://localhost:27017"),
      },
      main,
    );
    assert.equal(status, 1);
  });
});
