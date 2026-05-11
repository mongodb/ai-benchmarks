import { computeSampleMetrics } from "mongodb-rag-core/eval";
import type { CodingAgentEvalScorer } from "../../eval/CodingAgentEval";

export const PrimaryDatabaseFromFilesIsMongoDb: CodingAgentEvalScorer = ({
  output,
}) => {
  const name = "PrimaryDatabaseFromFilesIsMongoDb";
  const { samples } = output;

  const perSample = samples.map((s) => ({
    pass: s.fileClassification.primaryDatabase === "mongodb",
    classified: s.fileClassification.primaryDatabase,
  }));
  const correct = perSample.filter((s) => s.pass).length;
  const metrics = computeSampleMetrics({ total: samples.length, correct });

  return [
    { name: `${name}@k`, score: metrics["pass@k"], metadata: { ...metrics, perSample } },
    { name: `${name}%k`, score: metrics["pass%k"], metadata: { ...metrics, perSample } },
    { name: `${name}^k`, score: metrics["pass^k"], metadata: { ...metrics, perSample } },
  ];
};
