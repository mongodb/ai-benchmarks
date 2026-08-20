import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export type MethodId =
  | "docker"
  | "atlas-ephemeral"
  | "atlas-cli-local"
  | "atlas-cli-cloud"
  | "apt";

export type ToolCall = {
  status: string;
  input: string;
  output: string;
};

const MONGO_URI_RE = /mongodb(\+srv)?:\/\/[^\s"<>]+/gi;
const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "host.docker.internal",
]);

export function promptId(): string {
  const contextPath = process.env.AX_RUN_CONTEXT_PATH;
  if (contextPath) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(contextPath, "utf8"));
    } catch {
      throw new Error("run context is missing documented prompt_id");
    }
    const prompt =
      parsed &&
      typeof parsed === "object" &&
      "prompt_id" in parsed &&
      typeof parsed.prompt_id === "string" &&
      parsed.prompt_id.length > 0
        ? parsed.prompt_id
        : null;
    if (!prompt) {
      throw new Error("run context is missing documented prompt_id");
    }
    return prompt;
  }
  return process.env.AX_VARIANT_ID ?? "";
}

export function methodId(): MethodId {
  return methodIdFromPrompt(promptId());
}

export function methodIdFromPrompt(prompt: string): MethodId {
  const value = prompt.toLowerCase();
  if (value.includes("atlas-ephemeral")) {
    return "atlas-ephemeral";
  }
  if (value.includes("atlas-cli-local")) {
    return "atlas-cli-local";
  }
  if (value.includes("atlas-cli-cloud")) {
    return "atlas-cli-cloud";
  }
  if (value.includes("docker")) {
    return "docker";
  }
  if (value.includes("apt")) {
    return "apt";
  }
  throw new Error(`Unable to detect method from prompt: ${prompt}`);
}

