import { LanguageModel } from "mongodb-rag-core/aiSdk";
import {
  AppStackClassification,
  classifyAppStack,
} from "benchmarks";
import type { GeneratedFile } from "../sandbox/SandboxResult";

const MAX_SOURCE_FILES = 3;
const PER_FILE_CHAR_LIMIT = 8_000;

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rb",
  ".java",
  ".kt",
  ".rs",
  ".php",
  ".cs",
  ".swift",
];

const MANIFEST_FILES = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Pipfile",
  "go.mod",
  "Gemfile",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
];

function isManifest(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  return MANIFEST_FILES.includes(name);
}

function isSource(path: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function selectRepresentativeFiles(files: GeneratedFile[]): GeneratedFile[] {
  const manifests = files.filter((f) => isManifest(f.path));
  const sources = files
    .filter((f) => isSource(f.path))
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, MAX_SOURCE_FILES);
  return [...manifests, ...sources];
}

function renderForJudge(files: GeneratedFile[]): string {
  return files
    .map((f) => {
      const body =
        f.content.length > PER_FILE_CHAR_LIMIT
          ? f.content.slice(0, PER_FILE_CHAR_LIMIT) + "\n// [truncated]"
          : f.content;
      return `### ${f.path}\n\`\`\`\n${body}\n\`\`\``;
    })
    .join("\n\n");
}

/**
 * LLM-judge classification of the technology stack from the generated file
 * tree. Reads manifest files plus up to 3 large source files, renders them
 * for the judge, then reuses the shared classifyAppStack schema.
 */
export async function analyzeGeneratedFiles({
  model,
  files,
}: {
  model: LanguageModel;
  files: GeneratedFile[];
}): Promise<AppStackClassification> {
  const selected = selectRepresentativeFiles(files);
  if (selected.length === 0) {
    return {
      programmingLanguage: null,
      primaryDatabase: null,
      appFramework: null,
      ormOrDatabaseClient: null,
      frontendFramework: null,
      deploymentInfrastructure: null,
      authenticationApproach: null,
    };
  }
  const generation = renderForJudge(selected);
  return classifyAppStack({ model, generation });
}
