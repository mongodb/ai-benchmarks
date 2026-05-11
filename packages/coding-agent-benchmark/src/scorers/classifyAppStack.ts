import { z } from "zod";
import { generateText, LanguageModel, Output } from "mongodb-rag-core/aiSdk";
import { wrapTraced } from "mongodb-rag-core/braintrust";

/*
 * Duplicated from packages/benchmarks/src/app-development/classifyAppStack.ts.
 * Kept local to avoid coding-agent-benchmark depending on the benchmarks package
 * (which pulls in heavy deps). If the enum lists drift, sync manually or extract
 * to mongodb-rag-core.
 */

export const programmingLanguages = [
  "typescript",
  "javascript",
  "python",
  "ruby",
  "php",
  "perl",
  "lua",
  "r",
  "java",
  "kotlin",
  "scala",
  "clojure",
  "groovy",
  "go",
  "rust",
  "c",
  "cpp",
  "zig",
  "nim",
  "csharp",
  "fsharp",
  "swift",
  "objective-c",
  "dart",
  "elixir",
  "erlang",
  "haskell",
  "ocaml",
  "other",
] as const;

export const primaryDatabases = [
  "mongodb",
  "couchdb",
  "couchbase",
  "firestore",
  "fauna",
  "surrealdb",
  "cosmosdb",
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
  "supabase",
  "firebase-realtime-db",
  "dynamodb",
  "airtable",
  "appwrite",
  "pocketbase",
  "convex",
  "redis",
  "valkey",
  "memcached",
  "elasticsearch",
  "opensearch",
  "clickhouse",
  "influxdb",
  "timescaledb",
  "duckdb",
  "neo4j",
  "dgraph",
  "arangodb",
  "pinecone",
  "weaviate",
  "qdrant",
  "chroma",
  "milvus",
  "cloudflare-d1",
  "cloudflare-kv",
  "other",
] as const;

export const appFrameworks = [
  "express",
  "fastify",
  "nestjs",
  "hono",
  "koa",
  "adonisjs",
  "strapi",
  "nextjs",
  "nuxtjs",
  "sveltekit",
  "remix",
  "astro",
  "redwood",
  "blitz",
  "t3",
  "django",
  "flask",
  "fastapi",
  "starlette",
  "tornado",
  "pyramid",
  "litestar",
  "rails",
  "sinatra",
  "hanami",
  "laravel",
  "symfony",
  "slim",
  "codeigniter",
  "lumen",
  "spring-boot",
  "quarkus",
  "micronaut",
  "ktor",
  "dropwizard",
  "gin",
  "echo",
  "chi",
  "fiber",
  "actix",
  "axum",
  "rocket",
  "warp",
  "phoenix",
  "aspnet",
  "dart-shelf",
  "other",
] as const;

export const ormOrDatabaseClients = [
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
  "prisma",
  "typeorm",
  "drizzle",
  "sequelize",
  "knex",
  "objection",
  "mikro-orm",
  "bookshelf",
  "kysely",
  "sqlalchemy",
  "django-orm",
  "peewee",
  "tortoise-orm",
  "sqlmodel",
  "activerecord",
  "eloquent",
  "doctrine",
  "hibernate",
  "jooq",
  "exposed",
  "spring-data-jpa",
  "gorm",
  "ent",
  "sqlx-go",
  "bun-go",
  "diesel",
  "sea-orm",
  "sqlx-rust",
  "entity-framework",
  "dapper",
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
  "other",
] as const;

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
        content: `Here is the model's generation to classify:\n\n<generation>\n${generation}\n</generation>`,
      },
    ],
    output: Output.object({ schema: AppStackClassificationSchema }),
  });
  return output;
});
