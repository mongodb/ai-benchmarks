import { assertEnvVars } from "mongodb-rag-core";
import { CLAUDE_CODE_SNAPSHOT_IDS } from "../envVars";

export const CLAUDE_CODE_MODEL = "claude-opus-4-7";
const DEFAULT_SAMPLE_SIZE = 3;

// load environment details.
const { 
  CLAUDE_CODE_BASE_SNAPSHOT_ID, 
  CLAUDE_CODE_SUPERPOWERS_SNAPSHOT_ID, 
  CLAUDE_CODE_SUPERPOWERS_FORK_SNAPSHOT_ID 
} = assertEnvVars(
  CLAUDE_CODE_SNAPSHOT_IDS
);

export const codingAgentBenchmarkModels = {
  "smoke-test": {
    description: "Claude Code smoke test to make sure the eval driver, sandbox, etc. work",
    config: { snapshotId: CLAUDE_CODE_BASE_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: 1, conversationMode: true },
  },
  "claude-code-baseline": {
    description: "Claude Code baseline snapshot, 3 runs/case",
    config: { snapshotId: CLAUDE_CODE_BASE_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: DEFAULT_SAMPLE_SIZE, conversationMode: true },
  },
  "claude-code-nonconversational": {
    description: "Claude Code non-conversational snapshot - just build it. Human agent does not answer questions. 3 runs/case",
    config: { snapshotId: CLAUDE_CODE_BASE_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: DEFAULT_SAMPLE_SIZE, conversationMode: false },
  },
  "claude-code-superpowers": {
    description: "Claude Code superpowers snapshot, 3 runs/case (multi-turn conversation runner)",
    config: { snapshotId: CLAUDE_CODE_SUPERPOWERS_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: DEFAULT_SAMPLE_SIZE, conversationMode: true },
  },
  "claude-code-superpowers-fork": {
    description: "Claude Code custom superpowers fork snapshot, 3 runs/case (multi-turn conversation runner)",
    config: { snapshotId: CLAUDE_CODE_SUPERPOWERS_FORK_SNAPSHOT_ID, model: CLAUDE_CODE_MODEL, runsPerCase: DEFAULT_SAMPLE_SIZE, conversationMode: true },
  },
};