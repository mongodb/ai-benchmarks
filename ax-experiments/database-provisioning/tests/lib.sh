# Shared helpers for database-provisioning tests.
# Editable source of truth — run ../pack-tests.sh after changes.
# Not staged into the agent workspace.

detect_db() {
  local prompt_id
  if [[ -n "${AX_RUN_CONTEXT_PATH:-}" && -f "$AX_RUN_CONTEXT_PATH" ]]; then
    prompt_id="$(jq -er '.prompt_id | strings | select(length > 0)' \
      "$AX_RUN_CONTEXT_PATH")" || {
      echo "run context is missing documented prompt_id" >&2
      return 1
    }
  else
    # AX_VARIANT_ID is the documented backwards-compatible fallback.
    prompt_id="${AX_VARIANT_ID:-}"
  fi

  case "$prompt_id" in
    *postgresql*|*postgres*) printf '%s\n' postgresql ;;
    *mongodb*) printf '%s\n' mongodb ;;
    *sqlite*) printf '%s\n' sqlite ;;
    *)
      echo "Unable to detect database from prompt: $prompt_id" >&2
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
    jq -er '.run_id' "$AX_RUN_CONTEXT_PATH"
    return 0
  fi

  echo "AX_RUN_ID is unavailable; local AX cannot query transcript events" >&2
  return 1
}
