import "dotenv/config";
import { runClaudeCode } from "./runClaudeCode";
import { ANTHROPIC_FOUNDRY_ENV_VARS, CLAUDE_CODE_SNAPSHOT_IDS } from "../envVars";
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

async function main(): Promise<void> {
  const { CLAUDE_CODE_BASE_SNAPSHOT_ID: snapshotId } = assertEnvVars(CLAUDE_CODE_SNAPSHOT_IDS);

  console.log(`Running smoke test against snapshot ${snapshotId}...`);
  const result = await runClaudeCode({
    prompt:
      "Create a file called hello.txt in the current directory containing exactly the text 'hello world'. Do not create any other files.",
    snapshotId,
    claudeCodeEnv: getClaudeCodeSandboxEnv(),
    model: "claude-opus-4-7",
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
