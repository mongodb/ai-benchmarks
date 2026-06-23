import type { Sandbox } from "@vercel/sandbox";
import { Files } from "../CodingAgentAppDevelopmentEval";

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

/** Files larger than this are skipped — they're almost always binaries or lockfiles. */
const MAX_FILE_SIZE_BYTES = 100_000;

/** Default working directory the coding agent builds its app in. */
const DEFAULT_ROOT_DIR = "/app";

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
  rootDir = DEFAULT_ROOT_DIR,
}: {
  sandbox: Sandbox;
  rootDir?: string;
}): Promise<Files> {
  const files: Files = {};
  await collectDir({ sandbox, rootDir, currentDir: rootDir, files });
  return files;
}

async function collectDir({
  sandbox,
  rootDir,
  currentDir,
  files,
}: {
  sandbox: Sandbox;
  rootDir: string;
  currentDir: string;
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
    const isDir = typeof entry === "string" ? false : entry.isDirectory();

    if (isDir) {
      await collectDir({ sandbox, rootDir, currentDir: fullPath, files });
      continue;
    }

    try {
      const stats = await sandbox.fs.stat(fullPath);
      if (stats.size > MAX_FILE_SIZE_BYTES) continue;

      const content = await sandbox.fs.readFile(fullPath, "utf8");
      if (typeof content === "string") {
        files[fullPath.slice(rootDir.length + 1)] = content;
      }
    } catch {
      // skip unreadable files
    }
  }
}
