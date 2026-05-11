import fs from "fs";
import path from "path";
import yaml from "yaml";
import { models } from "mongodb-rag-core/models";
import assert from "assert";

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

export interface AppDevelopmentDatasetEntry {
  input: {
    name: string;
    messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
  };
  tags: string[];
  metadata: {
    difficulty: "beginner" | "intermediate" | "advanced";
    is_mongodb_optimal?: boolean;
    category?: string;
  };
}

export function loadAppDevelopmentDataset(): AppDevelopmentDatasetEntry[] {
  const raw = yaml.parse(
    fs.readFileSync(DATASET_PATH, "utf8")
  ) as RawDatasetEntry[];
  return raw.map((entry) => ({
    input: { name: entry.name, messages: entry.messages },
    tags: entry.tags ?? [],
    metadata: entry.metadata as AppDevelopmentDatasetEntry["metadata"],
  }));
}

export const judgeModelLabel: (typeof models)[number]["label"] = "gpt-5.3-codex";
export const judgeModelConfig = models.find((m) => m.label === judgeModelLabel)!;
assert(judgeModelConfig, `Model ${judgeModelLabel} not found`);
