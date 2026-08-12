# Helpers used only by tool-call evidence tests.

tool_call_rows() {
  local run_id
  local output
  run_id="$(resolve_run_id)" || return 1
  command -v ax-run-query >/dev/null 2>&1 || {
    echo "ax-run-query is unavailable in the test sandbox" >&2
    return 1
  }

  output="$(
    ax-run-query "$run_id" sql "
      SELECT status, started_ts_ns, raw_input, raw_output
      FROM tool_calls
      ORDER BY started_ts_ns
    " --format json
  )"
  [[ -n "$output" ]] || {
    echo "No tool-call evidence was returned for run $run_id" >&2
    return 1
  }

  # Preserve one normalized tool-call object per line for semantic matching.
  printf '%s\n' "$output" | jq -ec '
    {
      status: (.status // ""),
      input: (
        .raw_input // ""
        | if type == "string" then . else tojson end
      ),
      output: (
        .raw_output // ""
        | if type == "string" then . else tojson end
      )
    }
  '
}
