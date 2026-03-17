import { createOpenAI, openai } from "@ai-sdk/openai";
import assert from "assert";
import { assertEnvVars, BRAINTRUST_ENV_VARS } from "mongodb-rag-core";
import { wrapLanguageModel } from "mongodb-rag-core/aiSdk";
import { BraintrustMiddleware } from "mongodb-rag-core/braintrust";
import { models } from "mongodb-rag-core/models";

export const judgeModelLabel = "gpt-5.4";
export const judgeModelConfig = models.find(
  (m) => m.label === judgeModelLabel
)!;
assert(judgeModelConfig, `Model ${judgeModelLabel} not found`);

export const judgeModel = wrapLanguageModel({
  model: openai.responses(judgeModelLabel),
  middleware: [BraintrustMiddleware({ debug: true })],
});
