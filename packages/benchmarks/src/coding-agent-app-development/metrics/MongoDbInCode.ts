import { CodingAgentAppDevelopmentEvalScorer } from "../CodingAgentAppDevelopmentEval";

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

function fileImportsMongoDb(content: string): string[] {
  return IMPORT_PATTERNS.filter((p) => p.test(content)).map((p) => p.source);
}

/**
 * Checks whether MongoDB is used in the generated code by detecting whether a
 * MongoDB library / driver / ODM is imported into any source file.
 *
 * Returns 1 if MongoDB is imported in the application, 0 if not, and null if there are no files.
 */
export const MongoDbInCode: CodingAgentAppDevelopmentEvalScorer = ({
  output,
}) => {
  const files = output?.files ?? {};

  const matchedFiles: Array<{ path: string; patterns: string[] }> = [];
  const fileEntries = Object.entries(files);

  if (fileEntries.length === 0) {
    return {
      name: "MongoDbInCode",
      score: null,
      metadata: { matchedFiles: [] },
    };
  }

  for (const [path, content] of fileEntries) {
    if (!isSourceFile(path)) continue;
    const patterns = fileImportsMongoDb(content);
    if (patterns.length > 0) matchedFiles.push({ path, patterns });
  }

  return {
    name: "MongoDbInCode",
    score: matchedFiles.length > 0 ? 1 : 0,
    metadata: { matchedFiles },
  };
};
