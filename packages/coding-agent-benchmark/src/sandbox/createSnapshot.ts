import { Sandbox } from "@vercel/sandbox";
import { assertEnvVars } from "mongodb-rag-core";
import { VERCEL_ENV_VARS } from "../envVars";

const INSTALL_TIMEOUT_MS = 20 * 60 * 1000;

export type SnapshotSetupFn = (sandbox: Sandbox) => Promise<void>;

export type CreateSnapshotParams = {
  setupCodingAgent: SnapshotSetupFn;
};

/**
 * Runs a shell command in the sandbox.
 *
 * @throws If the command fails.
 */
export async function run(
  cmd: string,
  sandbox: Sandbox,
  label: string
): Promise<void> {
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
 * Creates a base snapshot of a coding-agent sandbox environment.
 * Snapshots are base environments that we can use to quickly run our benchmarks.
 * 
 * The base environment includes:
 * - Node.js 24
 * - npm
 * - Filesystem: /home/dev
 *
 * @returns The snapshot ID.
 * @throws If snapshot creation fails.
 */
export async function createSnapshot(
  params: CreateSnapshotParams
): Promise<string> {
  const { setupCodingAgent } = params;
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } =
    assertEnvVars(VERCEL_ENV_VARS);

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
    // Create /home/dev before calling setupCodingAgent so setup fns can write
    // config there (e.g. with HOME=/home/dev). chown runs after setup so all
    // files written during setup are covered.
    await run("mkdir -p /home/dev", sandbox, "Creating /home/dev");

    await setupCodingAgent(sandbox);

    const whoResult = await sandbox.runCommand({ cmd: "whoami" });
    const sandboxUser = (await whoResult.stdout()).trim();
    console.log(`  Sandbox user: ${sandboxUser}`);
    await run(
      `chown -R ${sandboxUser}: /home/dev`,
      sandbox,
      "Setting /home/dev ownership"
    );

    console.log("  Creating snapshot (this stops the sandbox)...");
    const snapshot = await sandbox.snapshot({ expiration: 0 });
    return snapshot.snapshotId;
  } catch (err) {
    console.error("\nFailed. Stopping sandbox...");
    await sandbox.stop();
    throw err;
  }
}
