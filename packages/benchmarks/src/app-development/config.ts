import { createOpenAI, wrapLanguageModel } from "mongodb-rag-core/aiSdk";
import { BraintrustMiddleware } from "mongodb-rag-core/braintrust";
import { assertEnvVars, BRAINTRUST_ENV_VARS } from "mongodb-rag-core";
import { ModelConfig, models } from "mongodb-rag-core/models";
import assert from "assert";

import { BenchmarkConfig, ModelProvider } from "../cli/BenchmarkConfig";
import {
  AppDevelopmentEvalCaseInput,
  AppDevelopmentMetadata,
  AppDevelopmentTaskExpected,
  AppDevelopmentTaskOutput,
} from "./AppDevelopmentEval";
import { appDevelopmentDatasets } from "./datasets";
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

  datasets: appDevelopmentDatasets,

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
