import { Sandbox } from "@vercel/sandbox";
import { collectGeneratedFiles } from "./collectArtifacts";
import type { SandboxResult } from "./SandboxResult";
import { VERCEL_ENV_VARS } from "../envVars";
import { assertEnvVars } from "mongodb-rag-core";

const PROJECT_DIR = "/home/dev/app";

const SANDBOX_TIMEOUT_MS = 25 * 60 * 1000;

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

export type MakeRunClaudeCodeSandboxParams = {
  snapshotId: string;
  claudeCodeEnv: Record<string, string>;
  model: string;
};

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
 */
export function makeRunClaudeCodeSandbox(
  params: MakeRunClaudeCodeSandboxParams
): RunClaudeCodeSandbox {
  const { snapshotId, claudeCodeEnv, model } = params;
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } =
    assertEnvVars(VERCEL_ENV_VARS);

  return async ({ prompt }) => {
    const startTime = Date.now();

    const sandbox = await Sandbox.create({
      source: { type: "snapshot", snapshotId },
      timeout: SANDBOX_TIMEOUT_MS,
      token: VERCEL_TOKEN,
      teamId: VERCEL_TEAM_ID,
      projectId: VERCEL_PROJECT_ID,
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

      const command = await sandbox.runCommand({
        cmd: "claude",
        args: [
          "--dangerously-skip-permissions",
          "--model",
          model,
          "--print",
          prompt,
        ],
        cwd: PROJECT_DIR,
        detached: true,
      });

      const finished = await command.wait();

      return {
        stdout: await finished.stdout(),
        stderr: await finished.stderr(),
        exitCode: finished.exitCode,
        files: await collectGeneratedFiles(sandbox, PROJECT_DIR),
        durationMs: Date.now() - startTime,
      };
    } finally {
      activeSandboxes.delete(sandbox);
      await sandbox.stop();
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
