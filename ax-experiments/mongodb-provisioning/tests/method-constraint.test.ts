import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  runMain,
  setupFakeAxRunQuery,
  teardownFakeAxRunQuery,
  uriEvents,
  variant,
  withEnv,
} from "./harness.js";
import { main } from "./method-constraint.js";

before(setupFakeAxRunQuery);
after(teardownFakeAxRunQuery);

describe("method-constraint", () => {
  test("atlas-cli-cloud rejects localhost", () => {
    assert.equal(
      runMain(main, uriEvents("mongodb://localhost:27017"), "atlas-cli-cloud"),
      1,
    );
  });

  test("atlas-ephemeral rejects localhost", () => {
    assert.equal(
      runMain(main, uriEvents("mongodb://127.0.0.1:27017"), "atlas-ephemeral"),
      1,
    );
  });

  test("atlas-cli-cloud accepts mongodb+srv cloud URI", () => {
    assert.equal(
      runMain(
        main,
        uriEvents("mongodb+srv://cluster0.abc.mongodb.net"),
        "atlas-cli-cloud",
      ),
      0,
    );
  });

  test("atlas-ephemeral accepts standard mongodb.net URI", () => {
    assert.equal(
      runMain(
        main,
        uriEvents("mongodb://cluster0-shard-00-00.abc.mongodb.net:27017"),
        "atlas-ephemeral",
      ),
      0,
    );
  });

  test("docker does not fail on localhost", () => {
    assert.equal(runMain(main, uriEvents("mongodb://localhost:27017"), "docker"), 0);
  });

  test("apt does not fail on localhost", () => {
    assert.equal(runMain(main, uriEvents("mongodb://localhost:27017"), "apt"), 0);
  });

  test("local-package-manager does not fail on localhost", () => {
    assert.equal(
      runMain(main, uriEvents("mongodb://localhost:27017"), "local-package-manager"),
      0,
    );
  });

  test("local-package-manager survives an HTML NDJSON dump", () => {
    const events = [
      "<!DOCTYPE html><html><body class='leafygreen-ui-1'>docs</body></html>",
      JSON.stringify({ payload: "mongodb://127.0.0.1:27017" }),
    ].join("\n");
    assert.equal(runMain(main, events, "local-package-manager"), 0);
  });

  test("atlas-cli-local does not fail on localhost", () => {
    assert.equal(
      runMain(main, uriEvents("mongodb://localhost:27017"), "atlas-cli-local"),
      0,
    );
  });

  test("cloud-bound prompt with no URI fails", () => {
    assert.equal(
      runMain(main, uriEvents("provisioning failed"), "atlas-cli-cloud"),
      1,
    );
  });

  test("missing ax-run-query fails closed for unconstrained prompts", () => {
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
