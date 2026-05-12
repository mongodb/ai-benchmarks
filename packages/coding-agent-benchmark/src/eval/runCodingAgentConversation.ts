import { LanguageModel } from "mongodb-rag-core/aiSdk";
import { inferPrimaryLanguage } from "../sandbox/collectArtifacts";
import { classifyStdoutAppStack } from "./classifyStdoutAppStack";
import { analyzeGeneratedFiles } from "./analyzeGeneratedFiles";
import { classifyAskedQuestion } from "./classifyAskedClarifyingQuestion";
import {
  generateHumanAgentReply,
  type GenerateHumanAgentReplyParams,
} from "./generateHumanAgentReply";
import type {
  ClaudeCodeSandboxHandle,
  ClaudeCommandResult,
} from "../sandbox/runClaudeCodeSandbox";
import type { GeneratedFile } from "../sandbox/SandboxResult";
import type {
  CodingAgentEvalCaseInput,
  CodingAgentSample,
  CodingAgentTaskOutput,
  ConversationTurn,
} from "./CodingAgentEval";

export const FALLBACK_PROMPT =
  "Just build it. Don't ask me questions, you're allowed to make assumptions.";

const DEFAULT_MAX_TURNS = 20;
const HUMAN_AGENT_RETRY_BACKOFF_MS = 1_500;

export type CreateSandboxFn = () => Promise<ClaudeCodeSandboxHandle>;

export interface MakeRunCodingAgentConversationParams {
  codeJudgeModel: LanguageModel;
  lightJudgeModel: LanguageModel;
  humanAgentModel: LanguageModel;
  /** Factory that creates a fresh, initialized sandbox handle per conversation. */
  createSandbox: CreateSandboxFn;
  /** Samples per case. Defaults to 1. */
  sampleSize?: number;
  /** Hard turn limit before falling back to FALLBACK_PROMPT. Defaults to 20. */
  maxTurns?: number;
}

