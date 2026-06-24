# Coding Agent App Development Benchmark

This benchmark evaluates coding agents on generating full-stack applications, with focus on database choice and MongoDB usage.

## Set up

This benchmark requires a Vercel account to use [Vercel Sandbox](https://vercel.com/docs/sandbox).
For more information, you can follow the [Sandbox authentication documentation](https://vercel.com/docs/sandbox/concepts/authentication).

1. Set up the monorepo following the instructions in the [Contributor Guide](https://github.com/mongodb/ai-benchmarks/blob/main/CONTRIBUTING.md).
1. Add the Vercel `VERCEL_TEAM_ID` and `VERCEL_PROJECT_ID` environment variables to the package's `.env` file.
   You can get this from the MongoDB team's Vercel account.
1. Authenticate into Vercel and get the `VERCEL_OIDC_TOKEN`. 

   If you use the Vercel CLI command `vercel env pull`,
   this creates a `.env.local` file with the following variables:
   ```
   VERCEL_OIDC_TOKEN=<your vercel token>
   ```

   The token should be valid for 12 hours.

   Add the token from the `.env.local` file to the package's `.env` file.