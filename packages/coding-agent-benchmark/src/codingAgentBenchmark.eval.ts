import "dotenv/config";
import { Eval } from "mongodb-rag-core/braintrust";
import { assertEnvVars } from "mongodb-rag-core";
import {
  createClaudeCodeSandbox,
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
  humanAgentModel,
  scorers,
} from "./eval/benchmarkConfig";
import { CLAUDE_CODE_MODEL, codingAgentBenchmarkModels } from "./eval/benchmarkModels";
import { makeRunCodingAgentTask } from "./eval/runCodingAgentTask";
import { makeRunCodingAgentConversation } from "./eval/runCodingAgentConversation";
import { createMongoDbAssistantEvalCli, EvalCliConfig } from "mongodb-assistant-eval";
import { CodingAgentEvalCaseInput, CodingAgentEvalCaseMetadata, CodingAgentTaskExpected, CodingAgentTaskOutput } from "./eval/CodingAgentEval";

const BRAINTRUST_PROJECT_NAME = "coding-agent-benchmark";
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

const claudeCodeEnv = {
  CLAUDE_CODE_USE_FOUNDRY: "1",
  ...assertEnvVars(ANTHROPIC_FOUNDRY_ENV_VARS),
};

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

type AgentConfig = {
  snapshotId: string;
  model: string;
  /** Number of independent runs per eval case (for statistical sampling). */
  runsPerCase: number;
  /**
   * When true, route this model through the multi-turn conversation runner
   * (human-user AI agent responds to clarifying questions). Used for
   * superpowers-style snapshots where forcing implementation skews results.
   */
  conversationMode?: boolean;
  pluginDir?: string;
};

/** Main CLI setup */
async function mainCli() {
  const config: EvalCliConfig<
    CodingAgentEvalCaseInput,
    CodingAgentTaskExpected,
    CodingAgentTaskOutput,
    AgentConfig,
    CodingAgentEvalCaseMetadata
  > = {
    projectName: BRAINTRUST_PROJECT_NAME,
    datasets,
    models: codingAgentBenchmarkModels,
    tasks: {
      codingAgent: {
        description: "Runs the coding agent in a Vercel sandbox",
        run: ({ input, modelConfig }) =>
          modelConfig.conversationMode
            ? makeRunCodingAgentConversation({
                codeJudgeModel,
                lightJudgeModel,
                humanAgentModel,
                createSandbox: () =>
                  createClaudeCodeSandbox({
                    snapshotId: modelConfig.snapshotId,
                    claudeCodeEnv,
                    model: modelConfig.model,
                    pluginDir: modelConfig.pluginDir,
                  }),
                sampleSize: modelConfig.runsPerCase,
              })(input)
            : makeRunCodingAgentTask({
                codeJudgeModel,
                lightJudgeModel,
                runSandbox: makeRunClaudeCodeSandbox({
                  snapshotId: modelConfig.snapshotId,
                  claudeCodeEnv,
                  model: modelConfig.model,
                  pluginDir: modelConfig.pluginDir,
                }),
                sampleSize: modelConfig.runsPerCase,
              })(input),
      },
    },
    scorers: Object.fromEntries(
      Object.entries(scorers).map(([key, scorer]) => [key, { scorer }])
    ),
  };

  const cli = createMongoDbAssistantEvalCli(config);
  await cli.parseAsync();
}


process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));

void mainCli()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });