import assert from "assert";
import { OUTPUT_DIR } from "./prompts";

export interface AgentConfig {
  id: string;
  /** 
     @example
     ["npm install -g @anthropic-ai/claude-code"]
   */
  buildSetupCommands: (env: Record<string, string>, model: string) => string[];
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

export const GROK_CONFIG_OUTPUT_PATH = "/tmp/grok-config.toml";
export const GROK_MODELS_OUTPUT_PATH = "/tmp/grok-models.txt";

assert(process.env.BRAINTRUST_ENDPOINT, "BRAINTRUST_ENDPOINT is not set");
assert(
  process.env.BRAINTRUST_GATEWAY_API_KEY,
  "BRAINTRUST_GATEWAY_API_KEY is not set"
);

function tomlString(value: string) {
  return JSON.stringify(value);
}

export const AGENTS: AgentConfig[] = [
  {
    id: "anthropic/claude-code",
    buildSetupCommands: () => ["npm install -g @anthropic-ai/claude-code"],
    buildMainCommand: (promptFilePath, model) =>
      `claude --print --model ${model} --permission-mode bypassPermissions --dangerously-skip-permissions < ${promptFilePath}`,
    env: {
      ANTHROPIC_BASE_URL: process.env.BRAINTRUST_ENDPOINT,
      ANTHROPIC_API_KEY: process.env.BRAINTRUST_GATEWAY_API_KEY,
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
      OPENAI_API_KEY: process.env.BRAINTRUST_GATEWAY_API_KEY,
    },
    buildBraintrustParentEnv: (_env, braintrustParent) => ({
      BRAINTRUST_PARENT: braintrustParent,
    }),
  },
  {
    id: "opencode/opencode",
    buildSetupCommands: (env, model) => {
      const config = {
        $schema: "https://opencode.ai/config.json",
        provider: {
          braintrust: {
            npm: "@ai-sdk/openai-compatible",
            name: "Braintrust",
            options: {
              baseURL: env.OPENAI_BASE_URL,
              apiKey: "{env:OPENAI_API_KEY}",
              headers: {
                "x-bt-parent": "{env:BRAINTRUST_PARENT}",
              },
            },
            models: {
              [model]: {
                name: model,
              },
            },
          },
        },
      };
      return [
        "npm install -g opencode-ai",
        `cat > ${OUTPUT_DIR}/opencode.json <<'EOF'\n${JSON.stringify(
          config,
          null,
          2
        )}\nEOF`,
      ];
    },
    buildMainCommand: (promptFilePath, model) =>
      `opencode run --dir ${OUTPUT_DIR} --model braintrust/${model} --dangerously-skip-permissions "Build the app described in the attached prompt file." --file ${promptFilePath}`,
    env: {
      OPENAI_BASE_URL: process.env.BRAINTRUST_ENDPOINT,
      OPENAI_API_KEY: process.env.BRAINTRUST_GATEWAY_API_KEY,
    },
    buildBraintrustParentEnv: (_env, braintrustParent) => ({
      BRAINTRUST_PARENT: braintrustParent,
    }),
  },
  {
    id: "xai/grok-build",
    env: {
      BRAINTRUST_ENDPOINT: process.env.BRAINTRUST_ENDPOINT,
      BRAINTRUST_GATEWAY_API_KEY: process.env.BRAINTRUST_GATEWAY_API_KEY,
    },
    // Add BT parent span to the environment variables
    buildBraintrustParentEnv: (_env, braintrustParent) => ({
      BRAINTRUST_PARENT: braintrustParent,
    }),
    buildSetupCommands: (env, model) => {
      const extraHeaders = env.BRAINTRUST_PARENT
        ? `extra_headers = { "x-bt-parent" = "${env.BRAINTRUST_PARENT}" }`
        : "";
      const config = [
        `[model."${model}"]`,
        `model = ${tomlString(model)}`,
        `base_url = ${tomlString(env.BRAINTRUST_ENDPOINT)}`,
        `name = "Grok Build via Braintrust (${model})"`,
        `api_backend = "responses"`,
        `env_key = "BRAINTRUST_GATEWAY_API_KEY"`,
        extraHeaders,
      ]
        .join("\n")
        .trim();
      return [
        "curl -fsSL https://x.ai/cli/install.sh | bash",
        `mkdir -p ~/.grok && cat > ~/.grok/config.toml <<'EOF'\n${config}\nEOF`,
        // These are just for debugging purposes...when things are working, we can remove.
        `cat ~/.grok/config.toml > ${GROK_CONFIG_OUTPUT_PATH} 2>&1 || true`,
        `grok models > ${GROK_MODELS_OUTPUT_PATH} 2>&1 || true`,
      ];
    },
    buildMainCommand: (promptFilePath, model) =>
      `grok --model ${model} --permission-mode bypassPermissions --prompt-file ${promptFilePath}`,
  },
];
