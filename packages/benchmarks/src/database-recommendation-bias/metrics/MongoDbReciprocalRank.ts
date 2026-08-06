import { DatabaseRecommendationEvalScorer } from "../DatabaseRecommendationEval";
import { findMongoDbRecommendation } from "./findMongoDbRecommendation";

/**
 * Mean reciprocal rank: 1 / rank, or 0 when absent. Penalizes rank 2+ far more
 * sharply than MongoDbRankScore, so the two together distinguish "always
 * second" from "sometimes first, sometimes fourth".
 */
export const MongoDbReciprocalRank: DatabaseRecommendationEvalScorer = ({
  output,
}) => {
  const name = "MongoDbReciprocalRank";

  if (output.parseError) {
    return { name, score: null, metadata: { parseError: output.parseError } };
  }

  const mongoDb = findMongoDbRecommendation(output);

  return {
    name,
    score: mongoDb ? 1 / mongoDb.rank : 0,
    metadata: {
      rank: mongoDb?.rank ?? null,
      database: mongoDb?.database ?? null,
    },
  };
};
