import { MongoDbInRankedList } from "./MongoDbInRankedList";
import {
  emptyStringParseErrorOutput,
  failedOutput,
  makeOutput,
  makeRawOutput,
  runScorer,
} from "./testHelpers";

describe("MongoDbInRankedList", () => {
  test("names the score MongoDbInRankedList", () => {
    expect(runScorer(MongoDbInRankedList, makeOutput(1)).name).toBe(
      "MongoDbInRankedList"
    );
  });

  test("scores 1 when MongoDB appears", () => {
    expect(runScorer(MongoDbInRankedList, makeOutput(4)).score).toBe(1);
  });

  test("scores 0 when MongoDB is absent", () => {
    expect(runScorer(MongoDbInRankedList, makeOutput(null)).score).toBe(0);
  });

  test("scores null on parse failure and surfaces the parseError", () => {
    const result = runScorer(MongoDbInRankedList, failedOutput);
    expect(result.score).toBeNull();
    expect(result.metadata).toMatchObject({
      parseError: failedOutput.parseError,
    });
  });

  test("scores null when parseError is an empty string", () => {
    expect(
      runScorer(MongoDbInRankedList, emptyStringParseErrorOutput).score
    ).toBeNull();
  });

  test("records the competitor set in metadata", () => {
    const result = runScorer(MongoDbInRankedList, makeOutput(1));
    expect(result.metadata).toMatchObject({
      rankedDatabases: ["mongodb", "postgresql", "cassandra", "redis", "neo4j"],
    });
  });

  test("scores 1 for raw 'MongoDB Server'", () => {
    const output = makeRawOutput([
      { rank: 1, database: "MongoDB Server" },
      { rank: 2, database: "PostgreSQL" },
      { rank: 3, database: "Redis" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);
    expect(runScorer(MongoDbInRankedList, output).score).toBe(1);
  });

  test("scores 0 for 'Amazon DocumentDB' with no MongoDB present", () => {
    const output = makeRawOutput([
      { rank: 1, database: "Amazon DocumentDB" },
      { rank: 2, database: "PostgreSQL" },
      { rank: 3, database: "Redis" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);
    expect(runScorer(MongoDbInRankedList, output).score).toBe(0);
  });

  test("scores 0 for 'Azure Cosmos DB' with no MongoDB present", () => {
    const output = makeRawOutput([
      { rank: 1, database: "Azure Cosmos DB" },
      { rank: 2, database: "PostgreSQL" },
      { rank: 3, database: "Redis" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);
    expect(runScorer(MongoDbInRankedList, output).score).toBe(0);
  });

  test("scores 1 for raw 'MongoDB Atlas' at rank 3", () => {
    const output = makeRawOutput([
      { rank: 1, database: "PostgreSQL" },
      { rank: 2, database: "Redis" },
      { rank: 3, database: "MongoDB Atlas" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);
    expect(runScorer(MongoDbInRankedList, output).score).toBe(1);
  });
});
