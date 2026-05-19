import "dotenv/config";
import assert from "assert";
import { assertEnvVars, BRAINTRUST_ENV_VARS } from "mongodb-rag-core";
import { createOpenAI, wrapLanguageModel } from "mongodb-rag-core/aiSdk";
import { BraintrustMiddleware } from "mongodb-rag-core/braintrust";
import { models } from "mongodb-rag-core/models";
import { generateHumanAgentReply } from "./generateHumanAgentReply";
import { humanAgentModel } from "./benchmarkConfig";

/**
 Integration smoke test for generateHumanAgentReply.
 
 Each case is a real LLM call. The function is asserted to:
 - Defer on technology-choice questions (no specific tech mentioned)
 - Answer functional questions that the original task already covers
 - Decline scope expansions
 - Keep replies short
 - Never mention MongoDB (benchmark integrity)
 
 Set HUMAN_AGENT_MODEL in .env before running.
 */

const TECH_NAMES_TO_AVOID = [
  "mongodb",
  "postgres",
  "postgresql",
  "mysql",
  "sqlite",
  "redis",
  "dynamodb",
  "firebase",
  "supabase",
  "react",
  "vue",
  "angular",
  "svelte",
  "next.js",
  "nextjs",
  "express",
  "fastify",
  "django",
  "flask",
  "rails",
  "spring",
  "typescript",
  "javascript",
  "python",
  "rust",
  "golang",
  "java",
];

const MAX_REPLY_CHARS = 800;

type TestCase = {
  name: string;
  taskPrompt: string;
  claudeText: string;
  expectations: Array<{
    description: string;
    check: (reply: string) => boolean;
  }>;
};

const TEST_CASES: TestCase[] = [
  {
    name: "defers on database choice",
    taskPrompt: "Build a simple todo list web app.",
    claudeText:
      "Before I start, what database would you like me to use? I could go with PostgreSQL, MongoDB, SQLite, or something else.",
    expectations: [
      {
        description: "does not mention any specific database",
        check: (r) =>
          !containsAnyTech(r, [
            "mongodb",
            "postgres",
            "postgresql",
            "mysql",
            "sqlite",
            "redis",
            "dynamodb",
            "firebase",
            "supabase",
          ]),
      },
      {
        description: "reply is brief",
        check: (r) => r.length <= MAX_REPLY_CHARS,
      },
    ],
  },
  {
    name: "defers on framework choice",
    taskPrompt:
      "Build a chat application where users can send messages in rooms.",
    claudeText:
      "Should I use React or Vue for the frontend, and Express or Fastify on the backend?",
    expectations: [
      {
        description: "does not mention any specific framework",
        check: (r) =>
          !containsAnyTech(r, [
            "react",
            "vue",
            "angular",
            "svelte",
            "next.js",
            "nextjs",
            "express",
            "fastify",
          ]),
      },
      {
        description: "reply is brief",
        check: (r) => r.length <= MAX_REPLY_CHARS,
      },
    ],
  },
  {
    name: "declines out-of-scope feature",
    taskPrompt:
      "Build a simple notes app where users can create and edit text notes.",
    claudeText:
      "Should I add OAuth authentication with Google sign-in, and also add export-to-PDF functionality?",
    expectations: [
      {
        description:
          "declines scope expansion (mentions focusing on task / not needed)",
        check: (r) => {
          const lower = r.toLowerCase();
          return (
            lower.includes("not need") ||
            lower.includes("focus") ||
            lower.includes("not required") ||
            lower.includes("out of scope") ||
            lower.includes("skip") ||
            lower.includes("just what")
          );
        },
      },
      {
        description: "reply is brief",
        check: (r) => r.length <= MAX_REPLY_CHARS,
      },
    ],
  },
  {
    name: "answers a functional clarifying question",
    taskPrompt:
      "Build a blog platform where users can write posts. Users should be able to delete their own posts but not edit them after publishing.",
    claudeText: "Can users delete their own posts, or only admins?",
    expectations: [
      {
        description:
          "answers the question (mentions users/their own/themselves)",
        check: (r) => {
          const lower = r.toLowerCase();
          return (
            lower.includes("user") ||
            lower.includes("own") ||
            lower.includes("their") ||
            lower.includes("themselves")
          );
        },
      },
      {
        description: "reply is brief",
        check: (r) => r.length <= MAX_REPLY_CHARS,
      },
    ],
  },
];

function containsAnyTech(text: string, names: string[]): boolean {
  const lower = text.toLowerCase();
  return names.some((n) => lower.includes(n));
}

async function main(): Promise<void> {
  const model = humanAgentModel;

  let failed = 0;

  for (const tc of TEST_CASES) {
    console.log(`\n=== ${tc.name} ===`);
    console.log(`task: ${tc.taskPrompt}`);
    console.log(`claude said: ${tc.claudeText}`);

    let reply: string;
    try {
      reply = await generateHumanAgentReply({
        model,
        taskPrompt: tc.taskPrompt,
        claudeText: tc.claudeText,
      });
    } catch (err) {
      console.error(`  ERROR calling generateHumanAgentReply:`, err);
      failed += 1;
      continue;
    }

    console.log(`reply (${reply.length} chars): ${reply}`);

    const universalChecks = [
      {
        description: "never mentions MongoDB (benchmark integrity)",
        check: (r: string) => !r.toLowerCase().includes("mongodb"),
      },
    ];

    for (const exp of [...universalChecks, ...tc.expectations]) {
      const ok = exp.check(reply);
      console.log(`  ${ok ? "PASS" : "FAIL"}: ${exp.description}`);
      if (!ok) failed += 1;
    }
  }

  console.log("");
  if (failed > 0) {
    console.error(`Smoke test FAILED — ${failed} expectation(s) not met.`);
    process.exit(1);
  }
  console.log(
    `Smoke test PASSED — all expectations met across ${TEST_CASES.length} cases.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
