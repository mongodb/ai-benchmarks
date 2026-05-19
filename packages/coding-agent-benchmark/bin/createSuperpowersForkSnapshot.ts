import "dotenv/config";
import { createSuperpowersForkSnapshot } from "../src/sandbox/createClaudeCodeSnapshot";

async function main() {
  const snapshotId = await createSuperpowersForkSnapshot();

  console.log(`\nSnapshot ID: ${snapshotId}`);
  console.log(`\nAdd to your .env file:`);
  console.log(`CLAUDE_CODE_SUPERPOWERS_FORK_SNAPSHOT_ID=${snapshotId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
