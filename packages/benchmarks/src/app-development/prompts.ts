export interface SystemPromptVariant {
  name: string;
  description: string;
  prompt: string;
}

const codingAssistantBasePrompt = [
  "You are an expert software engineer.",
  "Help the user build their application.",
  "Provide a complete, production-ready application with clear explanations of your technical decisions.",
];

export const systemPromptVariants: Record<string, SystemPromptVariant> = {
  none: {
    name: "none",
    description: "No system prompt — raw model defaults",
    prompt: "",
  },
  generic_coding_assistant: {
    name: "generic_coding_assistant",
    description: "Generic coding assistant with no database guidance",
    prompt: codingAssistantBasePrompt.join(" "),
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
  system_architect: {
    name: "system_architect",
    description: "Focuses on architecture and technical decisions over code",
    prompt: [
      "You are a senior software architect.",
      "When the user describes an application, design the full technical architecture.",
      "Focus on technology choices, data modeling, and system design rather than writing every line of code.",
      "Explain your reasoning for each major decision, especially your choice of database, framework, and infrastructure.",
    ].join(" "),
  },
  stack_agnostic: {
    name: "stack_agnostic",
    description:
      "Explicitly asks the model to evaluate database options before choosing",
    prompt: [
      ...codingAssistantBasePrompt,
      "When choosing a each element of the application stack, briefly consider multiple options and explain why you picked the one you did.",
    ].join(" "),
  },
};