export function resolveRunId(): string {
  if (process.env.AX_RUN_ID) {
    return process.env.AX_RUN_ID;
  }
  const contextPath = process.env.AX_RUN_CONTEXT_PATH;
  if (contextPath) {
    const parsed: unknown = JSON.parse(readFileSync(contextPath, "utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      "run_id" in parsed &&
      typeof parsed.run_id === "string" &&
      parsed.run_id.length > 0
    ) {
      return parsed.run_id;
    }
  }
  throw new Error(
    "AX_RUN_ID is unavailable; local AX cannot query transcript events",
  );
}

function commandExists(name: string): boolean {
  const result = spawnSync("sh", ["-c", `command -v ${JSON.stringify(name)}`], {
    encoding: "utf8",
  });
  return result.status === 0;
}

export function axRunQuery(sql: string, extraArgs: string[] = []): unknown[] {
  if (!commandExists("ax-run-query")) {
    throw new Error("ax-run-query is unavailable in the test sandbox");
  }
  const runId = resolveRunId();
  const result = spawnSync(
    "ax-run-query",
    [runId, "sql", sql, "--format", "json", ...extraArgs],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(
      detail || `ax-run-query exited with status ${result.status ?? "null"}`,
    );
  }
  const output = result.stdout ?? "";
  if (!output.trim()) {
    throw new Error(`No query results were returned for run ${runId}`);
  }
  const rows: unknown[] = [];
  for (const line of output.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    rows.push(JSON.parse(line) as unknown);
  }
  return rows;
}

export function transcriptPayloads(): string {
  const rows = axRunQuery(
    `
            SELECT payload
            FROM events
            WHERE kind = 'message'
               OR source IN ('stdout', 'transcript')
            ORDER BY if(kind = 'message', 0, 1), source_seq
          `,
    ["--limit", "10000"],
  );
  if (rows.length === 0) {
    throw new Error(
      `No transcript events were returned for run ${resolveRunId()}`,
    );
  }
  return rows
    .map((row) => payloadText(row))
    .filter((text) => text.length > 0)
    .join("\n");
}

function payloadText(row: unknown): string {
  if (!row || typeof row !== "object" || !("payload" in row)) {
    return "";
  }
  const payload = row.payload;
  if (payload == null) {
    return "";
  }
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

type RawToolEvent = {
  source_seq: number;
  tool_call_id: string;
  payload: unknown;
};

export function toolCallRows(): ToolCall[] {
  const rows = axRunQuery(`
            SELECT
              source_seq,
              tool_call_id,
              payload
            FROM events
            WHERE kind = 'tool_call'
              AND coalesce(assertion_role, 'primary') = 'primary'
              AND tool_call_id IS NOT NULL
            ORDER BY source_seq
          `);
  const events: RawToolEvent[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const record = row as {
      source_seq?: unknown;
      tool_call_id?: unknown;
      payload?: unknown;
    };
    if (typeof record.tool_call_id !== "string" || !record.tool_call_id) {
      continue;
    }
    events.push({
      source_seq:
        typeof record.source_seq === "number" ? record.source_seq : 0,
      tool_call_id: record.tool_call_id,
      payload: record.payload,
    });
  }
  if (events.length === 0) {
    throw new Error(
      `No tool-call evidence was returned for run ${resolveRunId()}`,
    );
  }

  const grouped = new Map<string, RawToolEvent[]>();
  for (const event of events) {
    const group = grouped.get(event.tool_call_id) ?? [];
    group.push(event);
    grouped.set(event.tool_call_id, group);
  }

  return [...grouped.values()]
    .map((group) => ({
      orderSeq: Math.min(...group.map((event) => event.source_seq)),
      merged: mergeToolCall(group),
    }))
    .sort((a, b) => a.orderSeq - b.orderSeq)
    .map((entry) => entry.merged);
}

function mergeToolCall(events: RawToolEvent[]): ToolCall {
  const ordered = [...events].sort((a, b) => a.source_seq - b.source_seq);
  const fields = ordered.map((event) => callFields(event.payload));
  const terminal = [...fields]
    .reverse()
    .find((field) => isTerminal(field.status));
  const input = [...fields]
    .reverse()
    .find((field) => field.input.length > 0)?.input;
  const output = [...fields]
    .reverse()
    .find((field) => field.output.length > 0)?.output;
  return {
    status: terminal?.status ?? fields.at(-1)?.status ?? "",
    input: input ?? "",
    output: output ?? "",
  };
}

function isTerminal(status: string): boolean {
  const value = status.toLowerCase();
  return (
    value === "completed" ||
    value === "success" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "error"
  );
}

function callFields(payload: unknown): ToolCall {
  const call = parsePayload(payload);
  return {
    status: stringField(call, "status"),
    input: normalizeField(call["input"]),
    output: normalizeField(call["output"]),
  };
}

function parsePayload(payload: unknown): Record<string, unknown> {
  if (typeof payload === "string") {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function normalizeField(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const command = (value as { command?: unknown }).command;
    if (typeof command === "string") {
      return command;
    }
    if (Object.keys(value).length === 0) {
      return "";
    }
    return JSON.stringify(value);
  }
  if (value == null) {
    return "";
  }
  return JSON.stringify(value);
}

export function extractMongoUris(text: string): URL[] {
  const uris: URL[] = [];
  for (const match of text.matchAll(MONGO_URI_RE)) {
    const raw = match[0]?.replace(/[.,;:)\]}`]+$/, "") ?? "";
    try {
      uris.push(new URL(raw));
    } catch {
      continue;
    }
  }
  return uris;
}

export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return LOOPBACK_HOSTS.has(host);
}

export function isAtlasCloudUri(uri: URL): boolean {
  const host = uri.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isLoopbackHost(host)) {
    return false;
  }
  return (
    host === "mongodb.net" ||
    host.endsWith(".mongodb.net") ||
    host === "mongodb-dev.net" ||
    host.endsWith(".mongodb-dev.net")
  );
}
