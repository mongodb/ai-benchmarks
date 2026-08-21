# MongoDB Provisioning Benchmark

Measures coding-agent ability to provision MongoDB with a specified method
(Docker, Atlas ephemeral, Atlas CLI local, Atlas CLI cloud, apt).

Design: [docs/mongodb-provisioning/experiment-design.md](../../docs/mongodb-provisioning/experiment-design.md)

Tests are TypeScript. `pack-tests.ts` uses esbuild to inline them into the YAML
`script:` blocks AX runs. Do not stage `tests/` into the agent workspace.

```bash
cd ax-experiments/mongodb-provisioning
npm install
npm test
npm run typecheck
npm run pack
npm run pack:check
ax experiment validate mongodb-provisioning.yaml
ax experiment variants mongodb-provisioning.yaml
```

After changing a test, pack then validate. `npm run pack:check` fails if the
YAML is stale.
