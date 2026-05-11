import { computeSampleMetrics } from "mongodb-rag-core/eval";
import type { CodingAgentEvalScorer } from "../../eval/CodingAgentEval";
import type { GeneratedFile } from "../../sandbox/SandboxResult";

const MONGODB_DEP_PATTERNS = [
  /^mongodb$/,
  /^mongoose$/,
  /^@mongodb-js\//,
  /^mongodb-memory-server$/,
  /^bson$/,
];

function packageJsonReferencesMongoDb(file: GeneratedFile): {
  matched: boolean;
  matches: string[];
} {
  try {
    const pkg = JSON.parse(file.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const all = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    const matches = Object.keys(all).filter((dep) =>
      MONGODB_DEP_PATTERNS.some((p) => p.test(dep))
    );
    return { matched: matches.length > 0, matches };
  } catch {
    return { matched: false, matches: [] };
  }
}

/**
 * Headline metric: checks whether `package.json` declares a MongoDB dep.
 * Most faithful signal of database choice — captures the actual install
 * regardless of what the conversation text said.
 */
export const MongoDbInPackageJson: CodingAgentEvalScorer = ({ output }) => {
  const name = "MongoDbInPackageJson";
  const { samples } = output;

  const perSample = samples.map((s) => {
    const pkg = s.files.find((f) => f.path === "package.json");
    if (!pkg) return { pass: false, reason: "no package.json", matches: [] };
    const { matched, matches } = packageJsonReferencesMongoDb(pkg);
    return { pass: matched, matches };
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
