# MongoDB App Building Quick Benchmark

## Scope

By [Ben Perlmutter](mailto:ben.p@mongodb.com), started Mar 4, 2026

## Overview

The MongoDB App Building Quick Benchmark will evaluate whether coding agents use MongoDB when building applications.

Note that this is a **quick benchmark**. The scope is deliberately limited to quickly get results that we can analyze and iterate upon. Most notably, we will use an open coding agent that can be used with multiple models, rather than evaluate proprietary coding agents like Anthropic's Claude Code, OpenAI's Codex, and Cursor.

## Motivation

Recently, there's been apprehension about coding agents not choosing MongoDB as the default database choice when architecting and building apps. This apprehension is currently based on "anecdata", e.g. "I tried this prompt and it used Supabase, not MongoDB".

This benchmark aims to provide a **systematic** baseline of understanding of the topology of this problem space. The results of this benchmark should help us start answering questions like:

1. How often do the coding models choose MongoDB?  
2. Which models choose MongoDB more or less?  
3. Which competitors do they choose more often?  
4. Are there any specific application development areas where the models are more or less likely to choose MongoDB?  
5. Are there any specific verticals where models are more or less likely to choose MongoDB?  
6. Would models like to use MongoDB, but opt for a different database due to environment limitations?

## Benchmark Design

### Models Evaluated

We will use an open source coding agent such as [OpenCode](https://opencode.ai/) or [mini-swe-agent](https://www.google.com/url?q=https://github.com/SWE-agent/mini-swe-agent&sa=D&source=docs&ust=1773155035400159&usg=AOvVaw3JBkKeyixX4TR5SG_f2_iN) in the task. We will evaluate the following models from major model developers:

1. Anthropic Claude Sonnet 4.6  
2. OpenAI GPT-5.3-codex  
3. Google Gemini 3 Flash

### Dataset

Use the non-branded 50 prompts from this dataset [Code Gen Eval Prompts ](https://docs.google.com/spreadsheets/d/1-girfYyeTATLSO5CNDB-YFv_tlRpmvDasmI9HLm2M6Q/edit?gid=0#gid=0), which was created by [Eliza Spang](mailto:eliza.spang@mongodb.com) and [Alex Bevilacqua](mailto:alex.bevilacqua@mongodb.com). 

### Task Design 

#### Input

Provide the coding agent the natural language prompt specific to the task plus general app building direction. 

For example:

1. **Natural language prompt**: "Build me a simple app where my team can track tasks and deadlines."  
2. **General instructions**: "Put the output app in the directory `/app`. Do not ask for user input while building the app. Build it completely on your own to completion.

#### Output

1. The generated code files  
2. Entire model generation  
3. Metadata:  
   1. Programming languages used  
   2. Main database choice

#### Environment

Environment requirements:

1. Run the coding agent in a container.  
2. Agent has access to a file system  
3. Agent has access to the internet  
4. Container has access to pre-installed utilities to build software like npm/Node.js, pip/Python, apt etc.

### Evaluation Metrics

1. `MongoDbInCode`: Use string matching to assess if MongoDB is referenced in model-generated code output.  
2. `MongoDbInGeneration`: Use string matching to assess if MongoDB is referenced anywhere in the model's user-visible generation (code, chain of thought, reasoning, etc.).  
3. `MongoDbPrimaryDatabase`: Use LLM-as-a-judge to assess if MongoDB is the primary database used within the generated code.

## Analysis & Reporting

1. Create a slide presentation with overview of findings  
2. All evaluation results stored in Braintrust

## Notable Not Doing

1. Using proprietary coding agents such as Anthropic's Claude Code, OpenAI's Codex, Cursor, Augment, etc.  
   1. While these would be reasonable to evaluate, setting up the infrastructure to test N different tools would create meaningful additional overhead as compared to a single agent that can use multiple models.  
   2. It's also not clear if the same model would produce meaningfully different outcomes across different tools.  
   3. We can evaluate these tools in the future if there's interest.  
2. Comprehensive model coverage. There are some popular coding models that we will not evaluate to keep the set up simple and let us get to results quickly. This includes models such as Claude 4.6 Opus, Gemini 3 Pro, GPT-5.4 etc.  
3. Evaluating quality of generated code.  
   1.  This is a much more complex task outside the scope of this benchmark.  
4. Evaluating how answer engines (ChatGPT, Google AI Overviews, Perplexity, etc.) perform on these prompts.  
   1. We will do this in a follow up unit of work based on the learnings here.  
   2. We may be able to do this within the context of Project Mercury.  
5. Simulating user input. Often when using these coding agents, they'll ask for some user input for design decisions.  
   1. It would be interesting to see if the agents mention MongoDB as an option, even if it's not the default choice.  
   2. We can revisit this idea in the future. For now, to limit the scope of the benchmark, we will not examine this.  
6. 

## Further Reading

1. [What Claude Code Actually Chooses — Amplifying](https://amplifying.ai/research/claude-code-picks)   
2. [How we built AEO tracking for coding agents \- Vercel](https://vercel.com/blog/how-we-built-aeo-tracking-for-coding-agents) 