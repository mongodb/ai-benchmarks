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
      SELECT
        min(source_seq) AS order_seq,
        argMax(payload, source_seq) AS payload
      FROM events
      WHERE kind = 'tool_call'
        AND coalesce(assertion_role, 'primary') = 'primary'
        AND tool_call_id IS NOT NULL
      GROUP BY tool_call_id
      ORDER BY order_seq
    " --format json
  )"
  [[ -n "$output" ]] || {
    echo "No tool-call evidence was returned for run $run_id" >&2
    return 1
  }

  # Session-data events contain lifecycle rows for each tool call. The query
  # keeps the latest payload while ordering calls by their first source event.
  printf '%s\n' "$output" | jq -ec '
    (
      .payload
      | if type == "string" then fromjson else . end
    ) as $call
    |
    {
      status: ($call.status // ""),
      input: (
        $call.input // ""
        | if type == "string" then
            .
          elif type == "object" and (.command? | type == "string") then
            .command
          else
            tojson
          end
      ),
      output: (
        $call.output // ""
        | if type == "string" then . else tojson end
      )
    }
  '
}
