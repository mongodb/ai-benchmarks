# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a MongoDB AI Benchmarks repository for evaluating AI models on MongoDB-related tasks. It's a Lerna monorepo with three main packages focused on benchmarking text-to-driver code generation, natural language queries, and MongoDB knowledge tasks.

**Key Architecture:**
- Lerna monorepo with independent TypeScript packages
- Braintrust integration for experiment tracking and evaluation
- AI SDK (Vercel) for LLM interactions
- MongoDB for test databases and query execution
- Evaluation pipelines with custom scorers

## Essential Commands

### Setup
```bash
# Initial setup
npm install
npm run bootstrap

# Build all packages
npm run build

# Build specific packages (mongodb-rag-core must be built first)
npm run build -- --scope='{mongodb-rag-core,benchmarks}'
cd packages/mongodb-rag-core && npm run build
```

### Testing & Quality
```bash
# Run all tests
npm run test

# Test specific package
cd packages/<package-name> && npm test

# Linting
npm run lint
npm run lint:fix
```

## Package Structure

### Core Packages

**mongodb-rag-core**: Shared utilities, types, and functions used across all packages. Build this first before other packages.
- Exports: `/braintrust`, `/aiSdk`, `/mongodb`, `/executeCode`, `/eval`, `/models`
- Contains Braintrust integration, LLM utilities, MongoDB helpers, code execution
- Dependency for both benchmarks and datasets packages

**benchmarks**: Benchmarking suite for evaluating AI models on MongoDB tasks
- Text-to-driver code generation (natural language to MongoDB queries)
- Quiz questions (MongoDB University multiple choice questions)
- Discovery tasks (finding relevant MongoDB documentation)
- Uses Braintrust `Eval()` for experiment tracking
- Includes custom scorers for MongoDB query evaluation

**datasets**: Tools for generating and managing evaluation datasets
- Extract and process code examples from MongoDB docs
- Generate synthetic natural language queries for databases
- Upload datasets to Hugging Face
- Schema generation for MongoDB databases

## Key Implementation Details

### Evaluations
- Use `Eval()` from `mongodb-rag-core/braintrust` (re-exported from `braintrust` npm package)
- Evaluation files named `*.eval.ts` contain Braintrust experiments
- Each eval defines: project name, experiment name, data, task function, scorers
- Results tracked in Braintrust web UI with experiment comparisons

### Text-to-Driver Benchmarks
Located in `packages/benchmarks/src/textToDriver/`:
- **Agentic approach**: `generateMongoshCodeAgentic.ts` - iterative query generation with tool calling
- **Prompt completion**: `generateMongoshCodePromptCompletion.ts` - single-shot generation
- **Tool calling**: `generateMongoshCodeToolCall.ts` - structured output generation
- Custom scorers compare generated queries against expected results
- Supports different prompt strategies: annotated schemas, interpreted schemas, few-shot examples, chain-of-thought

### Database Execution
- `makeExecuteMongoshQuery()` from `mongodb-rag-core/executeCode` runs generated code
- Test databases created with `textToDriver:makeDatabases` script
- Results validated using custom scoring functions in `scorers/`

### Braintrust Integration
- Import from `mongodb-rag-core/braintrust` not `braintrust` directly
- `wrapOpenAI()` and `wrapAzureOpenAI()` for automatic logging
- Experiments tracked with metadata, tags, and custom scores
- Use Braintrust MCP server (available via `/mcp` command) to query results

## Development Workflow

1. **Environment Setup**: Each package requires `.env` file (see `.env.example`)
2. **Build Order**: Always build `mongodb-rag-core` first, then dependent packages
3. **Dependencies**: Most packages depend on `mongodb-rag-core` - rebuild it after changes
4. **Testing**: MongoDB Memory Server used for tests (no external DB required for unit tests)
5. **Benchmarks**: Require MongoDB connection URI in `.env` for real database tests

## Common Patterns

### Running an Evaluation
```typescript
import { Eval } from "mongodb-rag-core/braintrust";

await Eval("project-name", {
  experimentName: "experiment-name",
  data: evalCases,
  async task(input) {
    // Your task implementation
    return output;
  },
  scorers: [customScorer1, customScorer2],
});
```

### Using AI SDK
```typescript
import { generateText, tool } from "mongodb-rag-core/aiSdk";

const result = await generateText({
  model: openai,
  tools: { toolName: tool({ description, inputSchema, execute }) },
  system: systemPrompt,
  prompt: userPrompt,
});
```

## Benchmarking CLI

From `packages/benchmarks`, run:
```bash
npm run benchmark -- --help
```

Key benchmark types:
- `textToDriver`: Natural language to MongoDB driver code
- `quizQuestions`: MongoDB knowledge quiz questions
- `nlPromptResponse`: Natural language prompt responses

### Running Benchmarks

Run all benchmarks with the benchmark CLI:

```sh
# Get started
npm run benchmark -- --help

# List available benchmarks
npm run benchmark -- list

# List available models
npm run benchmark -- models list

# Run a benchmark
npm run benchmark -- run --type nl_prompt_response --model gpt-4.1-nano --dataset top_questions
```