import assert from "assert";

export interface AgentConfig {
  id: string;
  /** 
     @example
     ["npm install -g @anthropic-ai/claude-code"]
   */
  buildSetupCommands: (env: Record<string, string>) => string[];
  /** 
     @example
     (promptFilePath, model) => `claude --print --model ${model} < ${promptFilePath}`
   */
  buildMainCommand: (promptFilePath: string, model: string) => string;

  /** 
     @example
     {
       ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
       ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY  
     }
   */
  env: Record<string, string>;
}
assert(process.env.BRAINTRUST_ENDPOINT, "BRAINTRUST_ENDPOINT is not set");
assert(process.env.BRAINTRUST_API_KEY, "BRAINTRUST_API_KEY is not set");

export const AGENTS: AgentConfig[] = [
  {
    id: "anthropic/claude-code",
    buildSetupCommands: () => ["npm install -g @anthropic-ai/claude-code"],
    buildMainCommand: (promptFilePath, model) =>
      `claude --print --model ${model} --permission-mode bypassPermissions --dangerously-skip-permissions < ${promptFilePath}`,
    env: {
      ANTHROPIC_BASE_URL: process.env.BRAINTRUST_ENDPOINT,
      ANTHROPIC_API_KEY: process.env.BRAINTRUST_API_KEY,
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: "1",
    },
  },
];
