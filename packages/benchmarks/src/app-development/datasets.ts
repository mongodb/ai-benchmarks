import fs from "fs";
import path from "path";
import yaml from "yaml";
import { strict as assert } from "assert";

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

const notableCustomerSuccessStories = [
  /** Ceto AI - vector + time-series + real-time predictive analytics on fleet sensors */
  "task_0037",
  /** Amadeus - AI incident investigation over logs; classic Atlas Vector Search shape */
  "task_0009",
  /** ICIS - GenAI over real-time commodities data; vector + document store */
  "task_0086",
  /** LG U+ - call-center AI assistant; RAG / semantic retrieval over messy knowledge */
  "task_0104",
  /** Electrolux - appliance telemetry; clean time-series collections case */
  "task_0056",
  /** AXA - real-time cyber + geospatial risk insights; analytics + geo + compliance */
  "task_0016",
  /** Beni - 300M+ listing catalog with 1M+ daily updates; flexible schema at scale */
  "task_0021",
  /** Evernorth - personalized health-record single view; document embedding / patient-360 */
  "task_0064",
];

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

function loadNotableCustomerSuccessStoriesDataset(
  datasetPath: string
): AppDevelopmentEvalCase[] {
  const notable = loadAppDevelopmentDataset(datasetPath).filter(
    (d) =>
      typeof d.metadata.id === "string" &&
      notableCustomerSuccessStories.includes(d.metadata.id)
  );
  assert(
    notable.length === notableCustomerSuccessStories.length,
    `Not all notable customer success stories were found. Expected ${
      notableCustomerSuccessStories.length
    } but got ${notable.length}. Expected: ${notableCustomerSuccessStories.join(
      ", "
    )}. Got: ${notable.map((d) => d.metadata.id).join(", ")}`
  );
  return notable;
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
  customer_success_stories_notable_short: {
    description: "Notable customer success stories (short)",
    async getDataset() {
      return loadNotableCustomerSuccessStoriesDataset(
        CUSTOMER_SUCCESS_STORIES_SHORT_PATH
      );
    },
  },
  customer_success_stories_notable_long: {
    description: "Notable customer success stories (long)",
    async getDataset() {
      return loadNotableCustomerSuccessStoriesDataset(
        CUSTOMER_SUCCESS_STORIES_LONG_PATH
      );
    },
  },
};
