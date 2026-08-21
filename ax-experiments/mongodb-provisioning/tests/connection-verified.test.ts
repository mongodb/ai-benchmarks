import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import {
  connectionEvents,
  runMain,
  setupFakeAxRunQuery,
  teardownFakeAxRunQuery,
} from "./harness.js";
import { main } from "./connection-verified.js";

before(setupFakeAxRunQuery);
after(teardownFakeAxRunQuery);

describe("connection-verified-in-agent", () => {
  test("HTML documentation tool output does not hide a later ping", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "completed",
            raw_input: "curl -sS https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-debian/",
            raw_output: `<!DOCTYPE html><html><body class="leafygreen-ui-1">${"docs ".repeat(50)}</body></html>`,
          },
          {
            status: "completed",
            raw_input: "mongosh mongodb://127.0.0.1:27017 --eval db.runCommand({ping:1})",
            raw_output: "{ ok: 1 }",
          },
        ]),
        "local-package-manager",
      ),
      0,
    );
  });

  test("MongoDB find operation is accepted", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "completed",
            raw_input:
              "mongosh mongodb://127.0.0.1:27017 --eval db.widgets.findOne()",
            raw_output: "{ _id: 1, ready: true }",
          },
        ]),
        "docker",
      ),
      0,
    );
  });

  test("MongoDB driver insert operation is accepted", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "completed",
            raw_input:
              'const client = new MongoClient(uri); await client.connect(); await client.db("app").collection("checks").insertOne({ok:true})',
            raw_output: "acknowledged=true",
          },
        ]),
        "docker",
      ),
      0,
    );
  });

  test("MongoDB shell metadata operation is accepted", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "completed",
            raw_input: "mongosh mongodb://127.0.0.1:27017 --eval db.version()",
            raw_output: "8.0.12",
          },
        ]),
        "docker",
      ),
      0,
    );
  });

  test("npx mongosh ping is accepted when output is ok 1 despite telemetry exit 1", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "completed",
            raw_input: "python3 - <<'PY'\nimport pymongo\nPY",
            raw_output: "no pymongo No module named 'pymongo'",
          },
          {
            status: "failed",
            raw_input:
              "npx --yes mongosh 'mongodb+srv://cluster0.example.mongodb-dev.net/' --quiet --eval 'db.runCommand({ ping: 1 })'",
            raw_output:
              "{ ok: 1 }\nError: Telemetry setup is missing userId or anonymousId",
          },
        ]),
        "atlas-ephemeral-curl",
      ),
      0,
    );
  });

  test("failed MongoDB ping without application ok is rejected", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "failed",
            raw_input:
              "mongosh mongodb://127.0.0.1:27017 --eval db.runCommand({ping:1})",
            raw_output: "MongoServerError: not authorized on admin to execute command",
          },
        ]),
        "docker",
      ),
      1,
    );
  });

  test("ok 1 with a connection error is still rejected", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "failed",
            raw_input:
              "npx mongosh mongodb://127.0.0.1:27017 --eval 'db.runCommand({ ping: 1 })'",
            raw_output: "{ ok: 1 }\nMongoNetworkError: connect ECONNREFUSED",
          },
        ]),
        "docker",
      ),
      1,
    );
  });

  test("JSON ping ok 1 is accepted despite a failed npx exit", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "failed",
            raw_input:
              "npx --yes mongosh --quiet --eval 'JSON.stringify(db.runCommand({ping: 1}))'",
            raw_output:
              '{"ok":1}\nError: Telemetry setup is missing userId or anonymousId',
          },
        ]),
        "atlas-ephemeral-curl",
      ),
      0,
    );
  });

  test("MongoDB connection error is rejected", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "completed",
            raw_input:
              "mongosh mongodb://127.0.0.1:27017 --eval db.widgets.findOne()",
            raw_output: "MongoNetworkError: connect ECONNREFUSED",
          },
        ]),
        "docker",
      ),
      1,
    );
  });

  test("TCP-only evidence is not connection verification", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "completed",
            raw_input: "nc -z 127.0.0.1 27017",
            raw_output: "Connection to 127.0.0.1 27017 port [tcp/*] succeeded",
          },
        ]),
        "docker",
      ),
      1,
    );
  });

  test("assistant self-attestation is rejected", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "completed",
            raw_input: "echo MongoDB connection verified successfully",
            raw_output: "MongoDB connection verified successfully",
          },
        ]),
        "docker",
      ),
      1,
    );
  });

  test("probe before the latest restart is rejected", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "completed",
            raw_input: "mongosh mongodb://localhost --eval db.widgets.findOne()",
            raw_output: "{ _id: 1 }",
          },
          {
            status: "completed",
            raw_input: "mongod --dbpath /workspace/data --fork",
            raw_output: "started",
          },
        ]),
        "docker",
      ),
      1,
    );
  });

  test("failed application probe after success invalidates earlier evidence", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "completed",
            raw_input: "mongosh mongodb://localhost --eval db.widgets.findOne()",
            raw_output: "{ _id: 1 }",
          },
          {
            status: "failed",
            raw_input: "mongosh mongodb://localhost --eval db.widgets.findOne()",
            raw_output: "connection refused",
          },
        ]),
        "docker",
      ),
      1,
    );
  });

  test("split Claude lifecycle rows still count as a completed operation", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            tool_call_id: "claude-mongo",
            source_seq: 1,
            status: "in_progress",
            raw_input: "docker exec mongodb mongosh --eval db.runCommand({ping:1})",
          },
          {
            tool_call_id: "claude-mongo",
            source_seq: 2,
            status: "completed",
            raw_output: "{ ok: 1 }",
          },
          {
            tool_call_id: "claude-mongo",
            source_seq: 3,
            status: "in_progress",
            raw_input: "docker exec mongodb mongosh --eval db.runCommand({ping:1})",
          },
        ]),
        "docker",
      ),
      0,
    );
  });

  test("atlas deployments setup counts as a restart", () => {
    assert.equal(
      runMain(
        main,
        connectionEvents([
          {
            status: "completed",
            raw_input: "mongosh mongodb://localhost --eval db.widgets.findOne()",
            raw_output: "{ _id: 1 }",
          },
          {
            status: "completed",
            raw_input: "atlas deployments setup --type local --force",
            raw_output: "started",
          },
        ]),
        "docker",
      ),
      1,
    );
  });
});
