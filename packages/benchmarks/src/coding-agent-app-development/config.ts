import { BenchmarkConfig } from "../cli/BenchmarkConfig";
import { makeAppDevelopmentTask } from "./appDevelopmentTask";
import {
  CodingAgentAppDevelopmentEvalCaseInput,
  CodingAgentAppDevelopmentTaskOutput,
  CodingAgentAppDevelopmentTaskExpected,
  CodingAgentAppDevelopmentMetadata,
} from "./CodingAgentAppDevelopmentEval";
import {
  loadAppDevelopmentDataset,
  loadCustomerSuccessStoriesDataset,
} from "./loadAppDevelopmentDataset";
import { MongoDbInCode } from "./metrics/MongoDbInCode";
import { MongoDbInTranscript } from "./metrics/MongoDbInTranscript";
import { AGENTS, AgentVariant } from "./agents";
import { ARCHITECT_SYSTEM_PROMPT, BASE_SYSTEM_PROMPT } from "./prompts";
import { strict as assert } from "assert";

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

const notableCustomerSuccessStories = [
  /** Ceto AI — vector + time-series + real-time predictive analytics on fleet sensors */
  "task_0037",
  /** Amadeus — AI incident investigation over logs; classic Atlas Vector Search shape */
  "task_0009",
  /** ICIS — GenAI over real-time commodities data; vector + document store */
  "task_0086",
  /** LG U+ — call-center AI assistant; RAG / semantic retrieval over messy knowledge */
  "task_0104",
  /** Electrolux — appliance telemetry; clean time-series collections case */
  "task_0056",
  /** AXA — real-time cyber + geospatial risk insights; analytics + geo + compliance */
  "task_0016",
  /** Beni — 300M+ listing catalog with 1M+ daily updates; flexible schema at scale */
  "task_0021",
  /** Evernorth — personalized health-record single view; document embedding / patient-360 */
  "task_0064",
];

export const codingAgentAppDevelopmentBenchmarkConfig: CodingAgentAppDevelopmentBenchmarkConfig =
  {
    projectName: "coding-agent-app-development",
    description:
      "Evaluates coding agents on generating full-stack applications, with focus on database choice and MongoDB usage",

    datasets: {
      all: {
        description: "All 104 app-development eval cases",
        async getDataset() {
          return loadAppDevelopmentDataset();
        },
      },
      mongodb_optimal: {
        description: "Cases where MongoDB is the optimal database choice",
        async getDataset() {
          return loadAppDevelopmentDataset().filter((d) =>
            d.tags.includes("mongodb-optimal")
          );
        },
      },
      db_agnostic: {
        description:
          "Cases where the prompt doesn't favor MongoDB — a different DB may be a better fit",
        async getDataset() {
          return loadAppDevelopmentDataset().filter(
            (d) => !d.tags.includes("mongodb-optimal")
          );
        },
      },
      customer_success_stories_short: {
        description: "Customer success stories (short)",
        async getDataset() {
          return loadCustomerSuccessStoriesDataset("short");
        },
      },
      customer_success_stories_notable_short: {
        description: "Notable customer success stories (short)",
        async getDataset() {
          const notable = loadCustomerSuccessStoriesDataset("short").filter(
            (d) =>
              typeof d.metadata.id === "string" &&
              notableCustomerSuccessStories.includes(d.metadata.id)
          );
          assert(
            notable.length === notableCustomerSuccessStories.length,
            `Not all notable customer success stories were found. Expected ${
              notableCustomerSuccessStories.length
            } but got ${
              notable.length
            }. Expected: ${notableCustomerSuccessStories.join(
              ", "
            )}. Got: ${notable.map((d) => d.metadata.id).join(", ")}`
          );
          return notable;
        },
      },
      customer_success_stories_notable_long: {
        description: "Notable customer success stories (long)",
        async getDataset() {
          const notable = loadCustomerSuccessStoriesDataset("long").filter(
            (d) =>
              typeof d.metadata.id === "string" &&
              notableCustomerSuccessStories.includes(d.metadata.id)
          );
          assert(
            notable.length === notableCustomerSuccessStories.length,
            `Not all notable customer success stories were found. Expected ${
              notableCustomerSuccessStories.length
            } but got ${
              notable.length
            }. Expected: ${notableCustomerSuccessStories.join(
              ", "
            )}. Got: ${notable.map((d) => d.metadata.id).join(", ")}`
          );
          return notable;
        },
      },
      customer_success_stories_long: {
        description: "Customer success stories (long)",
        async getDataset() {
          return loadCustomerSuccessStoriesDataset("long");
        },
      },
    },
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
