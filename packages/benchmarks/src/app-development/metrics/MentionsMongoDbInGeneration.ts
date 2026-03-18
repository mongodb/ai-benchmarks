import { AppDevelopmentEvalScorer } from "../AppDevelopmentEval";
import { computeSampleMetrics } from "mongodb-rag-core/eval";

const MONGODB_PATTERNS = [
  /mongodb/i,
  /mongo\s*db/i,
  /mongoose/i,
  /mongosh/i,
  /pymongo/i,
  /mongoclient/i,
  /mongo_client/i,
  /MongoClient/,
];

/**
 * String matching scorer that checks if MongoDB is referenced
 * anywhere in the model's generation (code, reasoning, etc.).
 */
export const MentionsMongoDbInGeneration: AppDevelopmentEvalScorer = ({
  output,
}) => {
  const name = "MentionsMongoDbInGeneration";
  const { samples } = output;

  const perSample = samples.map((s) => {
    const matches = MONGODB_PATTERNS.filter((pattern) =>
      pattern.test(s.response)
    ).map((pattern) => pattern.source);
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
