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