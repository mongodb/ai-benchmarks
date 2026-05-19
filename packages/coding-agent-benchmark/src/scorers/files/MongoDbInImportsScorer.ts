import { computeSampleMetrics } from "mongodb-rag-core/eval";
import type { CodingAgentEvalScorer } from "../../eval/CodingAgentEval";
import type { GeneratedFile } from "../../sandbox/SandboxResult";
import { nullifySampledScore } from "../nullifySampledScore";

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
];

const IMPORT_PATTERNS: RegExp[] = [
  // JS/TS
  /\brequire\(['"](mongodb|mongoose|@mongodb-js\/[\w-]+)['"]\)/,
  /\bfrom\s+['"](mongodb|mongoose|@mongodb-js\/[\w-]+)['"]/,
  /\bimport\s+['"](mongodb|mongoose|@mongodb-js\/[\w-]+)['"]/,
  // Python
  /\bimport\s+pymongo\b/,
  /\bfrom\s+pymongo\b/,
  /\bimport\s+motor\b/,
  /\bfrom\s+motor\b/,
  /\bimport\s+beanie\b/,
  /\bfrom\s+beanie\b/,
  /\bimport\s+mongoengine\b/,
  /\bfrom\s+mongoengine\b/,
  // Ruby
  /\brequire\s+['"]mongo['"]/,
  /\brequire\s+['"]mongoid['"]/,
  // Go
  /go\.mongodb\.org\/mongo-driver/,
];

function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function fileImportsMongoDb(file: GeneratedFile): string[] {
  return IMPORT_PATTERNS.filter((p) => p.test(file.content)).map(
    (p) => p.source
  );
}

/**
 Checks if any source file imports a MongoDB driver / ORM. Complements
 MongoDbInPackageJson — catches single-file scripts and non-Node ecosystems.
 */
export const MongoDbInImports: CodingAgentEvalScorer = ({ output }) => {
  const name = "MongoDbInImports";
  const { samples } = output;

  // Short-circuit if no samples (likely sandbox timeout).
  if (samples.length === 0) return nullifySampledScore(name);

  const sampleResults = samples.map((s) => {
    const sourceFiles = s.files.filter((f) => isSourceFile(f.path));
    const matchedFiles: Array<{ path: string; patterns: string[] }> = [];
    for (const f of sourceFiles) {
      const patterns = fileImportsMongoDb(f);
      if (patterns.length > 0) matchedFiles.push({ path: f.path, patterns });
    }
    return { pass: matchedFiles.length > 0, matchedFiles };
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
