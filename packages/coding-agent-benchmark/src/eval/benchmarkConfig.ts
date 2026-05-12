import assert from "assert";
import {
  assertEnvVars,
  BRAINTRUST_ENV_VARS,
} from "mongodb-rag-core";
import { createOpenAI, wrapLanguageModel } from "mongodb-rag-core/aiSdk";
import { BraintrustMiddleware } from "mongodb-rag-core/braintrust";
import { models } from "mongodb-rag-core/models";
import {
  loadAppDevelopmentDataset,
} from "benchmarks";
import { MongoDbMentioned } from "../scorers/MongoDbMentionedScorer";
import type {
  CodingAgentEvalCase,
  CodingAgentEvalScorer,
} from "./CodingAgentEval";

const { BRAINTRUST_API_KEY, BRAINTRUST_ENDPOINT } = assertEnvVars({
  ...BRAINTRUST_ENV_VARS,
});

const { CODE_JUDGE_MODEL, LIGHT_JUDGE_MODEL } = assertEnvVars({
  CODE_JUDGE_MODEL: "",
  LIGHT_JUDGE_MODEL: "",
});

// Validate model labels
const codeJudgeModelConfig = models.find((m) => m.label === CODE_JUDGE_MODEL);
assert(codeJudgeModelConfig, `Model ${CODE_JUDGE_MODEL} not found`);

const lightJudgeModelConfig = models.find((m) => m.label === LIGHT_JUDGE_MODEL);
assert(lightJudgeModelConfig, `Model ${LIGHT_JUDGE_MODEL} not found`);

// Create model connections w/ Braintrust middleware
export const codeJudgeModel = wrapLanguageModel({
  model: createOpenAI({
    apiKey: BRAINTRUST_API_KEY,
    baseURL: BRAINTRUST_ENDPOINT,
  }).responses(codeJudgeModelConfig.label),
  middleware: [BraintrustMiddleware({ debug: true })],
});

export const lightJudgeModel = wrapLanguageModel({
  model: createOpenAI({
    apiKey: BRAINTRUST_API_KEY,
    baseURL: BRAINTRUST_ENDPOINT,
  }).responses(lightJudgeModelConfig.label),
  middleware: [BraintrustMiddleware({ debug: true })],
});

export function loadDataset(): CodingAgentEvalCase[] {
  return loadAppDevelopmentDataset() satisfies CodingAgentEvalCase[];
}

export const datasets = {
  "app-development": {
    description: "All 104 app-development eval cases",
    getCases: async () => loadDataset(),
  },
  mongodb_optimal: {
    description: "Cases where MongoDB is the optimal database choice",
    getCases: async () =>
      loadDataset().filter((d) => d.tags.includes("mongodb-optimal")),
  },
  db_agnostic: {
    description:
      "Cases where the prompt doesn't favor MongoDB — a different DB may be a better fit",
      getCases: async () =>
      loadDataset().filter((d) => !d.tags.includes("mongodb-optimal")),
  },
};

export const scorers: Record<string, CodingAgentEvalScorer> = {
  MongoDbMentioned,
};
