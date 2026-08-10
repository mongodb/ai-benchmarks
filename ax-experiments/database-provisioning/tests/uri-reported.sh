#!/usr/bin/env bash
# Approximates URI reporting from run-scoped transcript/stdout events.
# Local AX currently does not expose these events to initial test sandboxes.
set -euo pipefail
# pack:inline-lib
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

db="$(detect_db)"
text="$(transcript_payloads)"

case "$db" in
  mongodb)
    [[ "$text" =~ mongodb(\+srv)?://[^[:space:]\"\<\>]+ ]]
    ;;
  postgresql)
    [[ "$text" =~ postgres(ql)?://[^[:space:]\"\<\>]+ ]]
    ;;
  sqlite)
    [[ "$text" =~ (file:)?/workspace/[^[:space:]\"\<\>]+ ]] ||
      [[ "$text" =~ sqlite:[^[:space:]\"\<\>]+ ]]
    ;;
esac
