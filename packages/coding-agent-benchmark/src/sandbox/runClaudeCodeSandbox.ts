import { Command, CommandFinished, Sandbox } from "@vercel/sandbox";
import { Agent, fetch as undiciFetch } from "undici";
import { collectGeneratedFiles } from "./collectArtifacts";
import type { GeneratedFile, SandboxResult } from "./SandboxResult";
import { VERCEL_ENV_VARS } from "../envVars";
import { assertEnvVars } from "mongodb-rag-core";
import { traced } from "braintrust";

const PROJECT_DIR = "/home/dev/app";

const SANDBOX_TIMEOUT_MS = 45 * 60 * 1000;
// Snapshot the workspace 90s before Vercel's deadline. collectGeneratedFiles
// is serial RPC (~5-20s typical, spikes higher for large repos).
const DEADLINE_SNAPSHOT_MARGIN_MS = 90 * 1000;

// @vercel/sandbox's command.wait() long-polls the API and the SDK only zeroes
// out undici's bodyTimeout, leaving headersTimeout at the 5-minute default.
// Any claude turn longer than that aborts with UND_ERR_HEADERS_TIMEOUT.
const longPollDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
const longPollFetch = ((url, opts) =>
  undiciFetch(url as Parameters<typeof undiciFetch>[0], {
    ...(opts as Parameters<typeof undiciFetch>[1]),
    dispatcher: longPollDispatcher,
  })) as typeof globalThis.fetch;

const activeSandboxes = new Set<Sandbox>();

/**
 * Stop every sandbox currently in flight. Intended for shutdown handlers
 * (e.g. SIGINT) so orphaned sandboxes don't keep consuming tokens.
 */
export async function stopAllActiveSandboxes(): Promise<void> {
  const sandboxes = [...activeSandboxes];
  activeSandboxes.clear();
  await Promise.allSettled(sandboxes.map((s) => s.stop()));
}

export type CreateClaudeCodeSandboxParams = {
  snapshotId: string;
  claudeCodeEnv: Record<string, string>;
  model: string;
  pluginDir?: string;
};

export type ClaudeCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
};

export type RunClaudeOptions = {
  /** The prompt or reply text passed to claude -p. */
  input: string;
  /** When true, adds --continue to resume the in-sandbox conversation. */
  continueSession?: boolean;
  /** When "json", adds --output-format json. Defaults to "text". */
  outputFormat?: "text" | "json";
};

/**
 * Long-lived sandbox handle that can run `claude` multiple times against
 * the same workspace. Use for multi-turn conversations where session state
 * must persist on disk between invocations.
 */
export type ClaudeCodeSandboxHandle = {
  runClaude(options: RunClaudeOptions): Promise<
    { type: "ok"; run: ClaudeCommandResult, claudeText: string } |
    { type: "sandbox_stopped" }
  >;
  collectFiles(): Promise<GeneratedFile[]>;
  close(): Promise<void>;
};

/**
 * Create a sandbox, initialize its workspace, and return a handle for running
 * `claude` against it. The caller is responsible for calling `close()` to stop
 * the sandbox; otherwise it will be reaped on shutdown via stopAllActiveSandboxes.
 */
