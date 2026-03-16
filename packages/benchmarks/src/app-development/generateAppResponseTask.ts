/**
 * TODO: Implement generateAppResponseTask
 *
 * This is the main task function for the app-development eval.
 * It takes a conversation (messages) and returns a structured output
 * with the model's response, classified tech stack, database analysis,
 * and the model's own self-reflection on its database choice.
 *
 * ## Workflow
 *
 * ### Step 1: Generate app response (subject model)
 * - Call the subject model with the eval case's `messages` (conversation history)
 * - Capture the full text response
 *
 * ### Step 2: Classify app stack (judge model)
 * - Call `classifyAppStack({ model: judgeModel, generation: response })`
 *   from `./classifyAppStack`
 * - Returns `AppStackClassification` with:
 *   programmingLanguage, primaryDatabase, appFramework,
 *   ormOrDatabaseClient, frontendFramework, deploymentInfrastructure,
 *   authenticationApproach (all nullable enums or free-text)
 *
 * ### Step 3: Analyze database choice (judge model)
 * - Call `analyzeDatabaseChoice({ model: judgeModel, generation: response, classifiedDatabase })`
 *   from `./analyzeDatabaseChoice`
 * - An external judge analyzes the generation to determine WHY the subject
 *   model chose its database, based solely on evidence in the output
 * - Returns `DatabaseChoiceAnalysis`:
 *   - `choseMongoDb: boolean | null` — comparable with `metadata.is_mongodb_optimal`
 *   - `alternativeDatabasesConsidered: PrimaryDatabase[]` — other DBs mentioned
 *   - `mainJustifications: JustificationReason[]` (1-5, ordered by importance)
 *   - `mongoDbFitAssessment: MongoDbFitLevel` — objective fit regardless of choice
 *   - `analysisOfChoice: string` — evidence-based explanation
 *
 * ### Step 4: Self-reflect on database choice (subject model)
 * - Call `selfReflectOnDatabaseChoice({ model: subjectModel, originalMessages, generation: response })`
 *   from `./selfReflectOnDatabaseChoice`
 * - Sends the original conversation + the model's own generation back to the
 *   SAME model and asks it to reflect on its database decision
 * - Returns `SelfReflection`:
 *   - `chosenDatabase: PrimaryDatabase | null`
 *   - `consideredMongoDb: boolean` — did it even think about MongoDB?
 *   - `reasonsForChoice: JustificationReason[]` (1-5)
 *   - `whyMongoDb: string | null` — explanation if it chose MongoDB
 *   - `whyNotMongoDb: string | null` — explanation if it didn't
 *   - `mongoDbFitAssessment: MongoDbFitLevel`
 *   - `alternativesConsidered: PrimaryDatabase[]`
 *   - `wouldChangeChoice: boolean` — honest reconsideration
 *   - `reflection: string` — free-text self-critique
 *
 * ## Return value
 * ```ts
 * {
 *   response: string,
 *   appStack: AppStackClassification,
 *   databaseAnalysis: DatabaseChoiceAnalysis,
 *   selfReflection: SelfReflection,
 * }
 * ```
 *
 * ## Parallelism
 * - Steps 2 and 3 use a **judge model** and can run in parallel (both only need `response`)
 * - Step 4 uses the **subject model** and can also run in parallel with steps 2-3
 * - Only step 1 is sequential — everything else fans out after it completes
 *
 * ## Comparing judge vs self-report
 * Steps 3 and 4 capture the same decision from two perspectives:
 * - `analyzeDatabaseChoice` (step 3): external analysis based on evidence in the code
 * - `selfReflectOnDatabaseChoice` (step 4): the model's own account of its reasoning
 * Comparing these reveals cases where the model's stated reasoning diverges from
 * what the code actually shows (e.g., claims it "deliberately chose" MongoDB but
 * the judge flags it as `model-default-no-justification`).
 */
