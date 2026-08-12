#!/usr/bin/env bash
# Approximates URI reporting from run-scoped message, transcript, and stdout events.
# Local AX currently does not expose these events to initial test sandboxes.
set -euo pipefail
# pack:inline-lib
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/transcript-helpers.sh"

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
    sqlite_file_pattern='(file|sqlite):/+workspace/[^[:space:]"<>`]+\.(db|sqlite|sqlite3)([?][^[:space:]"<>`]*)?([[:space:]"<>,;)`]|$)'
    libsql_pattern='libsql://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?([/?][^[:space:]"<>`]*)?([[:space:]"<>,;)`]|$)'
    sqlite_http_pattern='https?://(localhost|127\.0\.0\.1|\[::1\]):[0-9]{1,5}([/?][^[:space:]"<>`]*)?([[:space:]"<>,;)`]|$)'
    sqlite_ws_pattern='wss?://(localhost|127\.0\.0\.1|\[::1\]):[0-9]{1,5}([/?][^[:space:]"<>`]*)?([[:space:]"<>,;)`]|$)'
    [[ "$text" =~ $sqlite_file_pattern ]] ||
      [[ "$text" =~ $libsql_pattern ]] ||
      [[ "$text" =~ $sqlite_http_pattern ]] ||
      [[ "$text" =~ $sqlite_ws_pattern ]]
    ;;
esac
