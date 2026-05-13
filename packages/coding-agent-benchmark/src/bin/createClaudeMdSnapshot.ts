import "dotenv/config";
import { createClaudeMdSnapshot } from "../sandbox/createClaudeCodeSnapshot";

async function main() {
  const snapshotId = await createClaudeMdSnapshot();

  console.log(`\nSnapshot ID: ${snapshotId}`);
  console.log(`\nAdd to your .env file:`);
  console.log(`CLAUDE_CODE_CLAUDE_MD_SNAPSHOT_ID=${snapshotId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
