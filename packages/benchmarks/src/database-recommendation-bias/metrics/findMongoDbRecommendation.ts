import {
  DatabaseRecommendation,
  DatabaseRecommendationTaskOutput,
} from "../DatabaseRecommendationEval";

/**
 * Locate MongoDB in a ranking by canonical id, so "MongoDB Atlas" counts and
 * MongoDB-compatible competitors like DocumentDB and Cosmos DB do not.
 */
export function findMongoDbRecommendation(
  output: DatabaseRecommendationTaskOutput
): DatabaseRecommendation | undefined {
  return output.recommendations.find(
    (r) => r.normalizedDatabase === "mongodb"
  );
}
