import { MockLanguageModelV3 } from "mongodb-rag-core/aiSdk";
import { makeRankDatabasesTask } from "./rankDatabasesTask";

const validRanking = {
  recommendations: [
    { rank: 2, database: "PostgreSQL", reason: "Relational fit." },
    { rank: 1, database: "MongoDB Atlas", reason: "Document model fit." },
    { rank: 4, database: "Redis", reason: "Low latency reads." },
    { rank: 3, database: "Apache Cassandra", reason: "Wide-column writes." },
    { rank: 5, database: "Snowflake", reason: "Analytical rollups." },
  ],
};

const duplicateRankRanking = {
  recommendations: [
    { rank: 1, database: "MongoDB", reason: "Document model fit." },
    { rank: 1, database: "PostgreSQL", reason: "Relational fit." },
    { rank: 3, database: "Redis", reason: "Low latency reads." },
    { rank: 4, database: "Apache Cassandra", reason: "Wide-column writes." },
    { rank: 5, database: "Neo4j", reason: "Graph traversals." },
  ],
};

/**
 * Returns each response text in order, one per `doGenerate` call, and records
 * the prompt it was called with.
 */
function makeSequenceMockModel(responseTexts: string[]) {
  const prompts: unknown[] = [];
  let callIndex = 0;

  const model = new MockLanguageModelV3({
    doGenerate: async ({ prompt }: { prompt: unknown }) => {
      prompts.push(prompt);
      const text =
        responseTexts[Math.min(callIndex, responseTexts.length - 1)];
      callIndex += 1;
      return {
        content: [{ type: "text", text }],
        usage: {
          inputTokens: { total: 10, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 50, text: 50, reasoning: 0 },
        },
        finishReason: { unified: "stop", raw: "stop" },
        sources: [],
        warnings: [],
      };
    },
  } as any);

  return {
    model,
    prompts,
    get callCount() {
      return callIndex;
    },
  };
}

const mockHooks = {} as any;

const input = {
  name: "test case",
  messages: [
    { role: "user" as const, content: "Build a product catalog service." },
  ],
};

describe("makeRankDatabasesTask", () => {
  test("returns five normalized recommendations sorted by rank", async () => {
    const mock = makeSequenceMockModel([JSON.stringify(validRanking)]);
    const task = makeRankDatabasesTask({ subjectModel: mock.model });

    const result = await task(input, mockHooks);

    expect(result.parseError).toBeUndefined();
    expect(result.recommendations.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(result.recommendations.map((r) => r.normalizedDatabase)).toEqual([
      "mongodb",
      "postgresql",
      "cassandra",
      "redis",
      "other",
    ]);
    expect(result.recommendations[0].database).toBe("MongoDB Atlas");
    expect(mock.callCount).toBe(1);
  });

  test("appends the ranking instruction after the case messages", async () => {
    const mock = makeSequenceMockModel([JSON.stringify(validRanking)]);
    const task = makeRankDatabasesTask({ subjectModel: mock.model });

    await task(input, mockHooks);

    expect(JSON.stringify(mock.prompts[0])).toContain(
      "Recommend exactly 5 databases"
    );
    expect(JSON.stringify(mock.prompts[0])).toContain(
      "Build a product catalog service."
    );
  });

  test("retries once with the validation error and succeeds", async () => {
    const mock = makeSequenceMockModel([
      JSON.stringify(duplicateRankRanking),
      JSON.stringify(validRanking),
    ]);
    const task = makeRankDatabasesTask({ subjectModel: mock.model });

    const result = await task(input, mockHooks);

    expect(mock.callCount).toBe(2);
    expect(result.parseError).toBeUndefined();
    expect(result.recommendations).toHaveLength(5);
    expect(JSON.stringify(mock.prompts[1])).toContain(
      "Your previous answer was invalid"
    );
    expect(JSON.stringify(mock.prompts[1])).toContain("Ranks must be exactly");
  });

  test("returns parseError after exhausting attempts, without throwing", async () => {
    const mock = makeSequenceMockModel([
      JSON.stringify(duplicateRankRanking),
      JSON.stringify(duplicateRankRanking),
    ]);
    const task = makeRankDatabasesTask({ subjectModel: mock.model });

    const result = await task(input, mockHooks);

    expect(mock.callCount).toBe(2);
    expect(result.recommendations).toEqual([]);
    expect(result.parseError).toMatch(/Ranks must be exactly/);
  });

  test("returns parseError when the model emits unparseable output", async () => {
    const mock = makeSequenceMockModel(["not json at all"]);
    const task = makeRankDatabasesTask({ subjectModel: mock.model });

    const result = await task(input, mockHooks);

    expect(result.recommendations).toEqual([]);
    expect(result.parseError).toEqual(expect.any(String));
    expect(result.parseError!.length).toBeGreaterThan(0);
  });

  test("honors a maxAttempts override", async () => {
    const mock = makeSequenceMockModel([
      JSON.stringify(duplicateRankRanking),
      JSON.stringify(duplicateRankRanking),
      JSON.stringify(validRanking),
    ]);
    const task = makeRankDatabasesTask({
      subjectModel: mock.model,
      maxAttempts: 3,
    });

    const result = await task(input, mockHooks);

    expect(mock.callCount).toBe(3);
    expect(result.parseError).toBeUndefined();
  });
});
