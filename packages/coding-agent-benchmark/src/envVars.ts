import { assertEnvVars } from "mongodb-rag-core";

export const VERCEL_ENV_VARS = {
  VERCEL_TOKEN: "",
  VERCEL_TEAM_ID: "",
  VERCEL_PROJECT_ID: "",
};

/**
 * Azure Foundry credentials passed *into* the sandbox so Claude Code
 * authenticates without touching any personal Anthropic account.
 *
 * Note: these variable names are documented but unproven — validate before
 * running a full benchmark run (Milestone #1 in CLAUDE_CODE_APP_DEV_BENCHMARK_PHASE_ONE_PLAN.md).
 */
export const ANTHROPIC_FOUNDRY_ENV_VARS = {
  ANTHROPIC_FOUNDRY_RESOURCE: "",
  ANTHROPIC_FOUNDRY_API_KEY: "",
  ANTHROPIC_FOUNDRY_API_VERSION: "",
};

/** Snapshot IDs written to .env after running the create-snapshot script. */
export const CLAUDE_CODE_SNAPSHOT_IDS = {
  CLAUDE_CODE_BASE_SNAPSHOT_ID: "",
  CLAUDE_CODE_SUPERPOWERS_SNAPSHOT_ID: "",
  CLAUDE_CODE_SUPERPOWERS_FORK_SNAPSHOT_ID: "",
};

