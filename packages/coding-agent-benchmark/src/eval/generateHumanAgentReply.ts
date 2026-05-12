import { createOpenAI, generateText, LanguageModel } from "mongodb-rag-core/aiSdk";
import { wrapTraced } from "braintrust";

const CLAUDE_TEXT_CHAR_LIMIT = 20_000;

const DEFER_PROMPT = `
   - "Use your best judgment for this kind of app."
   - "Pick whatever you think is most appropriate."
   - "That's your call — go with what fits."
`;

const SYSTEM_PROMPT = `You are playing the role of a software developer who has asked a coding agent to build an application. The coding agent has asked you a clarifying question. Your job is to reply briefly and as neutrally as possible.

Strict rules — follow all of them:

1. **NEVER express a preference for, suggest, or even mention any specific technology**: not databases, not frameworks, not libraries, not languages, not auth schemes, not deployment targets, not specific products. No exceptions.

2. **Defer ALL implementation decisions to the agent.** If asked which database / framework / library / language / approach / pattern / architecture / port / file structure to use, redirect with phrasing like:
   - "Use your best judgment for this kind of app."
   - "Pick whatever you think is most appropriate."
   - "That's your call — go with what fits."

3. **Only answer questions about functional requirements** — what the application should DO, expected behavior, user flows, in-scope vs out-of-scope features. If the original task already covers it, say so briefly.

4. **If the question is ambiguous or could be answered multiple ways**, give the most permissive answer that lets the agent proceed (e.g. "either is fine, you decide").

5. **Keep replies short** — typically one to three sentences. Never write more than a short paragraph.

6. **Do not add new requirements** beyond what was in the original task. If the agent asks "should I add feature X?", and X wasn't in the original task, say "not needed for now, focus on what was asked."

7. **Sound like a developer**, not an assistant. No "Great question!", no lengthy explanations, no markdown formatting.

Your output is the reply text only — no preamble, no quoting, no formatting around it.`;

export type GenerateHumanAgentReplyParams = {
  /**
    The model to use for generating the human agent reply.
  */
  model: LanguageModel;

  /** The original app-development task prompt given to Claude Code. */
  taskPrompt: string;
  /** Claude Code's text response from the current turn (the .result field). */
  claudeText: string;
};

export const generateHumanAgentReply = wrapTraced(
  async function generateHumanAgentReply({
    model,
    taskPrompt,
    claudeText,
  }: GenerateHumanAgentReplyParams): Promise<string> {
    const trimmedClaudeText =
      claudeText.length > CLAUDE_TEXT_CHAR_LIMIT
        ? claudeText.slice(0, CLAUDE_TEXT_CHAR_LIMIT) + "\n\n[truncated]"
        : claudeText;

    const prompt = `${SYSTEM_PROMPT}

---

Original task you gave the agent:
<task>
${taskPrompt}
</task>

What the agent just said to you:
<agent_message>
${trimmedClaudeText}
</agent_message>

Reply now.`;

    const result = await generateText({ model, prompt });

    const text = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim();

    return text;
  }
);
