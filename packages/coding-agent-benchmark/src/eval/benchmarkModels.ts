import { assertEnvVars } from "mongodb-rag-core";
import { CLAUDE_CODE_SNAPSHOT_IDS } from "../envVars";

export const CLAUDE_CODE_MODEL = "claude-opus-4-7";
const DEFAULT_SAMPLE_SIZE = 1;

// load environment details.
const {
  CLAUDE_CODE_BASE_SNAPSHOT_ID,
  CLAUDE_CODE_SUPERPOWERS_SNAPSHOT_ID,
  CLAUDE_CODE_SUPERPOWERS_FORK_SNAPSHOT_ID,
  CLAUDE_CODE_CLAUDE_MD_SNAPSHOT_ID
} = assertEnvVars(
  CLAUDE_CODE_SNAPSHOT_IDS
);

export const codingAgentBenchmarkModels = {
  "smoke-test": {
    description: "Claude Code smoke test to make sure the eval driver, sandbox, etc. work",
    config: { snapshotId: CLAUDE_CODE_BASE_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: 1, },
  },
  "smoke-test-superpowers-fork": {
    description: "Claude Code smoke test to make sure the eval driver, sandbox, etc. work",
    config: { snapshotId: CLAUDE_CODE_SUPERPOWERS_FORK_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: 1, pluginDir: "/home/dev/superpowers/"},
  },
  "claude-code-baseline": {
    description: "Claude Code baseline snapshot",
    config: { snapshotId: CLAUDE_CODE_BASE_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: DEFAULT_SAMPLE_SIZE },
  },
  "claude-code-nonconversational": {
    description: "Claude Code non-conversational snapshot - just build it. Human agent does not answer questions.",
    config: { snapshotId: CLAUDE_CODE_BASE_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: DEFAULT_SAMPLE_SIZE },
  },
  "claude-code-superpowers": {
    description: "Claude Code superpowers snapshot (multi-turn conversation runner)",
    config: { snapshotId: CLAUDE_CODE_SUPERPOWERS_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: DEFAULT_SAMPLE_SIZE },
  },
  "claude-code-superpowers-fork": {
    description: "Claude Code superpowers fork with structured elicitation",
    config: { snapshotId: CLAUDE_CODE_SUPERPOWERS_FORK_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: DEFAULT_SAMPLE_SIZE, pluginDir: "/home/dev/superpowers/" },
  },
  "claude-code-claude-md": {
    description: "Claude Code with custom CLAUDE.md structured elicitation",
    config: { snapshotId: CLAUDE_CODE_CLAUDE_MD_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: DEFAULT_SAMPLE_SIZE },
  },
};