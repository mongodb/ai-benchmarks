import { z } from "zod";
import { generateText, LanguageModel, Output } from "mongodb-rag-core/aiSdk";
import { wrapTraced } from "mongodb-rag-core/braintrust";

// ---------------------------------------------------------------------------
// Enum values for each classifiable dimension.
// Use lowercase kebab-case identifiers. "other" is the escape hatch
// when the LLM identifies a technology not in the list.
// ---------------------------------------------------------------------------

export const programmingLanguages = [
  // Web / scripting
  "typescript",
  "javascript",
  "python",
  "ruby",
  "php",
  "perl",
  "lua",
  "r",
  // JVM
  "java",
  "kotlin",
  "scala",
  "clojure",
  "groovy",
  // Systems
  "go",
  "rust",
  "c",
  "cpp",
  "zig",
  "nim",
  // .NET
  "csharp",
  "fsharp",
  // Mobile
  "swift",
  "objective-c",
  "dart",
  // Functional
  "elixir",
  "erlang",
  "haskell",
  "ocaml",
  // Other
  "other",
] as const;

export const primaryDatabases = [
  // Document
  "mongodb",
  "couchdb",
  "couchbase",
  "firestore",
  "fauna",
  "surrealdb",
  "cosmosdb",
  // Relational
  "postgresql",
  "mysql",
  "mariadb",
  "sqlite",
  "mssql",
  "oracle",
  "cockroachdb",
  "planetscale",
  "neon",
  "turso",
  "tidb",
  // BaaS / managed
  "supabase",
  "firebase-realtime-db",
  "dynamodb",
  "airtable",
  "appwrite",
  "pocketbase",
  "convex",
  // Key-value / cache (when used as primary store)
  "redis",
  "valkey",
  "memcached",
  // Search / analytics
  "elasticsearch",
  "opensearch",
  "clickhouse",
  "influxdb",
  "timescaledb",
  "duckdb",
  // Graph
  "neo4j",
  "dgraph",
  "arangodb",
  // Vector
  "pinecone",
  "weaviate",
  "qdrant",
  "chroma",
  "milvus",
  // Cloudflare
  "cloudflare-d1",
  "cloudflare-kv",
  // Other
  "other",
] as const;

export const appFrameworks = [
  // Node.js / TypeScript
  "express",
  "fastify",
  "nestjs",
  "hono",
  "koa",
  "adonisjs",
  "strapi",
  // Fullstack JS/TS
  "nextjs",
  "nuxtjs",
  "sveltekit",
  "remix",
  "astro",
  "redwood",
  "blitz",
  "t3",
  // Python
  "django",
  "flask",
  "fastapi",
  "starlette",
  "tornado",
  "pyramid",
  "litestar",
  // Ruby
  "rails",
  "sinatra",
  "hanami",
  // PHP
  "laravel",
  "symfony",
  "slim",
  "codeigniter",
  "lumen",
  // Java / Kotlin
  "spring-boot",
  "quarkus",
  "micronaut",
  "ktor",
  "dropwizard",
  // Go
  "gin",
  "echo",
  "chi",
  "fiber",
  // Rust
  "actix",
  "axum",
  "rocket",
  "warp",
  // Elixir
  "phoenix",
  // .NET
  "aspnet",
  // Dart
  "dart-shelf",
  // Other
  "other",
] as const;

export const ormOrDatabaseClients = [
  // MongoDB-specific
  "mongoose",
  "pymongo",
  "motor",
  "mongoid",
  "mongodb-driver",
  "spring-data-mongodb",
  "mongoc",
  "beanie",
  "mongoengine",
  "mongodart",
  // Multi-database ORMs (JS/TS)
  "prisma",
  "typeorm",
  "drizzle",
  "sequelize",
  "knex",
  "objection",
  "mikro-orm",
  "bookshelf",
  "kysely",
  // Python
  "sqlalchemy",
  "django-orm",
  "peewee",
  "tortoise-orm",
  "sqlmodel",
  // Ruby
  "activerecord",
  // PHP
  "eloquent",
  "doctrine",
  // Java / Kotlin
  "hibernate",
  "jooq",
  "exposed",
  "spring-data-jpa",
  // Go
  "gorm",
  "ent",
  "sqlx-go",
  "bun-go",
  // Rust
  "diesel",
  "sea-orm",
  "sqlx-rust",
  // .NET
  "entity-framework",
  "dapper",
  // Other
  "other",
] as const;

