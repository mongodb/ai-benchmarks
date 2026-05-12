import { computeSampleMetrics } from "mongodb-rag-core/eval";
import type { CodingAgentEvalScorer } from "../../eval/CodingAgentEval";

export const PrimaryDatabaseFromStdoutIsMongoDb: CodingAgentEvalScorer = ({
  output,
}) => {
  const name = "PrimaryDatabaseFromStdoutIsMongoDb";
  const { samples } = output;

  const sampleResults = samples.map((s) => ({
    pass: s.stdoutClassification.primaryDatabase === "mongodb",
    classified: s.stdoutClassification.primaryDatabase,
  }));
  const correct = sampleResults.filter((s) => s.pass).length;
  const metrics = computeSampleMetrics({ total: samples.length, correct });

  return [
    { name: `${name}@k`, score: metrics["pass@k"], metadata: { ...metrics, sampleResults } },
    { name: `${name}%k`, score: metrics["pass%k"], metadata: { ...metrics, sampleResults } },
    { name: `${name}^k`, score: metrics["pass^k"], metadata: { ...metrics, sampleResults } },
  ];
};
