import { Tool, tool } from "mongodb-rag-core/aiSdk";
import { pipeline, z } from "zod";
import { listExamplesInPrompt } from "../languagePrompts/listExamplesInPrompt";

const MongoDbAggregateOperationSchema = z.object({
  databaseName: z.string(),
  collectionName: z.string(),
  pipeline: z
    .array(z.record(z.string(), z.any()))
    .describe("MongoDB aggregation pipeline"),
});

export type MongoDbAggregateOperation = z.infer<
  typeof MongoDbAggregateOperationSchema
>;

export const submitFinalSolutionToolName = "submit-final-solution";

export const submitFinalSolutionTool: Tool = tool({
  name: submitFinalSolutionToolName,
  description: `Submit the final solution of MongoDB operation.

<general-requirements>
${listExamplesInPrompt([
  `Once you have generated a query that you are confident in, call the ${submitFinalSolutionToolName} tool.`,
  `Only call the ${submitFinalSolutionToolName} tool when you have generated the final solution.`,
  `In the tool call, you MUST include the correct database name, collection name, and aggregation pipeline. All fields are required.`,
  `Once you have called the tool, you will stop generating.`,
])}
</general-requirements>

<pipeline-formatting-requirements>
${listExamplesInPrompt([
  `The pipeline MUST be a valid JSON array of stage objects`,
  `Each stage is an object with a single operator key (e.g., {"$search": {...}})`,
  `Do NOT include comments in the pipeline JSON`,
  `Ensure proper JSON formatting: quoted strings, correct nesting, no trailing commas`,
])}
</pipeline-formatting-requirements>

<example-pipelines>
${listExamplesInPrompt([
  `Match and group: [{"$match": {"status": "active"}}, {"$group": {"_id": "$category", "count": {"$sum": 1}}}]`,
  `Sort and limit: [{"$match": {"year": {"$gte": 2020}}}, {"$sort": {"title": 1}}, {"$limit": 10}]`,
  `Atlas Search with project: [{"$search": {"index": "default", "text": {"query": "comedy", "path": "genres"}}}, {"$project": {"title": 1, "_id": 1, "text": 0}}]`,
])}
</example-pipelines>`,
  inputSchema: MongoDbAggregateOperationSchema,
});