export async function createClaudeCodeSandbox(
  params: CreateClaudeCodeSandboxParams
): Promise<ClaudeCodeSandboxHandle> {
  const { snapshotId, claudeCodeEnv, model, pluginDir } = params;
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } =
    assertEnvVars(VERCEL_ENV_VARS);

  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    timeout: SANDBOX_TIMEOUT_MS,
    token: VERCEL_TOKEN,
    teamId: VERCEL_TEAM_ID,
    projectId: VERCEL_PROJECT_ID,
    fetch: longPollFetch,
    env: {
      ...claudeCodeEnv,
      HOME: "/home/dev",
      GIT_AUTHOR_EMAIL: "c.faulkner@google.com",
      GIT_COMMITTER_EMAIL: "c.faulkner@google.com",
    },
  });
  activeSandboxes.add(sandbox);

  // Start the deadline timer immediately after Sandbox.create() resolves so
  // Vercel's timeout clock and our timer are aligned. 
  let closed = false;
  let cachedSnapshot: GeneratedFile[] | null = null;

  const deadlineTimer = setTimeout(async () => {
    if (closed) return;
    const start = Date.now();
    try {
      cachedSnapshot = await collectGeneratedFiles(sandbox, PROJECT_DIR);
      console.log(
        `[sandbox] deadline snapshot captured ${cachedSnapshot.length} files in ${Date.now() - start}ms`
      );
    } catch (err) {
      console.warn(`[sandbox] deadline snapshot failed:`, err);
    }
  }, SANDBOX_TIMEOUT_MS - DEADLINE_SNAPSHOT_MARGIN_MS);
  deadlineTimer.unref?.();

  try {
    await initializeWorkspace(sandbox);
  } catch (err) {
    closed = true;
    clearTimeout(deadlineTimer);
    activeSandboxes.delete(sandbox);
    await sandbox.stop().catch(() => {});
    throw err;
  }

  return {
    async runClaude(options: RunClaudeOptions) {
      return traced(async () => {
        const { input, continueSession, outputFormat } = options;
        const startTime = Date.now();

        // build command args
        const args = [
          "--dangerously-skip-permissions",
          "--model",
          model,
        ];
        if (pluginDir) args.push("--plugin-dir", pluginDir);
        args.push("--print");
        if (continueSession) args.push("--continue");
        if (outputFormat === "json") args.push("--output-format", "json");
        args.push(input);

        // run command
        let commandOutput: CommandFinished | null = null;
        try {
          const command = await sandbox.runCommand({
            cmd: "claude",
            args,
            cwd: PROJECT_DIR,
            detached: true,
          });
          commandOutput = await waitForCommandWithRecovery(command);
        } catch (err) {
          // handle errors. most resolvable errors are due to sandbox timeouts
          if (isSandboxStoppedError(err)) {
            return { type: "sandbox_stopped" };
          } 
          if (err instanceof Error && err.message === SANDBOX_UNAVAILABLE_ERR_MSG) {
            return { type: "sandbox_stopped" };
          }
          throw err;
        }

        const stdout = await commandOutput.stdout();
        return {
          type: "ok",
          run: {
            stdout,
            stderr: await commandOutput.stderr(),
            exitCode: commandOutput.exitCode,
            durationMs: Date.now() - startTime,
          },
          claudeText: extractResultFromJson(stdout),
        };
      },
      {
        name: "runClaudeCodeAgent",
      }
    )},
    /**
     * Collects the generated files from the sandbox.
     * @returns The collected files, or the cached snapshot if the collection failed or returned no files.
     */
    async collectFiles() {
      try {
        const maybeCollectedFiles = await collectGeneratedFiles(sandbox, PROJECT_DIR);
        if (maybeCollectedFiles && maybeCollectedFiles.length > 0) return maybeCollectedFiles;
        throw new Error("[sandbox] collectFiles returned no files");
      } catch (err) {
        console.warn("[sandbox] collectFiles failed, returning cached snapshot or empty array", err);
        return cachedSnapshot ?? [];
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      clearTimeout(deadlineTimer);
      activeSandboxes.delete(sandbox);
      await sandbox.stop();
    },
  };
}

export type MakeRunClaudeCodeSandboxParams = CreateClaudeCodeSandboxParams;

export type RunClaudeCodeSandboxInput = {
  prompt: string;
};

export type RunClaudeCodeSandbox = (
  input: RunClaudeCodeSandboxInput
) => Promise<SandboxResult>;

