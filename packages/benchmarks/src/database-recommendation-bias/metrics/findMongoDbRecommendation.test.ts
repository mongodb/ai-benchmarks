import { DatabaseRecommendationTaskOutput } from "../DatabaseRecommendationEval";
import { findMongoDbRecommendation } from "./findMongoDbRecommendation";
import { makeOutput } from "./testHelpers";

describe("findMongoDbRecommendation", () => {
  test("returns the MongoDB entry by canonical id", () => {
    const output = makeOutput(3);
    expect(findMongoDbRecommendation(output)).toMatchObject({
      rank: 3,
      normalizedDatabase: "mongodb",
    });
  });

  test("returns undefined when MongoDB is absent", () => {
    expect(findMongoDbRecommendation(makeOutput(null))).toBeUndefined();
  });

  test("ignores MongoDB-compatible competitors that normalize to other ids", () => {
    const output: DatabaseRecommendationTaskOutput = {
      recommendations: [
        {
          rank: 1,
          database: "Amazon DocumentDB",
          normalizedDatabase: "documentdb",
          reason: "Compatible API.",
        },
        {
          rank: 2,
          database: "Azure Cosmos DB",
          normalizedDatabase: "cosmosdb",
          reason: "Managed document store.",
        },
        {
          rank: 3,
          database: "PostgreSQL",
          normalizedDatabase: "postgresql",
          reason: "Relational.",
        },
        {
          rank: 4,
          database: "Redis",
          normalizedDatabase: "redis",
          reason: "Cache.",
        },
        {
          rank: 5,
          database: "Neo4j",
          normalizedDatabase: "neo4j",
          reason: "Graph.",
        },
      ],
    };

    expect(findMongoDbRecommendation(output)).toBeUndefined();
  });
});
