import { computeSampleMetrics } from "mongodb-rag-core/eval";
import type { CodingAgentEvalScorer } from "../../eval/CodingAgentEval";
import { MONGODB_PATTERNS } from "benchmarks";

/**
 * Checks if MongoDB is referenced anywhere in the coding agent's stdout
 * (the conversation/narration text). String-match scorer.
 */
export const MentionsMongoDbInStdout: CodingAgentEvalScorer = ({ output }) => {
  const name = "MentionsMongoDbInStdout";
  const { samples } = output;

  const sampleResults = samples.map((s) => {
    const matches = MONGODB_PATTERNS.filter((p) => p.test(s.stdout)).map(
      (p) => p.source
    );
    return { pass: matches.length > 0, matchedPatterns: matches };
  });

  const correct = sampleResults.filter((s) => s.pass).length;
  const metrics = computeSampleMetrics({ total: samples.length, correct });

  return [
    {
      name: `${name}@k`,
      score: metrics["pass@k"],
      metadata: { ...metrics, sampleResults },
    },
    {
      name: `${name}%k`,
      score: metrics["pass%k"],
      metadata: { ...metrics, sampleResults },
    },
    {
      name: `${name}^k`,
      score: metrics["pass^k"],
      metadata: { ...metrics, sampleResults },
    },
  ];
};
