import "dotenv/config";
import { Sandbox } from "@vercel/sandbox";
import { createSnapshot, run } from "./createSnapshot";

/**
 * Installs Claude Code into the sandbox and verifies it.
 */
async function installClaudeCode(sandbox: Sandbox): Promise<void> {
  await run("npm install -g @anthropic-ai/claude-code", sandbox, "Installing Claude Code");

  const versionResult = await sandbox.runCommand("claude", ["--version"]);
  const version = (await versionResult.stdout()).trim();
  console.log(`  Claude Code version: ${version}`);
}

/**
 * Creates a base snapshot of the Claude Code environment.
 */
async function main() {
  const snapshotId = await createSnapshot({ setupCodingAgent: installClaudeCode });

  console.log(`\nSnapshot ID: ${snapshotId}`);
  console.log(`\nAdd to your .env file:`);
  console.log(`CLAUDE_CODE_BASE_SNAPSHOT_ID=${snapshotId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
