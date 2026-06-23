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
