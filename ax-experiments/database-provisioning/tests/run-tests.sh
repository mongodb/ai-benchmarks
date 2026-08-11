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
expect_uri_fail \
  "Missing URI is rejected" \
  '{"payload":"Done, database is ready"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"
expect_uri_fail \
  "Wrong database URI is rejected" \
  '{"payload":"Done: postgresql://localhost:5432/postgres"}' \
  "codex::openai-gpt-5.6-luna::mongodb::codex-luna"

run_connection_test() {
  local rows="$1"
  local variant="$2"
  AX_RUN_ID=test-run \
    AX_VARIANT_ID="$variant" \
    AX_TEST_EVENTS="$rows" \
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
    "name: stock",
    "name: docker-host",
    "docker.io docker-cli",
    "dockerd --iptables=false --bridge=none",
    "docker run -d --rm --network host",
)
raise SystemExit(0 if all(item in text for item in required) else 1)
PY
then
  pass "Experiment defines paired stock and host-network Docker environments"
else
  fail "Experiment defines paired stock and host-network Docker environments"
fi

PACK_TMP="$TMP/pack"
mkdir -p "$PACK_TMP/tests"
cp "$ROOT/pack-tests.sh" "$PACK_TMP/"
cp "$ROOT/database-provisioning.yaml" "$PACK_TMP/"
cp "$TESTS_DIR/lib.sh" "$PACK_TMP/tests/"
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
