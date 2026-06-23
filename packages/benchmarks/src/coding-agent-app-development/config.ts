import { BenchmarkConfig } from "../cli/BenchmarkConfig";
import {
  CodingAgentAppDevelopmentEvalCaseInput,
  CodingAgentAppDevelopmentTaskOutput,
  CodingAgentAppDevelopmentTaskExpected,
  CodingAgentAppDevelopmentMetadata,
} from "./CodingAgentAppDevelopmentEval";
import { loadAppDevelopmentDataset } from "./loadAppDevelopmentDataset";

export const appDevelopmentBenchmarkConfig: BenchmarkConfig<
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
    primary_database_is_mongodb: {
      description: "Checks if MongoDB was chosen as the primary database",
      scorerFunc: (args) => {
        // TODO: real implementation!
        return 0;
      },
    },
    mentions_mongodb: {
      description: "Checks if MongoDB is referenced anywhere in the generation",
      scorerFunc: (args) => {
        // TODO: real implementation!
        return 0;
      },
    },
  },
};
