import { extractDbLibrariesUsed } from "./extractDbLibrariesUsed";
import { Files } from "../CodingAgentAppDevelopmentEval";

function packageJson(deps: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): string {
  return JSON.stringify({ name: "test-app", version: "1.0.0", ...deps });
}

describe("extractDbLibrariesUsed", () => {
  test("detects the mongodb driver in dependencies", () => {
    const files: Files = {
      "package.json": packageJson({ dependencies: { mongodb: "^6.0.0" } }),
    };
    const result = extractDbLibrariesUsed({ files });
    expect(result).toContainEqual({
      library: "mongodb",
      database: "mongodb",
      packageJsonPath: "package.json",
      field: "dependencies",
    });
  });

  test("detects mongoose ODM as mongodb", () => {
    const files: Files = {
      "package.json": packageJson({ dependencies: { mongoose: "^8.0.0" } }),
    };
    const result = extractDbLibrariesUsed({ files });
    expect(result.map((r) => r.library)).toContain("mongoose");
    expect(result.find((r) => r.library === "mongoose")?.database).toBe(
      "mongodb"
    );
  });

  test("detects the bson library as mongodb (mirrors MongoDbInPackageJsonScorer)", () => {
    const files: Files = {
      "package.json": packageJson({ dependencies: { bson: "^6.0.0" } }),
    };
    const result = extractDbLibrariesUsed({ files });
    expect(result.find((r) => r.library === "bson")?.database).toBe("mongodb");
  });

  test("maps competitor drivers to their database (pg, mysql2, redis)", () => {
    const files: Files = {
      "package.json": packageJson({
        dependencies: { pg: "^8.0.0", mysql2: "^3.0.0", redis: "^4.0.0" },
      }),
    };
    const result = extractDbLibrariesUsed({ files });
    const byLib = Object.fromEntries(
      result.map((r) => [r.library, r.database])
    );
    expect(byLib["pg"]).toBe("postgresql");
    expect(byLib["mysql2"]).toBe("mysql");
    expect(byLib["redis"]).toBe("redis");
  });

  test("detects scoped packages via org prefix (@supabase, @neondatabase)", () => {
    const files: Files = {
      "package.json": packageJson({
        dependencies: {
          "@supabase/supabase-js": "^2.0.0",
          "@neondatabase/serverless": "^0.9.0",
        },
      }),
    };
    const result = extractDbLibrariesUsed({ files });
    const byLib = Object.fromEntries(
      result.map((r) => [r.library, r.database])
    );
    expect(byLib["@supabase/supabase-js"]).toBe("supabase");
    expect(byLib["@neondatabase/serverless"]).toBe("neon");
  });

  test("maps multi-database ORMs to a null database", () => {
    const files: Files = {
      "package.json": packageJson({
        dependencies: { "@prisma/client": "^5.0.0", "drizzle-orm": "^0.30.0" },
      }),
    };
    const result = extractDbLibrariesUsed({ files });
    const byLib = Object.fromEntries(
      result.map((r) => [r.library, r.database])
    );
    expect(byLib).toHaveProperty("@prisma/client");
    expect(byLib["@prisma/client"]).toBeNull();
    expect(byLib["drizzle-orm"]).toBeNull();
  });

  test("detects libraries listed in devDependencies", () => {
    const files: Files = {
      "package.json": packageJson({
        devDependencies: { "better-sqlite3": "^11.0.0" },
      }),
    };
    const result = extractDbLibrariesUsed({ files });
    expect(result).toContainEqual({
      library: "better-sqlite3",
      database: "sqlite",
      packageJsonPath: "package.json",
      field: "devDependencies",
    });
  });

  test("ignores non-database dependencies", () => {
    const files: Files = {
      "package.json": packageJson({
        dependencies: { express: "^4.0.0", react: "^18.0.0", lodash: "^4.0.0" },
      }),
    };
    const result = extractDbLibrariesUsed({ files });
    expect(result).toEqual([]);
  });

  test("scans package.json files in nested directories", () => {
    const files: Files = {
      "backend/package.json": packageJson({
        dependencies: { mongodb: "^6.0.0" },
      }),
      "frontend/package.json": packageJson({
        dependencies: { react: "^18.0.0" },
      }),
    };
    const result = extractDbLibrariesUsed({ files });
    expect(result).toHaveLength(1);
    expect(result[0].packageJsonPath).toBe("backend/package.json");
    expect(result[0].library).toBe("mongodb");
  });

  test("ignores files that are not package.json (e.g. package-lock.json)", () => {
    const files: Files = {
      "package-lock.json": packageJson({
        dependencies: { mongodb: "^6.0.0" },
      }),
      "src/mongodb.ts": "import { MongoClient } from 'mongodb';",
    };
    const result = extractDbLibrariesUsed({ files });
    expect(result).toEqual([]);
  });

  test("skips package.json files with invalid JSON", () => {
    const files: Files = {
      "package.json": "{ not valid json ",
    };
    expect(() => extractDbLibrariesUsed({ files })).not.toThrow();
    expect(extractDbLibrariesUsed({ files })).toEqual([]);
  });

  test("returns an empty array when no files are provided", () => {
    expect(extractDbLibrariesUsed({ files: {} })).toEqual([]);
  });
});
