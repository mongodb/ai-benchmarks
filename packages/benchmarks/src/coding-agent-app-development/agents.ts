export interface AgentConfig {
  id: string;
  /** 
     @example
     ["npm install -g @anthropic-ai/claude-code"]
   */
  buildSetupCommands: (env: Record<string, string>) => string[];
  /** 
     @example
     (prompt, model) => `echo '${prompt}' | claude --print --model ${model}`
   */
  buildMainCommand: (prompt: string, model: string) => string;

  /** 
     @example
     {
       ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
       ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY  
     }
   */
  env: Record<string, string>;
}

export const AGENTS: AgentConfig[] = [
  // TODO: EAI-1975 implement these!!
];
