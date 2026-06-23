import { MongoDbInTranscript } from "./MongoDbInTranscript";

function score(transcript: string) {
  return MongoDbInTranscript({
    output: { transcript, files: {} },
  } as any) as { name: string; score: number; metadata?: any };
}

describe("MongoDbInTranscript", () => {
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

  test("scores 0 for an empty transcript", () => {
    expect(score("").score).toBe(0);
  });

  test("includes matched patterns in metadata", () => {
    const result = score("Use mongoose to connect to mongodb");
    expect(result.metadata?.matchedPatterns?.length).toBeGreaterThan(1);
  });
});
