import { MongoDbInTranscript } from "./MongoDbInTranscript";
import { MONGODB_PATTERNS } from "../../app-development/metrics/MentionsMongoDbInGeneration";

function score(transcript: string) {
  return MongoDbInTranscript({
    output: { transcript, files: {} },
  } as any) as { name: string; score: number | null; metadata?: any };
}

describe("MongoDbInTranscript", () => {
  const originalPatternCount = MONGODB_PATTERNS.length;

  afterEach(() => {
    MONGODB_PATTERNS.splice(originalPatternCount);
  });

  test("scores 1 when transcript mentions 'mongodb'", () => {
    const result = score("I'll use MongoDB for the database.");
    expect(result.name).toBe("MongoDbInTranscript");
    expect(result.score).toBe(1);
  });

  test("matches case-insensitively", () => {
    expect(score("connect to MONGODB Atlas").score).toBe(1);
  });

  test("matches mongoose", () => {
    expect(score("npm install mongoose").score).toBe(1);
  });

  test("matches pymongo", () => {
    expect(score("from pymongo import MongoClient").score).toBe(1);
  });

  test("scores 0 when there is no MongoDB reference", () => {
    expect(
      score("I'll use PostgreSQL with Prisma for the data layer.").score
    ).toBe(0);
  });

  test("does not score an empty transcript", () => {
    const result = score("");

    expect(result.name).toBe("MongoDbInTranscript");
    expect(result.score).toBeNull();
    expect(result.metadata?.matchedPatterns).toEqual([]);
  });

  test("includes matched patterns in metadata", () => {
    const result = score("Use mongoose to connect to mongodb");
    expect(result.metadata?.matchedPatterns?.length).toBeGreaterThan(1);
  });

  test("does not reuse lastIndex from stateful patterns", () => {
    MONGODB_PATTERNS.push(/mongo/gi);

    expect(score("mongo").score).toBe(1);
    expect(score("mongo").score).toBe(1);
  });
});
