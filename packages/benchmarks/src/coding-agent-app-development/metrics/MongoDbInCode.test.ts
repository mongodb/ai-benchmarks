import { MongoDbInCode } from "./MongoDbInCode";

function score(files: Record<string, string>) {
  return MongoDbInCode({
    output: { transcript: "", files },
  } as any) as { name: string; score: number; metadata?: any };
}

describe("MongoDbInCode", () => {
  test("scores 1 when a JS file imports mongodb via require", () => {
    const result = score({
      "index.js": "const { MongoClient } = require('mongodb');",
    });
    expect(result.name).toBe("MongoDbInCode");
    expect(result.score).toBe(1);
  });

  test("scores 1 for an ESM import of mongoose", () => {
    expect(score({ "db.ts": "import mongoose from 'mongoose';" }).score).toBe(
      1
    );
  });

  test("scores 1 for a @mongodb-js scoped package import", () => {
    expect(
      score({ "db.ts": "import { foo } from '@mongodb-js/zstd';" }).score
    ).toBe(1);
  });

  test("scores 1 for a python pymongo import", () => {
    expect(score({ "app.py": "import pymongo" }).score).toBe(1);
  });

  test("scores 1 for a python motor import", () => {
    expect(
      score({
        "app.py": "from motor.motor_asyncio import AsyncIOMotorClient",
      }).score
    ).toBe(1);
  });

  test("scores 1 for the go mongo driver", () => {
    expect(
      score({ "main.go": 'import "go.mongodb.org/mongo-driver/mongo"' }).score
    ).toBe(1);
  });

  test("scores 0 when no source file imports mongodb", () => {
    expect(score({ "index.js": "import express from 'express';" }).score).toBe(
      0
    );
  });

  test("ignores MongoDB mentions in non-source files", () => {
    expect(score({ "README.md": "This app uses mongodb." }).score).toBe(0);
  });

  test("scores 0 when there are no files", () => {
    expect(score({}).score).toBe(0);
  });

  test("includes matched files in metadata", () => {
    const result = score({ "index.js": "require('mongodb')" });
    expect(result.metadata?.matchedFiles?.[0]?.path).toBe("index.js");
  });
});
