import { Tool, tool } from "mongodb-rag-core/aiSdk";
import { z } from "zod";
import { listExamplesInPrompt } from "../languagePrompts/listExamplesInPrompt";

const MongoDbAggregateOperationSchema = z.object({
  databaseName: z.string(),
  collectionName: z.string(),
  pipeline: z
    .array(z.record(z.string(), z.any()))
    .describe("MongoDB aggregation pipeline. Format: `Document[]`"),
});

export type MongoDbAggregateOperation = z.infer<
  typeof MongoDbAggregateOperationSchema
>;

export const submitFinalSolutionToolName = "submit-final-solution";

export const submitFinalSolutionTool: Tool = tool({
  name: submitFinalSolutionToolName,
  description: `Call ${submitFinalSolutionToolName} to submit the MongoDB operation that solves the problem. Once you have called the tool, you will stop generating.

<output-format>
The output MUST be a JSON object with the following fields:

- "databaseName": The name of the database to execute the pipeline on. E.g. "sample_mflix"
- "collectionName": The name of the collection to execute the pipeline on. E.g. "movies"
- "pipeline": The aggregation pipeline to execute. An array of all the stages in the pipeline. You can use the same pipeline as was created in previous tool steps. E.g. [{"$match": {"status": "active"}}, {"$group": {"_id": "$category", "count": {"$sum": 1}}}]

All fields are required.
</output-format>

<pipeline-formatting-requirements>
${listExamplesInPrompt([
  `The pipeline MUST be a valid JSON array of stage objects`,
  `Each stage is an object with a single operator key (e.g., {"$search": {...}})`,
  `Do NOT include comments in the pipeline JSON`,
  `Ensure proper JSON formatting: quoted strings, correct nesting, no trailing commas`,
])}
</pipeline-formatting-requirements>`,
  inputSchema: MongoDbAggregateOperationSchema,
});
