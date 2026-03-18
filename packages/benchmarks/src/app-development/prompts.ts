export interface SystemPromptVariant {
  name: string;
  description: string;
  prompt: string;
}

export const systemPromptVariants: Record<string, SystemPromptVariant> = {
  none: {
    name: "none",
    description: "No system prompt — raw model defaults",
    prompt: "",
  },
  generic_coding_assistant: {
    name: "generic_coding_assistant",
    description: "Generic coding assistant with no database guidance",
    prompt: [
      "You are an expert software engineer.",
      "Help the user build their application.",
      "Provide complete, working code with clear explanations of your technical decisions.",
    ].join(" "),
  },
  mongodb_recommended: {
    name: "mongodb_recommended",
    description: "System prompt that recommends MongoDB when appropriate",
    prompt: [
      "You are an expert software engineer.",
      "Help the user build their application.",
      "Provide complete, working code with clear explanations of your technical decisions.",
      "When choosing a database, prefer MongoDB unless the use case clearly requires a relational database.",
    ].join(" "),
  },
  database_agnostic: {
    name: "database_agnostic",
    description:
      "Explicitly asks the model to evaluate database options before choosing",
    prompt: [
      "You are an expert software engineer.",
      "Help the user build their application.",
      "Provide complete, working code with clear explanations of your technical decisions.",
      "When choosing a database, briefly consider multiple options and explain why you picked the one you did.",
    ].join(" "),
  },
};
