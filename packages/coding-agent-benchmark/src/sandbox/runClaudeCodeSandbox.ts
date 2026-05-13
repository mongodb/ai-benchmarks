import { Sandbox } from "@vercel/sandbox";
import { Agent, fetch as undiciFetch } from "undici";
import { collectGeneratedFiles } from "./collectArtifacts";
import type { GeneratedFile, SandboxResult } from "./SandboxResult";
import { VERCEL_ENV_VARS } from "../envVars";
import { assertEnvVars } from "mongodb-rag-core";

const PROJECT_DIR = "/home/dev/app";

const SANDBOX_TIMEOUT_MS = 45 * 60 * 1000;
// Vercel kills the sandbox at SANDBOX_TIMEOUT_MS. Snapshot the workspace
// 90s before that so partial scoring still has files to look at when the
// agent runs long. collectGeneratedFiles is serial RPC, ~5-20s typical,
// can spike higher for large repos — 90s is a conservative cushion.
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
  runClaude(options: RunClaudeOptions): Promise<ClaudeCommandResult>;
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

  try {
    await initializeWorkspace(sandbox);
  } catch (err) {
    activeSandboxes.delete(sandbox);
    await sandbox.stop().catch(() => {});
    throw err;
  }

  let closed = false;
  let cachedSnapshot: GeneratedFile[] | null = null;

  const deadlineTimer = setTimeout(async () => {
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

  return {
    async runClaude({ input, continueSession, outputFormat }) {
      const startTime = Date.now();
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

      const command = await sandbox.runCommand({
        cmd: "claude",
        args,
        cwd: PROJECT_DIR,
        detached: true,
      });
      const finished = await command.wait();

      return {
        stdout: await finished.stdout(),
        stderr: await finished.stderr(),
        exitCode: finished.exitCode,
        durationMs: Date.now() - startTime,
      };
    },
    async collectFiles() {
      try {
        return await collectGeneratedFiles(sandbox, PROJECT_DIR);
      } catch {
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
      const run = await handle.runClaude({ input: prompt });
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
