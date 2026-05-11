import "dotenv/config";
import { Sandbox } from "@vercel/sandbox";
import { assertEnvVars } from "mongodb-rag-core";
import { VERCEL_ENV_VARS } from "../envVars";

const INSTALL_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Runs a shell command in the sandbox.
 * 
 * @param cmd - The command to run.
 * @param sandbox - The sandbox to run the command in.
 * @param label - The label to display in logs.
 * 
 * @returns The result of the command.
 * @throws If the command fails.
 */
async function run(cmd: string, sandbox: Sandbox, label: string): Promise<void> {
  process.stdout.write(`  ${label}...`);
  const result = await sandbox.runCommand({ cmd: "sh", args: ["-c", cmd], sudo: true });
  if (result.exitCode !== 0) {
    console.error(" FAILED");
    console.error(await result.stderr());
    throw new Error(`Step failed: ${label}`);
  }
  console.log(" done");
}

/**
 * Creates a base snapshot of the Claude Code environment.
 * Snapshots are like images - they are a snapshot of the environment at a given point in time, and can be reused.
 * We use snapshots to create a base environment that we can use to run our benchmarks.
 * This is much faster than installing the environment from scratch each time.
 * 
 * The base environment includes:
 * - Node.js 24
 * - npm
 * - @anthropic-ai/claude-code
 * - Filesystem: /home/dev
 * 
 * @returns The snapshot ID.
 * @throws If the snapshot creation fails.
 */
async function main() {
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = assertEnvVars(VERCEL_ENV_VARS);

  console.log("Creating sandbox (node24)...");
  const sandbox = await Sandbox.create({
    runtime: "node24",
    timeout: INSTALL_TIMEOUT_MS,
    token: VERCEL_TOKEN,
    teamId: VERCEL_TEAM_ID,
    projectId: VERCEL_PROJECT_ID,
  });
  console.log(`Sandbox ID: ${sandbox.sandboxId}`);

  try {
    await run("npm install -g @anthropic-ai/claude-code", sandbox, "Installing Claude Code");

    const versionResult = await sandbox.runCommand("claude", ["--version"]);
    const version = (await versionResult.stdout()).trim();
    console.log(`  Claude Code version: ${version}`);

    const whoResult = await sandbox.runCommand({ cmd: "whoami" });
    const sandboxUser = (await whoResult.stdout()).trim();
    console.log(`  Sandbox user: ${sandboxUser}`);
    await run(
      `mkdir -p /home/dev && chown -R ${sandboxUser}: /home/dev`,
      sandbox,
      "Creating /home/dev"
    );

    console.log("  Creating snapshot (this stops the sandbox)...");
    const snapshot = await sandbox.snapshot({ expiration: 0 });

    console.log(`\nSnapshot ID: ${snapshot.snapshotId}`);
    console.log(`\nAdd to your .env file:`);
    console.log(`CLAUDE_CODE_BASE_SNAPSHOT_ID=${snapshot.snapshotId}`);
  } catch (err) {
    console.error("\nFailed. Stopping sandbox...");
    await sandbox.stop();
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
