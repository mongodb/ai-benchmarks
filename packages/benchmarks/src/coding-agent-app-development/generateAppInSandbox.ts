import { Sandbox } from "@vercel/sandbox";
import { CodingAgentAppDevelopmentEvalCaseInput } from "./CodingAgentAppDevelopmentEval";
import { extractDbLibrariesUsed, extractFilesFromSandbox } from "./utils";
import assert from "assert";
import { AgentConfig } from "./agents";

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
}
export const generateAppInSandbox = async function ({
  agent,
  model,
  systemPrompt,
  input,
}: GenerateAppInSandboxParams) {
  assertSandboxEnv();
  const prompt = buildFullPrompt(systemPrompt, input);

  let sandbox: Sandbox | undefined;
  try {
    // create sandbox
    sandbox = await Sandbox.create({
      resources: { vcpus: 2 },
      timeout: 10 * 60 * 1000,
      env: agent.env,
    });
    assert(sandbox, "Sandbox creation failed");

    // setup agent in sandbox
    const setupCommands = agent.buildSetupCommands(agent.env);
    for (const setupCmd of setupCommands) {
      await sandbox.runCommand("sh", ["-c", setupCmd]);
    }

    // run agent!
    const fullCommand = agent.buildMainCommand(prompt, model);
    const { stdout, stderr } = await sandbox.runCommand("sh", [
      "-c",
      fullCommand,
    ]);

    const files = await extractFilesFromSandbox({ sandbox });
    const databaseLibraries = extractDbLibrariesUsed({ files });

    return {
      files,
      databaseLibraries,
      stdout: await stdout(),
      stderr: await stderr(),
    };
  } finally {
    // clean up sandbox
    await sandbox?.stop();
  }
};

function assertSandboxEnv() {
  assert(process.env.VERCEL_OIDC_TOKEN, "VERCEL_OIDC_TOKEN is not set");
}
