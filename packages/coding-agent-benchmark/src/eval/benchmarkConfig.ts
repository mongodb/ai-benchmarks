import {
  assertEnvVars,
  BRAINTRUST_ENV_VARS,
} from "mongodb-rag-core";
import { createOpenAI, wrapLanguageModel } from "mongodb-rag-core/aiSdk";
import { BraintrustMiddleware } from "mongodb-rag-core/braintrust";
import {
  judgeModelLabel,
  judgeModelConfig,
  loadAppDevelopmentDataset,
} from "benchmarks";
import { MongoDbMentioned } from "../scorers/MongoDbMentionedScorer";
import type {
  CodingAgentEvalCase,
  CodingAgentEvalScorer,
} from "./CodingAgentEval";

export { judgeModelLabel, judgeModelConfig };

const { BRAINTRUST_API_KEY, BRAINTRUST_ENDPOINT } = assertEnvVars({
  ...BRAINTRUST_ENV_VARS,
});

export const judgeModel = wrapLanguageModel({
  model: createOpenAI({
    apiKey: BRAINTRUST_API_KEY,
    baseURL: BRAINTRUST_ENDPOINT,
  }).responses(judgeModelLabel),
  middleware: [BraintrustMiddleware({ debug: true })],
});

export function loadDataset(): CodingAgentEvalCase[] {
  return loadAppDevelopmentDataset() satisfies CodingAgentEvalCase[];
}

export const datasets = {
  all: {
    description: "All 104 app-development eval cases",
    getDataset: async () => loadDataset(),
  },
  mongodb_optimal: {
    description: "Cases where MongoDB is the optimal database choice",
    getDataset: async () =>
      loadDataset().filter((d) => d.tags.includes("mongodb-optimal")),
  },
  db_agnostic: {
    description:
      "Cases where the prompt doesn't favor MongoDB — a different DB may be a better fit",
    getDataset: async () =>
      loadDataset().filter((d) => !d.tags.includes("mongodb-optimal")),
  },
};

export const scorers: Record<string, CodingAgentEvalScorer> = {
  MongoDbMentioned,
};
