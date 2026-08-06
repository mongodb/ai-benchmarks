# Database Recommendation Bias Benchmark — Design

Replicate the [`10gen/llm_mdb_bias_eval`](https://github.com/10gen/llm_mdb_bias_eval) study as a
first-class benchmark in this repo, using Braintrust and the existing benchmark CLI.

## Problem

The Python study measures whether frontier models exhibit systematic bias toward recommending
MongoDB when asked to evaluate database fit for an application. It prompts a model with an
application description, asks for **exactly five databases ranked 1–5**, then extracts three
dependent variables: whether MongoDB was mentioned, at what rank, and whether it was rank 1.

We already measure two of those three signals in the `app_development` benchmark
(`MentionsMongoDbInGeneration`, `PrimaryDatabaseIsMongoDb`) — but only as booleans over a free-form
app-building generation. The ranking signal is the one we're missing, and it is the most
informative: it distinguishes "MongoDB was considered and rejected" from "MongoDB was never
considered", and it exposes the competitor set.

## Goal

A `database_recommendation_bias` benchmark that:

- Reuses the app-development eval-case schema and dataset registry, so any dataset usable by one
  benchmark is usable by the other.
- Asks the subject model for a ranked list of five databases via structured output.
- Scores MongoDB's presence, rank, and top-position with rank-aware metrics.
- Runs through `npm run benchmark -- run --type database_recommendation_bias ...` with no new
  environment variables.

## Non-goals

- Personas. The original's 5-persona × 2-length factor is deliberately not replicated.
- `pass@k` / `pass%k` / `pass^k`. Replication is handled by the CLI's `--trialCount` flag, which
  Braintrust averages natively.
- Synthetic prompt generation (`generate_benchmark_prompts.py`, `synth_poor_fit`). The existing
  `db_agnostic` dataset serves as the non-best-fit arm.
- The R modeling and matplotlib plotting scripts. Braintrust's UI and `src/reporting/` cover
  analysis.
- An LLM judge. The ranking is structured output from the subject model, so this benchmark is one
  model call per case, not app-development's four.

## Architecture

```
packages/benchmarks/src/
  app-development/
    datasets.ts                 (NEW — extracted shared dataset registry)
    config.ts                   (EDIT — consume datasets.ts)
    AppDevelopmentEval.ts       (EDIT — make `difficulty` optional)
  database-recommendation-bias/
    DatabaseRecommendationEval.ts
    rankedRecommendations.ts
    normalizeDatabaseName.ts
    prompts.ts
    rankDatabasesTask.ts
    config.ts
    metrics/
      MongoDbInRankedList.ts
      MongoDbIsTopRanked.ts
      MongoDbRankScore.ts
      MongoDbReciprocalRank.ts
      ValidRankedList.ts
  bin/mongoDbBenchmarkCli.ts    (EDIT — register benchmark)
```

### Shared dataset registry

`loadDataset()` and the five dataset entries are currently inlined in
`app-development/config.ts`. They move to `app-development/datasets.ts`, which exports:

- `loadAppDevelopmentDataset(path: string): AppDevelopmentEvalCase[]`
- `appDevelopmentDatasets: Record<string, BenchmarkDataset<AppDevelopmentEvalCaseInput, void, AppDevelopmentMetadata>>`
  containing `all`, `mongodb_optimal`, `db_agnostic`, `customer_success_stories_short`,
  `customer_success_stories_long`. (Shipped with two further keys,
  `customer_success_stories_notable_short` / `_long`, folded in from parallel work that also
  pointed `coding-agent-app-development` at this same registry — seven keys total.)

Both benchmark configs set `datasets: appDevelopmentDatasets`. A dataset added later appears in
both automatically. `app-development/config.ts` keeps its current behavior exactly — this is a
move, not a rewrite.

While extracting: `AppDevelopmentMetadata.difficulty` becomes optional. It is declared required
today but the customer-success-story YAML files don't set it, and `loadDataset` papers over the
mismatch with `as unknown as AppDevelopmentMetadata`. Making it optional lets the cast become a
plain assignment.

### Types

```ts
// DatabaseRecommendationEval.ts
import { AppDevelopmentEvalCaseInput, AppDevelopmentMetadata }
  from "../app-development/AppDevelopmentEval";

export type DatabaseRecommendationEvalCaseInput = AppDevelopmentEvalCaseInput;
export type DatabaseRecommendationMetadata = AppDevelopmentMetadata;
export type DatabaseRecommendationExpected = void;

export interface DatabaseRecommendation {
  /** 1–5, unique within a ranking. */
  rank: number;
  /** Database name exactly as the model wrote it. */
  database: string;
  /** `database` mapped onto a canonical id, or "other". */
  normalizedDatabase: RankableDatabase | "other";
  reason: string;
}

export type DatabaseRecommendationTaskOutput = {
  /** Sorted by rank ascending. Empty when `parseError` is set. */
  recommendations: DatabaseRecommendation[];
  /** Set when the model never produced a valid ranking. */
  parseError?: string;
};
```

### Ranking schema and validation

`rankedRecommendations.ts` holds the Zod schema and the semantic validator, ported from the
Python `RecommendationSet` Pydantic model:

```ts
export const RankedRecommendationsSchema = z.object({
  recommendations: z
    .array(
      z.object({
        rank: z.number().int().min(1).max(5),
        database: z.string().min(1),
        reason: z.string().min(1),
      })
    )
    .length(5),
});
```

Zod enforces shape; `validateRanking()` enforces the rest and returns a human-readable error
string suitable for feeding back to the model:

- ranks are a permutation of `[1,2,3,4,5]` — no duplicates, no gaps
- normalized database names are distinct (catches "MongoDB" and "MongoDB Atlas" as two entries)

### Database name normalization

`normalizeDatabaseName(raw: string): RankableDatabase | "other"` lowercases, strips punctuation and
vendor prefixes, then looks up an alias table.

The canonical id list is **local to this benchmark**:

```ts
export const rankableDatabases = [
  ...primaryDatabases,          // reused from app-development/classifyAppStack.ts
  ...additionalOperationalDatabases,
] as const;
```

`primaryDatabases` is missing several databases that routinely appear in ranked
recommendation lists — `cassandra`, `scylladb`, `yugabytedb`, `spanner`, `aurora`, `documentdb`,
`singlestore`, `db2`, `hbase`, `ravendb`. Those go in `additionalOperationalDatabases`.
Deriving a local list rather than extending `primaryDatabases` in place keeps app-development's
LLM judge behavior unchanged — adding enum values there would alter what that judge can return.

Alias coverage must at minimum handle, for MongoDB: `mongo`, `mongo db`, `mongodb atlas`,
`atlas`, `mongodb community`, `mongodb enterprise`. Note that `documentdb` (AWS) normalizes to
`documentdb`, **not** `mongodb` — it is a competitor, and conflating them would inflate the
mention rate.

MongoDB detection throughout the scorers is `normalizedDatabase === "mongodb"`, not the original's
substring match on `"mongodb"`.

### Prompt

`prompts.ts` exports `RANKING_INSTRUCTION`, ported from the original's `prompts/final_task.txt`,
minus its JSON-formatting trailer (structured output handles that):

> Recommend exactly 5 databases for this application, ranked from most suitable (rank 1) to least
> suitable (rank 5) among your recommendations. Consider only purpose-built database management
> systems designed for operational and transactional workloads. Recommend the database by its
> primary name regardless of which specific feature or module addresses the use case. Do not
> include search engines, caching layers, message brokers, data warehouses, or columnar analytics
> engines.
>
> For each recommendation provide:
> - `rank`: an integer 1 to 5, each value used exactly once
> - `database`: the database name
> - `reason`: a single sentence of no more than 50 words explaining why this database is ranked at
>   this position for this specific application. The reason must be grounded in the application's
>   data model and requirements — referencing a specific technical capability of the database and
>   explaining how that capability addresses a concrete need of this use case.

The original also prepended an "internal reasoning" line to every system prompt
(`prompts/internal_reasoning.txt`). Because we ship a single task with **no system prompt**, this
is omitted. It is a natural future task variant if we want the factor back.

### Task

`makeRankDatabasesTask({ subjectModel, maxAttempts = 2 })` returns a
`DatabaseRecommendationEvalTask`. Per case:

1. Send the eval case's `messages`, then a final user message containing `RANKING_INSTRUCTION`.
2. Call `generateText` with `output: Output.object({ schema: RankedRecommendationsSchema })` —
   the same pattern as `classifyAppStack.ts`.
3. Run `validateRanking()`. On failure, retry once with the validation error appended as an extra
   user message ("Your previous answer was invalid: …"), mirroring the Python `run_structured_eval`
   repair loop.
4. On success: normalize each database name, sort by rank, return.
5. On repeated failure: return `{ recommendations: [], parseError }`. **Do not throw** — one
   unparseable case must not fail the experiment.

Wrapped in `wrapTraced` for Braintrust, matching existing task conventions.

### Scorers

All scores are 0–1. When `parseError` is set, the four MongoDB scorers return `score: null` so
parse failures are excluded from the bias estimate rather than counted as "no MongoDB" — this
matches the Python `postprocess.py`, which writes `None` for failed records.

| Scorer | Score when parsed | Score when `parseError` |
|---|---|---|
| `MongoDbInRankedList` | 1 if MongoDB present, else 0 | `null` |
| `MongoDbIsTopRanked` | 1 if MongoDB rank is 1, else 0 | `null` |
| `MongoDbRankScore` | `(6 − rank) / 5`; 0 if absent | `null` |
| `MongoDbReciprocalRank` | `1 / rank`; 0 if absent | `null` |
| `ValidRankedList` | 1 | 0 |

`MongoDbRankScore` maps rank 1 → 1.0, rank 3 → 0.6, rank 5 → 0.2, absent → 0. The original used a
sentinel `mdb_rank = 6` for absence; we use an explicit `null` rank plus score 0, so no magic
number leaks into aggregates.

`MongoDbReciprocalRank` (standard MRR) is included alongside the linear score because it penalizes
rank 2+ far more sharply. The two together distinguish "MongoDB is always second" from "MongoDB is
sometimes first, sometimes fourth".

Rank scorers attach `metadata: { rank, database, normalizedDatabase }`. `MongoDbInRankedList`
attaches the full normalized competitor list, so the competitor mix is queryable in Braintrust
without re-parsing the output.

`ValidRankedList` is a health guard: a suspiciously low bias score should be checkable against
parse success before it is believed.

### CLI

Registered in `bin/mongoDbBenchmarkCli.ts` as `database_recommendation_bias`, Braintrust project
name `database-recommendation-bias`. Single task, named `rank_databases`. Usage:

```bash
npm run benchmark -- run \
  --type database_recommendation_bias \
  --model gpt-5.5 \
  --dataset customer_success_stories_short \
  --trialCount 2
```

No new environment variables — the subject model comes from the CLI's shared
`modelProvider` (Braintrust proxy), and there is no judge model.

## Error handling

- **Schema violation / no object generated** — AI SDK throws; caught, triggers the repair retry.
- **Semantic validation failure** (bad ranks, duplicate DBs) — triggers the repair retry.
- **Second failure** — recorded as `parseError`, MongoDB scorers return `null`, `ValidRankedList`
  returns 0. The case still lands in Braintrust with the error text visible.
- **API/network errors** — not handled here. Braintrust and the AI SDK own retry at that layer,
  consistent with every other benchmark in this repo.

## Testing

Colocated Jest tests, following existing conventions.

- `normalizeDatabaseName.test.ts` — MongoDB aliases; case and punctuation variance; `documentdb`
  and `cosmosdb` stay distinct from `mongodb`; unknown names fall back to `"other"`.
- `rankedRecommendations.test.ts` — `validateRanking` accepts a valid ranking; rejects duplicate
  ranks, gapped ranks, and duplicate normalized databases; error messages name the problem.
- `rankDatabasesTask.test.ts` — `MockLanguageModelV3`, following the mock pattern in
  `app-development/generateAppResponseTask.test.ts`. Covers: happy path returns five sorted
  normalized recommendations; invalid first response then valid retry succeeds and the retry
  prompt contains the error; two invalid responses yield `parseError` without throwing.
- One test per scorer — MongoDB at rank 1, at rank 3, absent, and `parseError` (asserting `null`).

## Verification

Beyond unit tests, the benchmark is verified by a real run against a small slice:

```bash
npm run benchmark -- run \
  --type database_recommendation_bias \
  --model gpt-5.5 \
  --dataset customer_success_stories_short \
  --sampleSize 10
```

Success means: the experiment appears in Braintrust, all five scorers are populated,
`ValidRankedList` is 1.0, and spot-checking a few outputs shows five distinct sensibly-ranked
databases with grounded reasons.
