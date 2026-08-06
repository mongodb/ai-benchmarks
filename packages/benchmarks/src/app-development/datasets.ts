import fs from "fs";
import path from "path";
import yaml from "yaml";

import { BenchmarkDataset } from "../cli/BenchmarkConfig";
import {
  AppDevelopmentEvalCase,
  AppDevelopmentEvalCaseInput,
  AppDevelopmentMetadata,
  AppDevelopmentTaskExpected,
} from "./AppDevelopmentEval";

const APP_DEVELOPMENT_PATH = path.resolve(
  __dirname,
  "../../datasets/app-development.yml"
);

const CUSTOMER_SUCCESS_STORIES_SHORT_PATH = path.resolve(
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

/**
 * Load a YAML eval-case file into Braintrust eval cases.
 *
 * Shared by every benchmark that operates on app-development eval cases,
 * so that a dataset added here is immediately available to all of them.
 */
export function loadAppDevelopmentDataset(
  datasetPath: string
): AppDevelopmentEvalCase[] {
  const raw = yaml.parse(
    fs.readFileSync(datasetPath, "utf8")
  ) as RawDatasetEntry[];
  return raw.map((entry) => ({
    input: {
      name: entry.name,
      messages: entry.messages,
    },
    tags: entry.tags ?? [],
    metadata: (entry.metadata ?? {}) as unknown as AppDevelopmentMetadata,
  }));
}

export const appDevelopmentDatasets: Record<
  string,
  BenchmarkDataset<
    AppDevelopmentEvalCaseInput,
    AppDevelopmentTaskExpected,
    AppDevelopmentMetadata
  >
> = {
  all: {
    description: "All 104 app-development eval cases",
    async getDataset() {
      return loadAppDevelopmentDataset(APP_DEVELOPMENT_PATH);
    },
  },
  mongodb_optimal: {
    description: "Cases where MongoDB is the optimal database choice",
    async getDataset() {
      return loadAppDevelopmentDataset(APP_DEVELOPMENT_PATH).filter((d) =>
        d.tags.includes("mongodb-optimal")
      );
    },
  },
  db_agnostic: {
    description:
      "Cases where the prompt doesn't favor MongoDB — a different DB may be a better fit",
    async getDataset() {
      return loadAppDevelopmentDataset(APP_DEVELOPMENT_PATH).filter(
        (d) => !d.tags.includes("mongodb-optimal")
      );
    },
  },
  customer_success_stories_short: {
    description: "Customer success stories (short)",
    async getDataset() {
      return loadAppDevelopmentDataset(CUSTOMER_SUCCESS_STORIES_SHORT_PATH);
    },
  },
  customer_success_stories_long: {
    description: "Customer success stories (long)",
    async getDataset() {
      return loadAppDevelopmentDataset(CUSTOMER_SUCCESS_STORIES_LONG_PATH);
    },
  },
};
