# Coding Agent Benchmark

## Claude Code

1. Setup environment vars: Ask team. Create your own personal Vercel access token

2. Run snapshot script 

```bash
npm run create-snapshot 
```

It should auto-auth you to Vercel if you've setup the .env tokens correctly. 

Copy output to `CLAUDE_CODE_BASE_SNAPSHOT_ID` environment var in .env

3. Validate the snapshot runs properly with

```bash
npm run smoke-test
```

4. Run the eval

```bash
# Small validation run (recommended first)
LIMIT=5 npm run eval

# Full run (104 cases)
npm run eval
```

## Scorers

Each scorer emits three Braintrust metrics (`@k`, `%k`, `^k`) supporting `pass@k` / `pass%k` / `pass^k` semantics. These only differ when `SAMPLE_SIZE > 1` — with the default of 1 sample per case they are identical. The headline metric is `MongoDbInPackageJson%k` (pass rate based on generated files).

If `SAMPLE_SIZE > 1`, then these metrics represent:
- pass@k = ≥1 sample passes (useful when k=3: did it get it right at least once?)
- pass%k = fraction of samples that pass (the simple pass rate)
- pass^k = all samples pass (strict)