# Helpers used only by transcript-based tests.

transcript_payloads() {
  local run_id
  local output
  run_id="$(resolve_run_id)" || return 1
  # AX must inject ax-run-query and a run-scoped query token. Final agent
  # messages are kind=message. ax-run-query defaults to 100 rows, which can
  # drop those messages when stdout/transcript also include lifecycle, usage,
  # and tool-call rows. Keep the old sources, prefer messages, and raise the
  # limit.
  command -v ax-run-query >/dev/null 2>&1 || {
    echo "ax-run-query is unavailable in the test sandbox" >&2
    return 1
  }

  output="$(
    ax-run-query "$run_id" sql "
      SELECT payload
      FROM events
      WHERE kind = 'message'
         OR source IN ('stdout', 'transcript')
      ORDER BY if(kind = 'message', 0, 1), source_seq
    " --format json --limit 10000
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
