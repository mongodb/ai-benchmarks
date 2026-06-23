import {
  EvalCase,
  EvalParameters,
  EvalScorer,
  EvalTask,
} from "mongodb-rag-core/braintrust";
import { ConversationEvalCase } from "mongodb-rag-core/eval";
import { LlmOptions } from "mongodb-rag-core/executeCode";

export type CodingAgentAppDevelopmentEvalCaseInput = {
  name: string;
  messages: ConversationEvalCase["messages"];
};

export type CodingAgentAppDevelopmentTag = string;

export type CodingAgentAppDevelopmentMetadata = Record<string, unknown> &
  Partial<Omit<LlmOptions, "openAiClient">> & {
    difficulty: "beginner" | "intermediate" | "advanced";
    is_mongodb_optimal?: boolean;
    category?: string;
  };

export interface CodingAgentAppDevelopmentEvalCase
  extends EvalCase<
    CodingAgentAppDevelopmentEvalCaseInput,
    CodingAgentAppDevelopmentTaskExpected,
    CodingAgentAppDevelopmentMetadata
  > {
  tags: CodingAgentAppDevelopmentTag[];
}

export type Files = Record<string, string>;

export type CodingAgentAppDevelopmentTaskOutput = {
  transcript: string;
  files: Files;
};

export type CodingAgentAppDevelopmentTaskExpected = void;

export type CodingAgentAppDevelopmentEvalTask = EvalTask<
  CodingAgentAppDevelopmentEvalCaseInput,
  CodingAgentAppDevelopmentTaskOutput,
  CodingAgentAppDevelopmentTaskExpected,
  CodingAgentAppDevelopmentMetadata,
  EvalParameters
>;

export type CodingAgentAppDevelopmentEvalScorer = EvalScorer<
  CodingAgentAppDevelopmentEvalCaseInput,
  CodingAgentAppDevelopmentTaskOutput,
  CodingAgentAppDevelopmentTaskExpected,
  CodingAgentAppDevelopmentMetadata
>;
