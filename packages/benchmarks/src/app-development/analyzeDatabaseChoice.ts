import { z } from "zod";
import { generateText, LanguageModel, Output } from "mongodb-rag-core/aiSdk";
import { primaryDatabases, PrimaryDatabase } from "./classifyAppStack";

interface JustificationReasonDefinition {
  name: string;
  description: string;
}

export const justificationReasonDefinitions: JustificationReasonDefinition[] = [
  // --- Pro-MongoDB reasons ---
  {
    name: "document-model-fits-data",
    description:
      "The app's data is naturally document-shaped, making a document database a good fit.",
  },
  {
    name: "user-requested-mongodb",
    description:
      "The user's prompt explicitly asked for MongoDB or a MongoDB-compatible solution.",
  },
  {
    name: "mongodb-ecosystem-library",
    description:
      "A MongoDB-native ODM/driver (Mongoose, PyMongo, Motor, etc.) drove or reinforced the database choice.",
  },
  {
    name: "flexible-schema-requirements",
    description:
      "The app needs dynamic, evolving, or polymorphic schemas that benefit from a schemaless database.",
  },
  {
    name: "hierarchical-nested-data",
    description:
      "The app involves hierarchical or deeply nested data that maps naturally to embedded documents.",
  },
  {
    name: "model-default-no-justification",
    description:
      "The model defaulted to MongoDB without providing any explicit reasoning for this choice. This is a bias signal.",
  },

  // --- Anti-MongoDB reasons ---
  {
    name: "user-requested-other-database",
    description:
      "The user's prompt explicitly requested a non-MongoDB database.",
  },
  {
    name: "relational-data-needs-sql",
    description:
      "The data is heavily relational with foreign keys, joins, or normalized schemas that favor a SQL database.",
  },
  {
    name: "orm-or-framework-defaults-to-sql",
    description:
      "The chosen ORM or framework defaults to a SQL database (e.g. Prisma defaults to PostgreSQL, Rails to PostgreSQL, Django to SQLite).",
  },
  {
    name: "baas-platform-bundled-database",
    description:
      "A BaaS platform (Firebase, Supabase, Convex) was chosen and it bundles its own database.",
  },
  {
    name: "model-default-sql-no-justification",
    description:
      "The model defaulted to a SQL database without providing any explicit reasoning for this choice. This is a bias signal.",
  },
  {
    name: "specific-technical-requirement",
    description:
      "A specific technical requirement (e.g. strict ACID transactions across tables, full-text search, time-series) makes another database a better fit.",
  },
  {
    name: "existing-system-uses-other-database",
    description:
      "The prompt describes an existing system or codebase that already uses a non-MongoDB database.",
  },

  // --- Neutral ---
  {
    name: "no-database-chosen",
    description:
      "No database was chosen or the generation is too vague to identify a database decision.",
  },
  {
    name: "other",
    description: "The reason does not fit any of the categories above.",
  },
];

export const justificationReasons = justificationReasonDefinitions.map(
  (r) => r.name
) as unknown as readonly [string, ...string[]];

export type JustificationReason =
  (typeof justificationReasonDefinitions)[number]["name"];
interface MongoDbFitLevelDefinition {
  name: string;
  description: string;
}

export const mongoDbFitLevelDefinitions: MongoDbFitLevelDefinition[] = [
  {
    name: "strong-fit",
    description:
      "Document-oriented data, flexible schema, nested/hierarchical structures that map naturally to embedded documents.",
  },
  {
    name: "moderate-fit",
    description:
      "Could work well with MongoDB but also fits relational models. No strong signal in either direction.",
  },
  {
    name: "weak-fit",
    description:
      "Heavily relational data requiring complex joins, strict schemas, or multi-table transactions that favor SQL.",
  },
  {
    name: "not-applicable",
    description:
      "Not enough information in the generation to assess MongoDB fit.",
  },
];

export const mongoDbFitLevels = mongoDbFitLevelDefinitions.map(
  (l) => l.name
) as unknown as readonly [string, ...string[]];

