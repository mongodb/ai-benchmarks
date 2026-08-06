import {
  EvalCase,
  EvalParameters,
  EvalScorer,
  EvalTask,
} from "mongodb-rag-core/braintrust";
import {
  AppDevelopmentEvalCaseInput,
  AppDevelopmentMetadata,
  AppDevelopmentTag,
} from "../app-development/AppDevelopmentEval";
import { DetectedDbLibrary } from "./utils/extractDbLibrariesUsed";

export type CodingAgentAppDevelopmentEvalCaseInput =
  AppDevelopmentEvalCaseInput;

export type CodingAgentAppDevelopmentTag = AppDevelopmentTag;

export type CodingAgentAppDevelopmentMetadata = AppDevelopmentMetadata;

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
  databaseLibraries: DetectedDbLibrary[];
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
