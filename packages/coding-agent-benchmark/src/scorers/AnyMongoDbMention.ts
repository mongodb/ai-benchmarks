import { computeSampleMetrics } from "mongodb-rag-core/eval";
import type { CodingAgentEvalScorer } from "../eval/CodingAgentEval";
import { mentionsMongoDbInStdout } from "./stdout/MentionsMongoDbInStdout";
import { mongoDbInPackageJson } from "./files/MongoDbInPackageJson";
import { mongoDbInImports } from "./files/MongoDbInImports";

/**
 * Passes if any individual MongoDB signal fires for a sample:
 * - stdout mentions MongoDB (string match)
 * - stdout classification identifies MongoDB as primary database
 * - package.json declares a MongoDB dependency
 * - a source file imports a MongoDB driver/ORM
 * - file classification identifies MongoDB as primary database
 */
export const AnyMongoDbMention: CodingAgentEvalScorer = ({ output }) => {
  const name = "AnyMongoDbMention";
  const { samples } = output;

  const perSample = samples.map((s) => {
    const checks = {
      mentionsInStdout: mentionsMongoDbInStdout(s.stdout),
      stdoutClassification: s.stdoutClassification.primaryDatabase === "mongodb",
      inPackageJson: mongoDbInPackageJson(s.files),
      inImports: mongoDbInImports(s.files),
      fileClassification: s.fileClassification.primaryDatabase === "mongodb",
    };
    return { pass: Object.values(checks).some(Boolean), checks };
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
