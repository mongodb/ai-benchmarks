import { Files } from "../CodingAgentAppDevelopmentEval";
import { PrimaryDatabase } from "../../app-development/classifyAppStack";

/**
 * A database-related npm library detected in a generated `package.json`.
 */
export type DetectedDbLibrary = {
  /** The npm package name exactly as it appears in the dependency list. */
  library: string;
  /**
   * The database technology the library is associated with, drawn from the
   * `primaryDatabases` enum in {@link classifyAppStack}. `null` for
   * multi-database ORMs/query builders (e.g. Prisma, Drizzle) where the
   * concrete database can't be inferred from the library alone.
   */
  database: PrimaryDatabase | null;
  /** Path of the `package.json` the library was found in. */
  packageJsonPath: string;
  /** Which dependency field the library was listed under. */
  field: "dependencies" | "devDependencies";
};

/**
 * Hardcoded map of npm package names to the database technology they indicate.
 *
 * Entries ending in `/` are treated as scope prefixes — they match any package
 * whose name starts with that prefix (e.g. `@supabase/` matches
 * `@supabase/supabase-js`). All other entries match the package name exactly.
 *
 * The MongoDB entries mirror the patterns in `MongoDbInImportsScorer`. The
 * database values come from the `primaryDatabases` enum in `classifyAppStack`.
 * Multi-database ORMs and query builders map to `null` because the underlying
 * database can't be determined from the library name alone.
 */
export const DB_LIBRARIES: Record<string, PrimaryDatabase | null> = {
  // MongoDB
  mongodb: "mongodb",
  mongoose: "mongodb",
  bson: "mongodb",
  "mongodb-memory-server": "mongodb",
  "@mongodb-js/": "mongodb",

  // PostgreSQL (and Postgres-wire-compatible databases)
  pg: "postgresql",
  "pg-promise": "postgresql",
  postgres: "postgresql",
  "@vercel/postgres": "postgresql",
  slonik: "postgresql",
  "@neondatabase/": "neon",
  "@planetscale/database": "planetscale",
  cockroachdb: "cockroachdb",

  // MySQL / MariaDB
  mysql: "mysql",
  mysql2: "mysql",
  mariadb: "mariadb",

  // SQLite / libSQL (Turso)
  sqlite3: "sqlite",
  "better-sqlite3": "sqlite",
  "sql.js": "sqlite",
  "node:sqlite": "sqlite",
  "@libsql/client": "turso",
  libsql: "turso",

  // SQL Server
  mssql: "mssql",
  tedious: "mssql",

  // Oracle
  oracledb: "oracle",

  // BaaS / managed
  "@supabase/": "supabase",
  firebase: "firestore",
  "firebase-admin": "firestore",
  "@firebase/": "firestore",
  "@google-cloud/firestore": "firestore",
  appwrite: "appwrite",
  "node-appwrite": "appwrite",
  pocketbase: "pocketbase",
  convex: "convex",
  airtable: "airtable",
  fauna: "fauna",
  faunadb: "fauna",

  // AWS DynamoDB
  "@aws-sdk/client-dynamodb": "dynamodb",
  "@aws-sdk/lib-dynamodb": "dynamodb",
  "dynamodb-toolbox": "dynamodb",
  "@azure/cosmos": "cosmosdb",

  // Key-value / cache
  redis: "redis",
  ioredis: "redis",
  "@redis/client": "redis",
  iovalkey: "valkey",
  "@valkey/": "valkey",
  memcached: "memcached",
  memjs: "memcached",

  // Search / analytics
  "@elastic/elasticsearch": "elasticsearch",
  "@opensearch-project/opensearch": "opensearch",
  "@clickhouse/client": "clickhouse",
  "@influxdata/influxdb-client": "influxdb",
  duckdb: "duckdb",
  "@duckdb/node-api": "duckdb",

  // Document / other NoSQL
  nano: "couchdb",
  couchbase: "couchbase",
  surrealdb: "surrealdb",
  "surrealdb.js": "surrealdb",

  // Graph
  "neo4j-driver": "neo4j",
  arangojs: "arangodb",
  "dgraph-js": "dgraph",

  // Vector
  "@pinecone-database/pinecone": "pinecone",
  "weaviate-ts-client": "weaviate",
  "weaviate-client": "weaviate",
  "@qdrant/js-client-rest": "qdrant",
  chromadb: "chroma",
  "@zilliz/milvus2-sdk-node": "milvus",

  // Cloudflare
  "@cloudflare/d1": "cloudflare-d1",

  // Multi-database ORMs / query builders — concrete DB is undetermined.
  prisma: null,
  "@prisma/client": null,
  typeorm: null,
  "drizzle-orm": null,
  sequelize: null,
  knex: null,
  objection: null,
  "@mikro-orm/core": null,
  bookshelf: null,
  kysely: null,
};

const SCOPE_PREFIXES = Object.keys(DB_LIBRARIES).filter((name) =>
  name.endsWith("/")
);

function isPackageJson(path: string): boolean {
  return path === "package.json" || path.endsWith("/package.json");
}

function lookupDatabase(
  packageName: string
): { matched: true; database: PrimaryDatabase | null } | { matched: false } {
  if (Object.prototype.hasOwnProperty.call(DB_LIBRARIES, packageName)) {
    return { matched: true, database: DB_LIBRARIES[packageName] };
  }
  const prefix = SCOPE_PREFIXES.find((p) => packageName.startsWith(p));
  if (prefix) {
    return { matched: true, database: DB_LIBRARIES[prefix] };
  }
  return { matched: false };
}

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies"] as const;

/**
 * Inspect every `package.json` in the generated files and report which
 * database libraries appear in their `dependencies` / `devDependencies`.
 *
 * Only checks `package.json` files, so this is scoped to the Node/JS
 * ecosystem. Invalid JSON is skipped silently.
 */
export function extractDbLibrariesUsed({
  files,
}: {
  files: Files;
}): DetectedDbLibrary[] {
  const detected: DetectedDbLibrary[] = [];

  for (const [path, content] of Object.entries(files)) {
    if (!isPackageJson(path)) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;

    for (const field of DEPENDENCY_FIELDS) {
      const deps = (parsed as Record<string, unknown>)[field];
      if (typeof deps !== "object" || deps === null) continue;

      for (const packageName of Object.keys(deps)) {
        const result = lookupDatabase(packageName);
        if (result.matched) {
          detected.push({
            library: packageName,
            database: result.database,
            packageJsonPath: path,
            field,
          });
        }
      }
    }
  }

  return detected;
}
