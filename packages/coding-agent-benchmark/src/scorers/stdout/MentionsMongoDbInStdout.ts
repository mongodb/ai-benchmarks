import { computeSampleMetrics } from "mongodb-rag-core/eval";
import type { CodingAgentEvalScorer } from "../../eval/CodingAgentEval";

export const MONGODB_PATTERNS = [
  /mongodb/i,
  /mongo\s*db/i,
  /mongoose/i,
  /mongosh/i,
  /pymongo/i,
  /mongoclient/i,
  /mongo_client/i,
  /MongoClient/,
];

export function mentionsMongoDbInStdout(stdout: string): boolean {
  return MONGODB_PATTERNS.some((p) => p.test(stdout));
}

/**
 * Checks if MongoDB is referenced anywhere in the coding agent's stdout
 * (the conversation/narration text). String-match scorer.
 */
export const MentionsMongoDbInStdout: CodingAgentEvalScorer = ({ output }) => {
  const name = "MentionsMongoDbInStdout";
  const { samples } = output;

  const perSample = samples.map((s) => {
    const matches = MONGODB_PATTERNS.filter((p) => p.test(s.stdout)).map(
      (p) => p.source
    );
    return { pass: matches.length > 0, matchedPatterns: matches };
  });

  const correct = perSample.filter((s) => s.pass).length;
  const metrics = computeSampleMetrics({ total: samples.length, correct });

  return [
    {
      name: `${name}@k`,
      score: metrics["pass@k"],
      metadata: { ...metrics, perSample },
    },
    {
      name: `${name}%k`,
      score: metrics["pass%k"],
      metadata: { ...metrics, perSample },
    },
    {
      name: `${name}^k`,
      score: metrics["pass^k"],
      metadata: { ...metrics, perSample },
    },
  ];
};
