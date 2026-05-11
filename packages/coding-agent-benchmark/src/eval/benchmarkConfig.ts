import fs from "fs";
import path from "path";
import yaml from "yaml";
import assert from "assert";
import {
  assertEnvVars,
  BRAINTRUST_ENV_VARS,
} from "mongodb-rag-core";
import { createOpenAI, wrapLanguageModel } from "mongodb-rag-core/aiSdk";
import { BraintrustMiddleware } from "mongodb-rag-core/braintrust";
import { models } from "mongodb-rag-core/models";

import { MentionsMongoDbInStdout } from "../scorers/stdout/MentionsMongoDbInStdout";
import { PrimaryDatabaseFromStdoutIsMongoDb } from "../scorers/stdout/PrimaryDatabaseFromStdout";
import { MongoDbInPackageJson } from "../scorers/files/MongoDbInPackageJson";
import { MongoDbInImports } from "../scorers/files/MongoDbInImports";
import { PrimaryDatabaseFromFilesIsMongoDb } from "../scorers/files/PrimaryDatabaseFromFiles";
import { AnyMongoDbMention } from "../scorers/AnyMongoDbMention";
import type {
  CodingAgentEvalCase,
  CodingAgentEvalCaseMetadata,
  CodingAgentEvalScorer,
} from "./CodingAgentEval";

const { BRAINTRUST_API_KEY, BRAINTRUST_ENDPOINT } = assertEnvVars({
  ...BRAINTRUST_ENV_VARS,
});

export const judgeModelLabel: (typeof models)[number]["label"] = "gpt-5.3-codex";
export const judgeModelConfig = models.find((m) => m.label === judgeModelLabel);
assert(judgeModelConfig, `Model ${judgeModelLabel} not found`);

const braintrustOpenAI = createOpenAI({
  apiKey: BRAINTRUST_API_KEY,
  baseURL: BRAINTRUST_ENDPOINT,
});

export const judgeModel = wrapLanguageModel({
  model: braintrustOpenAI.responses(judgeModelLabel),
  middleware: [BraintrustMiddleware({ debug: true })],
});

const DATASET_PATH = path.resolve(
  __dirname,
  "../../../benchmarks/datasets/app-development.yml"
);

interface RawDatasetEntry {
  name: string;
  messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export function loadAppDevelopmentDataset(): CodingAgentEvalCase[] {
  const raw = yaml.parse(
    fs.readFileSync(DATASET_PATH, "utf8")
  ) as RawDatasetEntry[];
  return raw.map((entry) => ({
    input: { name: entry.name, messages: entry.messages },
    tags: entry.tags ?? [],
    metadata: entry.metadata as unknown as CodingAgentEvalCaseMetadata,
  }));
}

export const datasets = {
  all: {
    description: "All 104 app-development eval cases",
    getDataset: async () => loadAppDevelopmentDataset(),
  },
  mongodb_optimal: {
    description: "Cases where MongoDB is the optimal database choice",
    getDataset: async () =>
      loadAppDevelopmentDataset().filter((d) =>
        d.tags.includes("mongodb-optimal")
      ),
  },
  db_agnostic: {
    description:
      "Cases where the prompt doesn't favor MongoDB — a different DB may be a better fit",
    getDataset: async () =>
      loadAppDevelopmentDataset().filter(
        (d) => !d.tags.includes("mongodb-optimal")
      ),
  },
};

export const scorers: Record<string, CodingAgentEvalScorer> = {
  AnyMongoDbMention,
  MongoDbInPackageJson,
  MongoDbInImports,
  MentionsMongoDbInStdout,
  PrimaryDatabaseFromFilesIsMongoDb,
  PrimaryDatabaseFromStdoutIsMongoDb,
};
