import { LanguageModel, generateText } from "mongodb-rag-core/aiSdk";
import {
  AppDevelopmentEvalCaseInput,
  AppDevelopmentEvalTask,
  AppDevelopmentSample,
  AppDevelopmentTaskOutput,
} from "./AppDevelopmentEval";
import { classifyAppStack } from "./classifyAppStack";
import { analyzeDatabaseChoice } from "./analyzeDatabaseChoice";
import { selfReflectOnDatabaseChoice } from "./selfReflectOnDatabaseChoice";
import { wrapTraced } from "mongodb-rag-core/braintrust";

export interface MakeGenerateAppResponseTaskParams {
  /** The model being evaluated — generates the app and does self-reflection. */
  subjectModel: LanguageModel;
  /** The judge model — runs classifyAppStack and analyzeDatabaseChoice. */
  judgeModel: LanguageModel;
  /** Optional system prompt prepended to the subject model's messages. */
  systemPrompt?: string;
  /** Number of times to run the task per eval case. Defaults to 1. */
  sampleSize?: number;
}

/**
 * Creates the main task function for the app-development eval.
 *
 * Workflow per sample:
 * 1. Generate app response (subject model)
 * 2. Classify app stack (judge model)
 * 3. Self-reflect on database choice (subject model)
 * 4. Analyze database choice (judge model)
 *
 * The task runs `sampleSize` times to account for model non-determinism.
 */
export function makeGenerateAppResponseTask({
  subjectModel,
  judgeModel,
  systemPrompt,
  sampleSize = 1,
}: MakeGenerateAppResponseTaskParams): AppDevelopmentEvalTask {
  return async function generateAppResponseTask(
    input: AppDevelopmentEvalCaseInput
  ): Promise<AppDevelopmentTaskOutput> {
    const samples: AppDevelopmentSample[] = await Promise.all(
      Array.from({ length: sampleSize }, () =>
        generateSingleSample({
          subjectModel,
          judgeModel,
          systemPrompt,
          input,
        })
      )
    );

    return { samples };
  };
}

interface GenerateSingleSampleParams {
  subjectModel: LanguageModel;
  judgeModel: LanguageModel;
  systemPrompt?: string;
  input: AppDevelopmentEvalCaseInput;
}

async function generateSingleSample({
  subjectModel,
  judgeModel,
  systemPrompt,
  input,
}: GenerateSingleSampleParams): Promise<AppDevelopmentSample> {
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push(
    ...input.messages.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
    }))
  );

  const wrappedGenerateText = wrapTraced(generateText, {
    name: "generateAppResponse",
  });

  // Step 1: Generate app response
  const { text: response } = await wrappedGenerateText({
    model: subjectModel,
    messages,
  });

  // Step 2: Classify app stack (needed by step 3)
  // Step 3: Self-reflect can run in parallel with step 2 since it doesn't depend on it
  const [appStack, selfReflection] = await Promise.all([
    classifyAppStack({ model: judgeModel, generation: response }),
    selfReflectOnDatabaseChoice({
      model: subjectModel,
      originalMessages: messages,
      generation: response,
    }),
  ]);

  // Step 4: Analyze database choice (needs classifiedDatabase from step 2)
  const databaseAnalysis = await analyzeDatabaseChoice({
    model: judgeModel,
    generation: response,
    classifiedDatabase: appStack.primaryDatabase,
  });

  return { response, appStack, databaseAnalysis, selfReflection };
}
