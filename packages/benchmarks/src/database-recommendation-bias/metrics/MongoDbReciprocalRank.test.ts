import { MongoDbReciprocalRank } from "./MongoDbReciprocalRank";
import {
  emptyStringParseErrorOutput,
  failedOutput,
  makeOutput,
  makeRawOutput,
  runScorer,
} from "./testHelpers";

describe("MongoDbReciprocalRank", () => {
  test("names the score MongoDbReciprocalRank", () => {
    expect(runScorer(MongoDbReciprocalRank, makeOutput(1)).name).toBe(
      "MongoDbReciprocalRank"
    );
  });

  test.each([
    [1, 1],
    [2, 0.5],
    [3, 1 / 3],
    [4, 0.25],
    [5, 0.2],
  ])("rank %i scores %f", (rank, expected) => {
    const result = runScorer(MongoDbReciprocalRank, makeOutput(rank));
    expect(result.score).toBeCloseTo(expected, 5);
    expect(result.metadata).toMatchObject({
      rank,
      database: "mongodb",
    });
  });

  test("scores 0 when absent", () => {
    const result = runScorer(MongoDbReciprocalRank, makeOutput(null));
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({ rank: null, database: null });
  });

  test("scores null on parse failure", () => {
    expect(runScorer(MongoDbReciprocalRank, failedOutput).score).toBeNull();
  });

  test("scores null when parseError is an empty string", () => {
    expect(
      runScorer(MongoDbReciprocalRank, emptyStringParseErrorOutput).score
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
    expect(runScorer(MongoDbReciprocalRank, output).score).toBe(1);
  });

  test("scores 0 for 'Amazon DocumentDB' at rank 1", () => {
    const output = makeRawOutput([
      { rank: 1, database: "Amazon DocumentDB" },
      { rank: 2, database: "PostgreSQL" },
      { rank: 3, database: "Redis" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);
    expect(runScorer(MongoDbReciprocalRank, output).score).toBe(0);
  });

  test("scores 0 for 'Azure Cosmos DB' at rank 1", () => {
    const output = makeRawOutput([
      { rank: 1, database: "Azure Cosmos DB" },
      { rank: 2, database: "PostgreSQL" },
      { rank: 3, database: "Redis" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);
    expect(runScorer(MongoDbReciprocalRank, output).score).toBe(0);
  });

  test("scores 1/3 for raw 'MongoDB Atlas' at rank 3", () => {
    const output = makeRawOutput([
      { rank: 1, database: "PostgreSQL" },
      { rank: 2, database: "Redis" },
      { rank: 3, database: "MongoDB Atlas" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);
    expect(runScorer(MongoDbReciprocalRank, output).score).toBeCloseTo(
      1 / 3,
      5
    );
  });
});
