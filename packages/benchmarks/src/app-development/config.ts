import fs from "fs";
import path from "path";
import yaml from "yaml";
import { createOpenAI, wrapLanguageModel } from "mongodb-rag-core/aiSdk";
import { BraintrustMiddleware } from "mongodb-rag-core/braintrust";
import { assertEnvVars, BRAINTRUST_ENV_VARS } from "mongodb-rag-core";
import { ModelConfig, models } from "mongodb-rag-core/models";
import assert from "assert";

import { BenchmarkConfig, ModelProvider } from "../cli/BenchmarkConfig";
import {
  AppDevelopmentEvalCase,
  AppDevelopmentEvalCaseInput,
  AppDevelopmentMetadata,
  AppDevelopmentTaskExpected,
  AppDevelopmentTaskOutput,
} from "./AppDevelopmentEval";
import { makeGenerateAppResponseTask } from "./generateAppResponseTask";
import { systemPromptVariants } from "./prompts";
import { PrimaryDatabaseIsMongoDb } from "./metrics/PrimaryDatabaseIsMongoDb";
import { MentionsMongoDbInGeneration } from "./metrics/MentionsMongoDbInGeneration";

const { BRAINTRUST_API_KEY, BRAINTRUST_ENDPOINT } = assertEnvVars({
  ...BRAINTRUST_ENV_VARS,
});

const braintrustOpenAI = createOpenAI({
  apiKey: BRAINTRUST_API_KEY,
  baseURL: BRAINTRUST_ENDPOINT,
});

export const judgeModelLabel: (typeof models)[number]["label"] =
  "gpt-5.3-codex";
export const judgeModelConfig = models.find(
  (m) => m.label === judgeModelLabel
)!;
assert(judgeModelConfig, `Model ${judgeModelLabel} not found`);

export const judgeModel = wrapLanguageModel({
  model: braintrustOpenAI.responses(judgeModelLabel),
  middleware: [BraintrustMiddleware({ debug: true })],
});

const DATASET_PATH = path.resolve(
  __dirname,
  "../../datasets/app-development.yml"
);

const CUSTOMER_SUCCESS_STORIES_PATH = path.resolve(
  __dirname,
  "../../datasets/customer_success_stories.short.yml"
);

const CUSTOMER_SUCCESS_STORIES_LONG_PATH = path.resolve(
  __dirname,
  "../../datasets/customer_success_stories.long.yml"
);
interface RawDatasetEntry {
  name: string;
  messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

function loadDataset(path: string): AppDevelopmentEvalCase[] {
  const raw = yaml.parse(fs.readFileSync(path, "utf8")) as RawDatasetEntry[];
  return raw.map((entry) => ({
    input: {
      name: entry.name,
      messages: entry.messages,
    },
    tags: entry.tags ?? [],
    metadata: entry.metadata as unknown as AppDevelopmentMetadata,
  }));
}

const SAMPLES_PER_CASE = 3;

export const appDevelopmentBenchmarkConfig: BenchmarkConfig<
  AppDevelopmentEvalCaseInput,
  AppDevelopmentTaskOutput,
  AppDevelopmentTaskExpected,
  AppDevelopmentMetadata
> = {
  projectName: "app-development",
  description:
    "Evaluates AI models on generating full-stack applications, with focus on database choice and MongoDB usage",

  datasets: {
    all: {
      description: "All 104 app-development eval cases",
      async getDataset() {
        return loadDataset(DATASET_PATH);
      },
    },
    mongodb_optimal: {
      description: "Cases where MongoDB is the optimal database choice",
      async getDataset() {
        return loadDataset(DATASET_PATH).filter((d) =>
          d.tags.includes("mongodb-optimal")
        );
      },
    },
    db_agnostic: {
      description:
        "Cases where the prompt doesn't favor MongoDB — a different DB may be a better fit",
      async getDataset() {
        return loadDataset(DATASET_PATH).filter(
          (d) => !d.tags.includes("mongodb-optimal")
        );
      },
    },
    customer_success_stories_short: {
      description: "Customer success stories (short)",
      async getDataset() {
        return loadDataset(CUSTOMER_SUCCESS_STORIES_PATH);
      },
    },
    customer_success_stories_long: {
      description: "Customer success stories (long)",
      async getDataset() {
        return loadDataset(CUSTOMER_SUCCESS_STORIES_LONG_PATH);
      },
    },
  },

  tasks: Object.fromEntries(
    Object.entries(systemPromptVariants).flatMap(([key, variant]) => {
      const makeTask = (sampleSize: number) => ({
        description:
          sampleSize === 1
            ? variant.description
            : `${variant.description} (${sampleSize}x samples)`,
        taskFunc: (modelProvider: ModelProvider, modelConfig: ModelConfig) => {
          const subjectModel = wrapLanguageModel({
            model: createOpenAI({
              apiKey: modelProvider.apiKey,
              baseURL: modelProvider.baseUrl,
            }).chat(modelConfig.deployment),
            middleware: [BraintrustMiddleware({ debug: true })],
          });

          return makeGenerateAppResponseTask({
            subjectModel,
            judgeModel,
            systemPrompt: variant.prompt || undefined,
            sampleSize,
          });
        },
      });

      return [
        [`prompt_${key}`, makeTask(1)],
        [`prompt_${key}_x${SAMPLES_PER_CASE}`, makeTask(SAMPLES_PER_CASE)],
      ];
    })
  ),

  scorers: {
    primary_database_is_mongodb: {
      description:
        "Checks if MongoDB was chosen as the primary database (pass@k, pass%k, pass^k)",
      scorerFunc: PrimaryDatabaseIsMongoDb,
    },
    mentions_mongodb: {
      description:
        "Checks if MongoDB is referenced anywhere in the generation (pass@k, pass%k, pass^k)",
      scorerFunc: MentionsMongoDbInGeneration,
    },
  },
};
