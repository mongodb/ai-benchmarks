import { Score } from "autoevals";
import { MongoDbInCode } from "./MongoDbInCode";

function runMongoDbInCode(files: Record<string, string>) {
  return MongoDbInCode({
    input: {
      messages: [],
      name: "test",
    },
    metadata: {
      difficulty: "beginner",
    },

    output: {
      transcript: "",
      // Only files are relevant for this metric.
      // The other values are just placeholders.
      files,
    },
  }) as Score;
}

describe("MongoDbInCode", () => {
  test("scores 1 when a JS file imports mongodb via require", () => {
    const result = runMongoDbInCode({
      "index.js": "const { MongoClient } = require('mongodb');",
    });
    expect(result.name).toBe("MongoDbInCode");
    expect(result.score).toBe(1);
  });

  test("scores 1 for an ESM import of mongoose", () => {
    expect(
      runMongoDbInCode({ "db.ts": "import mongoose from 'mongoose';" }).score
    ).toBe(1);
  });

  test("scores 1 for a @mongodb-js scoped package import", () => {
    expect(
      runMongoDbInCode({ "db.ts": "import { foo } from '@mongodb-js/zstd';" })
        .score
    ).toBe(1);
  });

  test("scores 1 for a python pymongo import", () => {
    expect(runMongoDbInCode({ "app.py": "import pymongo" }).score).toBe(1);
  });

  test("scores 1 for a python motor import", () => {
    expect(
      runMongoDbInCode({
        "app.py": "from motor.motor_asyncio import AsyncIOMotorClient",
      }).score
    ).toBe(1);
  });

  test("scores 1 for the go mongo driver", () => {
    expect(
      runMongoDbInCode({
        "main.go": 'import "go.mongodb.org/mongo-driver/mongo"',
      }).score
    ).toBe(1);
  });

  test("scores 0 when no source file imports mongodb", () => {
    expect(
      runMongoDbInCode({ "index.js": "import express from 'express';" }).score
    ).toBe(0);
  });

  test("ignores MongoDB mentions in non-source files", () => {
    expect(
      runMongoDbInCode({ "README.md": "This app uses mongodb." }).score
    ).toBe(0);
  });

  test("scores 0 when there are no files", () => {
    expect(runMongoDbInCode({}).score).toBe(0);
  });

  test("includes matched files in metadata", () => {
    const result = runMongoDbInCode({ "index.js": "require('mongodb')" });
    expect(
      (result.metadata?.matchedFiles as Array<{ path: string }>)[0]?.path
    ).toBe("index.js");
  });
});
