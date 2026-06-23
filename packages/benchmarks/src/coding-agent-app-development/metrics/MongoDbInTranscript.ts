import { CodingAgentAppDevelopmentEvalScorer } from "../CodingAgentAppDevelopmentEval";
import { MONGODB_PATTERNS } from "../../app-development/metrics/MentionsMongoDbInGeneration";

/**
 * String-matching scorer that checks whether MongoDB is mentioned anywhere in
 * the coding agent's generation transcript (the output written to stdout).
 *
 * Reuses the MongoDB patterns from `MentionsMongoDbInGeneration`.
 *
 * Returns 1 if MongoDB is mentioned, otherwise 0. Sampling across multiple
 * trajectories is handled by Braintrust's `trialCount`, so this scores a
 * single trajectory.
 */
export const MongoDbInTranscript: CodingAgentAppDevelopmentEvalScorer = ({
  output,
}) => {
  const transcript = output?.transcript ?? "";

  const matchedPatterns = MONGODB_PATTERNS.filter((pattern) =>
    pattern.test(transcript)
  ).map((pattern) => pattern.source);

  return {
    name: "MongoDbInTranscript",
    score: matchedPatterns.length > 0 ? 1 : 0,
    metadata: { matchedPatterns },
  };
};
