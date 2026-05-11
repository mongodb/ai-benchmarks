import type { Sandbox } from "@vercel/sandbox";
import type { GeneratedFile } from "./SandboxResult";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".venv",
  "venv",
  "vendor",
  "target",
  "dist",
  "build",
]);

const MAX_FILE_SIZE_BYTES = 100_000;

export async function collectGeneratedFiles(
  sandbox: Sandbox,
  rootDir: string
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];
  await collectDir(sandbox, rootDir, rootDir, files);
  return files;
}

async function collectDir(
  sandbox: Sandbox,
  rootDir: string,
  currentDir: string,
  files: GeneratedFile[]
): Promise<void> {
  let entries: Awaited<ReturnType<typeof sandbox.fs.readdir>>;
  try {
    entries = await sandbox.fs.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const name = typeof entry === "string" ? entry : entry.name;
    if (name.startsWith(".") || IGNORED_DIRS.has(name)) continue;

    const fullPath = `${currentDir}/${name}`;
    const isDir =
      typeof entry === "string" ? false : entry.isDirectory();

    if (isDir) {
      await collectDir(sandbox, rootDir, fullPath, files);
    } else {
      try {
        const stats = await sandbox.fs.stat(fullPath);
        if (stats.size > MAX_FILE_SIZE_BYTES) continue;

        const content = await sandbox.fs.readFile(fullPath, "utf8");
        if (typeof content === "string") {
          files.push({
            path: fullPath.slice(rootDir.length + 1),
            content,
          });
        }
      } catch {
        // skip unreadable files
      }
    }
  }
}

const LANGUAGE_SIGNALS: Array<{
  pattern: string | RegExp;
  language: string;
}> = [
  { pattern: "package.json", language: "TypeScript/JavaScript" },
  { pattern: /\.[tj]sx?$/, language: "TypeScript/JavaScript" },
  { pattern: "requirements.txt", language: "Python" },
  { pattern: "pyproject.toml", language: "Python" },
  { pattern: /\.py$/, language: "Python" },
  { pattern: "go.mod", language: "Go" },
  { pattern: /\.go$/, language: "Go" },
  { pattern: "Gemfile", language: "Ruby" },
  { pattern: /\.rb$/, language: "Ruby" },
  { pattern: "pom.xml", language: "Java" },
  { pattern: "build.gradle", language: "Java" },
  { pattern: /\.java$/, language: "Java" },
  { pattern: "Cargo.toml", language: "Rust" },
  { pattern: /\.rs$/, language: "Rust" },
];

export function inferPrimaryLanguage(files: GeneratedFile[]): string | null {
  const counts = new Map<string, number>();

  for (const file of files) {
    const name = file.path.split("/").pop() ?? "";
    for (const { pattern, language } of LANGUAGE_SIGNALS) {
      const matches =
        typeof pattern === "string" ? name === pattern : pattern.test(name);
      if (matches) {
        counts.set(language, (counts.get(language) ?? 0) + 1);
        break;
      }
    }
  }

  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
