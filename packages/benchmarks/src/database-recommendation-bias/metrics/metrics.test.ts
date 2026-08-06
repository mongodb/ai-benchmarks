import {
  DatabaseRecommendationTaskOutput,
  DatabaseRecommendationEvalScorer,
} from "../DatabaseRecommendationEval";
import { RankableDatabase } from "../normalizeDatabaseName";
import { toDatabaseRecommendations } from "../rankedRecommendations";
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

/**
 * `lastError` in rankDatabasesTask.ts is an `Error#message`, which can
 * legitimately be an empty string. A scorer that checks `if (output.parseError)`
 * treats "" as falsy and silently scores this as a healthy, MongoDB-absent
 * result instead of a parse failure, corrupting the bias estimate.
 */
const emptyStringParseErrorOutput: DatabaseRecommendationTaskOutput = {
  recommendations: [],
  parseError: "",
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

/**
 * Build an output the way the real task does: raw, model-shaped database
 * names run through `toDatabaseRecommendations` (and therefore through
 * `normalizeDatabaseName`) rather than a canonical-id literal. This is what
 * catches detection regressions like an unlisted MongoDB phrasing silently
 * normalizing to "other" -- `makeOutput` above can't, because it writes
 * `normalizedDatabase` directly.
 */
function makeRawOutput(
  entries: Array<{ rank: number; database: string }>
): DatabaseRecommendationTaskOutput {
  return {
    recommendations: toDatabaseRecommendations({
      recommendations: entries.map(({ rank, database }) => ({
        rank,
        database,
        reason: `Reason for ${database}.`,
      })),
    }),
  };
}

describe("scorers fed raw, model-shaped database names", () => {
  test("'MongoDB Server' at rank 1 scores MongoDB present and top-ranked", () => {
    const output = makeRawOutput([
      { rank: 1, database: "MongoDB Server" },
      { rank: 2, database: "PostgreSQL" },
      { rank: 3, database: "Redis" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);

    expect(runScorer(MongoDbInRankedList, output).score).toBe(1);
    expect(runScorer(MongoDbIsTopRanked, output).score).toBe(1);
    expect(runScorer(MongoDbRankScore, output).score).toBe(1);
    expect(runScorer(MongoDbReciprocalRank, output).score).toBe(1);
  });

  test("'Amazon DocumentDB' at rank 1 with no MongoDB present scores MongoDB absent", () => {
    const output = makeRawOutput([
      { rank: 1, database: "Amazon DocumentDB" },
      { rank: 2, database: "PostgreSQL" },
      { rank: 3, database: "Redis" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);

    expect(runScorer(MongoDbInRankedList, output).score).toBe(0);
    expect(runScorer(MongoDbIsTopRanked, output).score).toBe(0);
  });

  test("'Azure Cosmos DB' at rank 1 with no MongoDB present scores MongoDB absent", () => {
    const output = makeRawOutput([
      { rank: 1, database: "Azure Cosmos DB" },
      { rank: 2, database: "PostgreSQL" },
      { rank: 3, database: "Redis" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);

    expect(runScorer(MongoDbInRankedList, output).score).toBe(0);
  });

  test("'MongoDB Atlas' at rank 3 scores the correct rank-based metrics", () => {
    const output = makeRawOutput([
      { rank: 1, database: "PostgreSQL" },
      { rank: 2, database: "Redis" },
      { rank: 3, database: "MongoDB Atlas" },
      { rank: 4, database: "Neo4j" },
      { rank: 5, database: "MySQL" },
    ]);

    expect(runScorer(MongoDbRankScore, output).score).toBeCloseTo(0.6, 5);
    expect(runScorer(MongoDbReciprocalRank, output).score).toBeCloseTo(
      0.3333,
      3
    );
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

describe("parse failure detection uses presence, not truthiness", () => {
  test("an empty-string parseError still yields null from the four MongoDB scorers", () => {
    expect(
      runScorer(MongoDbInRankedList, emptyStringParseErrorOutput).score
    ).toBeNull();
    expect(
      runScorer(MongoDbIsTopRanked, emptyStringParseErrorOutput).score
    ).toBeNull();
    expect(
      runScorer(MongoDbRankScore, emptyStringParseErrorOutput).score
    ).toBeNull();
    expect(
      runScorer(MongoDbReciprocalRank, emptyStringParseErrorOutput).score
    ).toBeNull();
  });

  test("an empty-string parseError still yields 0 from ValidRankedList", () => {
    expect(
      runScorer(ValidRankedList, emptyStringParseErrorOutput).score
    ).toBe(0);
  });
});
