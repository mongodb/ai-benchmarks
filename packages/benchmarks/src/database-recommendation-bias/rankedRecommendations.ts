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
