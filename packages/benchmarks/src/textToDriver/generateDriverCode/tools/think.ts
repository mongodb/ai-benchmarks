import { Tool, tool } from "mongodb-rag-core/aiSdk";
import { wrapTraced } from "mongodb-rag-core/braintrust";
import { z } from "zod";
import { listExamplesInPrompt } from "../languagePrompts/listExamplesInPrompt";

const ThinkSchema = z.object({
  thought: z.string().describe("A thought to think about."),
});

export type Think = z.infer<typeof ThinkSchema>;

export const thinkToolName = "think";

/**
  Taken from [Claude 'think' tool blog post](https://www.anthropic.com/engineering/claude-think-tool).
 */
export const thinkTool: Tool = tool({
  name: thinkToolName,
  description: `Use the tool to think about something.
  
${listExamplesInPrompt([
  "Use it when complex reasoning or some cache memory is needed.",
  "It will not obtain new information or change the database, but just append the thought to the log.",
  "Use the tool to think about the problem as you are calling tools to generate a final response.",
])}`,
  inputSchema: ThinkSchema,
  // Note: That need to provide an execute() method
  // for the AI SDK to keep generating
  // after the tool has been called.
  execute: wrapTraced(
    async () => {
      return "Keep going!";
    },
    {
      name: "think",
    }
  ),
});
