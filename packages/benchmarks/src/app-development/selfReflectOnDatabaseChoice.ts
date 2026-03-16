import { z } from "zod";
import { generateText, LanguageModel, Output } from "mongodb-rag-core/aiSdk";
import { primaryDatabases, PrimaryDatabase } from "./classifyAppStack";
import {
  justificationReasons,
  justificationReasonDefinitions,
  mongoDbFitLevels,
  mongoDbFitLevelDefinitions,
} from "./analyzeDatabaseChoice";

export const SelfReflectionSchema = z.object({
  chosenDatabase: z
    .enum(primaryDatabases)
    .nullable()
    .describe(
      "The primary database you chose for the application. " +
        "Null if you did not choose a specific database."
    ),
  consideredMongoDb: z
    .boolean()
    .describe(
      "Whether you considered MongoDB as an option during your decision, " +
        "even if you ultimately chose a different database."
    ),
  reasonsForChoice: z
    .array(z.enum(justificationReasons))
    .min(1)
    .max(5)
    .describe(
      "The 1-5 most important reasons for your database choice, " +
        "ordered by importance."
    ),
  whyNotMongoDb: z
    .string()
    .nullable()
    .describe(
      "If you did NOT choose MongoDB, explain why. " +
        "What about the requirements or your reasoning led you away from MongoDB? " +
        "Null if you chose MongoDB."
    ),
  whyMongoDb: z
    .string()
    .nullable()
    .describe(
      "If you DID choose MongoDB, explain why. " +
        "What about the requirements or data model made MongoDB a good fit? " +
        "Null if you did not choose MongoDB."
    ),
  mongoDbFitAssessment: z
    .enum(mongoDbFitLevels)
    .describe(
      "Your honest assessment of how well MongoDB would fit this application's " +
        "data model and requirements, regardless of what you actually chose."
    ),
  alternativesConsidered: z
    .array(z.enum(primaryDatabases))
    .describe(
      "Other databases you considered before making your final choice. " +
        "Empty array if you did not actively consider alternatives."
    ),
  wouldChangeChoice: z
    .boolean()
    .describe(
      "Looking back at your generation, would you change your database choice " +
        "if you could regenerate the response? True if you think a different " +
        "database would be a better fit."
    ),
  reflection: z
    .string()
    .describe(
      "2-4 sentence reflection on your database decision-making process. " +
        "Be honest about whether your choice was deliberate or a default, " +
        "and whether you adequately considered alternatives."
    ),
});

export type SelfReflection = z.infer<typeof SelfReflectionSchema>;

const JUSTIFICATION_REASON_DESCRIPTIONS = justificationReasonDefinitions
  .map((r) => `- "${r.name}": ${r.description}`)
  .join("\n");

const MONGODB_FIT_LEVEL_DESCRIPTIONS = mongoDbFitLevelDefinitions
  .map((l) => `- "${l.name}": ${l.description}`)
  .join("\n");

const REFLECTION_PROMPT = `You previously generated an application in response to a user's request. Now I'd like you to reflect on your database choice.

Look at the response you generated and think critically about WHY you chose the database you did. Be honest — if it was a default/habit rather than a deliberate choice, say so.

<justification-reason-definitions>

${JUSTIFICATION_REASON_DESCRIPTIONS}

</justification-reason-definitions>

<mongodb-fit-levels>

${MONGODB_FIT_LEVEL_DESCRIPTIONS}

</mongodb-fit-levels>

<rules>

1. Be honest and self-critical. If you defaulted to a database without considering alternatives, admit it.
2. If you didn't choose MongoDB, explain specifically what led you away from it. Was it the data model, the framework, habit, or something else?
3. If you did choose MongoDB, explain what about the requirements made it a good fit.
4. For mongoDbFitAssessment, evaluate objectively — would MongoDB genuinely be a good fit for this application's data, regardless of what you chose?
5. For wouldChangeChoice, genuinely reconsider — don't just defend your original choice.

</rules>`;

interface SelfReflectOnDatabaseChoiceParams {
  /** The same model that generated the original response. */
  model: LanguageModel;
  /** The original conversation messages that led to the generation. */
  originalMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  /** The model's original generation/response. */
  generation: string;
}

/**
 * Ask the model that generated an application to reflect on its
 * database choice. This uses the same model (not a judge) and
 * includes the original conversation context.
 *
 * This captures the model's self-reported reasoning, which can
 * be compared against the external analysis from `analyzeDatabaseChoice`.
 */
export async function selfReflectOnDatabaseChoice({
  model,
  originalMessages,
  generation,
}: SelfReflectOnDatabaseChoiceParams): Promise<SelfReflection> {
  const { output } = await generateText({
    model,
    messages: [
      ...originalMessages,
      {
        role: "assistant" as const,
        content: generation,
      },
      {
        role: "user" as const,
        content: REFLECTION_PROMPT,
      },
    ],
    output: Output.object({ schema: SelfReflectionSchema }),
  });

  return output;
}