export function makeRunCodingAgentConversation({
  codeJudgeModel,
  lightJudgeModel,
  humanAgentModel,
  createSandbox,
  sampleSize = 1,
  maxTurns = DEFAULT_MAX_TURNS,
}: MakeRunCodingAgentConversationParams) {
  return async function runCodingAgentConversation(
    input: CodingAgentEvalCaseInput
  ): Promise<CodingAgentTaskOutput> {
    const prompt = promptFromMessages(input.messages);
    const samples: CodingAgentSample[] = [];
    for (let i = 0; i < sampleSize; i++) {
      samples.push(
        await generateConversationSample({
          prompt,
          codeJudgeModel,
          lightJudgeModel,
          humanAgentModel,
          createSandbox,
          maxTurns,
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

async function generateConversationSample(params: {
  prompt: string;
  codeJudgeModel: LanguageModel;
  lightJudgeModel: LanguageModel;
  humanAgentModel: LanguageModel;
  createSandbox: CreateSandboxFn;
  maxTurns: number;
}): Promise<CodingAgentSample> {
  const {
    prompt,
    codeJudgeModel,
    lightJudgeModel,
    humanAgentModel,
    createSandbox,
    maxTurns,
  } = params;

  const sandbox = await createSandbox();
  let convoOutcome: ConversationOutcome = emptyOutcome();
  try {
    convoOutcome = await runConversationLoop({
      prompt,
      sandbox,
      lightJudgeModel,
      humanAgentModel,
      maxTurns,
    });
  } finally {
    convoOutcome.files = await sandbox.collectFiles().catch(() => []);
    await sandbox.close().catch(() => {});
  }

  const aggregatedStdout = convoOutcome.history
    .filter((t) => t.role === "claude")
    .map((t) => t.content)
    .join("\n\n");

  const primaryLanguage = inferPrimaryLanguage(convoOutcome.files);

  const [stdoutClassification, fileClassification] = await Promise.all([
    classifyStdoutAppStack({
      model: codeJudgeModel,
      stdout: aggregatedStdout,
    }),
    analyzeGeneratedFiles({
      model: codeJudgeModel,
      files: convoOutcome.files,
    }),
  ]);

  return {
    stdout: aggregatedStdout,
    stderr: convoOutcome.lastStderr,
    exitCode: convoOutcome.lastExitCode,
    files: convoOutcome.files,
    durationMs: convoOutcome.totalDurationMs,
    primaryLanguage,
    stdoutClassification,
    fileClassification,
    askedQuestionOnFirstAttempt: convoOutcome.askedQuestionOnFirstAttempt,
    askedQuestionOnRetry: null,
    retried: convoOutcome.fellBackToForcePrompt,
    turnCount: convoOutcome.turnCount,
    fellBackToForcePrompt: convoOutcome.fellBackToForcePrompt,
    conversationHistory: convoOutcome.history,
  };
}

type ConversationOutcome = {
  history: ConversationTurn[];
  files: GeneratedFile[];
  lastStderr: string;
  lastExitCode: number;
  totalDurationMs: number;
  turnCount: number;
  askedQuestionOnFirstAttempt: boolean;
  fellBackToForcePrompt: boolean;
};

function emptyOutcome(): ConversationOutcome {
  return {
    history: [],
    files: [],
    lastStderr: "",
    lastExitCode: -1,
    totalDurationMs: 0,
    turnCount: 0,
    askedQuestionOnFirstAttempt: false,
    fellBackToForcePrompt: false,
  };
}

async function runConversationLoop(params: {
  prompt: string;
  sandbox: ClaudeCodeSandboxHandle;
  lightJudgeModel: LanguageModel;
  humanAgentModel: LanguageModel;
  maxTurns: number;
}): Promise<ConversationOutcome> {
  const { prompt, sandbox, lightJudgeModel, humanAgentModel, maxTurns } =
    params;

  const history: ConversationTurn[] = [];
  let lastRun: ClaudeCommandResult | null = null;
  let totalDurationMs = 0;
  let turnCount = 0;
  let askedQuestionOnFirstAttempt = false;
  let fellBackToForcePrompt = false;

  let nextInput = prompt;
  let useContinue = false;

  for (let turn = 1; turn <= maxTurns; turn++) {
    history.push({ role: "human", content: nextInput });

    const run = await sandbox.runClaude({
      input: nextInput,
      continueSession: useContinue,
      outputFormat: "json",
    });
    lastRun = run;
    totalDurationMs += run.durationMs;
    turnCount = turn;

    const claudeText = extractResultFromJson(run.stdout);
    history.push({ role: "claude", content: claudeText });

    if (run.exitCode !== 0) break;

    const asked = await classifyAskedSafely({
      model: lightJudgeModel,
      stdout: claudeText,
    });
    if (turn === 1) askedQuestionOnFirstAttempt = asked;
    if (!asked) break;

    // Claude is still asking. Decide what to send on the next turn.
    if (turn >= maxTurns) break;

    if (turn === maxTurns - 1) {
      // One turn left after this — use it on the fallback prompt.
      nextInput = FALLBACK_PROMPT;
      fellBackToForcePrompt = true;
    } else {
      const reply = await generateHumanAgentReplyWithRetry({
        model: humanAgentModel,
        taskPrompt: prompt,
        claudeText,
      });
      if (reply === null) {
        nextInput = FALLBACK_PROMPT;
        fellBackToForcePrompt = true;
      } else {
        nextInput = reply;
      }
    }
    useContinue = true;
  }

  return {
    history,
    files: [],
    lastStderr: lastRun?.stderr ?? "",
    lastExitCode: lastRun?.exitCode ?? -1,
    totalDurationMs,
    turnCount,
    askedQuestionOnFirstAttempt,
    fellBackToForcePrompt,
  };
}

async function classifyAskedSafely(params: {
  model: LanguageModel;
  stdout: string;
}): Promise<boolean> {
  try {
    const { askedClarifyingQuestion } = await classifyAskedQuestion(params);
    return askedClarifyingQuestion;
  } catch {
    return false;
  }
}

async function generateHumanAgentReplyWithRetry(
  params: GenerateHumanAgentReplyParams
): Promise<string | null> {
  try {
    return await generateHumanAgentReply(params);
  } catch {
    await new Promise((r) => setTimeout(r, HUMAN_AGENT_RETRY_BACKOFF_MS));
    try {
      return await generateHumanAgentReply(params);
    } catch {
      return null;
    }
  }
}

/**
 * Extract the `.result` field from `claude --output-format json` stdout.
 * Falls back to the raw stdout if JSON parsing fails so the loop can keep
 * making progress on classification.
 */
export function extractResultFromJson(stdout: string): string {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return "";
  try {
    const parsed = JSON.parse(trimmed) as { result?: unknown };
    if (typeof parsed.result === "string") {
      return parsed.result;
    }
  } catch {
    // Not JSON — return raw so classifier still has something to work with.
  }
  return stdout;
}
