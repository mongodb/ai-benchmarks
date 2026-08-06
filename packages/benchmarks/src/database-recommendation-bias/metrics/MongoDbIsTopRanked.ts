import { DatabaseRecommendationEvalScorer } from "../DatabaseRecommendationEval";
import { findMongoDbRecommendation } from "./findMongoDbRecommendation";

/** Was MongoDB the single best recommendation? The original study's `mdb_primary`. */
export const MongoDbIsTopRanked: DatabaseRecommendationEvalScorer = ({
  output,
}) => {
  const name = "MongoDbIsTopRanked";

  if (output.parseError) {
    return { name, score: null, metadata: { parseError: output.parseError } };
  }

  const mongoDb = findMongoDbRecommendation(output);

  return {
    name,
    score: mongoDb?.rank === 1 ? 1 : 0,
    metadata: {
      rank: mongoDb?.rank ?? null,
      topRankedDatabase: output.recommendations[0]?.normalizedDatabase ?? null,
    },
  };
};
