import { AppDevelopmentEvalScorer } from "../AppDevelopmentEval";
import { computeSampleMetrics } from "mongodb-rag-core/eval";

export const PrimaryDatabaseIsMongoDb: AppDevelopmentEvalScorer = ({
  output,
}) => {
  const name = "PrimaryDatabaseIsMongoDb";
  const { samples } = output;

  const correct = samples.filter(
    (s) => s.appStack.primaryDatabase === "mongodb"
  ).length;

  const metrics = computeSampleMetrics({ total: samples.length, correct });

  return [
    { name: `${name}@k`, score: metrics["pass@k"], metadata: { ...metrics } },
    { name: `${name}%k`, score: metrics["pass%k"], metadata: { ...metrics } },
    { name: `${name}^k`, score: metrics["pass^k"], metadata: { ...metrics } },
  ];
};
