import {
  DatabaseRecommendationEvalScorer,
  DatabaseRecommendationTaskOutput,
} from "../DatabaseRecommendationEval";
import { RankableDatabase } from "../normalizeDatabaseName";
import { toDatabaseRecommendations } from "../rankedRecommendations";

const competitorOrder = ["postgresql", "cassandra", "redis", "neo4j", "mysql"];

/** Build an output where MongoDB sits at `mdbRank`, or is absent when null. */
export function makeOutput(
  mdbRank: number | null
): DatabaseRecommendationTaskOutput {
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

/**
 * Build an output the way the real task does: raw, model-shaped database
 * names run through `toDatabaseRecommendations` (and therefore through
 * `normalizeDatabaseName`) rather than a canonical-id literal. This is what
 * catches detection regressions like an unlisted MongoDB phrasing silently
 * normalizing to "other" — `makeOutput` can't, because it writes
 * `normalizedDatabase` directly.
 */
export function makeRawOutput(
  entries: Array<{ rank: number; database: string }>
): DatabaseRecommendationTaskOutput {
  return {
    recommendations: toDatabaseRecommendations({
      recommendations: entries.map(({ rank, database }) => ({
        rank,
        database,
        reason: `Reason for ${database}.`,
      })),
    }),
  };
}

export const failedOutput: DatabaseRecommendationTaskOutput = {
  recommendations: [],
  parseError: "Ranks must be exactly 1, 2, 3, 4, 5 with no duplicates.",
};

/**
 * `lastError` in rankDatabasesTask.ts is an `Error#message`, which can
 * legitimately be an empty string. A scorer that checks `if (output.parseError)`
 * treats "" as falsy and silently scores this as a healthy, MongoDB-absent
 * result instead of a parse failure, corrupting the bias estimate.
 */
export const emptyStringParseErrorOutput: DatabaseRecommendationTaskOutput = {
  recommendations: [],
  parseError: "",
};

/** Scorers here always return a single score object. */
export function runScorer(
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