export const frontendFrameworks = [
  "react",
  "vue",
  "svelte",
  "angular",
  "solid",
  "preact",
  "lit",
  "alpine",
  "htmx",
  "ember",
  "qwik",
  "stencil",
  "marko",
  "flutter",
  "react-native",
  // Other
  "other",
] as const;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Schema for multi-dimension app stack classification.
 *
 * The first 5 dimensions use enums with an "other" escape hatch.
 * Deployment and auth remain free-text since their long tail is
 * too unpredictable.
 *
 * All dimensions are nullable — the classifier returns null
 * when the generation doesn't contain enough signal.
 */
export const AppStackClassificationSchema = z.object({
  programmingLanguage: z
    .enum(programmingLanguages)
    .nullable()
    .describe(
      "Primary programming language used in the generated application. Null if not determinable."
    ),
  primaryDatabase: z
    .enum(primaryDatabases)
    .nullable()
    .describe(
      "The main persistent data store for the application's core data. " +
        "If multiple databases are mentioned, identify the one used for the core application data, not caching or sessions. " +
        "For Firebase apps, distinguish between 'firestore' (Cloud Firestore document DB) and 'firebase-realtime-db' (legacy real-time JSON store). " +
        "Null if not determinable."
    ),
  appFramework: z
    .enum(appFrameworks)
    .nullable()
    .describe(
      "Primary backend or fullstack application framework. Null if not determinable."
    ),
  ormOrDatabaseClient: z
    .enum(ormOrDatabaseClients)
    .nullable()
    .describe(
      "ORM, ODM, or database client library used to interact with the database. Null if not determinable."
    ),
  frontendFramework: z
    .enum(frontendFrameworks)
    .nullable()
    .describe(
      "Frontend UI framework or library. Null if not determinable or no frontend is generated."
    ),
  deploymentInfrastructure: z
    .string()
    .nullable()
    .describe(
      "Deployment platform or infrastructure mentioned (e.g. Docker, Vercel, AWS Lambda, Heroku, Railway, Fly.io). Null if not determinable."
    ),
  authenticationApproach: z
    .string()
    .nullable()
    .describe(
      "Authentication strategy or library used (e.g. JWT, OAuth, NextAuth, Passport.js, Clerk, Firebase Auth). Null if not determinable or no auth is implemented."
    ),
});

export type AppStackClassification = z.infer<
  typeof AppStackClassificationSchema
>;

export type ProgrammingLanguage = (typeof programmingLanguages)[number];
export type PrimaryDatabase = (typeof primaryDatabases)[number];
export type AppFramework = (typeof appFrameworks)[number];
export type OrmOrDatabaseClient = (typeof ormOrDatabaseClients)[number];
export type FrontendFramework = (typeof frontendFrameworks)[number];

const SYSTEM_PROMPT = `You are an expert code reviewer classifying the technology stack of a generated application.

Analyze the provided model generation (which may include code, reasoning, and explanations) and classify the technology stack along multiple dimensions.

Rules:
- For each dimension, identify the PRIMARY choice — the one used for the core application, not ancillary concerns.
- You MUST pick from the provided enum values. Use "other" only when the technology genuinely does not match any listed option.
- If the generation does not contain enough information to determine a dimension, set it to null.
- If multiple options are mentioned but one is clearly the primary choice, pick that one.
- Base your classification on what the code actually uses, not what it discusses hypothetically.
- For deployment and authentication, use short canonical names (e.g. "Docker", "Vercel", "JWT", "NextAuth").`;

interface ClassifyAppStackParams {
  model: LanguageModel;
  generation: string;
}

/**
 * Classify the technology stack of a generated application along
 * multiple dimensions using an LLM judge.
 */
export const classifyAppStack = wrapTraced(async function classifyAppStack({
  model,
  generation,
}: ClassifyAppStackParams): Promise<AppStackClassification> {
  const { output } = await generateText({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here is the model's generation to classify:\n\n
<generation>
${generation}
</generation>`,
      },
    ],
    output: Output.object({ schema: AppStackClassificationSchema }),
  });

  return output;
});
