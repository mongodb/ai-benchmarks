import "dotenv/config";
import { createBaseSnapshot } from "../sandbox/createClaudeCodeSnapshot";

async function main() {
  const snapshotId = await createBaseSnapshot();

  console.log(`\nSnapshot ID: ${snapshotId}`);
  console.log(`\nAdd to your .env file:`);
  console.log(`CLAUDE_CODE_BASE_SNAPSHOT_ID=${snapshotId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
