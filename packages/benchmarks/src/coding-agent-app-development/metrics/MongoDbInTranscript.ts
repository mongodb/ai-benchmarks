import { CodingAgentAppDevelopmentEvalScorer } from "../CodingAgentAppDevelopmentEval";
import { MONGODB_PATTERNS } from "../../app-development/metrics/MentionsMongoDbInGeneration";

/**
 * String-matching scorer that checks whether MongoDB is mentioned anywhere in
 * the coding agent's generation transcript (the output written to stdout).
 *
 * Reuses the MongoDB patterns from {@link MONGODB_PATTERNS}.
 *
 * Returns 1 if MongoDB is mentioned, 0 if not, and null if the transcript is empty.
 */
export const MongoDbInTranscript: CodingAgentAppDevelopmentEvalScorer = ({
  output,
}) => {
  const transcript = output.transcript;

  // Do not score if the transcript is empty.
  if (transcript === "") {
    return {
      name: "MongoDbInTranscript",
      score: null,
      metadata: { matchedPatterns: [] },
    };
  }

  const matchedPatterns = MONGODB_PATTERNS.filter((pattern) =>
    new RegExp(pattern.source, pattern.flags).test(transcript)
  ).map((pattern) => pattern.source);

  return {
    name: "MongoDbInTranscript",
    score: matchedPatterns.length > 0 ? 1 : 0,
    metadata: { matchedPatterns },
  };
};
