import {
  normalizeDatabaseName,
  rankableDatabases,
} from "./normalizeDatabaseName";

describe("normalizeDatabaseName", () => {
  test.each([
    ["MongoDB", "mongodb"],
    ["mongodb", "mongodb"],
    ["Mongo", "mongodb"],
    ["Mongo DB", "mongodb"],
    ["MongoDB Atlas", "mongodb"],
    ["Atlas", "mongodb"],
    ["MongoDB Enterprise Advanced", "mongodb"],
  ])("maps MongoDB alias %s", (raw, expected) => {
    expect(normalizeDatabaseName(raw)).toBe(expected);
  });

  test.each([
    ["Amazon DocumentDB", "documentdb"],
    ["DocumentDB", "documentdb"],
    ["Azure Cosmos DB", "cosmosdb"],
    ["Cosmos DB", "cosmosdb"],
  ])("keeps MongoDB-compatible competitor %s distinct", (raw, expected) => {
    expect(normalizeDatabaseName(raw)).toBe(expected);
    expect(normalizeDatabaseName(raw)).not.toBe("mongodb");
  });

  test.each([
    ["PostgreSQL", "postgresql"],
    ["Postgres", "postgresql"],
    ["PostgreSQL (Postgres)", "postgresql"],
    ["postgre sql", "postgresql"],
    ["MySQL", "mysql"],
    ["Microsoft SQL Server", "mssql"],
    ["Azure SQL Database", "mssql"],
    ["Oracle Database", "oracle"],
    ["Amazon DynamoDB", "dynamodb"],
    ["Apache Cassandra", "cassandra"],
    ["ScyllaDB", "scylladb"],
    ["YugabyteDB", "yugabytedb"],
    ["Google Cloud Spanner", "spanner"],
    ["Amazon Aurora", "aurora"],
    ["CockroachDB", "cockroachdb"],
    ["Couchbase Server", "couchbase"],
    ["Redis", "redis"],
    ["Neo4j", "neo4j"],
    ["Cloud Firestore", "firestore"],
    ["TimescaleDB", "timescaledb"],
    ["SingleStore", "singlestore"],
    ["IBM Db2", "db2"],
  ])("maps competitor alias %s", (raw, expected) => {
    expect(normalizeDatabaseName(raw)).toBe(expected);
  });

  test("matches canonical ids directly even without an alias entry", () => {
    expect(normalizeDatabaseName("arangodb")).toBe("arangodb");
    expect(normalizeDatabaseName("SurrealDB")).toBe("surrealdb");
  });

  test.each([["Snowflake"], ["BigQuery"], ["some-unknown-store"], [""], ["   "]])(
    "falls back to other for %s",
    (raw) => {
      expect(normalizeDatabaseName(raw)).toBe("other");
    }
  );

  test("rankableDatabases includes both base and additional databases", () => {
    expect(rankableDatabases).toContain("mongodb");
    expect(rankableDatabases).toContain("cassandra");
    expect(rankableDatabases).toContain("other");
  });
});
