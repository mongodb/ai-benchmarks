# Deep Research Plan: LLM Database Choice Bias

## Context

We ran a benchmark measuring how frontier LLMs (Claude Sonnet 4.6, Gemini 3 Flash, GPT-5.4) choose databases when generating full-stack applications. Key findings:

- All models default to SQL databases (PostgreSQL, SQLite) in >96% of cases, even when MongoDB is the better fit.
- Prompting models to "consider alternatives" doesn't change behavior.
- Models rationalize defaults as deliberate technical decisions in self-reflection.

We want to understand: **Is this a known problem? What are others doing about it? What does the academic and industry literature say about technology bias in LLM code generation?**

## Research Questions

### 1. Training data bias in code generation models

- Is there published research quantifying the distribution of technologies (databases, frameworks, languages) in common code training corpora (The Stack, GitHub public repos, StackOverflow)?
- How does the frequency of a technology in training data correlate with how often models recommend or use it in generation?
- Are there studies specifically about database representation in training data — e.g. what fraction of code examples use PostgreSQL vs MongoDB vs DynamoDB vs Redis?
- Has anyone measured whether models trained on different corpora (e.g. StarCoder vs Codex vs CodeLlama) exhibit different technology preferences?

### 2. Technology recommendation bias in LLMs

- Are there benchmarks or studies evaluating LLMs' technology choice behavior — not just code correctness, but whether they select appropriate tools for the task?
- Has anyone studied "default stack" behavior — models gravitating toward the most common stack (React + Node + PostgreSQL) regardless of requirements?
- Is there research on LLM sycophancy or anchoring in the context of technical recommendations — do models stick to what they "know" rather than what's best?
- Are there studies comparing LLM technology recommendations to expert human recommendations for the same tasks?

### 3. ORM and framework lock-in effects

- Is there research on how ORM/framework choice in generated code deterministically implies database choice?
- Has anyone studied the causal chain: training data → default ORM → default database in code generation?
- Are there papers about "tool coupling" in LLM outputs — where choosing one technology constrains downstream choices?

### 4. Interventions that shift LLM technology preferences

- **Prompt engineering:** Are there studies showing that specific prompt strategies can reliably change which technologies a model recommends? What prompt designs work vs don't?
- **Fine-tuning / RLHF:** Has anyone fine-tuned code generation models to prefer specific technologies or to be more balanced in technology recommendations?
- **RAG / retrieval augmentation:** Does providing relevant documentation (e.g. MongoDB docs for a document-oriented task) change the model's database choice? Are there studies on RAG for technology selection?
- **System prompt interventions:** Is there research on how system prompts affect technology bias in code generation — not just output quality, but technology choice?

### 5. LLM self-reflection and rationalization

- Is there research on LLM rationalization — models generating plausible-sounding but inaccurate explanations for their own behavior?
- Has anyone studied the gap between LLM-stated reasoning and actual decision factors in code generation specifically?
- Are there papers on "confabulation" in the context of technical decision-making — models claiming to have considered options they didn't?
- Is there work on faithfulness of chain-of-thought reasoning in code generation tasks?

### 6. Commercial and ecosystem implications

- Are database vendors or cloud providers studying LLM technology bias as a go-to-market concern?
- Are there blog posts, talks, or reports from MongoDB, Supabase, PlanetScale, Neon, or other database companies about LLM-driven developer adoption?
- Has anyone published about the "LLM as technology advisor" phenomenon — developers using ChatGPT/Copilot to choose their stack?
- Are there developer surveys quantifying how often LLMs influence technology choices in new projects?

### 7. Benchmarking methodology for technology choice evaluation

- How do existing code generation benchmarks (HumanEval, MBPP, SWE-bench, LiveCodeBench) handle technology choice, if at all?
- Are there benchmarks specifically designed to evaluate technology selection rather than code correctness?
- Is there prior work on using LLM-as-judge for evaluating technology decisions (as opposed to code quality)?
- What are the best practices for designing ground-truth labels for "right technology for the job" — is this inherently subjective, and how do others handle it?

## Search Strategy

For each research question above, search:

1. **Academic papers** — arXiv, Semantic Scholar, ACL Anthology, ICSE/FSE proceedings. Keywords: "code generation bias," "LLM technology preference," "training data distribution code," "LLM rationalization," "code generation benchmark."
2. **Industry blogs and reports** — MongoDB engineering blog, OpenAI blog, Anthropic research, Google AI blog, major database vendor blogs. Look for posts about LLM-driven developer workflows.
3. **Developer community** — Hacker News discussions, Reddit r/programming and r/MachineLearning, Twitter/X threads from ML researchers and developer advocates. Often the most candid takes on LLM bias in practice.
4. **Conference talks** — Strange Loop, QCon, AI Engineer Summit, MongoDB .local — talks about LLMs for developer tooling, technology advisory, or code generation bias.

## Expected Deliverable

A structured summary organized by research question, with:
- Key findings from each source (2–3 sentences per source)
- Direct links to papers, blog posts, or discussions
- Assessment of relevance to our specific benchmark results
- Gaps identified — questions where no prior work exists (these are potential publication opportunities)
