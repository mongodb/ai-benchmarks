import { DatabaseRecommendationEvalScorer } from "../DatabaseRecommendationEval";
import { findMongoDbRecommendation } from "./findMongoDbRecommendation";

/** Did the model recommend MongoDB at all? The original study's `mdb_mentioned`. */
export const MongoDbInRankedList: DatabaseRecommendationEvalScorer = ({
  output,
}) => {
  const name = "MongoDbInRankedList";

  if (output.parseError !== undefined) {
    return { name, score: null, metadata: { parseError: output.parseError } };
  }

  return {
    name,
    score: findMongoDbRecommendation(output) ? 1 : 0,
    metadata: {
      rankedDatabases: output.recommendations.map((r) => r.normalizedDatabase),
    },
  };
};
