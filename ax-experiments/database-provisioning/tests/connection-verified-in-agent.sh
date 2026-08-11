#!/usr/bin/env bash
set -euo pipefail

# pack:inline-lib
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

db="$(detect_db)"
rows="$(tool_call_rows)"

classification="$(
  printf '%s\n' "$rows" | jq -ers --arg db "$db" '
    def text:
      ((.input // "") + "\n" + (.output // "") | ascii_downcase);

    def input_text:
      (.input // "" | ascii_downcase);

    def completed:
      (.status // "" | ascii_downcase) as $status
      | ($status == "completed"
          or $status == "success"
          or $status == "succeeded");

    def command_failed:
      (.status // "" | ascii_downcase) as $status
      | text as $text
      | ($status == "failed"
          or $status == "error"
          or ($text | test("\"exit_code\"[[:space:]]*:[[:space:]]*[1-9]|exit code[=: ]+[1-9]"))
          or ($text | test("econnrefused|connection refused|could not connect to server|server selection timed out|serverselectiontimeouterror|unable to open database file")));

    def mongo_candidate:
      input_text | test("mongosh|mongodb(\\+srv)?://|mongoclient|pymongo|from mongodb|require[^\\n]*mongodb");
    def mongo_operation:
      input_text | test("runcommand|db\\.[a-z0-9_$-]+\\(|db\\.[a-z0-9_$-]+\\.(find|findone|insert|aggregate|count|update|delete|createindex)|\\.(connect|command|find|findone|insertone|insertmany|aggregate|countdocuments|updateone|updatemany|deleteone|deletemany)\\(");
    def mongo_start:
      (.input // "" | ascii_downcase)
      | test("(^|[;&|[:space:]])mongod([;&|[:space:]]|$)|systemctl[[:space:]]+start[[:space:]]+mongod|service[[:space:]]+mongod[[:space:]]+start|docker[[:space:]]+run[^\\n]*mongo");
    def mongo_weak:
      input_text | test("(/dev/tcp/[^/ ]+/27017|create_connection[^\\n]*27017|nc[[:space:]][^\\n]*27017|ss[[:space:]][^\\n]*27017)");

    def postgres_candidate:
      input_text | test("psql|postgres(ql)?://|psycopg|pg\\.client|new client|createconnection");
    def postgres_operation:
      input_text | test("(^|[^a-z])(select|insert|update|delete|create|alter|drop|with|call|begin|commit|rollback|vacuum|analyze|explain)[[:space:](]|\\\\conninfo|\\.(query|execute|executemany)\\(");
    def postgres_start:
      (.input // "" | ascii_downcase)
      | test("pg_ctl[^\\n]*[[:space:]]start|systemctl[[:space:]]+start[[:space:]]+postgres|service[[:space:]]+postgres[^\\n]*[[:space:]]start|(^|[;&|[:space:]])postgres([;&|[:space:]]|$)|docker[[:space:]]+run[^\\n]*postgres");
    def postgres_weak:
      input_text | test("pg_isready|/dev/tcp/[^/ ]+/5432|create_connection[^\\n]*5432|nc[[:space:]][^\\n]*5432|ss[[:space:]][^\\n]*5432");

    def sqlite_candidate:
      input_text | test("sqlite3|better-sqlite3|from sqlite3|import sqlite3|require[^\\n]*sqlite3");
    def sqlite_operation:
      input_text | test("(^|[^a-z])(select|insert|update|delete|create|alter|drop|with|pragma|vacuum|analyze|explain|begin|commit|rollback)[[:space:](]|\\.(execute|executemany|executescript|query|prepare|all|get|run)\\(|(^|[[:space:]])\\.(tables|schema|databases|indexes|dbinfo|lint|recover)([[:space:]]|$)");
    def sqlite_weak:
      input_text | test("test[[:space:]]+-[ef][[:space:]][^\\n]*\\.(db|sqlite|sqlite3)|file[[:space:]][^\\n]*\\.(db|sqlite|sqlite3)");

    def candidate:
      if $db == "mongodb" then mongo_candidate
      elif $db == "postgresql" then postgres_candidate
      else sqlite_candidate
      end;

    def operation:
      if $db == "mongodb" then mongo_operation
      elif $db == "postgresql" then postgres_operation
      else sqlite_operation
      end;

    def start:
      if $db == "mongodb" then mongo_start
      elif $db == "postgresql" then postgres_start
      else false
      end;

    def weak:
      if $db == "mongodb" then mongo_weak
      elif $db == "postgresql" then postgres_weak
      else sqlite_weak
      end;

    to_entries as $calls
    | ([$calls[] | select(.value | start) | .key] | max // -1) as $last_start
    | ([
        $calls[]
        | select(.key >= $last_start)
        | select(.value | completed and (command_failed | not) and candidate and operation)
        | .key
      ] | max // -1) as $last_success
    | ([
        $calls[]
        | select(.key > $last_success)
        | select(.value | command_failed and candidate and operation)
      ] | length) as $later_failures
    | if $last_success >= 0 and $later_failures == 0 then
        "application-operation"
      elif any(.[]; completed and (command_failed | not) and weak) then
        "readiness-only"
      elif any(.[]; completed and candidate) then
        "unrecognized-candidate"
      else
        "no-evidence"
      end
  '
)"

case "$classification" in
  application-operation)
    echo "Found a successful $db application-level operation in agent tool calls"
    ;;
  readiness-only)
    echo "Only readiness/TCP evidence was found for $db; an application-level operation is required" >&2
    exit 1
    ;;
  unrecognized-candidate)
    echo "Completed $db candidate calls were found, but no recognized successful application operation matched the codebook" >&2
    exit 1
    ;;
  *)
    echo "No completed $db connection evidence was found in agent tool calls" >&2
    exit 1
    ;;
esac
