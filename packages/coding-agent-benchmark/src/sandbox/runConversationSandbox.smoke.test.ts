import "dotenv/config";
import { createClaudeCodeSandbox } from "./runClaudeCodeSandbox";
import {
  ANTHROPIC_FOUNDRY_ENV_VARS,
  CLAUDE_CODE_SNAPSHOT_IDS,
} from "../envVars";
import { assertEnvVars } from "mongodb-rag-core";

function getClaudeCodeSandboxEnv(): Record<string, string> {
  return {
    CLAUDE_CODE_USE_FOUNDRY: "1",
    ...assertEnvVars(ANTHROPIC_FOUNDRY_ENV_VARS),
  };
}

/**
 Spike: verify that `claude --continue` preserves conversation state across
 sequential `sandbox.runCommand` invocations on the same sandbox instance,
 and that `--output-format json` produces a `.result` field we can extract.
 
 This is the highest-risk assumption in the conversation runner design.
 */
async function main(): Promise<void> {
  const { CLAUDE_CODE_BASE_SNAPSHOT_ID: snapshotId } = assertEnvVars(
    CLAUDE_CODE_SNAPSHOT_IDS
  );

  console.log(`Creating sandbox from snapshot ${snapshotId}...`);
  const handle = await createClaudeCodeSandbox({
    snapshotId,
    claudeCodeEnv: getClaudeCodeSandboxEnv(),
    model: "claude-opus-4-7",
  });

  try {
    console.log("\nTurn 1: asking Claude to remember a fact...");
    const turn1Result = await handle.runClaude({
      input:
        "Remember this for later: my favorite color is chartreuse. Just acknowledge briefly.",
      outputFormat: "json",
    });
    if (turn1Result.type === "sandbox_stopped") {
      throw new Error("Turn 1 failed: Sandbox stopped");
    }
    const { run: turn1 } = turn1Result;
    console.log(`  exitCode:   ${turn1.exitCode}`);
    console.log(`  durationMs: ${turn1.durationMs}`);
    console.log(
      `  raw stdout (first 500 chars):\n${turn1.stdout.slice(0, 500)}`
    );

    if (turn1.exitCode !== 0) {
      throw new Error(`Turn 1 failed with exit code ${turn1.exitCode}`);
    }

    const parsed1 = parseClaudeJsonOutput(turn1.stdout);
    console.log(`\n  .result field:\n    ${parsed1.result}`);
    console.log(`  .session_id: ${parsed1.session_id ?? "<missing>"}`);

    console.log(
      "\nTurn 2: using --continue, asking what color was mentioned..."
    );
    const turn2Result = await handle.runClaude({
      input: "What color did I just mention? Reply with just the color name.",
      continueSession: true,
      outputFormat: "json",
    });
    if (turn2Result.type === "sandbox_stopped") {
      throw new Error("Turn 2 failed: Sandbox stopped");
    }
    const { run: turn2 } = turn2Result;
    console.log(`  exitCode:   ${turn2.exitCode}`);
    console.log(`  durationMs: ${turn2.durationMs}`);
    console.log(
      `  raw stdout (first 500 chars):\n${turn2.stdout.slice(0, 500)}`
    );

    if (turn2.exitCode !== 0) {
      throw new Error(`Turn 2 failed with exit code ${turn2.exitCode}`);
    }

    const parsed2 = parseClaudeJsonOutput(turn2.stdout);
    console.log(`\n  .result field:\n    ${parsed2.result}`);

    const result2Lower = parsed2.result.toLowerCase();
    if (!result2Lower.includes("chartreuse")) {
      console.error(
        `\nFAIL: turn 2 did not reference the color from turn 1.\n  Expected to find "chartreuse" in: ${parsed2.result}`
      );
      process.exit(1);
    }

    console.log("\nSPIKE PASSED: --continue preserved conversation state.");
  } finally {
    await handle.close();
  }
}

type ClaudeJsonOutput = {
  result: string;
  session_id?: string;
};

function parseClaudeJsonOutput(stdout: string): ClaudeJsonOutput {
  const trimmed = stdout.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `Failed to parse claude --output-format json output as JSON. Raw stdout:\n${stdout}`
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).result !== "string"
  ) {
    throw new Error(
      `claude JSON output missing string .result field. Got: ${JSON.stringify(
        parsed
      ).slice(0, 500)}`
    );
  }
  return parsed as ClaudeJsonOutput;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
