import {
  RankedRecommendationsSchema,
  RankedRecommendations,
  toDatabaseRecommendations,
  validateRanking,
} from "./rankedRecommendations";

function makeRanking(
  databases: string[],
  ranks: number[] = [1, 2, 3, 4, 5]
): RankedRecommendations {
  return {
    recommendations: databases.map((database, i) => ({
      rank: ranks[i],
      database,
      reason: `Reason for ${database}.`,
    })),
  };
}

const validDatabases = [
  "MongoDB",
  "PostgreSQL",
  "Apache Cassandra",
  "Redis",
  "Amazon DynamoDB",
];

describe("RankedRecommendationsSchema", () => {
  test("accepts a well-formed ranking", () => {
    expect(
      RankedRecommendationsSchema.safeParse(makeRanking(validDatabases)).success
    ).toBe(true);
  });

  test("rejects a ranking with fewer than five entries", () => {
    expect(
      RankedRecommendationsSchema.safeParse(
        makeRanking(validDatabases.slice(0, 4), [1, 2, 3, 4])
      ).success
    ).toBe(false);
  });

  test("rejects a rank outside 1-5", () => {
    expect(
      RankedRecommendationsSchema.safeParse(
        makeRanking(validDatabases, [1, 2, 3, 4, 9])
      ).success
    ).toBe(false);
  });

  test("rejects an empty database name", () => {
    expect(
      RankedRecommendationsSchema.safeParse(
        makeRanking(["", "PostgreSQL", "Redis", "MySQL", "Neo4j"])
      ).success
    ).toBe(false);
  });
});

describe("validateRanking", () => {
  test("accepts a valid ranking", () => {
    expect(validateRanking(makeRanking(validDatabases))).toEqual({ ok: true });
  });

  test("rejects duplicate ranks", () => {
    const result = validateRanking(
      makeRanking(validDatabases, [1, 2, 2, 4, 5])
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/rank/i);
  });

  test("rejects databases that normalize to the same id", () => {
    const result = validateRanking(
      makeRanking([
        "MongoDB",
        "MongoDB Atlas",
        "PostgreSQL",
        "Redis",
        "Neo4j",
      ])
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/mongodb/i);
  });

  test("rejects duplicate raw names differing only by case", () => {
    const result = validateRanking(
      makeRanking(["Snowflake", "snowflake", "PostgreSQL", "Redis", "Neo4j"])
    );
    expect(result.ok).toBe(false);
  });

  test("allows two distinct unrecognized databases", () => {
    expect(
      validateRanking(
        makeRanking(["Snowflake", "BigQuery", "PostgreSQL", "Redis", "Neo4j"])
      )
    ).toEqual({ ok: true });
  });
});

describe("toDatabaseRecommendations", () => {
  test("normalizes names and sorts by rank ascending", () => {
    const result = toDatabaseRecommendations(
      makeRanking(
        ["Postgres", "MongoDB Atlas", "Redis", "Snowflake", "Apache Cassandra"],
        [3, 1, 4, 5, 2]
      )
    );

    expect(result.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(result.map((r) => r.normalizedDatabase)).toEqual([
      "mongodb",
      "cassandra",
      "postgresql",
      "redis",
      "other",
    ]);
    expect(result[0].database).toBe("MongoDB Atlas");
    expect(result[0].reason).toBe("Reason for MongoDB Atlas.");
  });
});
