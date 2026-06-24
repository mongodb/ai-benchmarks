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

  /**
   * Adds agent-specific environment variables for Braintrust trace propagation.
   */
  buildBraintrustParentEnv?: (
    env: Record<string, string>,
    braintrustParent: string
  ) => Record<string, string>;
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
    buildBraintrustParentEnv: (env, braintrustParent) => {
      const braintrustHeader = `x-bt-parent: ${braintrustParent}`;
      const existingHeaders = env.ANTHROPIC_CUSTOM_HEADERS;
      return {
        ANTHROPIC_CUSTOM_HEADERS: existingHeaders
          ? `${existingHeaders}\n${braintrustHeader}`
          : braintrustHeader,
      };
    },
  },
  {
    id: "openai/codex",
    buildSetupCommands: (env) => [
      "npm install -g @openai/codex",
      `mkdir -p ~/.codex && cat > ~/.codex/config.toml <<'EOF'
model_provider = "braintrust"

[model_providers.braintrust]
name = "Braintrust"
base_url = "${env.OPENAI_BASE_URL}"
env_key = "OPENAI_API_KEY"
env_http_headers = { "x-bt-parent" = "BRAINTRUST_PARENT" }
EOF`,
    ],
    buildMainCommand: (promptFilePath, model) =>
      `codex exec --sandbox danger-full-access --skip-git-repo-check --model ${model} - < ${promptFilePath}`,
    env: {
      OPENAI_BASE_URL: process.env.BRAINTRUST_ENDPOINT,
      OPENAI_API_KEY: process.env.BRAINTRUST_API_KEY,
    },
    buildBraintrustParentEnv: (_env, braintrustParent) => ({
      BRAINTRUST_PARENT: braintrustParent,
    }),
  },
];
