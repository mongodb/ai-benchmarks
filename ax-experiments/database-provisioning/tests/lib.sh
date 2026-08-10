# Shared helpers for database-provisioning tests.
# Editable source of truth — run ../pack-tests.sh after changes.
# Not staged into the agent workspace.

detect_db() {
  local haystack="${AX_VARIANT_ID:-}"
  if [[ -n "${AX_RUN_CONTEXT_PATH:-}" && -f "$AX_RUN_CONTEXT_PATH" ]]; then
    haystack="$haystack $(jq -r '
      [
        .prompt_id // empty,
        .prompt // empty,
        .promptId // empty,
        .coordinates.prompt // empty,
        .coordinates.prompt_id // empty,
        .variant_id // empty
      ] | map(tostring) | join(" ")
    ' "$AX_RUN_CONTEXT_PATH" 2>/dev/null || true)"
  fi

  case "$haystack" in
    *postgresql*|*postgres*) printf '%s\n' postgresql ;;
    *mongodb*) printf '%s\n' mongodb ;;
    *sqlite*) printf '%s\n' sqlite ;;
    *)
      echo "Unable to detect database from variant/context: $haystack" >&2
      return 1
      ;;
  esac
}

resolve_run_id() {
  if [[ -n "${AX_RUN_ID:-}" ]]; then
    printf '%s\n' "$AX_RUN_ID"
    return 0
  fi
  if [[ -n "${AX_RUN_CONTEXT_PATH:-}" && -f "$AX_RUN_CONTEXT_PATH" ]]; then
    jq -er '.run_id // .composite_run_id' "$AX_RUN_CONTEXT_PATH"
    return 0
  fi

  echo "AX_RUN_ID is unavailable; local AX cannot query transcript events" >&2
  return 1
}

transcript_payloads() {
  local run_id
  local output
  run_id="$(resolve_run_id)" || return 1
  # AX CLI 0.5.726-rp does not provide ax-run-query in either local or cloud
  # test sandboxes (confirmed 2026-08-10). Keep this fail-closed check until
  # the platform exposes run-scoped transcript events to tests.
  command -v ax-run-query >/dev/null 2>&1 || {
    echo "ax-run-query is unavailable in the test sandbox" >&2
    return 1
  }

  output="$(
    ax-run-query "$run_id" sql "
      SELECT payload
      FROM events
      WHERE source IN ('stdout', 'transcript')
    " --format json
  )"
  [[ -n "$output" ]] || {
    echo "No transcript events were returned for run $run_id" >&2
    return 1
  }

  # ax-run-query emits NDJSON: one JSON object per line.
  printf '%s\n' "$output" | jq -ers '
    map(.payload // empty)
    | map(if type == "string" then . else tojson end)
    | .[]
  '
}
