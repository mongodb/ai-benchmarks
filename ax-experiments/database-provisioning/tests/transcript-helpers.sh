# Helpers used only by transcript-based tests.

transcript_payloads() {
  local run_id
  local output
  run_id="$(resolve_run_id)" || return 1
  # AX must inject both ax-run-query and a run-scoped query token. Keep this
  # fail-closed check because initial runs have omitted the executable and a
  # later retest injected an AX_API_KEY without run-scoped query permission.
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
