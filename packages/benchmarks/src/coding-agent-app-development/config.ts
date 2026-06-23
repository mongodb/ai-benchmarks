import { BenchmarkConfig } from "../cli/BenchmarkConfig";
import {
  CodingAgentAppDevelopmentEvalCaseInput,
  CodingAgentAppDevelopmentTaskOutput,
  CodingAgentAppDevelopmentTaskExpected,
  CodingAgentAppDevelopmentMetadata,
} from "./CodingAgentAppDevelopmentEval";
import { loadAppDevelopmentDataset } from "./loadAppDevelopmentDataset";
import { MongoDbInCode } from "./metrics/MongoDbInCode";
import { MongoDbInTranscript } from "./metrics/MongoDbInTranscript";

export const codingAgentAppDevelopmentBenchmarkConfig: BenchmarkConfig<
  CodingAgentAppDevelopmentEvalCaseInput,
  CodingAgentAppDevelopmentTaskOutput,
  CodingAgentAppDevelopmentTaskExpected,
  CodingAgentAppDevelopmentMetadata
> = {
  projectName: "coding-agent-app-development",
  description:
    "Evaluates coding agents on generating full-stack applications, with focus on database choice and MongoDB usage",

  datasets: {
    all: {
      description: "All 104 app-development eval cases",
      async getDataset() {
        return loadAppDevelopmentDataset();
      },
    },
    mongodb_optimal: {
      description: "Cases where MongoDB is the optimal database choice",
      async getDataset() {
        return loadAppDevelopmentDataset().filter((d) =>
          d.tags.includes("mongodb-optimal")
        );
      },
    },
    db_agnostic: {
      description:
        "Cases where the prompt doesn't favor MongoDB — a different DB may be a better fit",
      async getDataset() {
        return loadAppDevelopmentDataset().filter(
          (d) => !d.tags.includes("mongodb-optimal")
        );
      },
    },
  },

  tasks: {
    // TODO: real implementation!
  },

  scorers: {
    mongodb_in_code: {
      description:
        "Checks if MongoDB is used in the generated code by detecting a MongoDB library import in any source file",
      scorerFunc: MongoDbInCode,
    },
    mongodb_in_transcript: {
      description:
        "Checks if MongoDB is mentioned in the generation transcript written to stdout",
      scorerFunc: MongoDbInTranscript,
    },
  },
};
