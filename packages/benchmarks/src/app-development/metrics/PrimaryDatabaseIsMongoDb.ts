import { Score } from "autoevals";
import { LanguageModel } from "mongodb-rag-core/aiSdk";
import { AppDevelopmentEvalScorer } from "../AppDevelopmentEval";
import {
  classifyAppStack,
  AppStackClassification,
} from "./classifyAppStack";

/**
 * LLM-as-a-judge scorer that determines whether MongoDB is the
 * primary database in the generated application.
 *
 * Uses the shared {@link classifyAppStack} classifier and checks
 * the `primaryDatabase` dimension.
 */
export const makePrimaryDatabaseIsMongoDb: (
  model: LanguageModel
) => AppDevelopmentEvalScorer =
  (model) =>
  async ({ output }): Promise<Score> => {
    const name = "PrimaryDatabaseIsMongoDb";

    try {
      const classification = await classifyAppStack(model, output.response);
      const db = classification.primaryDatabase;

      return {
        name,
        score:
          db === null ? null : /mongodb/i.test(db) ? 1 : 0,
        metadata: {
          primaryDatabase: db,
          fullClassification: classification,
        },
      };
    } catch (err) {
      return {
        name,
        score: null,
        metadata: {
          error: String(err),
        },
      };
    }
  };
