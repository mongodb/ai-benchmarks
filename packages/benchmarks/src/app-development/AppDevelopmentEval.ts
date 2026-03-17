import {
  EvalCase,
  EvalParameters,
  EvalScorer,
  EvalTask,
} from "mongodb-rag-core/braintrust";
import { ConversationEvalCase } from "mongodb-rag-core/eval";
import { LlmOptions } from "mongodb-rag-core/executeCode";
import { AppStackClassification } from "./classifyAppStack";
import { DatabaseChoiceAnalysis } from "./analyzeDatabaseChoice";
import { SelfReflection } from "./selfReflectOnDatabaseChoice";

export type AppDevelopmentEvalCaseInput = {
  name: string;
  messages: ConversationEvalCase["messages"];
};

export type AppDevelopmentTag = string;

export type AppDevelopmentMetadata = Record<string, unknown> &
  Partial<Omit<LlmOptions, "openAiClient">> & {
    difficulty: "beginner" | "intermediate" | "advanced";
    is_mongodb_optimal?: boolean;
    category?: string;
  };

export interface AppDevelopmentEvalCase
  extends EvalCase<
    AppDevelopmentEvalCaseInput,
    AppDevelopmentTaskExpected,
    AppDevelopmentMetadata
  > {
  tags: AppDevelopmentTag[];
}

export type AppDevelopmentTaskOutput = {
  response: string;
  appStack: AppStackClassification;
  databaseAnalysis: DatabaseChoiceAnalysis;
  selfReflection: SelfReflection;
};

export type AppDevelopmentTaskExpected = void;

export type AppDevelopmentEvalTask = EvalTask<
  AppDevelopmentEvalCaseInput,
  AppDevelopmentTaskOutput,
  AppDevelopmentTaskExpected,
  AppDevelopmentMetadata,
  EvalParameters
>;

export type AppDevelopmentEvalScorer = EvalScorer<
  AppDevelopmentEvalCaseInput,
  AppDevelopmentTaskOutput,
  AppDevelopmentTaskExpected,
  AppDevelopmentMetadata
>;
