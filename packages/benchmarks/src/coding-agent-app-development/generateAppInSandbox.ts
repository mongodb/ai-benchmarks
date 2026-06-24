import { Sandbox } from "@vercel/sandbox";
import { CodingAgentAppDevelopmentEvalCaseInput } from "./CodingAgentAppDevelopmentEval";
import { extractDbLibrariesUsed, extractFilesFromSandbox } from "./utils";
import assert from "assert";
import { AgentConfig } from "./agents";
import { OUTPUT_DIR } from "./prompts";

function buildFullPrompt(
  systemPrompt: string,
  input: CodingAgentAppDevelopmentEvalCaseInput
) {
  return `<system>\n${systemPrompt}\n</system>\n${input.messages
    .map(
      (message) => `<${message.role}>\n${message.content}\n</${message.role}>`
    )
    .join("\n")}`;
}

export interface GenerateAppInSandboxParams {
  agent: AgentConfig;
  model: string;
  systemPrompt: string;
  input: CodingAgentAppDevelopmentEvalCaseInput;
  braintrustParent?: string;
}

function makeSandboxEnv({
  agentEnv,
  braintrustParent,
}: {
  agentEnv: Record<string, string>;
  braintrustParent?: string;
}) {
  if (!braintrustParent) {
    return agentEnv;
  }
  const braintrustHeader = `x-bt-parent: ${braintrustParent}`;
  const existingHeaders = agentEnv.ANTHROPIC_CUSTOM_HEADERS;
  return {
    ...agentEnv,
    ANTHROPIC_CUSTOM_HEADERS: existingHeaders
      ? `${existingHeaders}\n${braintrustHeader}`
      : braintrustHeader,
  };
}

export const generateAppInSandbox = async function ({
  agent,
  model,
  systemPrompt,
  input,
  braintrustParent,
}: GenerateAppInSandboxParams) {
  assertSandboxEnv();
  const prompt = buildFullPrompt(systemPrompt, input);
  const sandboxEnv = makeSandboxEnv({
    agentEnv: agent.env,
    braintrustParent,
  });
  let sandbox: Sandbox | undefined;
  try {
    // create sandbox
    sandbox = await Sandbox.create({
      resources: { vcpus: 2 },
      timeout: 10 * 60 * 1000,
      env: sandboxEnv,
    });
    assert(sandbox, "Sandbox creation failed");

    await sandbox.runCommand({
      cmd: "sh",
      args: [
        "-c",
        `mkdir -p ${OUTPUT_DIR} && chown -R vercel-sandbox:vercel-sandbox ${OUTPUT_DIR}`,
      ],
      sudo: true,
    });

    // setup agent in sandbox
    const setupCommands = agent.buildSetupCommands(agent.env);
    for (const setupCmd of setupCommands) {
      await sandbox.runCommand("sh", ["-c", setupCmd]);
    }

    // run agent!
    const fullCommand = agent.buildMainCommand(prompt, model);
    const command = await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", fullCommand],
      cwd: OUTPUT_DIR,
    });

    const stdout = await command.stdout().catch((error) => {
      console.error("failed to read stdout", error);
      return "";
    });
    const stderr = await command.stderr().catch((error) => {
      console.error("failed to read stderr", error);
      return "";
    });

    if (command.exitCode !== 0) {
      throw new Error(
        `Agent command exited with code ${command.exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
      );
    }

    const files = await extractFilesFromSandbox({ sandbox });
    const databaseLibraries = extractDbLibrariesUsed({ files });

    return {
      files,
      databaseLibraries,
      stdout,
      stderr,
    };
  } finally {
    // clean up sandbox
    await sandbox?.stop();
  }
};

function assertSandboxEnv() {
  assert(process.env.VERCEL_OIDC_TOKEN, "VERCEL_OIDC_TOKEN is not set");
}
