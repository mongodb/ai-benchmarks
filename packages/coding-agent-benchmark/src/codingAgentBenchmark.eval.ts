import "dotenv/config";
import { Eval } from "mongodb-rag-core/braintrust";
import { assertEnvVars } from "mongodb-rag-core";
import {
  makeRunClaudeCodeSandbox,
  stopAllActiveSandboxes,
} from "./sandbox/runClaudeCodeSandbox";
import {
  ANTHROPIC_FOUNDRY_ENV_VARS,
  CLAUDE_CODE_SNAPSHOT_IDS,
} from "./envVars";
import {
  datasets,
  codeJudgeModel,
  lightJudgeModel,
  scorers,
} from "./eval/benchmarkConfig";
import { makeRunCodingAgentTask } from "./eval/runCodingAgentTask";

const EXPERIMENT_NAME = "coding-agent-benchmark";

const SUBJECT_MODEL = "claude-opus-4-7";
const SAMPLE_SIZE = 3;
const DATASET: keyof typeof datasets = "all";
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

async function main(): Promise<void> {
  const { CLAUDE_CODE_BASE_SNAPSHOT_ID: snapshotId } = assertEnvVars(
    CLAUDE_CODE_SNAPSHOT_IDS
  );

  const claudeCodeEnv = {
    CLAUDE_CODE_USE_FOUNDRY: "1",
    ...assertEnvVars(ANTHROPIC_FOUNDRY_ENV_VARS),
  };

  const runSandbox = makeRunClaudeCodeSandbox({
    snapshotId,
    claudeCodeEnv,
    model: SUBJECT_MODEL,
  });

  const task = makeRunCodingAgentTask({
    codeJudgeModel,
    lightJudgeModel,
    runSandbox,
    sampleSize: SAMPLE_SIZE,
  });

  const fullData = await datasets[DATASET].getDataset();
  const data = LIMIT ? fullData.slice(0, LIMIT) : fullData;
  console.log(
    `Running ${data.length} case(s) (dataset=${DATASET}${LIMIT ? `, LIMIT=${LIMIT}` : ""}) x ${SAMPLE_SIZE} sample(s)`
  );

  await Eval(EXPERIMENT_NAME, {
    data,
    experimentName: `claude-code/${SUBJECT_MODEL}/baseline/${DATASET}${LIMIT ? `-limit${LIMIT}` : ""}`,
    metadata: {
      agent: "claude-code",
      subjectModel: SUBJECT_MODEL,
      pluginVariant: "baseline",
      dataset: DATASET,
      caseCount: data.length,
      sampleSize: SAMPLE_SIZE,
      snapshotId,
    },
    maxConcurrency: 20,
    task,
    scores: Object.values(scorers),
  });
}

const SHUTDOWN_TIMEOUT_MS = 30_000;

let isShuttingDown = false;
async function handleShutdownSignal(signal: "SIGINT" | "SIGTERM") {
  if (isShuttingDown) {
    console.error(
      `${signal} received — shutdown already in progress. Ignoring.`
    );
    return;
  }
  isShuttingDown = true;
  console.error(
    `\n${signal} received. Stopping active sandboxes (timeout ${SHUTDOWN_TIMEOUT_MS}ms)...`
  );
  // Force-exit safety net. Intentionally NOT unref'd: keeps the event loop
  // alive so the async shutdown can run to completion and we control the
  // exit code, instead of node exiting on signal once handles drain.
  const forceExit = setTimeout(() => {
    console.error("Shutdown timed out — forcing exit. Sandboxes may leak.");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    await stopAllActiveSandboxes();
    console.error("Active sandboxes stopped.");
  } catch (err) {
    console.error("Error stopping sandboxes:", err);
  } finally {
    clearTimeout(forceExit);
  }
  process.exit(130);
}

process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
