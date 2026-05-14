import { traced, wrapTraced } from "braintrust";
import { LanguageModel } from "mongodb-rag-core/aiSdk";
import { inferPrimaryLanguage } from "../sandbox/collectArtifacts";
import { classifyStdoutAppStack } from "./classifyStdoutAppStack";
import { analyzeGeneratedFiles } from "./analyzeGeneratedFiles";
import { classifyCodingAgentStopReason, STOP_REASON_FINISHED } from "./classifyCodingAgentStopReason";
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
    attemptedBuildOnFirstTurn: convoOutcome.attemptedBuildOnFirstTurn,
    retried: convoOutcome.fellBackToForcePrompt,
    turnCount: convoOutcome.turnCount,
    fellBackToForcePrompt: convoOutcome.fellBackToForcePrompt,
    conversationHistory: convoOutcome.history,
    sandboxStopped: convoOutcome.sandboxStopped,
  };
}

type ConversationOutcome = {
  history: ConversationTurn[];
  files: GeneratedFile[];
  lastStderr: string;
  lastExitCode: number;
  totalDurationMs: number;
  turnCount: number;
  attemptedBuildOnFirstTurn: boolean;
  fellBackToForcePrompt: boolean;
  sandboxStopped: boolean;
};

function emptyOutcome(): ConversationOutcome {
  return {
    history: [],
    files: [],
    lastStderr: "",
    lastExitCode: -1,
    totalDurationMs: 0,
    turnCount: 0,
    attemptedBuildOnFirstTurn: false,
    fellBackToForcePrompt: false,
    sandboxStopped: false,
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
  let attemptedBuildOnFirstTurn = false;
  let fellBackToForcePrompt = false;
  let sandboxStopped = false;

  let nextInput = prompt;
  let useContinue = false;

  const runClaudeTurn = sandbox.runClaude;
  const runHumanAgentTurn = makeRunHumanAgentTurnTraced(humanAgentModel);

  const END_CONVERSATION = "stop" as const;
  const CONTINUE_CONVERSATION = "continue" as const;
  const ERR_SANDBOX_STOPPED = "sandbox_stopped" as const;
  type LoopStepResult =
    | { status: typeof ERR_SANDBOX_STOPPED; runResult: null }
    | { status: typeof END_CONVERSATION; runResult: ClaudeCommandResult }
    | { status: typeof CONTINUE_CONVERSATION; runResult: ClaudeCommandResult };

  for (let turn = 1; turn <= maxTurns; turn++) {
    const { status, runResult } = await traced( 
      async (): Promise<LoopStepResult> => {
        history.push({ role: "human", content: nextInput });

        const turnResult = await runClaudeTurn({
          input: nextInput,
          continueSession: useContinue,
          outputFormat: "json",
        });
  
        // Return null here to avoid overwriting a real result with a failure.
        if (turnResult.type === "sandbox_stopped") {
          sandboxStopped = true;
          return { status: ERR_SANDBOX_STOPPED, runResult: null };
        }
  
        const { run, claudeText } = turnResult;
        totalDurationMs += run.durationMs;
        turnCount = turn;
        history.push({ role: "claude", content: claudeText });
  
        if (run.exitCode !== 0) return { status: END_CONVERSATION, runResult: run };
  
        const agentDone = await isCodingAgentDone({
          model: lightJudgeModel,
          stdout: claudeText,
        });
        if (turn === 1) attemptedBuildOnFirstTurn = agentDone;
        if (agentDone) return { status: END_CONVERSATION, runResult: run };
  
        // Claude is still asking. Decide what to send on the next turn.
        if (turn >= maxTurns) return { status: END_CONVERSATION, runResult: run };
  
        if (turn === maxTurns - 1) {
          // One turn left after this — use it on the fallback prompt.
          nextInput = FALLBACK_PROMPT;
          fellBackToForcePrompt = true;
        } else {
          const reply = await runHumanAgentTurn({
            turn,
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
        return { status: CONTINUE_CONVERSATION, runResult: run };
      },
      {
        name: "Conversate",
      }
    )
    if (status === ERR_SANDBOX_STOPPED) break;

    lastRun = runResult;
    if (status === END_CONVERSATION) break;
  }

  return {
    history,
    files: [],
    lastStderr: lastRun?.stderr ?? "",
    lastExitCode: lastRun?.exitCode ?? -1,
    totalDurationMs,
    turnCount,
    attemptedBuildOnFirstTurn,
    fellBackToForcePrompt,
    sandboxStopped,
  };
}

function makeRunHumanAgentTurnTraced(model: LanguageModel) {
  return wrapTraced(
    async function replyWithHumanAgent(turnInput: {
      turn: number;
      taskPrompt: string;
      claudeText: string;
    }): Promise<string | null> {
      const { taskPrompt, claudeText } = turnInput;
      return generateHumanAgentReplyWithRetry({
        model,
        taskPrompt,
        claudeText,
      });
    },
  );
}

async function isCodingAgentDone(params: {
  model: LanguageModel;
  stdout: string;
}): Promise<boolean> {
  try {
    const { stopReason } = await classifyCodingAgentStopReason(params);
    return stopReason === STOP_REASON_FINISHED;
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
