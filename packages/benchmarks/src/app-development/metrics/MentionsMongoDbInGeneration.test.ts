import { MentionsMongoDbInGeneration } from "./MentionsMongoDbInGeneration";

function makeSample(response: string) {
  return {
    response,
    appStack: {} as any,
    databaseAnalysis: {} as any,
    selfReflection: {} as any,
  };
}

function score(responses: string[]) {
  return MentionsMongoDbInGeneration({
    output: { samples: responses.map(makeSample) },
  } as any) as Array<{ name: string; score: number; metadata?: any }>;
}

function byName(results: Array<{ name: string; score: number }>) {
  return Object.fromEntries(results.map((r) => [r.name, r.score]));
}

describe("MentionsMongoDbInGeneration", () => {
  test("single sample — scores 1 when response contains 'mongodb'", () => {
    const results = score(["I'll use MongoDB for the database."]);
    expect(byName(results)["MentionsMongoDbInGeneration@k"]).toBe(1);
    expect(byName(results)["MentionsMongoDbInGeneration%k"]).toBe(1);
    expect(byName(results)["MentionsMongoDbInGeneration^k"]).toBe(1);
  });

  test("matches case-insensitively", () => {
    const results = score(["connect to MONGODB Atlas"]);
    expect(byName(results)["MentionsMongoDbInGeneration%k"]).toBe(1);
  });

  test("matches mongoose", () => {
    const results = score(["npm install mongoose"]);
    expect(byName(results)["MentionsMongoDbInGeneration%k"]).toBe(1);
  });

  test("matches pymongo", () => {
    const results = score(["from pymongo import MongoClient"]);
    expect(byName(results)["MentionsMongoDbInGeneration%k"]).toBe(1);
  });

  test("single sample — scores 0 when no MongoDB reference", () => {
    const results = score([
      "I'll use PostgreSQL with Prisma for the database layer.",
    ]);
    expect(byName(results)["MentionsMongoDbInGeneration@k"]).toBe(0);
    expect(byName(results)["MentionsMongoDbInGeneration%k"]).toBe(0);
    expect(byName(results)["MentionsMongoDbInGeneration^k"]).toBe(0);
  });

  test("multiple samples — mixed results", () => {
    const results = score([
      "I'll use MongoDB for this.",
      "Let's go with PostgreSQL.",
      "Using mongoose for the ODM.",
    ]);
    const scores = byName(results);

    // 2/3 mention mongodb
    expect(scores["MentionsMongoDbInGeneration@k"]).toBe(1);
    expect(scores["MentionsMongoDbInGeneration%k"]).toBeCloseTo(2 / 3, 5);
    expect(scores["MentionsMongoDbInGeneration^k"]).toBeCloseTo(
      Math.pow(2 / 3, 3),
      5
    );
  });

  test("returns per-sample metadata", () => {
    const results = score(["Use mongoose to connect to mongodb"]);
    const atK = results.find(
      (r) => r.name === "MentionsMongoDbInGeneration@k"
    );
    expect(atK?.metadata?.perSample?.[0]?.matchedPatterns?.length).toBeGreaterThan(1);
  });
});
