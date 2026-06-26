import type { Sandbox } from "@vercel/sandbox";
import { Files } from "../CodingAgentAppDevelopmentEval";
import { minimatch } from "minimatch";
import path from "path";
import { OUTPUT_DIR } from "../prompts";

/** Directories that never contain agent-authored source worth collecting. */
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

const DEFAULT_EXCLUDE_PATHS = [
  path.join(OUTPUT_DIR, "opencode.json"),
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
];

/** Files larger than this are skipped — they're almost always binaries or lockfiles. */
const MAX_FILE_SIZE_BYTES = 100_000;

/** Default working directory the coding agent builds its app in. */

/**
 * Recursively read the application files an agent generated inside a sandbox.
 *
 * Walks `rootDir`, skipping dependency/build directories, dotfiles, and files
 * over {@link MAX_FILE_SIZE_BYTES}. Returns a map of path (relative to
 * `rootDir`) to file contents — the {@link Files} shape consumed by scorers
 * and {@link extractDbLibrariesUsed}.
 */
export async function extractFilesFromSandbox({
  sandbox,
  rootDir = OUTPUT_DIR,
  excludePaths = DEFAULT_EXCLUDE_PATHS,
}: {
  sandbox: Sandbox;
  rootDir?: string;
  excludePaths?: string[];
}): Promise<Files> {
  const files: Files = {};
  await collectDir({
    sandbox,
    rootDir,
    currentDir: rootDir,
    excludePaths,
    files,
  });
  return files;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function shouldExcludePath({
  fullPath,
  relativePath,
  excludePaths,
}: {
  fullPath: string;
  relativePath: string;
  excludePaths: string[];
}): boolean {
  const pathsToMatch = [relativePath, fullPath].map(normalizePath);
  return excludePaths.some((pattern) =>
    pathsToMatch.some((path) => minimatch(path, normalizePath(pattern)))
  );
}

async function collectDir({
  sandbox,
  rootDir,
  currentDir,
  excludePaths,
  files,
}: {
  sandbox: Sandbox;
  rootDir: string;
  currentDir: string;
  excludePaths: string[];
  files: Files;
}): Promise<void> {
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
    const relativePath = fullPath.slice(rootDir.length + 1);
    const isDir = typeof entry === "string" ? false : entry.isDirectory();

    if (shouldExcludePath({ fullPath, relativePath, excludePaths })) continue;

    if (isDir) {
      await collectDir({
        sandbox,
        rootDir,
        currentDir: fullPath,
        excludePaths,
        files,
      });
      continue;
    }

    try {
      const stats = await sandbox.fs.stat(fullPath);
      if (stats.size > MAX_FILE_SIZE_BYTES) continue;

      const content = await sandbox.fs.readFile(fullPath, "utf8");
      if (typeof content === "string") {
        files[relativePath] = content;
      }
    } catch {
      // skip unreadable files
    }
  }
}
