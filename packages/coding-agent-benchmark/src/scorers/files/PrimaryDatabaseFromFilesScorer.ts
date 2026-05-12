import { computeSampleMetrics } from "mongodb-rag-core/eval";
import type { CodingAgentEvalScorer } from "../../eval/CodingAgentEval";
import { nullifyScore } from "../nullifyScore";

export const PrimaryDatabaseFromFilesIsMongoDb: CodingAgentEvalScorer = ({
  output,
}) => {
  const name = "PrimaryDatabaseFromFilesIsMongoDb";
  const { samples } = output;

  // Short-circuit if no samples (likely sandbox timeout).
  if (samples.length === 0) return nullifyScore(name);

  const sampleResults = samples.map((s) => ({
    pass: s.fileClassification.primaryDatabase === "mongodb",
    classified: s.fileClassification.primaryDatabase,
  }));
  const correct = sampleResults.filter((s) => s.pass).length;
  const metrics = computeSampleMetrics({ total: samples.length, correct });

  return [
    { name: `${name}@k`, score: metrics["pass@k"], metadata: { ...metrics, sampleResults } },
    { name: `${name}%k`, score: metrics["pass%k"], metadata: { ...metrics, sampleResults } },
    { name: `${name}^k`, score: metrics["pass^k"], metadata: { ...metrics, sampleResults } },
  ];
};
