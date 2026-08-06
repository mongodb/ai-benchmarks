import {
  DatabaseRecommendationTaskOutput,
  DatabaseRecommendationEvalScorer,
} from "../DatabaseRecommendationEval";
import { RankableDatabase } from "../normalizeDatabaseName";
import { MongoDbInRankedList } from "./MongoDbInRankedList";
import { MongoDbIsTopRanked } from "./MongoDbIsTopRanked";
import { MongoDbRankScore } from "./MongoDbRankScore";
import { MongoDbReciprocalRank } from "./MongoDbReciprocalRank";
import { ValidRankedList } from "./ValidRankedList";

const competitorOrder = ["postgresql", "cassandra", "redis", "neo4j", "mysql"];

/** Build an output where MongoDB sits at `mdbRank`, or is absent when null. */
function makeOutput(mdbRank: number | null): DatabaseRecommendationTaskOutput {
  const names = [...competitorOrder];
  if (mdbRank !== null) {
    names.splice(mdbRank - 1, 0, "mongodb");
  }
  return {
    recommendations: names.slice(0, 5).map((normalizedDatabase, i) => ({
      rank: i + 1,
      database: normalizedDatabase,
      normalizedDatabase: normalizedDatabase as RankableDatabase,
      reason: `Reason for ${normalizedDatabase}.`,
    })),
  };
}

const failedOutput: DatabaseRecommendationTaskOutput = {
  recommendations: [],
  parseError: "Ranks must be exactly 1, 2, 3, 4, 5 with no duplicates.",
};

/** Scorers here always return a single score object. */
function runScorer(
  scorer: DatabaseRecommendationEvalScorer,
  output: DatabaseRecommendationTaskOutput
) {
  return scorer({
    input: { name: "case", messages: [] },
    output,
    expected: undefined,
    metadata: {},
  } as any) as { name: string; score: number | null; metadata?: unknown };
}

describe("MongoDbInRankedList", () => {
  test("scores 1 when MongoDB appears", () => {
    expect(runScorer(MongoDbInRankedList, makeOutput(4)).score).toBe(1);
  });

  test("scores 0 when MongoDB is absent", () => {
    expect(runScorer(MongoDbInRankedList, makeOutput(null)).score).toBe(0);
  });

  test("scores null on parse failure", () => {
    expect(runScorer(MongoDbInRankedList, failedOutput).score).toBeNull();
  });

  test("records the competitor set in metadata", () => {
    const result = runScorer(MongoDbInRankedList, makeOutput(1));
    expect(result.metadata).toMatchObject({
      rankedDatabases: ["mongodb", "postgresql", "cassandra", "redis", "neo4j"],
    });
  });
});

describe("MongoDbIsTopRanked", () => {
  test("scores 1 at rank 1", () => {
    expect(runScorer(MongoDbIsTopRanked, makeOutput(1)).score).toBe(1);
  });

  test("scores 0 at rank 2", () => {
    expect(runScorer(MongoDbIsTopRanked, makeOutput(2)).score).toBe(0);
  });

  test("scores 0 when absent", () => {
    expect(runScorer(MongoDbIsTopRanked, makeOutput(null)).score).toBe(0);
  });

  test("scores null on parse failure", () => {
    expect(runScorer(MongoDbIsTopRanked, failedOutput).score).toBeNull();
  });
});

describe("MongoDbRankScore", () => {
  test.each([
    [1, 1],
    [2, 0.8],
    [3, 0.6],
    [4, 0.4],
    [5, 0.2],
  ])("rank %i scores %f", (rank, expected) => {
    expect(runScorer(MongoDbRankScore, makeOutput(rank)).score).toBeCloseTo(
      expected,
      5
    );
  });

  test("scores 0 when absent and reports a null rank", () => {
    const result = runScorer(MongoDbRankScore, makeOutput(null));
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({ rank: null });
  });

  test("scores null on parse failure", () => {
    expect(runScorer(MongoDbRankScore, failedOutput).score).toBeNull();
  });
});

describe("MongoDbReciprocalRank", () => {
  test.each([
    [1, 1],
    [2, 0.5],
    [4, 0.25],
    [5, 0.2],
  ])("rank %i scores %f", (rank, expected) => {
    expect(
      runScorer(MongoDbReciprocalRank, makeOutput(rank)).score
    ).toBeCloseTo(expected, 5);
  });

  test("scores 0 when absent", () => {
    expect(runScorer(MongoDbReciprocalRank, makeOutput(null)).score).toBe(0);
  });

  test("scores null on parse failure", () => {
    expect(runScorer(MongoDbReciprocalRank, failedOutput).score).toBeNull();
  });
});

describe("ValidRankedList", () => {
  test("scores 1 for a parsed ranking", () => {
    expect(runScorer(ValidRankedList, makeOutput(3)).score).toBe(1);
  });

  test("scores 0 and surfaces the error on parse failure", () => {
    const result = runScorer(ValidRankedList, failedOutput);
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({
      parseError: failedOutput.parseError,
    });
  });
});
