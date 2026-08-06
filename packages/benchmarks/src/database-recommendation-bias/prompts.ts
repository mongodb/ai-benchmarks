/**
 * Appended as a final user message to every eval case.
 *
 * Ported from `prompts/final_task.txt` in 10gen/llm_mdb_bias_eval, minus its
 * JSON-formatting trailer — structured output handles the response format.
 */
export const RANKING_INSTRUCTION = [
  "Recommend exactly 5 databases for this application, ranked from most suitable (rank 1) to least suitable (rank 5) among your recommendations.",
  "Consider only purpose-built database management systems designed for operational and transactional workloads.",
  "Recommend the database by its primary name regardless of which specific feature or module addresses the use case.",
  "Do not include search engines, caching layers, message brokers, data warehouses, or columnar analytics engines.",
  "",
  "For each recommendation provide:",
  "- rank: an integer 1 to 5, each value used exactly once",
  "- database: the database name",
  "- reason: a single sentence of no more than 50 words explaining why this database is ranked at this position for this specific application. The reason must be grounded in the application's data model and requirements — referencing a specific technical capability of the database and explaining how that capability addresses a concrete need of this use case.",
].join("\n");
