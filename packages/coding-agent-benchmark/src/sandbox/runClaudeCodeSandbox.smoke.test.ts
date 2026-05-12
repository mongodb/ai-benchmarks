import "dotenv/config";
import { Sandbox } from "@vercel/sandbox";
import { makeRunClaudeCodeSandbox } from "./runClaudeCodeSandbox";
import { ANTHROPIC_FOUNDRY_ENV_VARS, CLAUDE_CODE_SNAPSHOT_IDS, VERCEL_ENV_VARS } from "../envVars";
import { assertEnvVars } from "mongodb-rag-core";

const IDENTITY_LEAK_PATTERNS = ["helen.schawe", "@mongodb.com"];

/**
 * Environment variables for the Claude Code sandbox.
 */
export function getClaudeCodeSandboxEnv(): Record<string, string> {
  return {
    CLAUDE_CODE_USE_FOUNDRY: "1",
    ...assertEnvVars(ANTHROPIC_FOUNDRY_ENV_VARS),
  };
}

/**
 * Checks whether a Claude Code plugin is installed in the snapshot using two
 * independent signals: a config-file grep (no LLM needed) and `claude plugin list`.
 *
 * Returns an object so the caller can log individual results.
 */
async function checkPlugin(
  snapshotId: string,
  pluginName: string
): Promise<{ configFound: boolean; listOutput: string; listFound: boolean }> {
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = assertEnvVars(VERCEL_ENV_VARS);
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    timeout: 60_000,
    token: VERCEL_TOKEN,
    teamId: VERCEL_TEAM_ID,
    projectId: VERCEL_PROJECT_ID,
  });
  try {
    // Check 1: grep the config — the plugin may live under /root or /home/dev
    // depending on what HOME was set during snapshot creation.
    const grepResult = await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `grep -rl '${pluginName}' /root/.claude /home 2>/dev/null | head -1`],
    });
    const configFound = (await grepResult.stdout()).trim().length > 0;

    // Check 2: ask Claude Code directly. HOME must match the runtime value so
    // Claude Code looks in the right config directory.
    const listResult = await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", "HOME=/home/dev claude plugin list 2>&1"],
    });
    const listOutput = (await listResult.stdout()).trim();
    const listFound = listOutput.toLowerCase().includes(pluginName.toLowerCase());

    return { configFound, listOutput, listFound };
  } finally {
    await sandbox.stop();
  }
}

async function main(): Promise<void> {
  const { CLAUDE_CODE_SUPERPOWERS_SNAPSHOT_ID: snapshotId } = assertEnvVars(CLAUDE_CODE_SNAPSHOT_IDS);

  console.log(`Running smoke test against snapshot ${snapshotId}...`);
  const runClaudeCodeSandbox = makeRunClaudeCodeSandbox({
    snapshotId,
    claudeCodeEnv: getClaudeCodeSandboxEnv(),
    model: "claude-opus-4-7",
  });
  const result = await runClaudeCodeSandbox({
    prompt:
      "Create a file called hello.txt in the current directory containing exactly the text 'hello world'. Do not create any other files.",
  });

  console.log(`\nexitCode:   ${result.exitCode}`);
  console.log(`durationMs: ${result.durationMs}`);
  console.log(`files (${result.files.length}):`);
  for (const file of result.files) {
    console.log(`  - ${file.path} (${file.content.length} bytes)`);
  }
  console.log(`\n----- stdout -----\n${result.stdout}`);
  if (result.stderr) {
    console.log(`\n----- stderr -----\n${result.stderr}`);
  }

  const haystack = `${result.stdout}\n${result.stderr}`.toLowerCase();
  const leaks = IDENTITY_LEAK_PATTERNS.filter((s) => haystack.includes(s));
  if (leaks.length > 0) {
    console.error(
      `\nFAIL: identity leak detected in output: ${leaks.join(", ")}`
    );
    process.exit(2);
  }

  if (result.exitCode !== 0) {
    console.error(`\nFAIL: claude exited with non-zero code ${result.exitCode}`);
    process.exit(1);
  }

  const hello = result.files.find((f) => f.path === "hello.txt");
  if (!hello) {
    console.error("\nFAIL: hello.txt was not produced");
    process.exit(1);
  }
  if (!hello.content.toLowerCase().includes("hello world")) {
    console.error(
      `\nFAIL: hello.txt did not contain 'hello world'. Got: ${JSON.stringify(hello.content)}`
    );
    process.exit(1);
  }

  // Validate superpowers plugin is installed in the superpowers snapshot.
  console.log(`\nChecking superpowers plugin in snapshot ${snapshotId}...`);
  const { configFound, listOutput, listFound } = await checkPlugin(snapshotId, "superpowers");
  console.log(`  config grep: ${configFound ? "found" : "NOT FOUND"}`);
  console.log(`  claude plugin list:\n${listOutput.replace(/^/gm, "    ")}`);
  if (!configFound) {
    console.error("\nFAIL: superpowers not found in Claude Code config files");
    process.exit(1);
  }
  if (!listFound) {
    console.error("\nFAIL: superpowers not listed by `claude plugin list`");
    process.exit(1);
  }
  console.log("  superpowers plugin confirmed");

  console.log("\nSmoke test PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
