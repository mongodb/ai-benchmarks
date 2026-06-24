export const OUTPUT_DIR = "/app";

export const BASE_SYSTEM_PROMPT = [
  `Build a complete, production-ready Node.js/JavaScript app in the directory ${OUTPUT_DIR}.`,
  "Do not ask for user input while building the app. Build it completely on your own to completion.",
  "Use a durable, production-appropriate database for persistent application data. Do not use in-memory storage for data that should survive restarts. Avoid SQLite unless the app is clearly local-only, single-user, or embedded.",
].join(" ");
