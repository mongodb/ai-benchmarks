import { createOpenAI, wrapLanguageModel } from "mongodb-rag-core/aiSdk";
import { BraintrustMiddleware } from "mongodb-rag-core/braintrust";
import { ModelConfig } from "mongodb-rag-core/models";

import { BenchmarkConfig, ModelProvider } from "../cli/BenchmarkConfig";
import { appDevelopmentDatasets } from "../app-development/datasets";
import {
  DatabaseRecommendationEvalCaseInput,
  DatabaseRecommendationExpected,
  DatabaseRecommendationMetadata,
  DatabaseRecommendationTaskOutput,
} from "./DatabaseRecommendationEval";
import { makeRankDatabasesTask } from "./rankDatabasesTask";
import { MongoDbInRankedList } from "./metrics/MongoDbInRankedList";
import { MongoDbIsTopRanked } from "./metrics/MongoDbIsTopRanked";
import { MongoDbRankScore } from "./metrics/MongoDbRankScore";
import { MongoDbReciprocalRank } from "./metrics/MongoDbReciprocalRank";
import { ValidRankedList } from "./metrics/ValidRankedList";

export const databaseRecommendationBiasBenchmarkConfig: BenchmarkConfig<
  DatabaseRecommendationEvalCaseInput,
  DatabaseRecommendationTaskOutput,
  DatabaseRecommendationExpected,
  DatabaseRecommendationMetadata
> = {
  projectName: "database-recommendation-bias",
  description:
    "Measures bias toward recommending MongoDB by asking models to rank five databases by fit for an application. Replicates https://github.com/10gen/llm_mdb_bias_eval.",

  datasets: appDevelopmentDatasets,

  tasks: {
    rank_databases: {
      description:
        "Ask for five databases ranked by fit, with no system prompt. Use --trialCount for replication.",
      taskFunc: (modelProvider: ModelProvider, modelConfig: ModelConfig) => {
        const subjectModel = wrapLanguageModel({
          model: createOpenAI({
            apiKey: modelProvider.apiKey,
            baseURL: modelProvider.baseUrl,
          }).chat(modelConfig.deployment),
          middleware: [BraintrustMiddleware({ debug: true })],
        });

        return makeRankDatabasesTask({ subjectModel });
      },
    },
  },

  scorers: {
    mongodb_in_ranked_list: {
      description: "MongoDB appears anywhere in the ranked list",
      scorerFunc: MongoDbInRankedList,
    },
    mongodb_is_top_ranked: {
      description: "MongoDB is ranked 1",
      scorerFunc: MongoDbIsTopRanked,
    },
    mongodb_rank_score: {
      description:
        "MongoDB's rank mapped linearly onto 0-1 — rank 1 is 1.0, rank 5 is 0.2, absent is 0",
      scorerFunc: MongoDbRankScore,
    },
    mongodb_reciprocal_rank: {
      description: "1 / MongoDB's rank, 0 when absent",
      scorerFunc: MongoDbReciprocalRank,
    },
    valid_ranked_list: {
      description:
        "The model produced a valid five-item ranking — guards against reading parse failures as bias signal",
      scorerFunc: ValidRankedList,
    },
  },
};
