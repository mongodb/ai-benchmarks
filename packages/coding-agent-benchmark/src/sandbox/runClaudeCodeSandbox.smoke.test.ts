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
  sandbox: Sandbox,
  pluginName: string
): Promise<{ configFound: boolean; listOutput: string; listFound: boolean }> {
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
}

async function validateBaseClaudeCodeSnapshot(): Promise<void> {
  const { CLAUDE_CODE_BASE_SNAPSHOT_ID: snapshotId } = assertEnvVars(CLAUDE_CODE_SNAPSHOT_IDS);

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

  console.log("\nSmoke test PASSED");
}


async function validateClaudeCodeSuperpowersSnapshot(): Promise<void> {
  const { CLAUDE_CODE_SUPERPOWERS_SNAPSHOT_ID: snapshotId } = assertEnvVars(CLAUDE_CODE_SNAPSHOT_IDS);
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = assertEnvVars(VERCEL_ENV_VARS);
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    timeout: 60_000,
    token: VERCEL_TOKEN,
    teamId: VERCEL_TEAM_ID,
    projectId: VERCEL_PROJECT_ID,
  });
  try {
    await checkPlugin(sandbox, "superpowers");
  } finally {
    await sandbox.stop();
  }
  console.log("\nSmoke test PASSED");
}

async function validateClaudeCodeSuperpowersForkSnapshot(): Promise<void> {
  const { CLAUDE_CODE_SUPERPOWERS_FORK_SNAPSHOT_ID: snapshotId } = assertEnvVars(CLAUDE_CODE_SNAPSHOT_IDS);
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = assertEnvVars(VERCEL_ENV_VARS);
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    timeout: 60_000,
    token: VERCEL_TOKEN,
    teamId: VERCEL_TEAM_ID,
    projectId: VERCEL_PROJECT_ID,
  });
  try {
    await checkPlugin(sandbox, "superpowers");


    // Check if brainstorming skill was overwritten. Get file contents and check for string "Requirements-First Technology Selection"
    const grepResult = await sandbox.runCommand({ cmd: "cat", args: ["/home/dev/superpowers/skills/brainstorming/SKILL.md"] });
    const skillContents = (await grepResult.stdout()).trim();
    if (!skillContents.includes("Requirements-First Technology Selection") || 
        !skillContents.includes("Identify best-fit technology additions") 
      ) {
      console.error("\nFAIL: custom brainstorming skill edits are missing!");
      console.error(skillContents);
      process.exit(1);
    }
  } finally {
    await sandbox.stop();
  }
  console.log("\nSmoke test PASSED");
}


async function validateClaudeCodeCustomPromptMdSnapshot(): Promise<void> {
  const { CLAUDE_CODE_CLAUDE_MD_SNAPSHOT_ID: snapshotId } = assertEnvVars(CLAUDE_CODE_SNAPSHOT_IDS);
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = assertEnvVars(VERCEL_ENV_VARS);
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    timeout: 60_000,
    token: VERCEL_TOKEN,
    teamId: VERCEL_TEAM_ID,
    projectId: VERCEL_PROJECT_ID,
  });
  try {
      console.log(`Running smoke test against snapshot ${snapshotId}...`);
      const runClaudeCodeSandbox = makeRunClaudeCodeSandbox({
        snapshotId,
        claudeCodeEnv: getClaudeCodeSandboxEnv(),
        model: "claude-opus-4-7",
      });
      const result = await runClaudeCodeSandbox({
        prompt:
          "I need to confirm you understand your system prompt (CLAUDE.md). Can you summarize the instructions written there?",
      });

      console.log(`\nexitCode:   ${result.exitCode}`);
      console.log(`durationMs: ${result.durationMs}`);
      console.log(`files (${result.files.length}):`);
      for (const file of result.files) {
        console.log(`  - ${file.path} (${file.content.length} bytes)`);
      }
      console.log(`\n----- stdout -----\n${result.stdout}`);

      if (!result.stdout.includes("framework") || !result.stdout.includes("devil's advocate")) {
        console.error("Missing instructions!")
        process.exit(1)
      }

      if (result.stderr) {
        console.log(`\n----- stderr -----\n${result.stderr}`);
      }
  } finally {
    await sandbox.stop();
  }
  console.log("\nSmoke test PASSED");
}

async function main(): Promise<void> {
  // await validateBaseClaudeCodeSnapshot();
  // await validateClaudeCodeSuperpowersSnapshot();
  // await validateClaudeCodeSuperpowersForkSnapshot();
  await validateClaudeCodeCustomPromptMdSnapshot();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});