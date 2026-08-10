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

PACK_TMP="$TMP/pack"
mkdir -p "$PACK_TMP/tests"
cp "$ROOT/pack-tests.sh" "$PACK_TMP/"
cp "$ROOT/database-provisioning.yaml" "$PACK_TMP/"
cp "$TESTS_DIR/lib.sh" "$PACK_TMP/tests/"
cp "$TESTS_DIR/uri-reported.sh" "$PACK_TMP/tests/" 2>/dev/null || true

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
