import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let fixtureDir = "";
let previousPath = "";

export function testFixtureDir(): string {
  return fixtureDir;
}

export function setupFakeAxRunQuery(): void {
  fixtureDir = mkdtempSync(join(tmpdir(), "mongodb-provisioning-"));
  const binDir = join(fixtureDir, "bin");
  mkdirSync(binDir);
  writeFileSync(
    join(binDir, "ax-run-query"),
    `#!/usr/bin/env bash
printf '%s\\n' "$@" > "\${AX_TEST_QUERY_ARGS:-/dev/null}"
printf '%s\\n' "\${AX_TEST_EVENTS:-}"
`,
  );
  chmodSync(join(binDir, "ax-run-query"), 0o755);
  previousPath = process.env.PATH ?? "";
  process.env.PATH = `${binDir}:${previousPath}`;
}

export function teardownFakeAxRunQuery(): void {
  process.env.PATH = previousPath;
  if (fixtureDir) {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

export function withEnv(
  env: Record<string, string | undefined>,
  fn: () => number,
): number {
  const keys = Object.keys(env);
  const previous: Record<string, string | undefined> = {};
  for (const key of keys) {
    previous[key] = process.env[key];
    const value = env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export function variant(promptId: string): string {
  return `codex::openai-gpt-5.6-terra::${promptId}::codex-terra`;
}

export function uriEvents(payload: string): string {
  return `${JSON.stringify({ payload })}\n`;
}

export function connectionEvents(
  rows: Array<{
    status?: string;
    raw_input?: string;
    raw_output?: string;
    tool_call_id?: string;
    source_seq?: number;
  }>,
): string {
  return rows
    .map((row, index) => {
      const status = row.status ?? "";
      const rawInput = row.raw_input ?? "";
      const rawOutput = row.raw_output ?? "";
      return JSON.stringify({
        source_seq: row.source_seq ?? index + 1,
        tool_call_id: row.tool_call_id ?? `row-${index + 1}`,
        payload: JSON.stringify({
          kind: "tool_call",
          status,
          input: rawInput === "" ? {} : { command: rawInput },
          output:
            rawOutput === ""
              ? {}
              : {
                  aggregated_output: rawOutput,
                  exit_code: status === "failed" ? 1 : 0,
                },
        }),
      });
    })
    .join("\n");
}

export function runMain(
  main: () => number,
  events: string,
  promptId: string,
  extraEnv: Record<string, string | undefined> = {},
): number {
  return withEnv(
    {
      AX_RUN_ID: "test-run",
      AX_VARIANT_ID: variant(promptId),
      AX_RUN_CONTEXT_PATH: undefined,
      AX_TEST_EVENTS: events,
      ...extraEnv,
    },
    main,
  );
}
