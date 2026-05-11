# Claude Code Benchmark — Scope & Specification

## Context

This benchmark investigates **generative monoculture** in Claude Code — the tendency for AI coding agents to default to the same technology choices regardless of project context. The immediate research question is: *how often does Claude Code choose MongoDB when building applications, and can we move that needle?*

Background: [amplifying.ai/research/claude-code-picks](https://amplifying.ai/research/claude-code-picks) showed Claude Code chose PostgreSQL in 58.4% of database selections across 2,073 project instances, with strong clustering across many tool categories. This benchmark extends that work with a MongoDB-specific lens and tests whether the **superpowers** Claude Code plugin ([github.com/obra/superpowers](https://github.com/obra/superpowers)) changes the distribution.

The longer-term goal is an **actionable outcome**: if a specific plugin configuration significantly shifts the technology distribution toward contextually-appropriate choices, that configuration could be proposed upstream to the superpowers project.

---

## Benchmark Runs

Three sequential phases, each using the same 104 prompts:

| Phase | Configuration | Purpose |
|-------|--------------|---------|
| **0. Baseline** | Vanilla Claude Code, no plugins | Establish baseline monoculture signal |
| **1. Superpowers** | Claude Code + superpowers plugin (as-is) | Measure plugin's effect on technology choices |
| **2. Forked Superpowers** | Claude Code + modified superpowers fork | *Deferred — designed after Phase 1 results* |

---

## Dataset

Reuse the existing 104 app-development prompts from `packages/benchmarks/datasets/app-development.yml`. Each case is a single user message describing an app to build (e.g., "Build a Research Assistant app where users can upload PDFs and ask questions about them").

Cases span beginner / intermediate / advanced difficulty and categories including AI/RAG, e-commerce, social media, content platforms, and multi-tenant apps. 56 cases are tagged `mongodb-optimal`; 48 are tag-agnostic. These sub-slices will be reported separately to understand whether context sensitivity differs by prompt type.

No new dataset work is needed for Phases 0 and 1.

---

## Package Structure

**New package:** `packages/coding-agent-benchmark`

Rationale: sandbox infrastructure, different runtime requirements, and potential future expansion to other coding agents (Codex, Gemini CLI) justify a dedicated package rather than adding to `packages/benchmarks`.

```
packages/coding-agent-benchmark/
├── package.json
├── tsconfig.json
├── .env.example
└── src/
    ├── index.ts
    ├── envVars.ts
    ├── sandbox/
    │   ├── createClaudeCodeSandbox.ts   # Vercel Sandbox setup & snapshotting
    │   ├── runClaudeCode.ts             # Execute claude -p in sandbox, collect output
    │   └── collectArtifacts.ts          # Read generated files from sandbox filesystem
    ├── eval/
    │   ├── claudeCodeBenchmarkConfig.ts # BenchmarkConfig definition
    │   ├── runClaudeCodeTask.ts         # Braintrust task function
    │   └── ClaudeCodeEval.ts            # Types: input, output, metadata
    ├── scorers/
    │   ├── stdout/
    │   │   ├── MentionsMongoDbInStdout.ts
    │   │   └── classifyStdoutAppStack.ts    # Adapt from app-development/classifyAppStack.ts
    │   └── files/
    │       ├── MongoDbInPackageJson.ts
    │       ├── MongoDbInImports.ts
    │       └── analyzeGeneratedFiles.ts     # LLM-judge analysis of written files
    └── plugins/
        └── superpowers/
            └── installSuperpowers.ts        # Plugin install helper for sandbox
```

---

## Sandbox Design

### Technology: Vercel Sandbox

Uses `@vercel/sandbox` SDK (TypeScript). Each eval case runs in an isolated Firecracker microVM.

**Authentication:** Vercel OIDC token via `vercel link` + `vercel env pull` for local dev; access token for CI.

### Snapshot Strategy (critical for cost/speed)

Installing Claude Code and its dependencies on every case would be prohibitively slow. Instead:

1. **Build a base snapshot once** (not per-run):
   - Create sandbox (`runtime: 'node24'`)
   - Install Node.js tooling
   - `npm install -g @anthropic-ai/claude-code`
   - Write Claude Code config: set Azure Foundry credentials via env vars, disable telemetry, set `--dangerously-skip-permissions`
   - Call `sandbox.snapshot()` → store `snapshotId` in `.env` / config

2. **Per eval case**: `Sandbox.create({ source: { type: 'snapshot', snapshotId } })` → ready in milliseconds, no reinstall

3. **Superpowers variant**: Separate snapshot with superpowers plugin pre-installed on top of the base snapshot.

### Claude Code Authentication (Azure Foundry)

Claude Code must authenticate via Azure without using a personal Anthropic account. Environment variables passed to the sandbox at creation time:

```
CLAUDE_CODE_USE_FOUNDRY=1
ANTHROPIC_FOUNDRY_RESOURCE=<azure-resource-name>
ANTHROPIC_FOUNDRY_API_KEY=<azure-api-key>
ANTHROPIC_FOUNDRY_API_VERSION=<api-version>
```

> **Note:** These environment variables are referenced in Claude Code documentation but are **unproven** as of spec authoring. Validation that they successfully suppress personal-account auth is a required milestone before Phase 0 data collection begins. An alternative path is the `ANTHROPIC_API_KEY` pointing to an Azure-proxied endpoint.

Additional env vars to set in the sandbox to prevent any personal identity leakage:

```
HOME=/home/dev               # Override home directory to avoid ~/.claude profile pickup
GIT_AUTHOR_EMAIL=c.faulkner@google.com
GIT_COMMITTER_EMAIL=c.faulkner@google.com
```

### Workspace Initialization

Before running Claude Code, the sandbox project directory is seeded with a minimal repo skeleton to more closely resemble a real development context:

```bash
mkdir -p /home/dev/app
git init /home/dev/app
cd /home/dev/app
git config user.name "Christopher Faulkner"
git config user.email "c.faulkner@google.com"
echo "# App" > README.md
git add README.md && git commit -m "init"
```

This gives Claude Code a git-tracked working directory with a commit history — closer to what it encounters in real use — without introducing any technology-biasing scaffolding (no `package.json`, no framework or language choices pre-made).

### Running Claude Code

```typescript
const result = await sandbox.runCommand({
  cmd: 'claude',
  args: ['--dangerously-skip-permissions', '--print', prompt],
  cwd: '/home/dev/app',
  env: {
    CLAUDE_CODE_USE_FOUNDRY: '1',
    // ... other auth vars
  },
  stdout: stdoutStream,
  stderr: stderrStream,
});
```

The `--print` (`-p`) flag runs Claude Code non-interactively and exits when done.

### Artifact Collection

After `claude` exits, read the sandbox filesystem:

```typescript
const files = await collectGeneratedFiles(sandbox, '/home/dev/app');
// Returns: { path, content }[] for all non-hidden files
```

Key files to inspect: `package.json`, `*.ts`, `*.js`, `*.py`, `requirements.txt`, `go.mod`, `Gemfile`, `README.md`.

---

## Evaluation Driver (Braintrust)

### Braintrust Project

**Project name:** `coding-agent-benchmark`

Follows the pattern in `packages/benchmarks/src/app-development/config.ts`.

### Types

```typescript
// Input (same shape as AppDevelopmentEvalCaseInput)
type ClaudeCodeEvalCaseInput = {
  name: string;
  messages: ConversationEvalCase["messages"];
};

// Output — two artifact streams
type ClaudeCodeTaskOutput = {
  stdout: string;                  // Full Claude Code conversation output
  files: GeneratedFile[];          // Files written to sandbox filesystem
  stdoutAnalysis: StdoutAnalysis;  // LLM-judge analysis of stdout
  fileAnalysis: FileAnalysis;      // LLM-judge analysis of generated files
  durationMs: number;
  exitCode: number;
};

type GeneratedFile = {
  path: string;
  content: string;
};

// Metadata (carried from dataset)
type ClaudeCodeEvalCaseMetadata = {
  difficulty: "beginner" | "intermediate" | "advanced";
  is_mongodb_optimal?: boolean;
  category?: string;
};
```

### Task Function

```typescript
function makeRunClaudeCodeTask(params: {
  judgeModel: LanguageModel;
  snapshotId: string;
  pluginVariant: "baseline" | "superpowers";
}): EvalTask<ClaudeCodeEvalCaseInput, ClaudeCodeTaskOutput>
```

Per-case execution:
1. **Create sandbox** from snapshot
2. **Run** `claude --print --dangerously-skip-permissions "<prompt>"` → collect stdout + exit code
3. **Read files** written to the project directory
4. **Analyze stdout** with judge model (parallel with step 5)
5. **Analyze files** with judge model (parallel with step 4)
6. **Stop sandbox**
7. **Return** combined output

Steps 4 and 5 run in parallel (they are independent).

### Datasets

```typescript
datasets: {
  all: /* all 104 cases */,
  mongodb_optimal: /* 56 cases tagged mongodb-optimal */,
  db_agnostic: /* 48 cases without mongodb-optimal tag */,
}
```

### Task Variants

```typescript
tasks: {
  "baseline":    { snapshotId: BASE_SNAPSHOT_ID,        plugin: "baseline" },
  "superpowers": { snapshotId: SUPERPOWERS_SNAPSHOT_ID, plugin: "superpowers" },
}
```

---

## Scorers

Two scorer families, evaluated independently and reported side-by-side.

### Stdout Scorers

Adapt from `packages/benchmarks/src/app-development/`:

| Scorer | Logic | Reuses |
|--------|-------|--------|
| `mentions_mongodb_in_stdout` | Claude Code's conversation text mentions "MongoDB", "mongoose", "Atlas", etc. (case-insensitive regex) | Adapt `MentionsMongoDbInGeneration.ts` |
| `primary_database_from_stdout` | LLM judge classifies primary database from conversation text | Adapt `classifyAppStack.ts` + `analyzeDatabaseChoice.ts` |

### File Scorers (new)

| Scorer | Logic |
|--------|-------|
| `mongodb_in_package_json` | `package.json` includes `mongodb`, `mongoose`, `@mongodb-js/*`, or `mongodb-memory-server` in `dependencies` or `devDependencies` |
| `mongodb_in_imports` | Any source file contains `require('mongodb')`, `require('mongoose')`, `from 'mongodb'`, `from 'mongoose'`, `pymongo`, `motor` import |
| `primary_database_from_files` | LLM judge reads package.json + up to 3 source files and classifies primary database (same schema as `classifyAppStack.ts`) |

All scorers emit `pass@k` / `pass%k` / `pass^k` metrics via `computeSampleMetrics()` from `mongodb-rag-core/eval`, consistent with existing benchmark metrics.

**Primary headline metric:** `mongodb_in_package_json` — this is the most faithful signal (files > conversation text).

### Language Metadata

The task function derives `primaryLanguage` deterministically from the generated file tree and attaches it as Braintrust result metadata, enabling grouping and filtering by language in the UI. No LLM judge needed — inferred from manifest files and extensions:

| Signal | Language |
|--------|----------|
| `package.json`, `.ts`, `.js` | TypeScript / JavaScript |
| `requirements.txt`, `pyproject.toml`, `.py` | Python |
| `go.mod`, `.go` | Go |
| `Gemfile`, `.rb` | Ruby |
| `pom.xml`, `build.gradle`, `.java` | Java |
| `Cargo.toml`, `.rs` | Rust |

Implemented as `inferPrimaryLanguage(files: GeneratedFile[]): string | null` in `collectArtifacts.ts`. Useful for checking whether MongoDB adoption rates differ by language ecosystem (e.g. Node.js vs. Python).

---

## Superpowers Plugin Installation (Phase 1)

The superpowers snapshot is built by starting from the base snapshot and running:

```bash
claude --print "/plugin install superpowers@claude-plugins-official"
```

Since plugin installation may require an active Claude session, an alternative is to write the plugin CLAUDE.md content directly into the Claude Code config directory (`~/.claude/plugins/` or equivalent). The exact path needs to be confirmed against the [superpowers README](https://github.com/obra/superpowers) during implementation.

---

## Environment Variables

`packages/coding-agent-benchmark/.env.example`:

```
# Vercel Sandbox
VERCEL_ACCESS_TOKEN=

# Azure Foundry (for Claude Code inside sandbox)
ANTHROPIC_FOUNDRY_RESOURCE=
ANTHROPIC_FOUNDRY_API_KEY=
ANTHROPIC_FOUNDRY_API_VERSION=

# Snapshot IDs (populated after first build-snapshot run)
CLAUDE_CODE_BASE_SNAPSHOT_ID=
CLAUDE_CODE_SUPERPOWERS_SNAPSHOT_ID=

# Braintrust (for eval tracking)
BRAINTRUST_API_KEY=

# Judge model (Azure OpenAI)
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_API_BASE=
AZURE_OPENAI_DEPLOYMENT=
```

---

## Milestones & Open Questions

### Required Before Data Collection

1. **Validate Azure Foundry auth** — confirm `CLAUDE_CODE_USE_FOUNDRY` + related env vars successfully authenticate Claude Code without touching any personal account. Run a single test case manually and verify no personal identity (e.g. `helen.schawe@mongodb.com`) appears in Braintrust traces or sandbox logs.

2. **Confirm `--print` output format** — run `claude --print "Build a simple todo app"` locally and document exactly what stdout contains (conversation turns? final response only? file edit summaries?). This determines whether stdout scorers need to parse structured output or raw text.

3. **Confirm superpowers plugin install path** — check [github.com/obra/superpowers](https://github.com/obra/superpowers) README for the exact install mechanism (CLAUDE.md injection vs. `/plugin install`) so the snapshot builder can automate it reliably.

4. **Vercel Sandbox access** — confirm team account has access and billing is set up; estimate per-run cost (104 cases × ~2 min each).

### Deferred to Phase 2

- Fork strategy design: structured elicitation and/or open-source model sidecar hook (heuristic proxy for Context-Augmented Decoding)
- Decision on which fork strategy to pursue based on Phase 0 vs. Phase 1 delta
- Upstream PR to superpowers if results are compelling

---

## Methodology Limitations

### Evaluation Awareness

Claude Code may infer it is in a synthetic context from: the `--print` flag (explicit automation mode), a blank workspace with no git history, and structurally uniform prompts. `--dangerously-skip-permissions` is not a meaningful signal — it's widely used in real workflows.

This is less concerning than it would be for a safety evaluation: Claude Code has no way to know MongoDB is the measured outcome, so monoculture bias likely reflects trained priors rather than context-sensitive gaming.

**Mitigation:** Initialize the sandbox with a skeleton project (`git init`, bare `README.md`) to reduce the blank-canvas signal. Note that [amplifying.ai](https://amplifying.ai/research/claude-code-picks) ran against 2,430 real repos — our controlled design trades eval realism for comparability.

---

## Implementation Order

1. `packages/coding-agent-benchmark` scaffold (package.json, tsconfig, envVars)
2. `sandbox/createClaudeCodeSandbox.ts` — build-snapshot script + per-run create
3. `sandbox/runClaudeCode.ts` — execute claude, capture stdout + files
4. `eval/ClaudeCodeEval.ts` — types
5. `scorers/files/` — package.json and import scorers (deterministic, no LLM needed)
6. `scorers/stdout/` — adapt app-development classifiers
7. `eval/runClaudeCodeTask.ts` + `claudeCodeBenchmarkConfig.ts` — wire into Braintrust `Eval()`
8. Validate with 3–5 test cases before full 104-case run
9. Full Phase 0 run → Braintrust
10. Build superpowers snapshot → Full Phase 1 run → Braintrust
