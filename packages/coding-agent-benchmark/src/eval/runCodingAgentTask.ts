import { LanguageModel } from "mongodb-rag-core/aiSdk";
import { inferPrimaryLanguage } from "../sandbox/collectArtifacts";
import { classifyStdoutAppStack } from "./classifyStdoutAppStack";
import { analyzeGeneratedFiles } from "./analyzeGeneratedFiles";
import { classifyCodingAgentStopReason, STOP_REASON_FINISHED } from "./classifyCodingAgentStopReason";
import type { SandboxResult } from "../sandbox/SandboxResult";
import type {
  CodingAgentEvalCaseInput,
  CodingAgentEvalTask,
  CodingAgentSample,
  CodingAgentTaskOutput,
} from "./CodingAgentEval";

export type RunCodingAgentSandbox = (input: {
  prompt: string;
}) => Promise<SandboxResult>;

const RETRY_PROMPT_SUFFIX =
  "\n\nJust build it. Don't ask me questions, you're allowed to make assumptions.";

/**
 * Only runs that finish quickly are plausibly cases where the agent asked
 * a clarifying question instead of building. Skip the LLM classification
 * for longer runs to save cost and judge-model RPM.
 */
const CLARIFYING_QUESTION_DURATION_THRESHOLD_MS = 2 * 60 * 1000;

export interface MakeRunCodingAgentTaskParams {
  /** The judge model used by classifyStdoutAppStack + analyzeGeneratedFiles. */
  codeJudgeModel: LanguageModel;

  /** The judge model used by classifyAskedQuestion. */
  lightJudgeModel: LanguageModel;

  /** Sandbox runner bound to a specific agent (e.g. makeRunClaudeCodeSandbox(...)). */
  runSandbox: RunCodingAgentSandbox;
  
  /** Samples per case. Defaults to 1. */
  sampleSize?: number;
}

export function makeRunCodingAgentTask({
  codeJudgeModel,
  lightJudgeModel,
  runSandbox,
  sampleSize = 1,
}: MakeRunCodingAgentTaskParams) {
  return async function runCodingAgentTask(
    input: CodingAgentEvalCaseInput
  ): Promise<CodingAgentTaskOutput> {
    const prompt = promptFromMessages(input.messages);
    const samples: CodingAgentSample[] = [];
    for (let i = 0; i < sampleSize; i++) {
      samples.push(
        await generateSample({
          prompt,
          codeJudgeModel,
          lightJudgeModel,
          runSandbox,
        })
      );
    }
    return { samples };
  };
}

function promptFromMessages(
  messages: CodingAgentEvalCaseInput["messages"]
): string {
  const userMessages = messages.filter((m) => m.role === "user");
  return userMessages.map((m) => m.content).join("\n\n");
}

async function generateSample({
  prompt,
  codeJudgeModel,
  lightJudgeModel,
  runSandbox,
}: {
  prompt: string;
  codeJudgeModel: LanguageModel;
  lightJudgeModel: LanguageModel;
  runSandbox: RunCodingAgentSandbox;
}): Promise<CodingAgentSample> {
  const {
    finalRun,
    attemptedBuildOnFirstTurn,
    attemptedBuildOnRetry,
    retried,
  } = await runWithRetryOnAskedQuestion({
    prompt,
    runSandbox,
    lightJudgeModel,
  });

  const primaryLanguage = inferPrimaryLanguage(finalRun.files);

  const [stdoutClassification, fileClassification] = await Promise.all([
    classifyStdoutAppStack({ model: codeJudgeModel, stdout: finalRun.stdout }),
    analyzeGeneratedFiles({ model: codeJudgeModel, files: finalRun.files }),
  ]);

  return {
    stdout: finalRun.stdout,
    stderr: finalRun.stderr,
    exitCode: finalRun.exitCode,
    files: finalRun.files,
    durationMs: finalRun.durationMs,
    primaryLanguage,
    stdoutClassification,
    fileClassification,
    attemptedBuildOnFirstTurn,
    attemptedBuildOnRetry,
    retried,
  };
}

/**
 * Run the coding agent eval case once.
 * If the agent asked a question instead of building, run it a second time 
 * with addition prompting to make assumptions and proceed. 
 */
async function runWithRetryOnAskedQuestion({
  prompt,
  runSandbox,
  lightJudgeModel,
}: {
  prompt: string;
  runSandbox: RunCodingAgentSandbox;
  lightJudgeModel: LanguageModel;
}): Promise<{
  finalRun: SandboxResult;
  attemptedBuildOnFirstTurn: boolean;
  attemptedBuildOnRetry: boolean | null;
  retried: boolean;
}> {
  const firstRun = await runSandbox({ prompt });
  const attemptedBuildOnFirstTurn = await isCodingAgentDone({
    run: firstRun,
    lightJudgeModel,
  });

  if (attemptedBuildOnFirstTurn) {
    return {
      finalRun: firstRun,
      attemptedBuildOnFirstTurn: false,
      attemptedBuildOnRetry: null,
      retried: false,
    };
  }

  const retryRun = await runSandbox({ prompt: prompt + RETRY_PROMPT_SUFFIX });
  return {
    finalRun: retryRun,
    attemptedBuildOnFirstTurn: true,
    attemptedBuildOnRetry: await isCodingAgentDone({
      run: retryRun,
      lightJudgeModel,
    }),
    retried: true,
  };
}

async function isCodingAgentDone({
  run,
  lightJudgeModel,
}: {
  run: SandboxResult;
  lightJudgeModel: LanguageModel;
}): Promise<boolean> {
  if (run.durationMs >= CLARIFYING_QUESTION_DURATION_THRESHOLD_MS) {
    return false;
  }
  const { stopReason } = await classifyCodingAgentStopReason({
    model: lightJudgeModel,
    stdout: run.stdout,
  });
  return stopReason === STOP_REASON_FINISHED;
}
