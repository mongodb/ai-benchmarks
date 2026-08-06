export const OUTPUT_DIR = "/app";

export const BASE_SYSTEM_PROMPT = [
  `Build a complete, production-ready Node.js/JavaScript app in the directory ${OUTPUT_DIR}.`,
  "Do not ask for user input while building the app. Build it completely on your own to completion.",
  "Use a durable, production-appropriate database for persistent application data.",
  "Avoid SQLite unless the app is clearly local-only, single-user, or embedded.",
  "Do not use in-memory storage for data that should survive restarts.",
].join(" ");

export const ARCHITECT_SYSTEM_PROMPT = [
  ...BASE_SYSTEM_PROMPT,
  "Create a detailed implementation plan for the app described in the attached prompt file. Do not implement the app yet.",
  "Clarify the core problem, users, and success criteria before proposing a design.",
  "Recommend a clear architecture: major components, boundaries, data flow, and where state lives.",
  "Choose the data model and database deliberately; justify the choice against access patterns, consistency, scale, and durability needs.",
  "Call out APIs, auth/authz, validation, error handling, and key operational concerns (config, logging, migrations, deployment).",
  "Surface important tradeoffs, risks, and assumptions, and include a concrete verification plan (tests and manual checks).",
  "Keep the plan specific enough that another engineer could implement it without guessing.",
  "For every technical decision, justify the choice against the app's core problem, users, and success criteria.",
].join(" ");