/**
 * Builds a per-case `runClaudeCodeSandbox` bound to the run-level configuration
 * (snapshot, model, Claude Code env). The returned function accepts just the
 * per-case input (currently just `prompt`) and returns the full sandbox result.
 *
 * For multi-turn conversation use cases, prefer `createClaudeCodeSandbox`
 * directly to keep the sandbox alive across `claude --continue` calls.
 */
export function makeRunClaudeCodeSandbox(
  params: MakeRunClaudeCodeSandboxParams
): RunClaudeCodeSandbox {
  return async ({ prompt }) => {
    const handle = await createClaudeCodeSandbox(params);
    try {
      const claudeResult = await handle.runClaude({ input: prompt });

      if (claudeResult.type === "sandbox_stopped") {
        throw new Error(SANDBOX_UNAVAILABLE_ERR_MSG);
      }

      const { run } = claudeResult;
      const files = await handle.collectFiles();
      return { ...run, files };
    } finally {
      await handle.close();
    }
  };
}

async function initializeWorkspace(sandbox: Sandbox): Promise<void> {
  const steps = [
    `mkdir -p ${PROJECT_DIR}`,
    `git init ${PROJECT_DIR}`,
    `git -C ${PROJECT_DIR} config user.name "Christopher Faulkner"`,
    `git -C ${PROJECT_DIR} config user.email "c.faulkner@google.com"`,
    `printf '# App\\n' > ${PROJECT_DIR}/README.md`,
    `git -C ${PROJECT_DIR} add README.md`,
    `git -C ${PROJECT_DIR} commit -m "init"`,
  ];

  for (const cmd of steps) {
    const result = await sandbox.runCommand({ cmd: "sh", args: ["-c", cmd] });
    if (result.exitCode !== 0) {
      const stderr = await result.stderr();
      throw new Error(`Workspace init failed at: ${cmd}\n${stderr}`);
    }
  }
}

const SANDBOX_UNAVAILABLE_ERR_MSG = "SandboxUnavailableError";

async function waitForCommandWithRecovery(command: Command): Promise<CommandFinished> {
  const maxAttempts = 3;
  const backoffsMs = [1_000, 5_000];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await command.wait();
    } catch (err) {
      if (!isRecoverableSandboxWaitError(err)) throw err;
      if (attempt === maxAttempts) throw new Error(SANDBOX_UNAVAILABLE_ERR_MSG);
      console.warn(
        `[sandbox] command.wait() failed with recoverable error; retrying (${attempt}/${maxAttempts})`,
        err
      );
      await new Promise((r) => setTimeout(r, backoffsMs[attempt - 1] ?? 5_000));
    }
  }
  // Unreachable at runtime — the last iteration always throws — but TypeScript
  // can't prove that, so this satisfies the Promise<CommandFinished> return type.
  throw new Error(SANDBOX_UNAVAILABLE_ERR_MSG);
}

function isSandboxStoppedError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as {
    response?: { status?: number };
    json?: { error?: { code?: string } };
  };
  return (
    e.response?.status === 410 && e.json?.error?.code === "sandbox_stopped"
  );
}

function isRecoverableSandboxWaitError(err: unknown): boolean {
  const code = findErrorCode(err);
  return (
    code === "UND_ERR_SOCKET" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT"
  );
}

function findErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const e = err as {
    code?: unknown;
    name?: unknown;
    cause?: unknown;
  };
  if (typeof e.code === "string") return e.code;
  if (typeof e.name === "string" && e.name.startsWith("UND_ERR_")) {
    return e.name;
  }
  return findErrorCode(e.cause);
}

/**
 * Extract the `.result` field from `claude --output-format json` stdout.
 * Falls back to the raw stdout if JSON parsing fails so the loop can keep
 * making progress on classification.
 */
export function extractResultFromJson(stdout: string): string {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return "";
  try {
    const parsed = JSON.parse(trimmed) as { result?: unknown };
    if (typeof parsed.result === "string") {
      return parsed.result;
    }
  } catch {
    // Not JSON — return raw so classifier still has something to work with.
  }
  return stdout;
}
