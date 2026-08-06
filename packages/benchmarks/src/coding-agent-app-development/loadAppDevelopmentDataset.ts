import { AppDevelopmentMetadata } from "../app-development/AppDevelopmentEval";
import { CodingAgentAppDevelopmentEvalCase } from "./CodingAgentAppDevelopmentEval";
import fs from "fs";
import path from "path";
import yaml from "yaml";

const DATASET_PATH = path.resolve(
  __dirname,
  "../../datasets/app-development.yml"
);

interface RawDatasetEntry {
  name: string;
  messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export function loadAppDevelopmentDataset(): CodingAgentAppDevelopmentEvalCase[] {
  const raw = yaml.parse(
    fs.readFileSync(DATASET_PATH, "utf8")
  ) as RawDatasetEntry[];
  return raw.map((entry) => ({
    input: {
      name: entry.name,
      messages: entry.messages,
    },
    tags: entry.tags ?? [],
    metadata: entry.metadata as unknown as AppDevelopmentMetadata,
  }));
}

const CUSTOMER_SUCCESS_STORIES_SHORT_PATH = path.resolve(
  __dirname,
  "../../datasets/customer_success_stories.short.yml"
);
const CUSTOMER_SUCCESS_STORIES_LONG_PATH = path.resolve(
  __dirname,
  "../../datasets/customer_success_stories.long.yml"
);

export function loadCustomerSuccessStoriesDataset(
  length: "short" | "long"
): CodingAgentAppDevelopmentEvalCase[] {
  const path =
    length === "short"
      ? CUSTOMER_SUCCESS_STORIES_SHORT_PATH
      : CUSTOMER_SUCCESS_STORIES_LONG_PATH;
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
