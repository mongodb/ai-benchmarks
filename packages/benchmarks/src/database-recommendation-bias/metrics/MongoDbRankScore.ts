import { DatabaseRecommendationEvalScorer } from "../DatabaseRecommendationEval";
import { findMongoDbRecommendation } from "./findMongoDbRecommendation";

/**
 * MongoDB's position mapped linearly onto 0–1: rank 1 -> 1.0, rank 5 -> 0.2,
 * absent -> 0. The original study used a sentinel rank of 6 for absence; an
 * explicit null rank plus a 0 score carries the same information without
 * leaking a magic number into aggregates.
 */
export const MongoDbRankScore: DatabaseRecommendationEvalScorer = ({
  output,
}) => {
  const name = "MongoDbRankScore";

  if (output.parseError !== undefined) {
    return { name, score: null, metadata: { parseError: output.parseError } };
  }

  const mongoDb = findMongoDbRecommendation(output);

  return {
    name,
    score: mongoDb ? (6 - mongoDb.rank) / 5 : 0,
    metadata: {
      rank: mongoDb?.rank ?? null,
      database: mongoDb?.database ?? null,
    },
  };
};
