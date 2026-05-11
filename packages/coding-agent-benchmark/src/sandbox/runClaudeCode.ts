import { Sandbox } from "@vercel/sandbox";
import { collectGeneratedFiles } from "./collectArtifacts";
import type { ClaudeCodeRunResult } from "./types";
import { VERCEL_ENV_VARS } from "../envVars";
import { assertEnvVars } from "mongodb-rag-core";

const PROJECT_DIR = "/home/dev/app";

const SANDBOX_TIMEOUT_MS = 15 * 60 * 1000;

export type RunClaudeCodeParams = {
  prompt: string;
  snapshotId: string;
  claudeCodeEnv: Record<string, string>;
  model: string;
};

/**
 * Runs Claude Code in a sandbox.
 */
export async function runClaudeCode(
  params: RunClaudeCodeParams
): Promise<ClaudeCodeRunResult> {
  const { prompt, snapshotId, claudeCodeEnv, model } = params;
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = assertEnvVars(VERCEL_ENV_VARS);

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

  try {
    await initializeWorkspace(sandbox);

    const result = await sandbox.runCommand({
      cmd: "claude",
      args: ["--dangerously-skip-permissions", "--model", model, "--print", prompt],
      cwd: PROJECT_DIR,
    });

    return {
      stdout: await result.stdout(),
      stderr: await result.stderr(),
      exitCode: result.exitCode,
      files: await collectGeneratedFiles(sandbox, PROJECT_DIR),
      durationMs: Date.now() - startTime,
    };
  } finally {
    await sandbox.stop();
  }
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
