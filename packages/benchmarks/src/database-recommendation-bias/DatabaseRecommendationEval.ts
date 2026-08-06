import {
  EvalParameters,
  EvalScorer,
  EvalTask,
} from "mongodb-rag-core/braintrust";
import {
  AppDevelopmentEvalCaseInput,
  AppDevelopmentMetadata,
} from "../app-development/AppDevelopmentEval";
import { RankableDatabase } from "./normalizeDatabaseName";

/**
 * Eval cases are shared with the app-development benchmark so any dataset
 * usable by one is usable by the other.
 */
export type DatabaseRecommendationEvalCaseInput = AppDevelopmentEvalCaseInput;
export type DatabaseRecommendationMetadata = AppDevelopmentMetadata;
export type DatabaseRecommendationExpected = void;

export interface DatabaseRecommendation {
  /** 1 to 5, unique within a ranking. */
  rank: number;
  /** The database name exactly as the model wrote it. */
  database: string;
  /** `database` mapped onto a canonical id, or "other". */
  normalizedDatabase: RankableDatabase;
  reason: string;
}

export type DatabaseRecommendationTaskOutput = {
  /** Sorted by rank ascending. Empty when `parseError` is set. */
  recommendations: DatabaseRecommendation[];
  /** Set when the model never produced a valid ranking. */
  parseError?: string;
};

export type DatabaseRecommendationEvalTask = EvalTask<
  DatabaseRecommendationEvalCaseInput,
  DatabaseRecommendationTaskOutput,
  DatabaseRecommendationExpected,
  DatabaseRecommendationMetadata,
  EvalParameters
>;

export type DatabaseRecommendationEvalScorer = EvalScorer<
  DatabaseRecommendationEvalCaseInput,
  DatabaseRecommendationTaskOutput,
  DatabaseRecommendationExpected,
  DatabaseRecommendationMetadata
>;
