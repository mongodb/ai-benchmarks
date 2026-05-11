import "dotenv/config";
import { Eval } from "mongodb-rag-core/braintrust";
import { assertEnvVars } from "mongodb-rag-core";
import { makeRunClaudeCodeSandbox } from "./sandbox/runClaudeCodeSandbox";
import {
  ANTHROPIC_FOUNDRY_ENV_VARS,
  CLAUDE_CODE_SNAPSHOT_IDS,
} from "./envVars";
import {
  datasets,
  judgeModel,
  judgeModelConfig,
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
    judgeModel,
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
      judgeModel: judgeModelConfig?.label,
    },
    maxConcurrency: 20,
    timeout: 30 * 60 * 1000, // 30 minutes
    task,
    scores: Object.values(scorers),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
