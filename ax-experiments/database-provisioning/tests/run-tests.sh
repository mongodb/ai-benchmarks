#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TESTS_DIR="$ROOT/tests"
FAILURES=0

fail() {
  echo "FAIL: $*" >&2
  FAILURES=$((FAILURES + 1))
}

pass() {
  echo "PASS: $*"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cat >"$TMP/bin/ax-run-query" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" > "${AX_TEST_QUERY_ARGS:-/dev/null}"
printf '%s\n' "${AX_TEST_EVENTS:-}"
SH
chmod +x "$TMP/bin/ax-run-query"

run_uri_test() {
  local events="$1"
  local variant="$2"
  AX_RUN_ID=test-run \
    AX_VARIANT_ID="$variant" \
    AX_TEST_EVENTS="$events" \
    PATH="$TMP/bin:$PATH" \
    bash "$TESTS_DIR/uri-reported.sh" >/dev/null 2>&1
}

expect_uri_pass() {
  local name="$1"
  local events="$2"
  local variant="$3"
  if run_uri_test "$events" "$variant"; then
    pass "$name"
  else
    fail "$name"
  fi
}

expect_uri_fail() {
  local name="$1"
  local events="$2"
  local variant="$3"
  if run_uri_test "$events" "$variant"; then
    fail "$name (unexpected pass)"
  else
    pass "$name"
  fi
}

expect_uri_pass \
  "MongoDB URI is found in NDJSON transcript events" \
  $'{"payload":"starting"}\n{"payload":"Done: mongodb://localhost:27017"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_uri_pass \
  "PostgreSQL URI is found in transcript events" \
  '{"payload":"Done: postgresql://localhost:5432/postgres"}' \
  "codex::openai-gpt-5.6-luna::postgresql::codex-luna"
expect_uri_pass \
  "SQLite path is found in transcript events" \
  '{"payload":"Done: file:/workspace/app.sqlite"}' \
  "codex::openai-gpt-5.6-luna::sqlite::codex-luna"
expect_uri_pass \
  "SQLite URI with an absolute database path is accepted" \
  '{"payload":"Connection URI: sqlite:////workspace/data/app.db"}' \
  "codex::openai-gpt-5.6-luna::sqlite::codex-luna"
expect_uri_pass \
  "SQLite URI inside Markdown code is accepted" \
  '{"payload":"Connection URI: `sqlite:////workspace/data/app.db`"}' \
  "cursor::xai-grok-4.5::sqlite::cursor-grok"
expect_uri_pass \
  "Loopback libSQL URI is accepted for SQLite" \
  '{"payload":"Connection URI: libsql://127.0.0.1:8080"}' \
  "cursor::xai-grok-4.5::sqlite::cursor-grok"
expect_uri_pass \
  "Loopback libSQL HTTP URI is accepted for SQLite" \
  '{"payload":"Connection URI: http://127.0.0.1:8080"}' \
  "codex::openai-gpt-5.6-terra::sqlite::codex-terra"
expect_uri_pass \
  "Loopback libSQL WebSocket URI is accepted for SQLite" \
  '{"payload":"Connection URI: ws://localhost:8080"}' \
  "codex::openai-gpt-5.6-terra::sqlite::codex-terra"
expect_uri_fail \
  "Missing URI is rejected" \
  '{"payload":"Done, database is ready"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_uri_fail \
  "Wrong database URI is rejected" \
  '{"payload":"Done: postgresql://localhost:5432/postgres"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_uri_fail \
  "Generic workspace paths are not SQLite connection URIs" \
  '{"payload":"Created /workspace/package.json and finished setup"}' \
  "codex::openai-gpt-5.6-luna::sqlite::codex-luna"
expect_uri_fail \
  "SQLite-looking source paths are not database URIs" \
  '{"payload":"Read file:/workspace/schema.sqlite.ts during setup"}' \
  "codex::openai-gpt-5.6-luna::sqlite::codex-luna"
expect_uri_fail \
  "Remote libSQL URIs are not accepted" \
  '{"payload":"Connection URI: libsql://database.example.com:8080"}' \
  "cursor::xai-grok-4.5::sqlite::cursor-grok"
expect_uri_fail \
  "Remote HTTP URIs are not accepted for SQLite" \
  '{"payload":"Connection URI: http://database.example.com:8080"}' \
  "codex::openai-gpt-5.6-terra::sqlite::codex-terra"
expect_uri_pass \
  "PostgreSQL URI in a JSON message payload is accepted" \
  '{"payload":"{\"kind\":\"message\",\"text\":\"postgresql://localhost:5432/postgres\"}"}' \
  "claude::anthropic-claude-sonnet-5::postgresql::claude-sonnet"

QUERY_ARGS="$TMP/query-args.txt"
if AX_RUN_ID=test-run \
  AX_VARIANT_ID="claude::anthropic-claude-sonnet-5::postgresql::claude-sonnet" \
  AX_TEST_EVENTS='{"payload":"postgresql://localhost:5432/postgres"}' \
  AX_TEST_QUERY_ARGS="$QUERY_ARGS" \
  PATH="$TMP/bin:$PATH" \
  bash "$TESTS_DIR/uri-reported.sh" >/dev/null 2>&1 \
  && grep -q "kind = 'message'" "$QUERY_ARGS" \
  && grep -q -- '--limit' "$QUERY_ARGS" \
  && grep -q '10000' "$QUERY_ARGS"
then
  pass "uri-reported queries message events with a raised row limit"
else
  fail "uri-reported queries message events with a raised row limit"
fi

printf '%s\n' '{"prompt_id":"sqlite"}' >"$TMP/run-context.json"
if AX_RUN_ID=test-run \
  AX_RUN_CONTEXT_PATH="$TMP/run-context.json" \
  AX_VARIANT_ID="misleading-mongodb-variant" \
  AX_TEST_EVENTS='{"payload":"Connection URI: file:/workspace/app.sqlite"}' \
  PATH="$TMP/bin:$PATH" \
  bash "$TESTS_DIR/uri-reported.sh" >/dev/null 2>&1
then
  pass "Database detection uses documented run-context prompt_id"
else
  fail "Database detection uses documented run-context prompt_id"
fi

run_connection_test() {
  local rows="$1"
  local variant="$2"
  local events
  events="$(
    printf '%s\n' "$rows" | jq -s -c '
      to_entries[]
      | .key as $i
      | .value
      | {
        source_seq: (.source_seq // ($i + 1)),
        tool_call_id: (.tool_call_id // ("row-" + (($i + 1) | tostring))),
        payload: (
          {
            kind: "tool_call",
            status: (.status // ""),
            input: (
              if (.raw_input // "") == "" then
                {}
              else
                { command: .raw_input }
              end
            ),
            output: (
              if (.raw_output // "") == "" then
                {}
              else
                {
                  aggregated_output: .raw_output,
                  exit_code: (
                    if (.status // "") == "failed" then 1 else 0 end
                  )
                }
              end
            )
          }
          | tojson
        )
      }
    '
  )"
  AX_RUN_ID=test-run \
    AX_VARIANT_ID="$variant" \
    AX_TEST_EVENTS="$events" \
    PATH="$TMP/bin:$PATH" \
    bash "$TESTS_DIR/connection-verified-in-agent.sh" >/dev/null 2>&1
}

expect_connection_pass() {
  local name="$1"
  local rows="$2"
  local variant="$3"
  if run_connection_test "$rows" "$variant"; then
    pass "$name"
  else
    fail "$name"
  fi
}

expect_connection_fail() {
  local name="$1"
  local rows="$2"
  local variant="$3"
  if run_connection_test "$rows" "$variant"; then
    fail "$name (unexpected pass)"
  else
    pass "$name"
  fi
}

expect_connection_pass \
  "MongoDB find operation is accepted as connection evidence" \
  '{"status":"completed","raw_input":"mongosh mongodb://127.0.0.1:27017 --eval db.widgets.findOne()","raw_output":"{ _id: 1, ready: true }"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_connection_pass \
  "MongoDB driver insert operation is accepted as connection evidence" \
  '{"status":"completed","raw_input":"const client = new MongoClient(uri); await client.connect(); await client.db(\"app\").collection(\"checks\").insertOne({ok:true})","raw_output":"acknowledged=true"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_connection_pass \
  "MongoDB shell metadata operation is accepted as connection evidence" \
  '{"status":"completed","raw_input":"mongosh mongodb://127.0.0.1:27017 --eval db.version()","raw_output":"8.0.12"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_connection_pass \
  "PostgreSQL query is accepted as connection evidence" \
  '{"status":"completed","raw_input":"psql postgresql://app@127.0.0.1:5432/app -c SELECT 1","raw_output":"?column? | 1"}' \
  "codex::openai-gpt-5.6-luna::postgresql::codex-luna"
expect_connection_pass \
  "SQLite driver operation is accepted as connection evidence" \
  '{"status":"completed","raw_input":"import sqlite3; db = sqlite3.connect(\"/workspace/app.db\"); db.execute(\"PRAGMA integrity_check\")","raw_output":"ok"}' \
  "codex::openai-gpt-5.6-luna::sqlite::codex-luna"
expect_connection_pass \
  "SQLite shell metadata operation is accepted as connection evidence" \
  '{"status":"completed","raw_input":"sqlite3 /workspace/app.db .tables","raw_output":"checks"}' \
  "codex::openai-gpt-5.6-luna::sqlite::codex-luna"
expect_connection_fail \
  "Failed MongoDB operation is rejected despite success-looking output" \
  '{"status":"failed","raw_input":"mongosh mongodb://127.0.0.1:27017 --eval db.runCommand({ping:1})","raw_output":"{ ok: 1 }"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_connection_fail \
  "MongoDB connection error is rejected" \
  '{"status":"completed","raw_input":"mongosh mongodb://127.0.0.1:27017 --eval db.widgets.findOne()","raw_output":"MongoNetworkError: connect ECONNREFUSED"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_connection_fail \
  "PostgreSQL readiness-only evidence is not application-level verification" \
  '{"status":"completed","raw_input":"pg_isready -h 127.0.0.1 -p 5432","raw_output":"accepting connections"}' \
  "codex::openai-gpt-5.6-luna::postgresql::codex-luna"
expect_connection_fail \
  "SQLite installation output is not mistaken for a SQL operation" \
  '{"status":"completed","raw_input":"apt-get install sqlite3","raw_output":"update package metadata; sqlite3 installed"}' \
  "codex::openai-gpt-5.6-luna::sqlite::codex-luna"
expect_connection_fail \
  "Wrong database client evidence is rejected" \
  '{"status":"completed","raw_input":"psql postgresql://localhost/app -c SELECT 1","raw_output":"1"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_connection_fail \
  "Assistant self-attestation in a shell command is rejected" \
  '{"status":"completed","raw_input":"echo MongoDB connection verified successfully","raw_output":"MongoDB connection verified successfully"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_connection_fail \
  "Probe before the latest restart is rejected" \
  $'{"status":"completed","raw_input":"mongosh mongodb://localhost --eval db.widgets.findOne()","raw_output":"{ _id: 1 }"}\n{"status":"completed","raw_input":"mongod --dbpath /workspace/data --fork","raw_output":"started"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_connection_fail \
  "Failed application probe after success invalidates earlier evidence" \
  $'{"status":"completed","raw_input":"psql postgresql://localhost/app -c SELECT 1","raw_output":"1"}\n{"status":"failed","raw_input":"psql postgresql://localhost/app -c SELECT 1","raw_output":"connection refused"}' \
  "codex::openai-gpt-5.6-luna::postgresql::codex-luna"
expect_connection_pass \
  "Split Claude lifecycle rows still count as a completed MongoDB operation" \
  $'{"tool_call_id":"claude-mongo","source_seq":1,"status":"in_progress","raw_input":"docker exec mongodb mongosh --eval db.runCommand({ping:1})"}\n{"tool_call_id":"claude-mongo","source_seq":2,"status":"completed","raw_output":"{ ok: 1 }"}\n{"tool_call_id":"claude-mongo","source_seq":3,"status":"in_progress","raw_input":"docker exec mongodb mongosh --eval db.runCommand({ping:1})"}' \
  "claude::anthropic-claude-sonnet-5::mongodb::claude-sonnet"
expect_connection_pass \
  "libSQL HTTP pipeline SQL is accepted as SQLite connection evidence" \
  '{"status":"completed","raw_input":"curl --fail --request POST http://127.0.0.1:8080/v2/pipeline --data {\"requests\":[{\"type\":\"execute\",\"stmt\":{\"sql\":\"SELECT 1 AS ready\"}}]}","raw_output":"{\"results\":[{\"response\":{\"type\":\"execute\",\"result\":{\"cols\":[{\"name\":\"ready\"}],\"rows\":[[{\"type\":\"Integer\",\"value\":\"1\"}]]}}}]}"}' \
  "codex::openai-gpt-5.6-terra::sqlite::codex-terra"

if env -u AX_RUN_ID -u AX_RUN_CONTEXT_PATH \
  AX_VARIANT_ID="codex::openai-gpt-5.6-luna::mongodb::codex-luna" \
  AX_TEST_EVENTS='{"payload":"Done: mongodb://localhost:27017"}' \
  PATH="$TMP/bin:$PATH" \
  bash "$TESTS_DIR/uri-reported.sh" >/dev/null 2>&1
then
  fail "Missing run-scoped query access fails closed (unexpected pass)"
else
  pass "Missing run-scoped query access fails closed"
fi

if python3 - "$ROOT/database-provisioning.yaml" <<'PY'
from pathlib import Path
import sys

text = Path(sys.argv[1]).read_text()
required = (
    "id: mongodb",
    "id: postgresql",
    "id: sqlite",
)
forbidden = (
    "environments:",
    "name: stock",
    "name: docker-host",
    "dockerd --iptables=false --bridge=none",
    "/usr/local/bin/docker",
    "Docker bridge networking is unavailable in this sandbox.",
    "Retry with --network host; published ports are unsupported.",
    "name: docker-published-port",
    "docker-host-network",
)
raise SystemExit(
    0
    if all(item in text for item in required)
    and not any(item in text for item in forbidden)
    else 1
)
PY
then
  pass "Experiment has no stock/docker-host environment axis"
else
  fail "Experiment has no stock/docker-host environment axis"
fi

PACK_TMP="$TMP/pack"
mkdir -p "$PACK_TMP/tests"
cp "$ROOT/pack-tests.sh" "$PACK_TMP/"
cp "$ROOT/database-provisioning.yaml" "$PACK_TMP/"
cp "$TESTS_DIR/lib.sh" "$PACK_TMP/tests/"
cp "$TESTS_DIR/transcript-helpers.sh" "$PACK_TMP/tests/"
cp "$TESTS_DIR/tool-call-helpers.sh" "$PACK_TMP/tests/"
cp "$TESTS_DIR/uri-reported.sh" "$PACK_TMP/tests/" 2>/dev/null || true
cp "$TESTS_DIR/connection-verified-in-agent.sh" "$PACK_TMP/tests/" 2>/dev/null || true

chmod 0644 "$PACK_TMP/database-provisioning.yaml"
if bash "$PACK_TMP/pack-tests.sh" >/dev/null 2>&1; then
  mode="$(stat -f '%Lp' "$PACK_TMP/database-provisioning.yaml" 2>/dev/null || stat -c '%a' "$PACK_TMP/database-provisioning.yaml")"
  if [[ "$mode" == "644" ]]; then
    pass "Packer preserves YAML permissions"
  else
    fail "Packer preserves YAML permissions (got $mode)"
  fi
else
  fail "Packer succeeds on synchronized source"
fi
if awk '
  $0 == "      # BEGIN PACKED:connection-verified-in-agent" { found = 1 }
  END { exit !found }
' "$PACK_TMP/database-provisioning.yaml"; then
  pass "Packer includes connection verification test"
else
  fail "Packer includes connection verification test"
fi
if awk '/[[:blank:]]+$/ { found = 1 } END { exit found }' \
  "$PACK_TMP/database-provisioning.yaml"; then
  pass "Packer does not emit trailing whitespace"
else
  fail "Packer does not emit trailing whitespace"
fi
if awk '/BASH_SOURCE/ { found = 1 } END { exit found }' \
  "$PACK_TMP/database-provisioning.yaml"; then
  pass "Packed tests do not depend on BASH_SOURCE"
else
  fail "Packed tests do not depend on BASH_SOURCE"
fi
if python3 - "$PACK_TMP/database-provisioning.yaml" <<'PY'
from pathlib import Path
import sys

text = Path(sys.argv[1]).read_text()

def packed_body(name: str) -> str:
    begin = f"# BEGIN PACKED:{name}"
    end = f"# END PACKED:{name}"
    return text.split(begin, 1)[1].split(end, 1)[0]

uri_body = packed_body("uri-reported")
connection_body = packed_body("connection-verified-in-agent")
raise SystemExit(
    0
    if "tool_call_rows()" not in uri_body
    and "transcript_payloads()" not in connection_body
    and "FROM tool_calls" not in connection_body
    and "kind = 'tool_call'" in connection_body
    and "argMax(payload, source_seq)" not in connection_body
    and "group_by(.tool_call_id)" in connection_body
    and "kind = 'message'" in uri_body
    and "--limit" in uri_body
    and "10000" in uri_body
    else 1
)
PY
then
  pass "Packer includes only helpers required by each test"
else
  fail "Packer includes only helpers required by each test"
fi

python3 - "$PACK_TMP/database-provisioning.yaml" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
marker = "# BEGIN PACKED:uri-reported"
if marker in text:
    text = text.replace(marker, marker + "\n      echo stale-packed-body", 1)
else:
    text += "\n# stale-packed-body\n"
path.write_text(text)
PY

before_hash="$(shasum -a 256 "$PACK_TMP/database-provisioning.yaml" | awk '{print $1}')"
if bash "$PACK_TMP/pack-tests.sh" --check >/dev/null 2>&1; then
  fail "Packer --check detects generated-source drift"
else
  after_hash="$(shasum -a 256 "$PACK_TMP/database-provisioning.yaml" | awk '{print $1}')"
  if [[ "$before_hash" == "$after_hash" ]]; then
    pass "Packer --check detects drift without mutation"
  else
    fail "Packer --check must not mutate YAML"
  fi
fi

if [[ "$FAILURES" -ne 0 ]]; then
  echo "$FAILURES test(s) failed" >&2
  exit 1
fi

echo "All tests passed"
