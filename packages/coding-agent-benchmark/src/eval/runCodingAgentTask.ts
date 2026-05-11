import { LanguageModel } from "mongodb-rag-core/aiSdk";
import { inferPrimaryLanguage } from "../sandbox/collectArtifacts";
import { classifyStdoutAppStack } from "../scorers/stdout/classifyStdoutAppStack";
import { analyzeGeneratedFiles } from "../scorers/files/analyzeGeneratedFiles";
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

export interface MakeRunCodingAgentTaskParams {
  /** The judge model used by classifyStdoutAppStack + analyzeGeneratedFiles. */
  judgeModel: LanguageModel;
  /** Sandbox runner bound to a specific agent (e.g. makeRunClaudeCodeSandbox(...)). */
  runSandbox: RunCodingAgentSandbox;
  /** Samples per case. Defaults to 1. */
  sampleSize?: number;
}

/**
 * Build a Braintrust task that runs a coding agent in its sandbox once per
 * sample, then classifies stdout and generated files in parallel.
 */
export function makeRunCodingAgentTask({
  judgeModel,
  runSandbox,
  sampleSize = 1,
}: MakeRunCodingAgentTaskParams): CodingAgentEvalTask {
  return async function runCodingAgentTask(
    input: CodingAgentEvalCaseInput
  ): Promise<CodingAgentTaskOutput> {
    const prompt = promptFromMessages(input.messages);
    const samples: CodingAgentSample[] = [];
    for (let i = 0; i < sampleSize; i++) {
      samples.push(await generateSample({ prompt, judgeModel, runSandbox }));
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
  judgeModel,
  runSandbox,
}: {
  prompt: string;
  judgeModel: LanguageModel;
  runSandbox: RunCodingAgentSandbox;
}): Promise<CodingAgentSample> {
  const sandboxResult = await runSandbox({ prompt });

  const primaryLanguage = inferPrimaryLanguage(sandboxResult.files);

  const [stdoutClassification, fileClassification] = await Promise.all([
    classifyStdoutAppStack({ model: judgeModel, stdout: sandboxResult.stdout }),
    analyzeGeneratedFiles({ model: judgeModel, files: sandboxResult.files }),
  ]);

  return {
    stdout: sandboxResult.stdout,
    stderr: sandboxResult.stderr,
    exitCode: sandboxResult.exitCode,
    files: sandboxResult.files,
    durationMs: sandboxResult.durationMs,
    primaryLanguage,
    stdoutClassification,
    fileClassification,
  };
}
