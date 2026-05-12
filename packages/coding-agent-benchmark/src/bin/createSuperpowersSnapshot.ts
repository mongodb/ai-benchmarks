import "dotenv/config";
import { createSuperpowersSnapshot } from "../sandbox/createClaudeCodeSnapshot";

async function main() {
  const snapshotId = await createSuperpowersSnapshot();

  console.log(`\nSnapshot ID: ${snapshotId}`);
  console.log(`\nAdd to your .env file:`);
  console.log(`CLAUDE_CODE_SUPERPOWERS_SNAPSHOT_ID=${snapshotId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
