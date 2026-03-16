import { Score } from "autoevals";
import { MentionsMongoDbInGeneration } from "./MentionsMongoDbInGeneration";

function score(response: string) {
  return MentionsMongoDbInGeneration({
    output: { response },
  } as any) as Score;
}

describe("MentionsMongoDbInGeneration", () => {
  test("scores 1 when response contains 'mongodb'", () => {
    expect(score("I'll use MongoDB for the database.")).toMatchObject({
      name: "MentionsMongoDbInGeneration",
      score: 1,
    });
  });

  test("matches case-insensitively", () => {
    expect(score("connect to MONGODB Atlas")).toMatchObject({ score: 1 });
  });

  test("matches mongoose", () => {
    expect(score("npm install mongoose")).toMatchObject({ score: 1 });
  });

  test("matches pymongo", () => {
    expect(score("from pymongo import MongoClient")).toMatchObject({
      score: 1,
    });
  });

  test("matches MongoClient", () => {
    expect(score("const client = new MongoClient(uri)")).toMatchObject({
      score: 1,
    });
  });

  test("scores 0 when no MongoDB reference", () => {
    const result = score(
      "I'll use PostgreSQL with Prisma for the database layer."
    );
    expect(result).toMatchObject({ score: 0 });
    expect(result.metadata?.matchedPatterns).toEqual([]);
  });

  test("returns matched patterns in metadata", () => {
    const result = score("Use mongoose to connect to mongodb");
    expect(
      (result.metadata?.matchedPatterns as string[])?.length
    ).toBeGreaterThan(1);
  });
});
