import { LanguageModel } from "mongodb-rag-core/aiSdk";
import { wrapTraced } from "braintrust";
import { AppStackClassification, classifyAppStack } from "benchmarks";
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

function renderRepresentativeFiles(files: GeneratedFile[]): string {
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

type TreeNode = { name: string; children: Map<string, TreeNode> };

function renderFileTree(files: GeneratedFile[]): string {
  const root: TreeNode = { name: "", children: new Map() };
  for (const f of files) {
    let node = root;
    for (const part of f.path.split("/")) {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
  }

  const lines: string[] = [];
  const walk = (node: TreeNode, depth: number) => {
    const entries = [...node.children.values()].sort((a, b) => {
      const aIsDir = a.children.size > 0;
      const bIsDir = b.children.size > 0;
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of entries) {
      const isDir = child.children.size > 0;
      lines.push(`${"  ".repeat(depth)}${child.name}${isDir ? "/" : ""}`);
      if (isDir) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return lines.join("\n");
}

/**
 LLM-judge classification of the technology stack from the generated file
 tree. Reads manifest files plus up to 3 large source files, renders them
 for the judge, then reuses the shared classifyAppStack schema.
 */
export const analyzeGeneratedFiles = wrapTraced(
  async function analyzeGeneratedFiles({
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
    const generation = [
      `<file-tree>\n${renderFileTree(files)}\n</file-tree>`,
      `<representative-files>\n${renderRepresentativeFiles(
        selected
      )}\n</representative-files>`,
    ].join("\n\n");
    return classifyAppStack({ model, generation });
  }
);
