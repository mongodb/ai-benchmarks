import { Sandbox } from "@vercel/sandbox";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import type { Dirent } from "fs";
import { createSnapshot, run } from "./createSnapshot";

// __dirname is the directory of the compiled output (build/sandbox/).
// Navigate back to the source environment data directory.
const ENV_DATA_DIR = join(__dirname, "../../src/sandbox/environmentData");

const SUPERPOWERS_REPO = "https://github.com/obra/superpowers.git";
const SUPERPOWERS_PINNED_COMMIT = "f2cbfbefebbfef77321e4c9abc9e949826bea9d7";

/**
 * Installs Claude Code into the sandbox and verifies it.
 */
async function installClaudeCode(sandbox: Sandbox): Promise<void> {
  await run("npm install -g @anthropic-ai/claude-code", sandbox, "Installing Claude Code");

  const versionResult = await sandbox.runCommand("claude", ["--version"]);
  const version = (await versionResult.stdout()).trim();
  console.log(`  Claude Code version: ${version}`);
}

async function uploadDirectory(
  sandbox: Sandbox,
  localDir: string,
  remoteDir: string
): Promise<void> {
  const entries: Dirent[] = await readdir(localDir, { withFileTypes: true });
  for (const entry of entries) {
    const localPath = join(localDir, entry.name);
    const remotePath = `${remoteDir}/${entry.name}`;
    if (entry.isDirectory()) {
      await sandbox.fs.mkdir(remotePath, { recursive: true });
      await uploadDirectory(sandbox, localPath, remotePath);
    } else {
      const content = await readFile(localPath);
      await sandbox.fs.writeFile(remotePath, content);
    }
  }
}

/**
 * Creates a base snapshot of the Claude Code environment.
 */
export async function createBaseSnapshot(): Promise<string> {
  return createSnapshot({ setupCodingAgent: installClaudeCode });
}

/**
 * Creates a Claude Code snapshot with the Superpowers plugin pre-installed.
 */
export async function createSuperpowersSnapshot(): Promise<string> {
  const installClaudeCodeAndSuperpowers = async (sandbox: Sandbox): Promise<void> => {
    await installClaudeCode(sandbox);

    // /home/dev is created by createSnapshot before calling this function.
    // Use HOME=/home/dev so the plugin config lands where the runtime expects
    // it (runClaudeCodeSandbox also sets HOME=/home/dev).
    // Use the direct subcommand `claude plugin install` — NOT `claude --print
    // "/plugin install ..."`, which sends the text to the LLM as a prompt and
    // does not actually install anything.
    await run("HOME=/home/dev claude plugin marketplace add anthropics/claude-plugins-official", sandbox, "Adding official plugin marketplace");
    await run(
      "HOME=/home/dev claude plugin install superpowers@claude-plugins-official",
      sandbox,
      "Installing Superpowers plugin"
    );

    // Verify via the CLI list command and a direct config-file grep so we
    // catch both "command syntax wrong" and "file written to wrong path" cases.
    const listResult = await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", "HOME=/home/dev claude plugin list 2>&1"],
    });
    const listOutput = (await listResult.stdout()).trim();
    const grepResult = await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", "grep -rl superpowers /home/dev/.claude 2>/dev/null | head -1"],
    });
    const grepFound = (await grepResult.stdout()).trim().length > 0;

    if (!listOutput.toLowerCase().includes("superpowers") && !grepFound) {
      throw new Error(
        `Superpowers plugin did not register after install.\n` +
        `claude plugin list output: ${listOutput || "(empty)"}\n` +
        `config grep: ${grepFound ? "found" : "not found"}`
      );
    }
    console.log("  Plugin verified");
  };

  return createSnapshot({ setupCodingAgent: installClaudeCodeAndSuperpowers });
}

export async function createSuperpowersForkSnapshot(): Promise<string> {
  const setupFork = async (sandbox: Sandbox): Promise<void> => {
    await installClaudeCode(sandbox);

    await run(
      `git clone ${SUPERPOWERS_REPO} /home/dev/superpowers && git -C /home/dev/superpowers checkout ${SUPERPOWERS_PINNED_COMMIT}`,
      sandbox,
      "Cloning superpowers at pinned commit"
    );

    const overridesDir = join(ENV_DATA_DIR, "superpowers-overrides");
    process.stdout.write("  Applying overrides...");
    await uploadDirectory(sandbox, overridesDir, "/home/dev/superpowers");
    console.log(" done");
  };

  return createSnapshot({ setupCodingAgent: setupFork });
}

export async function createClaudeMdSnapshot(): Promise<string> {
  const setupClaudeMd = async (sandbox: Sandbox): Promise<void> => {
    await installClaudeCode(sandbox);

    const claudeMdContent = await readFile(
      join(ENV_DATA_DIR, "EXPERIMENT_CLAUDE.md"),
      "utf-8"
    );
    await sandbox.fs.mkdir("/home/dev/.claude", { recursive: true });
    await sandbox.fs.writeFile("/home/dev/.claude/CLAUDE.md", claudeMdContent);
    console.log("  CLAUDE.md written");
  };

  return createSnapshot({ setupCodingAgent: setupClaudeMd });
}