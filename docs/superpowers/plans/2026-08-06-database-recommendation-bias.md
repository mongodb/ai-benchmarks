# Database Recommendation Bias Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicate the [`10gen/llm_mdb_bias_eval`](https://github.com/10gen/llm_mdb_bias_eval) study as a `database_recommendation_bias` benchmark that asks a model to rank five databases for an application and scores where MongoDB lands.

**Architecture:** A new `packages/benchmarks/src/database-recommendation-bias/` directory, structured after the existing `app-development/` benchmark. The subject model returns a ranked list of five databases via AI SDK structured output (no LLM judge). Free-text database names are normalized to canonical ids so MongoDB detection and competitor analysis are reliable. Five Braintrust scorers convert MongoDB's position into 0–1 scores. Dataset loading is extracted from `app-development/config.ts` into a shared `app-development/datasets.ts` that both benchmarks import.

**Tech Stack:** TypeScript, Braintrust (`Eval`, `wrapTraced`, `BraintrustMiddleware`), Vercel AI SDK (`generateText`, `Output.object`, `MockLanguageModelV3`), Zod, Jest, yargs CLI.

**Design spec:** [`docs/superpowers/specs/2026-08-06-database-recommendation-bias-design.md`](../specs/2026-08-06-database-recommendation-bias-design.md)

## Global Constraints

