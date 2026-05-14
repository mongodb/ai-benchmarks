import { z } from "zod";
import { generateText, LanguageModel, Output } from "mongodb-rag-core/aiSdk";
import { wrapTraced } from "braintrust";

export const STOP_REASON_FINISHED = "finished" as const;
const STDOUT_CHAR_LIMIT = 60_000;

export const CodingAgentStopReasonSchema = z.object({
  stopReason: z
    .enum(["finished", "thinking", "needs_clarification", "other"])
    .describe("The reason the agent stopped running."),
});

export type CodingAgentStopReasonClassification = z.infer<
  typeof CodingAgentStopReasonSchema
>;

const SYSTEM_PROMPT = `You classify the final outcome of a coding agent's run. 

You will be shown the stdout produced by a coding agent (e.g. Claude Code) that was given a task to build an application. You must determine why it stopped running.

Decide whether the agent's run is complete, i.e. they are done implementing the application, or if the task is incomplete. Set the stopReason field to one of the following values:
- "finished" if the agent's run is complete.
- "thinking" if the agent was thinking about the task but did not yet attempt to build the application.
- "needs_clarification" if the agent asked the user for more information. You can also use this stop reason if the agent's task is incomplete and the agent is stumped and needs help from the user
- "other" if the agent stopped running for a reason other than the ones listed above, or if it's unclear whether the coding agent finished its task. 

If you use the "finished stopReason, the conversation with the coding agent will be ended. Any other reason will cause the coding agent to continue running. 

<classification-rules>
For example, a complete run would be:
- The agent produced code, files, or a working/partial implementation, even if it's incomplete or buggy.
- The agent briefly mentioned assumptions and then said it proceeded to build.
- The agent failed with an error but was trying to build.

The agent's run is incomplete when:
- The agent did not yet attempt to build the application.
- The agent restated the task without making real progress (no files created, no code written).
- The agent was thinking about the task but did not build the application.
- The agent asked the user for more information, like requirements, implementation details, or constraints.
- The agent is stumped and needs help from the user.

Be strict: Acknowledgments like "I'll assume X" followed by real build work should be marked as "finished", not incomplete.
<classification-rules>
`;

export const classifyCodingAgentStopReason = wrapTraced(
  async function classifyCodingAgentStopReason({
    model,
    stdout,
  }: {
    model: LanguageModel;
    stdout: string;
  }): Promise<CodingAgentStopReasonClassification> {
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
      output: Output.object({ schema: CodingAgentStopReasonSchema }),
    });

    return output;
  }
);
