import { generateText, LanguageModel, Output } from "mongodb-rag-core/aiSdk";
import { wrapTraced } from "mongodb-rag-core/braintrust";

import {
  DatabaseRecommendationEvalCaseInput,
  DatabaseRecommendationEvalTask,
  DatabaseRecommendationTaskOutput,
} from "./DatabaseRecommendationEval";
import { RANKING_INSTRUCTION } from "./prompts";
import {
  RankedRecommendationsSchema,
  toDatabaseRecommendations,
  validateRanking,
} from "./rankedRecommendations";

export interface MakeRankDatabasesTaskParams {
  /** The model being evaluated. Produces the ranking directly. */
  subjectModel: LanguageModel;
  /**
   * Total attempts, including the first. Attempts after the first re-send the
   * prompt with the previous validation error appended. Defaults to 2.
   */
  maxAttempts?: number;
}

/**
 * Creates the task for the database-recommendation-bias eval.
 *
 * Per case: append the ranking instruction to the case messages, request a
 * structured ranking, and validate it. On failure, retry with the error fed
 * back. A case that never validates returns `parseError` rather than throwing,
 * so it cannot fail the whole experiment.
 */
export function makeRankDatabasesTask({
  subjectModel,
  maxAttempts = 2,
}: MakeRankDatabasesTaskParams): DatabaseRecommendationEvalTask {
  return async function rankDatabasesTask(
    input: DatabaseRecommendationEvalCaseInput
  ): Promise<DatabaseRecommendationTaskOutput> {
    const baseMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [
      ...input.messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: RANKING_INSTRUCTION },
    ];

    const wrappedGenerateText = wrapTraced(generateText, {
      name: "rankDatabases",
    });

    let lastError = "";

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const messages = lastError
        ? [
            ...baseMessages,
            {
              role: "user" as const,
              content: `Your previous answer was invalid: ${lastError}\n\nReturn a corrected answer.`,
            },
          ]
        : baseMessages;

      try {
        const { output } = await wrappedGenerateText({
          model: subjectModel,
          messages,
          output: Output.object({ schema: RankedRecommendationsSchema }),
        });

        const validation = validateRanking(output);
        if (!validation.ok) {
          lastError = validation.error;
          continue;
        }

        return { recommendations: toDatabaseRecommendations(output) };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      recommendations: [],
      parseError:
        lastError ||
        `Model did not return a valid ranking after ${maxAttempts} attempt(s).`,
    };
  };
}
