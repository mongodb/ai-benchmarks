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
        source_seq,
        tool_call_id,
        payload
      FROM events
      WHERE kind = 'tool_call'
        AND coalesce(assertion_role, 'primary') = 'primary'
        AND tool_call_id IS NOT NULL
      ORDER BY source_seq
    " --format json
  )"
  [[ -n "$output" ]] || {
    echo "No tool-call evidence was returned for run $run_id" >&2
    return 1
  }

  # Session-data events emit multiple lifecycle rows per tool_call_id. Merge
  # them instead of taking the latest payload: Claude can append a duplicate
  # in_progress row after completed, which would otherwise drop input or
  # status. Keep the latest terminal status and the latest non-empty input
  # and output so split start/result events still reconstruct one call.
  printf '%s\n' "$output" | jq -s -ec '
    def parse:
      if type == "string" then fromjson else . end;

    def call_fields:
      parse as $call
      | {
          status: ($call.status // ""),
          input: (
            $call.input // ""
            | if type == "string" then
                .
              elif type == "object" and (.command? | type == "string") then
                .command
              elif type == "object" and . == {} then
                ""
              else
                tojson
              end
          ),
          output: (
            $call.output // ""
            | if type == "string" then
                .
              elif type == "object" and . == {} then
                ""
              else
                tojson
              end
          )
        };

    def terminal:
      (.status // "" | ascii_downcase) as $status
      | ($status == "completed"
          or $status == "success"
          or $status == "succeeded"
          or $status == "failed"
          or $status == "error");

    def merge:
      sort_by(.source_seq) as $rows
      | [$rows[] | .payload | call_fields] as $fields
      | {
          status: (
            ([$fields[] | select(terminal)] | last | .status)
            // ($fields | last | .status)
            // ""
          ),
          input: (
            ([$fields[] | .input | select(type == "string" and length > 0)] | last)
            // ""
          ),
          output: (
            ([$fields[] | .output | select(type == "string" and length > 0)] | last)
            // ""
          )
        };

    map({
      source_seq: (.source_seq // 0),
      tool_call_id: (.tool_call_id // null),
      payload
    })
    | group_by(.tool_call_id)
    | map({
        order_seq: (map(.source_seq) | min),
        merged: merge
      })
    | sort_by(.order_seq)
    | .[].merged
  '
}
