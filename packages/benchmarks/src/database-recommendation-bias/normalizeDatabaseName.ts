import { primaryDatabases } from "../app-development/classifyAppStack";

/**
 * Operational databases that models routinely recommend but that are absent
 * from `primaryDatabases`. Kept separate rather than added to that enum so
 * the app-development stack classifier's behavior is unchanged.
 */
export const additionalOperationalDatabases = [
  "cassandra",
  "scylladb",
  "yugabytedb",
  "spanner",
  "aurora",
  "documentdb",
  "singlestore",
  "db2",
  "hbase",
  "ravendb",
] as const;

export type RankableDatabase =
  | (typeof primaryDatabases)[number]
  | (typeof additionalOperationalDatabases)[number];

export const rankableDatabases: readonly RankableDatabase[] = [
  ...primaryDatabases,
  ...additionalOperationalDatabases,
];

/**
 * Amazon DocumentDB and Azure Cosmos DB expose MongoDB-compatible APIs but
 * are competitors, not MongoDB. They deliberately map to their own ids.
 */
const DATABASE_ALIASES: Record<string, RankableDatabase> = {
  mongo: "mongodb",
  "mongo db": "mongodb",
  "mongodb atlas": "mongodb",
  "atlas mongodb": "mongodb",
  atlas: "mongodb",
  "mongodb community": "mongodb",
  "mongodb community edition": "mongodb",
  "mongodb enterprise": "mongodb",
  "mongodb enterprise advanced": "mongodb",

  postgres: "postgresql",
  "postgre sql": "postgresql",
  "amazon rds for postgresql": "postgresql",
  "azure database for postgresql": "postgresql",
  "neon postgres": "neon",

  "my sql": "mysql",
  "amazon rds for mysql": "mysql",
  "maria db": "mariadb",
  "sql lite": "sqlite",

  "sql server": "mssql",
  "microsoft sql server": "mssql",
  "ms sql server": "mssql",
  "azure sql": "mssql",
  "azure sql database": "mssql",

  "oracle database": "oracle",
  "oracle db": "oracle",

  "dynamo db": "dynamodb",
  "amazon dynamodb": "dynamodb",
  "aws dynamodb": "dynamodb",

  "cosmos db": "cosmosdb",
  "azure cosmos db": "cosmosdb",
  "azure cosmosdb": "cosmosdb",

  "document db": "documentdb",
  "amazon documentdb": "documentdb",
  "aws documentdb": "documentdb",

  "apache cassandra": "cassandra",
  "datastax cassandra": "cassandra",
  "datastax astra": "cassandra",

  scylla: "scylladb",
  "scylla db": "scylladb",
  yugabyte: "yugabytedb",
  "yugabyte db": "yugabytedb",

  "cloud spanner": "spanner",
  "google cloud spanner": "spanner",
  "amazon aurora": "aurora",
  "aws aurora": "aurora",

  cockroach: "cockroachdb",
  "cockroach db": "cockroachdb",
  "couchbase server": "couchbase",
  "apache couchdb": "couchdb",
  "couch db": "couchdb",

  "redis stack": "redis",
  "redis enterprise": "redis",
  "neo 4j": "neo4j",
  "elastic search": "elasticsearch",
  elastic: "elasticsearch",
  "click house": "clickhouse",
  influx: "influxdb",
  "influx db": "influxdb",
  timescale: "timescaledb",
  "timescale db": "timescaledb",
  "single store": "singlestore",
  memsql: "singlestore",

  "cloud firestore": "firestore",
  "google cloud firestore": "firestore",
  "firebase firestore": "firestore",
  "firebase realtime database": "firebase-realtime-db",
  "firebase realtime db": "firebase-realtime-db",
  "realtime database": "firebase-realtime-db",

  "ibm db2": "db2",
  "apache hbase": "hbase",
  "raven db": "ravendb",
  "planet scale": "planetscale",
  "ti db": "tidb",
  "arango db": "arangodb",
  "surreal db": "surrealdb",
  faunadb: "fauna",
  "fauna db": "fauna",
};

/**
 * Lowercase, drop parentheticals, and collapse everything that isn't
 * alphanumeric into single spaces. "PostgreSQL (Postgres)" -> "postgresql".
 */
function canonicalKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Substrings that mark a name as a MongoDB-compatible competitor rather than
 * MongoDB itself. Vendors like "Amazon DocumentDB with MongoDB compatibility"
 * and "Azure Cosmos DB for MongoDB API" legitimately contain the word
 * "mongo" in their own marketing copy, so these markers are checked, and
 * always win, before the mongo substring fallback below is allowed to fire.
 */
const COMPETITOR_MARKERS = [
  "documentdb",
  "document db",
  "cosmos",
  "ferret",
  "oracle",
] as const;

/**
 * Substring fallback for MongoDB phrasings that aren't in `DATABASE_ALIASES`
 * and don't equal a canonical id exactly (e.g. "MongoDB Server", "MongoDB,
 * Inc."). This is a naive `includes("mongo")`, which is exactly why
 * `COMPETITOR_MARKERS` must be checked first: without that guard, every
 * MongoDB-compatible competitor would be misclassified as MongoDB and
 * inflate the exact number this benchmark measures.
 */
const MONGO_MARKER = "mongo";

/** Resolve a competitor marker to its canonical id where one is identifiable. */
function resolveCompetitorMarker(key: string): RankableDatabase {
  if (key.includes("documentdb") || key.includes("document db")) {
    return "documentdb";
  }
  if (key.includes("cosmos")) {
    return "cosmosdb";
  }
  if (key.includes("oracle")) {
    return "oracle";
  }
  return "other";
}

/**
 * Map a free-text database name from a model's ranking onto a canonical id.
 * Returns "other" for anything unrecognized.
 */
export function normalizeDatabaseName(raw: string): RankableDatabase {
  const key = canonicalKey(raw);
  if (key === "") {
    return "other";
  }

  const alias = DATABASE_ALIASES[key];
  if (alias) {
    return alias;
  }

  const squashed = key.replace(/ /g, "");
  const direct = rankableDatabases.find(
    (database) => database.replace(/-/g, "") === squashed
  );
  if (direct) {
    return direct;
  }

  if (COMPETITOR_MARKERS.some((marker) => key.includes(marker))) {
    return resolveCompetitorMarker(key);
  }

  if (key.includes(MONGO_MARKER)) {
    return "mongodb";
  }

  return "other";
}
