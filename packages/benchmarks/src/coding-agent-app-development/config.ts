import { BenchmarkConfig } from "../cli/BenchmarkConfig";
import { makeAppDevelopmentTask } from "./appDevelopmentTask";
import {
  CodingAgentAppDevelopmentEvalCaseInput,
  CodingAgentAppDevelopmentTaskOutput,
  CodingAgentAppDevelopmentTaskExpected,
  CodingAgentAppDevelopmentMetadata,
} from "./CodingAgentAppDevelopmentEval";
import { appDevelopmentDatasets } from "../app-development/datasets";
import { MongoDbInCode } from "./metrics/MongoDbInCode";
import { MongoDbInTranscript } from "./metrics/MongoDbInTranscript";
import { AGENTS, AgentVariant } from "./agents";
import { ARCHITECT_SYSTEM_PROMPT, BASE_SYSTEM_PROMPT } from "./prompts";

type CodingAgentAppDevelopmentBenchmarkConfig = BenchmarkConfig<
  CodingAgentAppDevelopmentEvalCaseInput,
  CodingAgentAppDevelopmentTaskOutput,
  CodingAgentAppDevelopmentTaskExpected,
  CodingAgentAppDevelopmentMetadata
>;

const AGENT_VARIANTS: { name: AgentVariant; description: string }[] = [
  {
    name: "build",
    description: "Agent runs with full write access and implements the app",
  },
  {
    name: "plan",
    description:
      "Agent runs in plan/read-only mode before or instead of implementing",
  },
];

function asAgentVariant(name?: string): AgentVariant | undefined {
  if (name === "build" || name === "plan") {
    return name;
  }
  return undefined;
}

const tasksConfig: CodingAgentAppDevelopmentBenchmarkConfig["tasks"] =
  Object.fromEntries(
    AGENTS.map((agent) => [
      agent.id,
      {
        description: `Runs ${agent.id} coding agent in a sandbox`,
        variants: AGENT_VARIANTS,
        taskFunc: (_modelProvider, modelConfig, variant) =>
          makeAppDevelopmentTask({
            agent,
            model: modelConfig.deployment,
            systemPrompt:
              variant?.name === "plan"
                ? ARCHITECT_SYSTEM_PROMPT
                : BASE_SYSTEM_PROMPT,
            variant: asAgentVariant(variant?.name),
          }),
      },
    ])
  );

export const codingAgentAppDevelopmentBenchmarkConfig: CodingAgentAppDevelopmentBenchmarkConfig =
  {
    projectName: "coding-agent-app-development",
    description:
      "Evaluates coding agents on generating full-stack applications, with focus on database choice and MongoDB usage",

    datasets: appDevelopmentDatasets,
    tasks: tasksConfig,
    scorers: {
      mongodb_in_code: {
        description:
          "Checks if MongoDB is used in the generated code by detecting a MongoDB library import in any source file",
        scorerFunc: MongoDbInCode,
      },
      mongodb_in_transcript: {
        description:
          "Checks if MongoDB is mentioned in the generation transcript written to stdout",
        scorerFunc: MongoDbInTranscript,
      },
    },
  };
