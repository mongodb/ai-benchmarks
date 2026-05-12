import { z } from "zod";
import { generateText, LanguageModel, Output } from "mongodb-rag-core/aiSdk";
import { wrapTraced } from "braintrust";

const STDOUT_CHAR_LIMIT = 60_000;

export const AskedClarifyingQuestionSchema = z.object({
  askedClarifyingQuestion: z
    .boolean()
    .describe(
      "True if the agent's final output is a question or request for more information from the user, rather than a completed build / partial build attempt."
    ),
  reason: z
    .string()
    .describe("Brief explanation of the classification (1-2 sentences)."),
});

export type AskedClarifyingQuestionClassification = z.infer<
  typeof AskedClarifyingQuestionSchema
>;

const SYSTEM_PROMPT = `You classify the final outcome of a coding agent's run.

You will be shown the stdout produced by a coding agent that was given a task to build an application.

Decide whether the agent's run ended by asking the user clarifying questions / requesting more information, instead of attempting to build the application.

Set askedClarifyingQuestion = true when:
- The output ends with one or more questions directed at the user (e.g. "Which database would you like to use?", "Should this use authentication?").
- The agent explicitly declined to proceed without more input.
- The agent only restated/clarified the task without making real progress (no files created, no code written).

Set askedClarifyingQuestion = false when:
- The agent attempted the task — produced code, files, or a working/partial implementation — even if the result is incomplete or buggy.
- The agent briefly mentioned assumptions and then proceeded to build.
- The agent failed with an error but was trying to build.

Be strict: tiny acknowledgments like "I'll assume X" followed by real build work are NOT clarifying questions.`;

export const classifyAskedQuestion = wrapTraced(
  async function classifyAskedClarifyingQuestion({
    model,
    stdout,
  }: {
    model: LanguageModel;
    stdout: string;
  }): Promise<AskedClarifyingQuestionClassification> {
    const trimmed =
      stdout.length > STDOUT_CHAR_LIMIT
        ? stdout.slice(0, STDOUT_CHAR_LIMIT) + "\n\n[truncated]"
        : stdout;

    const { output } = await generateText({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Here is the agent's stdout:\n\n<stdout>\n${trimmed}\n</stdout>`,
        },
      ],
      output: Output.object({ schema: AskedClarifyingQuestionSchema }),
    });

    return output;
  }
);