- All work happens in `packages/benchmarks`. Run all commands from that directory.
- `mongodb-rag-core` must be built before benchmark tests will run. If tests fail with module-resolution errors on `mongodb-rag-core/*`, run `cd ../mongodb-rag-core && npm run build` directly (Nx may report a cache hit without materializing `build/`).
- Import AI SDK symbols from `mongodb-rag-core/aiSdk`, Braintrust symbols from `mongodb-rag-core/braintrust`. Never import `ai` or `braintrust` directly.
- No banner / section-divider comments (e.g. `// ----- SECTION -----`). A blank line is sufficient. Note that `app-development/classifyAppStack.ts` violates this — do not copy that style.
- Benchmark CLI type name: `database_recommendation_bias`. Braintrust project name: `database-recommendation-bias`. Directory name: `database-recommendation-bias`.
- No new environment variables. There is no judge model in this benchmark.
- No `pass@k` / `pass%k` / `pass^k` metrics and no in-task sampling loop. Replication is the CLI's `--trialCount` flag.
- No personas and no system prompt. There is exactly one task, `rank_databases`.
- Test command is `npm test -- <path>` (the package's `test` script sets required `NODE_OPTIONS`).

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/app-development/datasets.ts` | Shared YAML dataset loader + the five-entry dataset registry used by both benchmarks |
| `src/app-development/datasets.test.ts` | Verifies every registry entry loads with expected counts and metadata |
| `src/database-recommendation-bias/DatabaseRecommendationEval.ts` | Type definitions for the benchmark's input, output, task, and scorers |
| `src/database-recommendation-bias/normalizeDatabaseName.ts` | Canonical database id list + free-text → canonical id mapping |
| `src/database-recommendation-bias/normalizeDatabaseName.test.ts` | Normalization unit tests |
| `src/database-recommendation-bias/rankedRecommendations.ts` | Zod schema, semantic validator, and conversion to output recommendations |
| `src/database-recommendation-bias/rankedRecommendations.test.ts` | Schema/validator unit tests |
| `src/database-recommendation-bias/prompts.ts` | The ranking instruction appended to every case |
| `src/database-recommendation-bias/rankDatabasesTask.ts` | Task factory: prompt → structured output → validate → repair → normalize |
| `src/database-recommendation-bias/rankDatabasesTask.test.ts` | Task tests using `MockLanguageModelV3` |
| `src/database-recommendation-bias/metrics/findMongoDbRecommendation.ts` | Shared helper locating MongoDB in a ranking |
| `src/database-recommendation-bias/metrics/MongoDbInRankedList.ts` | Scorer: MongoDB appears at all |
| `src/database-recommendation-bias/metrics/MongoDbIsTopRanked.ts` | Scorer: MongoDB is rank 1 |
| `src/database-recommendation-bias/metrics/MongoDbRankScore.ts` | Scorer: linear rank score `(6 − rank) / 5` |
| `src/database-recommendation-bias/metrics/MongoDbReciprocalRank.ts` | Scorer: `1 / rank` |
| `src/database-recommendation-bias/metrics/ValidRankedList.ts` | Scorer: parse-health guard |
| `src/database-recommendation-bias/metrics/metrics.test.ts` | Tests for all five scorers |
| `src/database-recommendation-bias/config.ts` | `BenchmarkConfig` wiring datasets, the task, and the scorers |

**Modify:**

| File | Change |
|---|---|
| `src/app-development/AppDevelopmentEval.ts:22` | Make `difficulty` optional |
| `src/app-development/config.ts:44-125` | Delete inlined loader + dataset entries; import from `datasets.ts` |
| `src/bin/mongoDbBenchmarkCli.ts` | Register `database_recommendation_bias` |

---

### Task 1: Extract the shared dataset registry

Today `loadDataset()` and the five dataset entries are inlined in `app-development/config.ts`. Both benchmarks need them, so they move to their own module. This is a pure move — `app_development`'s behavior must not change.

`AppDevelopmentMetadata.difficulty` is currently declared required, but the customer-success-story YAML files never set it (only `app-development.yml` does, on all 104 entries). It is declared and never read anywhere in the codebase. Making it optional makes the type honest.

**Files:**
- Create: `packages/benchmarks/src/app-development/datasets.ts`
- Create: `packages/benchmarks/src/app-development/datasets.test.ts`
- Modify: `packages/benchmarks/src/app-development/AppDevelopmentEval.ts:22`
- Modify: `packages/benchmarks/src/app-development/config.ts:44-125`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `loadAppDevelopmentDataset(datasetPath: string): AppDevelopmentEvalCase[]`
  - `appDevelopmentDatasets: Record<string, BenchmarkDataset<AppDevelopmentEvalCaseInput, AppDevelopmentTaskExpected, AppDevelopmentMetadata>>` with keys `all`, `mongodb_optimal`, `db_agnostic`, `customer_success_stories_short`, `customer_success_stories_long`

- [ ] **Step 1: Confirm the baseline builds and mongodb-rag-core is materialized**

```bash
cd packages/mongodb-rag-core && npm run build && ls build/index.js
```

Expected: `build/index.js` exists. If it does not, the later test steps will fail with unresolvable `mongodb-rag-core/*` imports.

- [ ] **Step 2: Write the failing test**

Create `packages/benchmarks/src/app-development/datasets.test.ts`:

```ts
import { appDevelopmentDatasets } from "./datasets";

describe("appDevelopmentDatasets", () => {
  test("exposes the five expected dataset keys", () => {
    expect(Object.keys(appDevelopmentDatasets).sort()).toEqual([
      "all",
      "customer_success_stories_long",
      "customer_success_stories_short",
      "db_agnostic",
      "mongodb_optimal",
    ]);
  });

  test("all loads every app-development case", async () => {
    const cases = await appDevelopmentDatasets.all.getDataset();
    expect(cases).toHaveLength(104);
  });

  test("mongodb_optimal and db_agnostic partition all", async () => {
    const optimal = await appDevelopmentDatasets.mongodb_optimal.getDataset();
    const agnostic = await appDevelopmentDatasets.db_agnostic.getDataset();
    expect(optimal).toHaveLength(52);
    expect(agnostic).toHaveLength(52);
    expect(
      optimal.every((c) => c.tags?.includes("mongodb-optimal"))
    ).toBe(true);
    expect(
      agnostic.every((c) => !c.tags?.includes("mongodb-optimal"))
    ).toBe(true);
  });

  test("customer success stories load in both lengths", async () => {
    const short =
      await appDevelopmentDatasets.customer_success_stories_short.getDataset();
    const long =
      await appDevelopmentDatasets.customer_success_stories_long.getDataset();
    expect(short).toHaveLength(201);
    expect(long).toHaveLength(201);
  });

  test("preserves eval case shape and metadata", async () => {
    const [first] =
      await appDevelopmentDatasets.customer_success_stories_short.getDataset();
    expect(first.input.name).toEqual(expect.any(String));
    expect(first.input.messages[0]).toEqual({
      role: "user",
      content: expect.any(String),
    });
    expect(first.metadata).toMatchObject({
      fit: "Best-fit",
      source: "real",
      length: "short",
    });
    expect(first.metadata?.db_problem).toEqual(expect.any(String));
  });

  test("long story content is longer than the short counterpart", async () => {
    const short =
      await appDevelopmentDatasets.customer_success_stories_short.getDataset();
    const long =
      await appDevelopmentDatasets.customer_success_stories_long.getDataset();
    expect(long[0].input.messages[0].content.length).toBeGreaterThan(
      short[0].input.messages[0].content.length
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test -- src/app-development/datasets.test.ts
```

Expected: FAIL — `Cannot find module './datasets'`.

- [ ] **Step 4: Make `difficulty` optional**

In `packages/benchmarks/src/app-development/AppDevelopmentEval.ts`, change line 22 from:

```ts
    difficulty: "beginner" | "intermediate" | "advanced";
```

to:

```ts
    difficulty?: "beginner" | "intermediate" | "advanced";
```

Leave `src/coding-agent-app-development/CodingAgentAppDevelopmentEval.ts` alone — it is a separate type and out of scope.

- [ ] **Step 5: Create the shared dataset module**

Create `packages/benchmarks/src/app-development/datasets.ts`:

```ts
import fs from "fs";
import path from "path";
import yaml from "yaml";

import { BenchmarkDataset } from "../cli/BenchmarkConfig";
import {
  AppDevelopmentEvalCase,
  AppDevelopmentEvalCaseInput,
  AppDevelopmentMetadata,
  AppDevelopmentTaskExpected,
} from "./AppDevelopmentEval";

const APP_DEVELOPMENT_PATH = path.resolve(
  __dirname,
  "../../datasets/app-development.yml"
);

const CUSTOMER_SUCCESS_STORIES_SHORT_PATH = path.resolve(
  __dirname,
  "../../datasets/customer_success_stories.short.yml"
);

const CUSTOMER_SUCCESS_STORIES_LONG_PATH = path.resolve(
  __dirname,
  "../../datasets/customer_success_stories.long.yml"
);

interface RawDatasetEntry {
  name: string;
  messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Load a YAML eval-case file into Braintrust eval cases.
 *
 * Shared by every benchmark that operates on app-development eval cases,
 * so that a dataset added here is immediately available to all of them.
 */
export function loadAppDevelopmentDataset(
  datasetPath: string
): AppDevelopmentEvalCase[] {
  const raw = yaml.parse(
    fs.readFileSync(datasetPath, "utf8")
  ) as RawDatasetEntry[];
  return raw.map((entry) => ({
    input: {
      name: entry.name,
      messages: entry.messages,
    },
    tags: entry.tags ?? [],
    metadata: (entry.metadata ?? {}) as unknown as AppDevelopmentMetadata,
  }));
}

export const appDevelopmentDatasets: Record<
  string,
  BenchmarkDataset<
    AppDevelopmentEvalCaseInput,
    AppDevelopmentTaskExpected,
    AppDevelopmentMetadata
  >
> = {
  all: {
    description: "All 104 app-development eval cases",
    async getDataset() {
      return loadAppDevelopmentDataset(APP_DEVELOPMENT_PATH);
    },
  },
  mongodb_optimal: {
    description: "Cases where MongoDB is the optimal database choice",
    async getDataset() {
      return loadAppDevelopmentDataset(APP_DEVELOPMENT_PATH).filter((d) =>
        d.tags.includes("mongodb-optimal")
      );
    },
  },
  db_agnostic: {
    description:
      "Cases where the prompt doesn't favor MongoDB — a different DB may be a better fit",
    async getDataset() {
      return loadAppDevelopmentDataset(APP_DEVELOPMENT_PATH).filter(
        (d) => !d.tags.includes("mongodb-optimal")
      );
    },
  },
  customer_success_stories_short: {
    description: "Customer success stories (short)",
    async getDataset() {
      return loadAppDevelopmentDataset(CUSTOMER_SUCCESS_STORIES_SHORT_PATH);
    },
  },
  customer_success_stories_long: {
    description: "Customer success stories (long)",
    async getDataset() {
      return loadAppDevelopmentDataset(CUSTOMER_SUCCESS_STORIES_LONG_PATH);
    },
  },
};
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npm test -- src/app-development/datasets.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Point `app-development/config.ts` at the shared module**

In `packages/benchmarks/src/app-development/config.ts`:

Delete the `fs`, `path`, and `yaml` imports at the top (lines 1–3) — they become unused.

Delete lines 44–125: the three `*_PATH` constants, the `RawDatasetEntry` interface, the `loadDataset` function, and the entire `datasets: { ... }` block.

Add to the imports:

```ts
import { appDevelopmentDatasets } from "./datasets";
```

Replace the deleted `datasets:` block inside `appDevelopmentBenchmarkConfig` with:

```ts
  datasets: appDevelopmentDatasets,
```

Leave `SAMPLES_PER_CASE`, the judge-model setup, `tasks`, and `scorers` untouched.

- [ ] **Step 8: Verify nothing regressed**

```bash
npm run build && npm test -- src/app-development && npm run lint
```

Expected: build succeeds with no errors, all app-development tests pass, lint reports no errors. If lint flags unused imports in `config.ts`, remove them.

- [ ] **Step 9: Commit**

```bash
git add packages/benchmarks/src/app-development
git commit -m "refactor: extract shared app-development dataset registry"
```

---

### Task 2: Database name normalization

Models return free text: "MongoDB", "MongoDB Atlas", "Postgres", "PostgreSQL (Postgres)". The original Python study just substring-matched `"mongodb"`, which both misses nothing and over-matches nothing important for MongoDB — but it leaves the competitor set unanalyzable. We map every name onto a canonical id.

The canonical list is **local to this benchmark** — built by extending, not editing, `primaryDatabases` from `app-development/classifyAppStack.ts`. Editing that enum in place would change what app-development's LLM judge is allowed to return.

**Critical:** `documentdb` (Amazon DocumentDB) and `cosmosdb` (Azure Cosmos DB) are MongoDB-API-compatible competitors. They must **not** normalize to `mongodb` — doing so would inflate the mention rate this benchmark exists to measure.

**Files:**
- Create: `packages/benchmarks/src/database-recommendation-bias/normalizeDatabaseName.ts`
- Create: `packages/benchmarks/src/database-recommendation-bias/normalizeDatabaseName.test.ts`

**Interfaces:**
- Consumes: `primaryDatabases` from `../app-development/classifyAppStack` (an `as const` string tuple that already includes `"other"`).
- Produces:
  - `type RankableDatabase` — union of `primaryDatabases` and `additionalOperationalDatabases` members, includes `"other"`
  - `rankableDatabases: readonly RankableDatabase[]`
  - `normalizeDatabaseName(raw: string): RankableDatabase`

- [ ] **Step 1: Write the failing test**

Create `packages/benchmarks/src/database-recommendation-bias/normalizeDatabaseName.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/database-recommendation-bias/normalizeDatabaseName.test.ts
```

Expected: FAIL — `Cannot find module './normalizeDatabaseName'`.

- [ ] **Step 3: Write the implementation**

Create `packages/benchmarks/src/database-recommendation-bias/normalizeDatabaseName.ts`:

```ts
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

  mssql: "mssql",
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

  return direct ?? "other";
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/database-recommendation-bias/normalizeDatabaseName.test.ts
```

Expected: PASS. If any `test.each` row fails, add the missing alias to `DATABASE_ALIASES` — do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add packages/benchmarks/src/database-recommendation-bias
git commit -m "feat: add database name normalization for ranking benchmark"
```

---

### Task 3: Ranking schema, types, and validation

Ports the Python `RecommendationSet` Pydantic model. Zod handles shape (exactly 5 items, rank in 1–5, non-empty strings); `validateRanking` handles what Zod can't express: ranks form a permutation of 1–5, and the five databases are actually distinct.

**Subtlety:** the uniqueness check must exclude `"other"` from the normalized comparison. Two genuinely different unrecognized databases both normalize to `"other"` and are not duplicates. Raw names are checked for duplicates separately.

**Files:**
- Create: `packages/benchmarks/src/database-recommendation-bias/DatabaseRecommendationEval.ts`
- Create: `packages/benchmarks/src/database-recommendation-bias/rankedRecommendations.ts`
- Create: `packages/benchmarks/src/database-recommendation-bias/rankedRecommendations.test.ts`

**Interfaces:**
- Consumes: `normalizeDatabaseName`, `RankableDatabase` from Task 2; `AppDevelopmentEvalCaseInput`, `AppDevelopmentMetadata` from `../app-development/AppDevelopmentEval`.
- Produces:
  - `interface DatabaseRecommendation { rank: number; database: string; normalizedDatabase: RankableDatabase; reason: string }`
  - `type DatabaseRecommendationTaskOutput = { recommendations: DatabaseRecommendation[]; parseError?: string }`
  - `type DatabaseRecommendationEvalCaseInput`, `DatabaseRecommendationMetadata`, `DatabaseRecommendationExpected`, `DatabaseRecommendationEvalTask`, `DatabaseRecommendationEvalScorer`
  - `RankedRecommendationsSchema` (Zod), `type RankedRecommendations`
  - `validateRanking(parsed: RankedRecommendations): { ok: true } | { ok: false; error: string }`
  - `toDatabaseRecommendations(parsed: RankedRecommendations): DatabaseRecommendation[]`

- [ ] **Step 1: Write the failing test**

Create `packages/benchmarks/src/database-recommendation-bias/rankedRecommendations.test.ts`:

```ts
import {
  RankedRecommendationsSchema,
  RankedRecommendations,
  toDatabaseRecommendations,
  validateRanking,
} from "./rankedRecommendations";

function makeRanking(
  databases: string[],
  ranks: number[] = [1, 2, 3, 4, 5]
): RankedRecommendations {
  return {
    recommendations: databases.map((database, i) => ({
      rank: ranks[i],
      database,
      reason: `Reason for ${database}.`,
    })),
  };
}

const validDatabases = [
  "MongoDB",
  "PostgreSQL",
  "Apache Cassandra",
  "Redis",
  "Amazon DynamoDB",
];

describe("RankedRecommendationsSchema", () => {
  test("accepts a well-formed ranking", () => {
    expect(
      RankedRecommendationsSchema.safeParse(makeRanking(validDatabases)).success
    ).toBe(true);
  });

  test("rejects a ranking with fewer than five entries", () => {
    expect(
      RankedRecommendationsSchema.safeParse(
        makeRanking(validDatabases.slice(0, 4), [1, 2, 3, 4])
      ).success
    ).toBe(false);
  });

  test("rejects a rank outside 1-5", () => {
    expect(
      RankedRecommendationsSchema.safeParse(
        makeRanking(validDatabases, [1, 2, 3, 4, 9])
      ).success
    ).toBe(false);
  });

  test("rejects an empty database name", () => {
    expect(
      RankedRecommendationsSchema.safeParse(
        makeRanking(["", "PostgreSQL", "Redis", "MySQL", "Neo4j"])
      ).success
    ).toBe(false);
  });
});

describe("validateRanking", () => {
  test("accepts a valid ranking", () => {
    expect(validateRanking(makeRanking(validDatabases))).toEqual({ ok: true });
  });

  test("rejects duplicate ranks", () => {
    const result = validateRanking(
      makeRanking(validDatabases, [1, 2, 2, 4, 5])
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/rank/i);
  });

  test("rejects databases that normalize to the same id", () => {
    const result = validateRanking(
      makeRanking([
        "MongoDB",
        "MongoDB Atlas",
        "PostgreSQL",
        "Redis",
        "Neo4j",
      ])
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/mongodb/i);
  });

  test("rejects duplicate raw names differing only by case", () => {
    const result = validateRanking(
      makeRanking(["Snowflake", "snowflake", "PostgreSQL", "Redis", "Neo4j"])
    );
    expect(result.ok).toBe(false);
  });

  test("allows two distinct unrecognized databases", () => {
    expect(
      validateRanking(
        makeRanking(["Snowflake", "BigQuery", "PostgreSQL", "Redis", "Neo4j"])
      )
    ).toEqual({ ok: true });
  });
});

describe("toDatabaseRecommendations", () => {
  test("normalizes names and sorts by rank ascending", () => {
    const result = toDatabaseRecommendations(
      makeRanking(
        ["Postgres", "MongoDB Atlas", "Redis", "Snowflake", "Apache Cassandra"],
        [3, 1, 4, 5, 2]
      )
    );

    expect(result.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(result.map((r) => r.normalizedDatabase)).toEqual([
      "mongodb",
      "cassandra",
      "postgresql",
      "redis",
      "other",
    ]);
    expect(result[0].database).toBe("MongoDB Atlas");
    expect(result[0].reason).toBe("Reason for MongoDB Atlas.");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/database-recommendation-bias/rankedRecommendations.test.ts
```

Expected: FAIL — `Cannot find module './rankedRecommendations'`.

- [ ] **Step 3: Write the type definitions**

Create `packages/benchmarks/src/database-recommendation-bias/DatabaseRecommendationEval.ts`:

```ts
import {
  EvalParameters,
  EvalScorer,
  EvalTask,
} from "mongodb-rag-core/braintrust";
import {
  AppDevelopmentEvalCaseInput,
  AppDevelopmentMetadata,
} from "../app-development/AppDevelopmentEval";
import { RankableDatabase } from "./normalizeDatabaseName";

/**
 * Eval cases are shared with the app-development benchmark so any dataset
 * usable by one is usable by the other.
 */
export type DatabaseRecommendationEvalCaseInput = AppDevelopmentEvalCaseInput;
export type DatabaseRecommendationMetadata = AppDevelopmentMetadata;
export type DatabaseRecommendationExpected = void;

export interface DatabaseRecommendation {
  /** 1 to 5, unique within a ranking. */
  rank: number;
  /** The database name exactly as the model wrote it. */
  database: string;
  /** `database` mapped onto a canonical id, or "other". */
  normalizedDatabase: RankableDatabase;
  reason: string;
}

export type DatabaseRecommendationTaskOutput = {
  /** Sorted by rank ascending. Empty when `parseError` is set. */
  recommendations: DatabaseRecommendation[];
  /** Set when the model never produced a valid ranking. */
  parseError?: string;
};

export type DatabaseRecommendationEvalTask = EvalTask<
  DatabaseRecommendationEvalCaseInput,
  DatabaseRecommendationTaskOutput,
  DatabaseRecommendationExpected,
  DatabaseRecommendationMetadata,
  EvalParameters
>;

export type DatabaseRecommendationEvalScorer = EvalScorer<
  DatabaseRecommendationEvalCaseInput,
  DatabaseRecommendationTaskOutput,
  DatabaseRecommendationExpected,
  DatabaseRecommendationMetadata
>;
```

- [ ] **Step 4: Write the schema and validator**

Create `packages/benchmarks/src/database-recommendation-bias/rankedRecommendations.ts`:

```ts
import { z } from "zod";

import { DatabaseRecommendation } from "./DatabaseRecommendationEval";
import { normalizeDatabaseName } from "./normalizeDatabaseName";

export const RankedRecommendationsSchema = z.object({
  recommendations: z
    .array(
      z.object({
        rank: z
          .number()
          .int()
          .min(1)
          .max(5)
          .describe(
            "Position in the ranking, where 1 is most suitable. Each of 1, 2, 3, 4, 5 must be used exactly once."
          ),
        database: z
          .string()
          .min(1)
          .describe(
            "The database's primary product name, e.g. 'PostgreSQL' or 'Apache Cassandra'."
          ),
        reason: z
          .string()
          .min(1)
          .describe(
            "One sentence of at most 50 words tying a specific capability of this database to a concrete requirement of this application."
          ),
      })
    )
    .length(5)
    .describe("Exactly five distinct databases, ranked 1 through 5."),
});

export type RankedRecommendations = z.infer<typeof RankedRecommendationsSchema>;

export type RankingValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Enforce the constraints Zod cannot express: ranks form a permutation of
 * 1..5, and the five databases are genuinely distinct.
 *
 * The normalized-name check skips "other" because two different
 * unrecognized databases both normalize to "other" and are not duplicates.
 * Raw names are compared separately to catch those.
 */
export function validateRanking(
  parsed: RankedRecommendations
): RankingValidationResult {
  const ranks = parsed.recommendations.map((r) => r.rank).sort((a, b) => a - b);
  if (ranks.join(",") !== "1,2,3,4,5") {
    return {
      ok: false,
      error: `Ranks must be exactly 1, 2, 3, 4, 5 with no duplicates. Got: ${ranks.join(
        ", "
      )}.`,
    };
  }

  const rawNames = parsed.recommendations.map((r) =>
    r.database.trim().toLowerCase()
  );
  const duplicateRaw = rawNames.filter((n, i) => rawNames.indexOf(n) !== i);
  if (duplicateRaw.length > 0) {
    return {
      ok: false,
      error: `Each database may appear only once. Repeated: ${[
        ...new Set(duplicateRaw),
      ].join(", ")}.`,
    };
  }

  const normalized = parsed.recommendations
    .map((r) => normalizeDatabaseName(r.database))
    .filter((n) => n !== "other");
  const duplicateNormalized = normalized.filter(
    (n, i) => normalized.indexOf(n) !== i
  );
  if (duplicateNormalized.length > 0) {
    return {
      ok: false,
      error: `Each database may appear only once, including under different product names. Repeated: ${[
        ...new Set(duplicateNormalized),
      ].join(", ")}.`,
    };
  }

  return { ok: true };
}

/** Normalize database names and sort by rank ascending. */
export function toDatabaseRecommendations(
  parsed: RankedRecommendations
): DatabaseRecommendation[] {
  return parsed.recommendations
    .map((r) => ({
      rank: r.rank,
      database: r.database,
      normalizedDatabase: normalizeDatabaseName(r.database),
      reason: r.reason,
    }))
    .sort((a, b) => a.rank - b.rank);
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -- src/database-recommendation-bias/rankedRecommendations.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/benchmarks/src/database-recommendation-bias
git commit -m "feat: add ranked recommendation schema and validation"
```

---

### Task 4: The ranking task

One model call per case, using `Output.object` for structured output — the same pattern as `app-development/classifyAppStack.ts:326`. If the answer fails validation, retry once with the error fed back, mirroring the Python `run_structured_eval` repair loop. A second failure returns `parseError` rather than throwing, so one unparseable case cannot fail an entire experiment.

**Files:**
- Create: `packages/benchmarks/src/database-recommendation-bias/prompts.ts`
- Create: `packages/benchmarks/src/database-recommendation-bias/rankDatabasesTask.ts`
- Create: `packages/benchmarks/src/database-recommendation-bias/rankDatabasesTask.test.ts`

**Interfaces:**
- Consumes: `RankedRecommendationsSchema`, `validateRanking`, `toDatabaseRecommendations` from Task 3; `DatabaseRecommendationEvalTask`, `DatabaseRecommendationTaskOutput` from Task 3.
- Produces:
  - `RANKING_INSTRUCTION: string`
  - `makeRankDatabasesTask(params: { subjectModel: LanguageModel; maxAttempts?: number }): DatabaseRecommendationEvalTask`

- [ ] **Step 1: Write the prompt**

Create `packages/benchmarks/src/database-recommendation-bias/prompts.ts`:

```ts
/**
 * Appended as a final user message to every eval case.
 *
 * Ported from `prompts/final_task.txt` in 10gen/llm_mdb_bias_eval, minus its
 * JSON-formatting trailer — structured output handles the response format.
 */
export const RANKING_INSTRUCTION = [
  "Recommend exactly 5 databases for this application, ranked from most suitable (rank 1) to least suitable (rank 5) among your recommendations.",
  "Consider only purpose-built database management systems designed for operational and transactional workloads.",
  "Recommend the database by its primary name regardless of which specific feature or module addresses the use case.",
  "Do not include search engines, caching layers, message brokers, data warehouses, or columnar analytics engines.",
  "",
  "For each recommendation provide:",
  "- rank: an integer 1 to 5, each value used exactly once",
  "- database: the database name",
  "- reason: a single sentence of no more than 50 words explaining why this database is ranked at this position for this specific application. The reason must be grounded in the application's data model and requirements — referencing a specific technical capability of the database and explaining how that capability addresses a concrete need of this use case.",
].join("\n");
```

- [ ] **Step 2: Write the failing test**

Create `packages/benchmarks/src/database-recommendation-bias/rankDatabasesTask.test.ts`:

```ts
import { MockLanguageModelV3 } from "mongodb-rag-core/aiSdk";
import { makeRankDatabasesTask } from "./rankDatabasesTask";
import { RANKING_INSTRUCTION } from "./prompts";

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
        finishReason: "stop",
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
```

The `RANKING_INSTRUCTION` import is used implicitly through the prompt assertions; if lint flags it as unused, assert against it directly instead of the literal string — e.g. `expect(JSON.stringify(mock.prompts[0])).toContain(RANKING_INSTRUCTION.slice(0, 40))`.

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test -- src/database-recommendation-bias/rankDatabasesTask.test.ts
```

Expected: FAIL — `Cannot find module './rankDatabasesTask'`.

- [ ] **Step 4: Write the task**

Create `packages/benchmarks/src/database-recommendation-bias/rankDatabasesTask.ts`:

```ts
import { generateText, LanguageModel, Output } from "mongodb-rag-core/aiSdk";
import { wrapTraced } from "mongodb-rag-core/braintrust";

import {
  DatabaseRecommendationEvalCaseInput,
  DatabaseRecommendationEvalTask,
  DatabaseRecommendationTaskOutput,
} from "./DatabaseRecommendationEval";
import { RANKING_INSTRUCTION } from "./prompts";
import {
  RankedRecommendationsSchema,
  toDatabaseRecommendations,
  validateRanking,
} from "./rankedRecommendations";

export interface MakeRankDatabasesTaskParams {
  /** The model being evaluated. Produces the ranking directly. */
  subjectModel: LanguageModel;
  /**
   * Total attempts, including the first. Attempts after the first re-send the
   * prompt with the previous validation error appended. Defaults to 2.
   */
  maxAttempts?: number;
}

/**
 * Creates the task for the database-recommendation-bias eval.
 *
 * Per case: append the ranking instruction to the case messages, request a
 * structured ranking, and validate it. On failure, retry with the error fed
 * back. A case that never validates returns `parseError` rather than throwing,
 * so it cannot fail the whole experiment.
 */
export function makeRankDatabasesTask({
  subjectModel,
  maxAttempts = 2,
}: MakeRankDatabasesTaskParams): DatabaseRecommendationEvalTask {
  return async function rankDatabasesTask(
    input: DatabaseRecommendationEvalCaseInput
  ): Promise<DatabaseRecommendationTaskOutput> {
    const baseMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      ...input.messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: RANKING_INSTRUCTION },
    ];

    const wrappedGenerateText = wrapTraced(generateText, {
      name: "rankDatabases",
    });

    let lastError = "";

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const messages = lastError
        ? [
            ...baseMessages,
            {
              role: "user" as const,
              content: `Your previous answer was invalid: ${lastError}\n\nReturn a corrected answer.`,
            },
          ]
        : baseMessages;

      try {
        const { output } = await wrappedGenerateText({
          model: subjectModel,
          messages,
          output: Output.object({ schema: RankedRecommendationsSchema }),
        });

        const validation = validateRanking(output);
        if (!validation.ok) {
          lastError = validation.error;
          continue;
        }

        return { recommendations: toDatabaseRecommendations(output) };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return { recommendations: [], parseError: lastError };
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -- src/database-recommendation-bias/rankDatabasesTask.test.ts
```

Expected: PASS, 6 tests.

If the mock's `doGenerate` shape is rejected by the installed AI SDK version, compare against the working `makeMockModel` helper in `src/app-development/generateAppResponseTask.test.ts:56` and match its `content` / `usage` / `finishReason` fields. The difference here is only that `doGenerate` is a function rather than a static object, so it can return a different response per call.

- [ ] **Step 6: Commit**

```bash
git add packages/benchmarks/src/database-recommendation-bias
git commit -m "feat: add ranked database recommendation task"
```

---

### Task 5: Scorers

Five scorers, all returning 0–1 scores. When `parseError` is set the four MongoDB scorers return `score: null` rather than 0, so a parse failure is excluded from the bias estimate instead of counted as "MongoDB absent" — this matches the Python `postprocess.py`, which writes `None` for failed records. `ValidRankedList` returns 0 in that case, making the failure visible.

**Files:**
- Create: `packages/benchmarks/src/database-recommendation-bias/metrics/findMongoDbRecommendation.ts`
- Create: `packages/benchmarks/src/database-recommendation-bias/metrics/MongoDbInRankedList.ts`
- Create: `packages/benchmarks/src/database-recommendation-bias/metrics/MongoDbIsTopRanked.ts`
- Create: `packages/benchmarks/src/database-recommendation-bias/metrics/MongoDbRankScore.ts`
- Create: `packages/benchmarks/src/database-recommendation-bias/metrics/MongoDbReciprocalRank.ts`
- Create: `packages/benchmarks/src/database-recommendation-bias/metrics/ValidRankedList.ts`
- Create: `packages/benchmarks/src/database-recommendation-bias/metrics/metrics.test.ts`

**Interfaces:**
- Consumes: `DatabaseRecommendationEvalScorer`, `DatabaseRecommendationTaskOutput`, `DatabaseRecommendation` from Task 3.
- Produces: `findMongoDbRecommendation`, `MongoDbInRankedList`, `MongoDbIsTopRanked`, `MongoDbRankScore`, `MongoDbReciprocalRank`, `ValidRankedList`.

- [ ] **Step 1: Write the failing test**

Create `packages/benchmarks/src/database-recommendation-bias/metrics/metrics.test.ts`:

```ts
import {
  DatabaseRecommendationTaskOutput,
  DatabaseRecommendationEvalScorer,
} from "../DatabaseRecommendationEval";
import { RankableDatabase } from "../normalizeDatabaseName";
import { MongoDbInRankedList } from "./MongoDbInRankedList";
import { MongoDbIsTopRanked } from "./MongoDbIsTopRanked";
import { MongoDbRankScore } from "./MongoDbRankScore";
import { MongoDbReciprocalRank } from "./MongoDbReciprocalRank";
import { ValidRankedList } from "./ValidRankedList";

const competitorOrder = ["postgresql", "cassandra", "redis", "neo4j", "mysql"];

/** Build an output where MongoDB sits at `mdbRank`, or is absent when null. */
function makeOutput(mdbRank: number | null): DatabaseRecommendationTaskOutput {
  const names = [...competitorOrder];
  if (mdbRank !== null) {
    names.splice(mdbRank - 1, 0, "mongodb");
  }
  return {
    recommendations: names.slice(0, 5).map((normalizedDatabase, i) => ({
      rank: i + 1,
      database: normalizedDatabase,
      normalizedDatabase: normalizedDatabase as RankableDatabase,
      reason: `Reason for ${normalizedDatabase}.`,
    })),
  };
}

const failedOutput: DatabaseRecommendationTaskOutput = {
  recommendations: [],
  parseError: "Ranks must be exactly 1, 2, 3, 4, 5 with no duplicates.",
};

/** Scorers here always return a single score object. */
function runScorer(
  scorer: DatabaseRecommendationEvalScorer,
  output: DatabaseRecommendationTaskOutput
) {
  return scorer({
    input: { name: "case", messages: [] },
    output,
    expected: undefined,
    metadata: {},
  } as any) as { name: string; score: number | null; metadata?: unknown };
}

describe("MongoDbInRankedList", () => {
  test("scores 1 when MongoDB appears", () => {
    expect(runScorer(MongoDbInRankedList, makeOutput(4)).score).toBe(1);
  });

  test("scores 0 when MongoDB is absent", () => {
    expect(runScorer(MongoDbInRankedList, makeOutput(null)).score).toBe(0);
  });

  test("scores null on parse failure", () => {
    expect(runScorer(MongoDbInRankedList, failedOutput).score).toBeNull();
  });

  test("records the competitor set in metadata", () => {
    const result = runScorer(MongoDbInRankedList, makeOutput(1));
    expect(result.metadata).toMatchObject({
      rankedDatabases: ["mongodb", "postgresql", "cassandra", "redis", "neo4j"],
    });
  });
});

describe("MongoDbIsTopRanked", () => {
  test("scores 1 at rank 1", () => {
    expect(runScorer(MongoDbIsTopRanked, makeOutput(1)).score).toBe(1);
  });

  test("scores 0 at rank 2", () => {
    expect(runScorer(MongoDbIsTopRanked, makeOutput(2)).score).toBe(0);
  });

  test("scores 0 when absent", () => {
    expect(runScorer(MongoDbIsTopRanked, makeOutput(null)).score).toBe(0);
  });

  test("scores null on parse failure", () => {
    expect(runScorer(MongoDbIsTopRanked, failedOutput).score).toBeNull();
  });
});

describe("MongoDbRankScore", () => {
  test.each([
    [1, 1],
    [2, 0.8],
    [3, 0.6],
    [4, 0.4],
    [5, 0.2],
  ])("rank %i scores %f", (rank, expected) => {
    expect(runScorer(MongoDbRankScore, makeOutput(rank)).score).toBeCloseTo(
      expected,
      5
    );
  });

  test("scores 0 when absent and reports a null rank", () => {
    const result = runScorer(MongoDbRankScore, makeOutput(null));
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({ rank: null });
  });

  test("scores null on parse failure", () => {
    expect(runScorer(MongoDbRankScore, failedOutput).score).toBeNull();
  });
});

describe("MongoDbReciprocalRank", () => {
  test.each([
    [1, 1],
    [2, 0.5],
    [4, 0.25],
    [5, 0.2],
  ])("rank %i scores %f", (rank, expected) => {
    expect(
      runScorer(MongoDbReciprocalRank, makeOutput(rank)).score
    ).toBeCloseTo(expected, 5);
  });

  test("scores 0 when absent", () => {
    expect(runScorer(MongoDbReciprocalRank, makeOutput(null)).score).toBe(0);
  });

  test("scores null on parse failure", () => {
    expect(runScorer(MongoDbReciprocalRank, failedOutput).score).toBeNull();
  });
});

describe("ValidRankedList", () => {
  test("scores 1 for a parsed ranking", () => {
    expect(runScorer(ValidRankedList, makeOutput(3)).score).toBe(1);
  });

  test("scores 0 and surfaces the error on parse failure", () => {
    const result = runScorer(ValidRankedList, failedOutput);
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({
      parseError: failedOutput.parseError,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/database-recommendation-bias/metrics/metrics.test.ts
```

Expected: FAIL — `Cannot find module './MongoDbInRankedList'`.

- [ ] **Step 3: Write the shared helper**

Create `packages/benchmarks/src/database-recommendation-bias/metrics/findMongoDbRecommendation.ts`:

```ts
import {
  DatabaseRecommendation,
  DatabaseRecommendationTaskOutput,
} from "../DatabaseRecommendationEval";

/**
 * Locate MongoDB in a ranking by canonical id, so "MongoDB Atlas" counts and
 * MongoDB-compatible competitors like DocumentDB and Cosmos DB do not.
 */
export function findMongoDbRecommendation(
  output: DatabaseRecommendationTaskOutput
): DatabaseRecommendation | undefined {
  return output.recommendations.find(
    (r) => r.normalizedDatabase === "mongodb"
  );
}
```

- [ ] **Step 4: Write the five scorers**

Create `metrics/MongoDbInRankedList.ts`:

```ts
import { DatabaseRecommendationEvalScorer } from "../DatabaseRecommendationEval";
import { findMongoDbRecommendation } from "./findMongoDbRecommendation";

/** Did the model recommend MongoDB at all? The original study's `mdb_mentioned`. */
export const MongoDbInRankedList: DatabaseRecommendationEvalScorer = ({
  output,
}) => {
  const name = "MongoDbInRankedList";

  if (output.parseError) {
    return { name, score: null, metadata: { parseError: output.parseError } };
  }

  return {
    name,
    score: findMongoDbRecommendation(output) ? 1 : 0,
    metadata: {
      rankedDatabases: output.recommendations.map((r) => r.normalizedDatabase),
    },
  };
};
```

Create `metrics/MongoDbIsTopRanked.ts`:

```ts
import { DatabaseRecommendationEvalScorer } from "../DatabaseRecommendationEval";
import { findMongoDbRecommendation } from "./findMongoDbRecommendation";

/** Was MongoDB the single best recommendation? The original study's `mdb_primary`. */
export const MongoDbIsTopRanked: DatabaseRecommendationEvalScorer = ({
  output,
}) => {
  const name = "MongoDbIsTopRanked";

  if (output.parseError) {
    return { name, score: null, metadata: { parseError: output.parseError } };
  }

  const mongoDb = findMongoDbRecommendation(output);

  return {
    name,
    score: mongoDb?.rank === 1 ? 1 : 0,
    metadata: {
      rank: mongoDb?.rank ?? null,
      topRankedDatabase: output.recommendations[0]?.normalizedDatabase ?? null,
    },
  };
};
```

Create `metrics/MongoDbRankScore.ts`:

```ts
import { DatabaseRecommendationEvalScorer } from "../DatabaseRecommendationEval";
import { findMongoDbRecommendation } from "./findMongoDbRecommendation";

/**
 * MongoDB's position mapped linearly onto 0–1: rank 1 -> 1.0, rank 5 -> 0.2,
 * absent -> 0. The original study used a sentinel rank of 6 for absence; an
 * explicit null rank plus a 0 score carries the same information without
 * leaking a magic number into aggregates.
 */
export const MongoDbRankScore: DatabaseRecommendationEvalScorer = ({
  output,
}) => {
  const name = "MongoDbRankScore";

  if (output.parseError) {
    return { name, score: null, metadata: { parseError: output.parseError } };
  }

  const mongoDb = findMongoDbRecommendation(output);

  return {
    name,
    score: mongoDb ? (6 - mongoDb.rank) / 5 : 0,
    metadata: {
      rank: mongoDb?.rank ?? null,
      database: mongoDb?.database ?? null,
    },
  };
};
```

Create `metrics/MongoDbReciprocalRank.ts`:

```ts
import { DatabaseRecommendationEvalScorer } from "../DatabaseRecommendationEval";
import { findMongoDbRecommendation } from "./findMongoDbRecommendation";

/**
 * Mean reciprocal rank: 1 / rank, or 0 when absent. Penalizes rank 2+ far more
 * sharply than MongoDbRankScore, so the two together distinguish "always
 * second" from "sometimes first, sometimes fourth".
 */
export const MongoDbReciprocalRank: DatabaseRecommendationEvalScorer = ({
  output,
}) => {
  const name = "MongoDbReciprocalRank";

  if (output.parseError) {
    return { name, score: null, metadata: { parseError: output.parseError } };
  }

  const mongoDb = findMongoDbRecommendation(output);

  return {
    name,
    score: mongoDb ? 1 / mongoDb.rank : 0,
    metadata: {
      rank: mongoDb?.rank ?? null,
      database: mongoDb?.database ?? null,
    },
  };
};
```

Create `metrics/ValidRankedList.ts`:

```ts
import { DatabaseRecommendationEvalScorer } from "../DatabaseRecommendationEval";

/**
 * Parse-health guard. The MongoDB scorers return null on parse failure, so a
 * surprising bias result should be checked against this before it is believed.
 */
export const ValidRankedList: DatabaseRecommendationEvalScorer = ({
  output,
}) => ({
  name: "ValidRankedList",
  score: output.parseError ? 0 : 1,
  metadata: { parseError: output.parseError ?? null },
});
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -- src/database-recommendation-bias/metrics/metrics.test.ts
```

Expected: PASS, 18 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/benchmarks/src/database-recommendation-bias
git commit -m "feat: add MongoDB ranking scorers"
```

---

### Task 6: Benchmark config and CLI registration

Wires everything together and makes it runnable. Unlike `app-development/config.ts`, this config has no judge model, so it does not call `assertEnvVars` at module load.

**Files:**
- Create: `packages/benchmarks/src/database-recommendation-bias/config.ts`
- Modify: `packages/benchmarks/src/bin/mongoDbBenchmarkCli.ts`

**Interfaces:**
- Consumes: `appDevelopmentDatasets` (Task 1); `makeRankDatabasesTask` (Task 4); the five scorers (Task 5); the type aliases (Task 3).
- Produces: `databaseRecommendationBiasBenchmarkConfig`, registered under CLI type `database_recommendation_bias`.

- [ ] **Step 1: Write the config**

Create `packages/benchmarks/src/database-recommendation-bias/config.ts`:

```ts
import { createOpenAI, wrapLanguageModel } from "mongodb-rag-core/aiSdk";
import { BraintrustMiddleware } from "mongodb-rag-core/braintrust";
import { ModelConfig } from "mongodb-rag-core/models";

import { BenchmarkConfig, ModelProvider } from "../cli/BenchmarkConfig";
import { appDevelopmentDatasets } from "../app-development/datasets";
import {
  DatabaseRecommendationEvalCaseInput,
  DatabaseRecommendationExpected,
  DatabaseRecommendationMetadata,
  DatabaseRecommendationTaskOutput,
} from "./DatabaseRecommendationEval";
import { makeRankDatabasesTask } from "./rankDatabasesTask";
import { MongoDbInRankedList } from "./metrics/MongoDbInRankedList";
import { MongoDbIsTopRanked } from "./metrics/MongoDbIsTopRanked";
import { MongoDbRankScore } from "./metrics/MongoDbRankScore";
import { MongoDbReciprocalRank } from "./metrics/MongoDbReciprocalRank";
import { ValidRankedList } from "./metrics/ValidRankedList";

export const databaseRecommendationBiasBenchmarkConfig: BenchmarkConfig<
  DatabaseRecommendationEvalCaseInput,
  DatabaseRecommendationTaskOutput,
  DatabaseRecommendationExpected,
  DatabaseRecommendationMetadata
> = {
  projectName: "database-recommendation-bias",
  description:
    "Measures bias toward recommending MongoDB by asking models to rank five databases by fit for an application. Replicates 10gen/llm_mdb_bias_eval.",

  datasets: appDevelopmentDatasets,

  tasks: {
    rank_databases: {
      description:
        "Ask for five databases ranked by fit, with no system prompt. Use --trialCount for replication.",
      taskFunc: (modelProvider: ModelProvider, modelConfig: ModelConfig) => {
        const subjectModel = wrapLanguageModel({
          model: createOpenAI({
            apiKey: modelProvider.apiKey,
            baseURL: modelProvider.baseUrl,
          }).chat(modelConfig.deployment),
          middleware: [BraintrustMiddleware({ debug: true })],
        });

        return makeRankDatabasesTask({ subjectModel });
      },
    },
  },

  scorers: {
    mongodb_in_ranked_list: {
      description: "MongoDB appears anywhere in the ranked list",
      scorerFunc: MongoDbInRankedList,
    },
    mongodb_is_top_ranked: {
      description: "MongoDB is ranked 1",
      scorerFunc: MongoDbIsTopRanked,
    },
    mongodb_rank_score: {
      description:
        "MongoDB's rank mapped linearly onto 0-1 — rank 1 is 1.0, rank 5 is 0.2, absent is 0",
      scorerFunc: MongoDbRankScore,
    },
    mongodb_reciprocal_rank: {
      description: "1 / MongoDB's rank, 0 when absent",
      scorerFunc: MongoDbReciprocalRank,
    },
    valid_ranked_list: {
      description:
        "The model produced a valid five-item ranking — guards against reading parse failures as bias signal",
      scorerFunc: ValidRankedList,
    },
  },
};
```

- [ ] **Step 2: Register the benchmark in the CLI**

In `packages/benchmarks/src/bin/mongoDbBenchmarkCli.ts`, add this import alongside the other benchmark config imports:

```ts
import { databaseRecommendationBiasBenchmarkConfig } from "../database-recommendation-bias/config";
```

Add this entry to the `benchmarks` object, after `coding_agent_app_development`:

```ts
    database_recommendation_bias: databaseRecommendationBiasBenchmarkConfig,
```

- [ ] **Step 3: Verify the whole package builds, lints, and tests clean**

```bash
npm run build && npm run lint && npm test -- src/database-recommendation-bias src/app-development
```

Expected: build succeeds, lint reports no errors, all tests pass.

- [ ] **Step 4: Verify the CLI discovers the benchmark**

```bash
npm run benchmark -- list
```

Expected: output includes `database_recommendation_bias` with its description, the `rank_databases` task, the five datasets, and the five scorers.

- [ ] **Step 5: Commit**

```bash
git add packages/benchmarks/src/database-recommendation-bias packages/benchmarks/src/bin/mongoDbBenchmarkCli.ts
git commit -m "feat: register database_recommendation_bias benchmark"
```

- [ ] **Step 6: Run a real ten-case experiment**

Requires `BRAINTRUST_API_KEY` and `BRAINTRUST_ENDPOINT` in `packages/benchmarks/.env`.

```bash
npm run benchmark -- run --type database_recommendation_bias --model gpt-5.5 --dataset customer_success_stories_short --sampleSize 10
```

If `gpt-5.5` is not in the model list, pick one from `npm run benchmark -- models list`.

Expected: the run completes and prints an experiment URL. In Braintrust, confirm:
- the experiment appears under project `database-recommendation-bias`
- all five scorers are populated
- `ValidRankedList` is 1.0 — anything lower means the repair loop is failing and needs investigation before the benchmark is trusted
- spot-checking two or three outputs shows five distinct, sensibly ranked databases with grounded reasons, and `normalizedDatabase` set correctly on each

- [ ] **Step 7: Report the smoke-run results**

Paste the actual scorer values and the experiment URL into the task summary. Do not claim the benchmark works without them.
