import {
  EvalCase,
  EvalParameters,
  EvalScorer,
  EvalTask,
} from "mongodb-rag-core/braintrust";
import { ConversationEvalCase } from "mongodb-rag-core/eval";
import type { AppStackClassification } from "benchmarks";
import type { GeneratedFile } from "../sandbox/SandboxResult";

export type CodingAgentEvalCaseInput = {
  name: string;
  messages: ConversationEvalCase["messages"];
};

export type CodingAgentEvalCaseMetadata = {
  difficulty: "beginner" | "intermediate" | "advanced";
  is_mongodb_optimal?: boolean;
  category?: string;
};

export type ConversationTurn = {
  role: "human" | "claude";
  content: string;
};

export type CodingAgentSample = {
  stdout: string;
  stderr: string;
  exitCode: number;
  files: GeneratedFile[];
  durationMs: number;
  primaryLanguage: string | null;
  stdoutClassification: AppStackClassification;
  fileClassification: AppStackClassification;
  askedQuestionOnFirstAttempt: boolean;
  askedQuestionOnRetry: boolean | null;
  retried: boolean;
  /** Only populated by the conversation runner. */
  turnCount?: number;
  fellBackToForcePrompt?: boolean;
  conversationHistory?: ConversationTurn[];
  /** True when the Vercel sandbox died mid-conversation (e.g. lifetime cap hit). */
  sandboxStopped?: boolean;
};

export type CodingAgentTaskOutput = {
  samples: CodingAgentSample[];
};

export type CodingAgentTaskExpected = void;

export type CodingAgentEvalCase = EvalCase<
  CodingAgentEvalCaseInput,
  CodingAgentTaskExpected,
  CodingAgentEvalCaseMetadata
> & { tags: string[] };

export type CodingAgentEvalTask = EvalTask<
  CodingAgentEvalCaseInput,
  CodingAgentTaskOutput,
  CodingAgentTaskExpected,
  CodingAgentEvalCaseMetadata,
  EvalParameters
>;

export type CodingAgentEvalScorer = EvalScorer<
  CodingAgentEvalCaseInput,
  CodingAgentTaskOutput,
  CodingAgentTaskExpected,
  CodingAgentEvalCaseMetadata
>;
