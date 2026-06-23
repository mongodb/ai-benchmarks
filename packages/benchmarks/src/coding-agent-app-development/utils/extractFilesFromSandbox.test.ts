import type { Sandbox } from "@vercel/sandbox";
import { extractFilesFromSandbox } from "./extractFilesFromSandbox";

/**
 * Builds an in-memory fake of the bits of the `@vercel/sandbox` filesystem
 * that `extractFilesFromSandbox` touches (`readdir`, `stat`, `readFile`),
 * driven by a flat map of absolute file path -> content.
 */
function makeFakeSandbox(
  fileTree: Record<string, string | { content: string; size: number }>
): Sandbox {
  const fileMap = new Map<string, { content: string; size: number }>();
  for (const [path, value] of Object.entries(fileTree)) {
    const content = typeof value === "string" ? value : value.content;
    const size =
      typeof value === "string" ? Buffer.byteLength(content) : value.size;
    fileMap.set(path, { content, size });
  }

  const fs = {
    async readdir(dir: string) {
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const isDirByName = new Map<string, boolean>();
      for (const path of fileMap.keys()) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        const [firstSegment] = rest.split("/");
        const isDir = rest.includes("/");
        if (!isDirByName.has(firstSegment) || isDir) {
          isDirByName.set(firstSegment, isDir);
        }
      }
      if (isDirByName.size === 0) {
        throw new Error(`ENOENT: no such directory ${dir}`);
      }
      return [...isDirByName.entries()].map(([name, isDir]) => ({
        name,
        isDirectory: () => isDir,
      }));
    },
    async stat(path: string) {
      const file = fileMap.get(path);
      if (!file) throw new Error(`ENOENT: ${path}`);
      return { size: file.size, isDirectory: () => false };
    },
    async readFile(path: string) {
      const file = fileMap.get(path);
      if (!file) throw new Error(`ENOENT: ${path}`);
      return file.content;
    },
  };

  return { fs } as unknown as Sandbox;
}

describe("extractFilesFromSandbox", () => {
  test("collects files recursively, keyed by path relative to rootDir", async () => {
    const sandbox = makeFakeSandbox({
      "/app/package.json": '{"name":"demo"}',
      "/app/src/index.ts": "console.log('hi')",
      "/app/src/db/client.ts": "export const client = {}",
    });

    const files = await extractFilesFromSandbox({ sandbox, rootDir: "/app" });

    expect(files).toEqual({
      "package.json": '{"name":"demo"}',
      "src/index.ts": "console.log('hi')",
      "src/db/client.ts": "export const client = {}",
    });
  });

  test("ignores dependency / build directories like node_modules and .git", async () => {
    const sandbox = makeFakeSandbox({
      "/app/index.js": "const x = 1",
      "/app/node_modules/left-pad/index.js": "module.exports = () => {}",
      "/app/.git/config": "[core]",
      "/app/dist/index.js": "compiled",
    });

    const files = await extractFilesFromSandbox({ sandbox, rootDir: "/app" });

    expect(Object.keys(files)).toEqual(["index.js"]);
  });

  test("skips dotfiles", async () => {
    const sandbox = makeFakeSandbox({
      "/app/index.js": "const x = 1",
      "/app/.env": "SECRET=shh",
    });

    const files = await extractFilesFromSandbox({ sandbox, rootDir: "/app" });

    expect(Object.keys(files)).toContain("index.js");
    expect(Object.keys(files)).not.toContain(".env");
  });

  test("skips files larger than the max file size", async () => {
    const sandbox = makeFakeSandbox({
      "/app/small.txt": "ok",
      "/app/huge.bin": { content: "x", size: 200_000 },
    });

    const files = await extractFilesFromSandbox({ sandbox, rootDir: "/app" });

    expect(Object.keys(files)).toContain("small.txt");
    expect(Object.keys(files)).not.toContain("huge.bin");
  });

  test("returns an empty object when the root directory cannot be read", async () => {
    const sandbox = makeFakeSandbox({
      "/somewhere-else/file.txt": "data",
    });

    const files = await extractFilesFromSandbox({ sandbox, rootDir: "/app" });

    expect(files).toEqual({});
  });

  test("defaults to scanning /app when no rootDir is given", async () => {
    const sandbox = makeFakeSandbox({
      "/app/server.js": "listen()",
    });

    const files = await extractFilesFromSandbox({ sandbox });

    expect(files).toEqual({ "server.js": "listen()" });
  });
});
