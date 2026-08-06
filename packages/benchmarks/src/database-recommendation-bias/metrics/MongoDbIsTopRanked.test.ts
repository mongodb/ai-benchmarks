import { MongoDbIsTopRanked } from "./MongoDbIsTopRanked";
import {
  emptyStringParseErrorOutput,
  failedOutput,
  makeOutput,
  makeRawOutput,
  runScorer,
} from "./testHelpers";

describe("MongoDbIsTopRanked", () => {
  test("names the score MongoDbIsTopRanked", () => {
    expect(runScorer(MongoDbIsTopRanked, makeOutput(1)).name).toBe(
      "MongoDbIsTopRanked"
    );
  });

  test("scores 1 at rank 1 and reports rank metadata", () => {
    const result = runScorer(MongoDbIsTopRanked, makeOutput(1));
    expect(result.score).toBe(1);
    expect(result.metadata).toMatchObject({
      rank: 1,
      topRankedDatabase: "mongodb",
    });
  });

  test("scores 0 at rank 2 and reports the actual top database", () => {
    const result = runScorer(MongoDbIsTopRanked, makeOutput(2));
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({
      rank: 2,
      topRankedDatabase: "postgresql",
    });
  });

  test("scores 0 when absent and reports a null rank", () => {
    const result = runScorer(MongoDbIsTopRanked, makeOutput(null));
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({
      rank: null,
      topRankedDatabase: "postgresql",
    });
  });

  test("scores null on parse failure", () => {
    expect(runScorer(MongoDbIsTopRanked, failedOutput).score).toBeNull();
  });

  test("scores null when parseError is an empty string", () => {
    expect(
      runScorer(MongoDbIsTopRanked, emptyStringParseErrorOutput).score
    ).toBeNull();
  });

  test("scores 1 for raw 'MongoDB Server' at rank 1", () => {
    const output = makeRawOutput([
      { rank: 1, database: "MongoDB Server" },
      { rank: 2, database: "PostgreSQL" },
      { rank: 3, database: "Redis" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);
    expect(runScorer(MongoDbIsTopRanked, output).score).toBe(1);
  });

  test("scores 0 for 'Amazon DocumentDB' at rank 1", () => {
    const output = makeRawOutput([
      { rank: 1, database: "Amazon DocumentDB" },
      { rank: 2, database: "PostgreSQL" },
      { rank: 3, database: "Redis" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);
    expect(runScorer(MongoDbIsTopRanked, output).score).toBe(0);
  });

  test("scores 0 for 'Azure Cosmos DB' at rank 1", () => {
    const output = makeRawOutput([
      { rank: 1, database: "Azure Cosmos DB" },
      { rank: 2, database: "PostgreSQL" },
      { rank: 3, database: "Redis" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);
    expect(runScorer(MongoDbIsTopRanked, output).score).toBe(0);
  });

  test("scores 0 for raw 'MongoDB Atlas' at rank 3", () => {
    const output = makeRawOutput([
      { rank: 1, database: "PostgreSQL" },
      { rank: 2, database: "Redis" },
      { rank: 3, database: "MongoDB Atlas" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);
    expect(runScorer(MongoDbIsTopRanked, output).score).toBe(0);
  });
});
