import { Sandbox } from "@vercel/sandbox";
import { CodingAgentAppDevelopmentEvalCaseInput } from "./CodingAgentAppDevelopmentEval";
import { extractDbLibrariesUsed, extractFilesFromSandbox } from "./utils";
import assert from "assert";
import {
  type AgentConfig,
  GROK_CONFIG_OUTPUT_PATH,
  GROK_MODELS_OUTPUT_PATH,
} from "./agents";
import { OUTPUT_DIR } from "./prompts";

const PROMPT_FILE_PATH = "/tmp/claude-prompt.txt";

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
  agent,
  braintrustParent,
}: {
  agent: AgentConfig;
  braintrustParent?: string;
}) {
  if (!braintrustParent) {
    return agent.env;
  }
  return {
    ...agent.env,
    ...agent.buildBraintrustParentEnv?.(agent.env, braintrustParent),
  };
}

async function logSandboxFile(sandbox: Sandbox, path: string, label: string) {
  const fileContents = await sandbox.fs.readFile(path).catch((error) => {
    console.error(`failed to read ${label} output`, error);
    return undefined;
  });
  if (fileContents !== undefined) {
    const fileContentsText =
      typeof fileContents === "string"
        ? fileContents
        : Buffer.from(fileContents).toString("utf8");
    console.log(label, fileContentsText);
  }
}

async function logGrokDebugOutput(agent: AgentConfig, sandbox: Sandbox) {
  if (agent.id !== "xai/grok-build") {
    return;
  }
  await logSandboxFile(sandbox, GROK_CONFIG_OUTPUT_PATH, "grok config");
  await logSandboxFile(sandbox, GROK_MODELS_OUTPUT_PATH, "grok models");
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
    agent,
    braintrustParent,
  });
  let sandbox: Sandbox | undefined;
  try {
    const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
    // create sandbox
    sandbox = await Sandbox.create({
      resources: { vcpus: 2 },
      timeout: THREE_HOURS_MS,
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
    const setupCommands = agent.buildSetupCommands(sandboxEnv, model);
    for (const setupCmd of setupCommands) {
      await sandbox.runCommand("sh", ["-c", setupCmd]);
    }
    await logGrokDebugOutput(agent, sandbox);

    await sandbox.writeFiles([
      {
        path: PROMPT_FILE_PATH,
        content: prompt,
      },
    ]);

    // run agent!
    const fullCommand = agent.buildMainCommand(PROMPT_FILE_PATH, model);
    const command = await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", fullCommand],
      cwd: OUTPUT_DIR,
      detached: true,
    });

    await command.wait();
    const stdout = await command.stdout().catch((error) => {
      console.error("failed to read stdout", error);
      return "";
    });
    const stderr = await command.stderr().catch((error) => {
      console.error("failed to read stderr", error);
      return "";
    });
    console.log("stderr:", stderr);

    if (command.exitCode !== null && command.exitCode !== 0) {
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