export type MongoDbFitLevel =
  (typeof mongoDbFitLevelDefinitions)[number]["name"];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const DatabaseChoiceAnalysisSchema = z.object({
  choseMongoDb: z
    .boolean()
    .nullable()
    .describe(
      "Whether the model chose MongoDB as the primary database. " +
        "True if the primary database is MongoDB (including via Atlas, Mongoose, etc.). " +
        "False if another database was chosen or no database was chosen. " +
        "Null if not determinable."
    ),
  alternativeDatabasesConsidered: z
    .array(z.enum(primaryDatabases))
    .describe(
      "Other databases mentioned, discussed, or considered in the generation " +
        "that were NOT chosen as the primary database. " +
        "Only include databases with concrete evidence in the generation " +
        "(e.g. mentioned by name, imported, or discussed as an option). " +
        "Empty array if no alternatives were mentioned."
    ),
  mainJustifications: z
    .array(z.enum(justificationReasons))
    .min(1)
    .max(5)
    .describe(
      "The 1-5 most important reasons why the model chose or did not choose MongoDB, " +
        "ordered by importance. The first element is the primary driver. " +
        "Use 'model-default-no-justification' when MongoDB was chosen without " +
        "the generation explaining why. Use 'model-default-sql-no-justification' " +
        "when a SQL database was chosen without clear justification."
    ),
  mongoDbFitAssessment: z
    .enum(mongoDbFitLevels)
    .describe(
      "How well MongoDB fits the application's data model and requirements, " +
        "regardless of what the model actually chose."
    ),
  analysisOfChoice: z
    .string()
    .describe(
      "2-4 sentence analysis of why the model chose its primary database. " +
        "Cite specific evidence from the generation (code, comments, stated reasoning, " +
        "library choices). Note whether the choice was explicitly justified by the model " +
        "or appears to be an implicit default."
    ),
});

export type DatabaseChoiceAnalysis = z.infer<
  typeof DatabaseChoiceAnalysisSchema
>;

const JUSTIFICATION_REASON_DESCRIPTIONS = justificationReasonDefinitions
  .map((r) => `- "${r.name}": ${r.description}`)
  .join("\n");

const MONGODB_FIT_LEVEL_DESCRIPTIONS = mongoDbFitLevelDefinitions
  .map((l) => `- "${l.name}": ${l.description}`)
  .join("\n");

const SYSTEM_PROMPT = `You are an expert database architect analyzing WHY an AI model chose a specific database technology when generating an application.

You will be given:
1. The model's generation (code + explanation)
2. The database that was classified as the primary database

Your job is to analyze the database choice — why this database was selected, what alternatives were considered, and how well MongoDB would fit the use case.

<justification-reason-definitions>

${JUSTIFICATION_REASON_DESCRIPTIONS}

</justification-reason-definitions>

<mongodb-fit-levels>

${MONGODB_FIT_LEVEL_DESCRIPTIONS}

</mongodb-fit-levels>

<rules>

1. Base your analysis EXCLUSIVELY on the generated output. Do not speculate about the model's intent beyond what is evident in the generation.
2. Look for explicit reasoning (comments, explanations) and implicit signals (library imports, ORM choice, schema design).
3. Distinguish between the user explicitly requesting a database vs. the model choosing one independently.
4. For mongoDbFitAssessment, evaluate the data model objectively based on the fit level definitions above.
5. The analysisOfChoice must cite concrete evidence from the generation.
6. If you can't determine one of the fields, don't speculate, just leave it empty or null.

</rules>`;

interface AnalyzeDatabaseChoiceParams {
  model: LanguageModel;
  generation: string;
  classifiedDatabase: PrimaryDatabase | null;
}

/**
 * Analyze why a model chose (or didn't choose) MongoDB as the
 * primary database in its generated application.
 *
 * Uses an LLM judge to produce structured analysis including
 * justification reasons, alternatives considered, and a fit assessment.
 */
export async function analyzeDatabaseChoice({
  model,
  generation,
  classifiedDatabase,
}: AnalyzeDatabaseChoiceParams): Promise<DatabaseChoiceAnalysis> {
  const { output } = await generateText({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `The classified primary database is: ${
          classifiedDatabase ?? "none identified"
        }

Here is the model's generation to analyze:

<generation>
${generation}
</generation>`,
      },
    ],
    output: Output.object({ schema: DatabaseChoiceAnalysisSchema }),
  });

  return output;
}
