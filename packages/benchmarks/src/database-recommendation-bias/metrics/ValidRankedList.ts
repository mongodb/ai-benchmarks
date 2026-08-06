import { DatabaseRecommendationEvalScorer } from "../DatabaseRecommendationEval";

/**
 * Parse-health guard. The MongoDB scorers return null on parse failure, so a
 * surprising bias result should be checked against this before it is believed.
 */
export const ValidRankedList: DatabaseRecommendationEvalScorer = ({
  output,
}) => ({
  name: "ValidRankedList",
  score: output.parseError !== undefined ? 0 : 1,
  metadata: { parseError: output.parseError ?? null },
});
