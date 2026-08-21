import {
  chmodSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import * as esbuild from "esbuild";

const ROOT = import.meta.dirname;
const YAML_PATH = join(ROOT, "mongodb-provisioning.yaml");

const TESTS = {
  "uri-reported": "tests/uri-reported.ts",
  "connection-verified-in-agent": "tests/connection-verified.ts",
  "method-constraint": "tests/method-constraint.ts",
} as const;

export function bundle(entry: string): string {
  const result = esbuild.buildSync({
    absWorkingDir: ROOT,
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    minify: false,
    legalComments: "none",
    footer: { js: "\nprocess.exit(module.exports.main());\n" },
  });
  const file = result.outputFiles[0];
  if (!file) {
    throw new Error(`esbuild produced no output for ${entry}`);
  }
  return `${file.text.replace(/\s+$/u, "")}\n`;
}

function wrapScript(js: string): string {
  const lines = [
    "set -euo pipefail",
    'command -v node >/dev/null || { echo "node missing in test sandbox" >&2; exit 1; }',
    "node - <<'AXP_PACKED_JS'",
    ...js.replace(/\s+$/u, "").split("\n"),
    "AXP_PACKED_JS",
  ];
  return lines
    .map((line) => (line.length === 0 ? "" : `      ${line}`))
    .join("\n")
    .replace(/[ \t]+$/gm, "");
}

function splicePacked(yaml: string, name: string, body: string): string {
  const begin = `# BEGIN PACKED:${name}`;
  const end = `# END PACKED:${name}`;
  const beginAt = yaml.indexOf(begin);
  const endAt = yaml.indexOf(end);
  if (beginAt < 0 || endAt < 0 || endAt <= beginAt) {
    throw new Error(`missing or invalid pack markers for ${name}`);
  }
  const bodyStart = yaml.indexOf("\n", beginAt) + 1;
  return `${yaml.slice(0, bodyStart)}${body}\n${yaml.slice(endAt)}`;
}

export function renderPackedYaml(
  yaml = readFileSync(YAML_PATH, "utf8")
): string {
  let rendered = yaml;
  for (const [name, entry] of Object.entries(TESTS)) {
    rendered = splicePacked(rendered, name, wrapScript(bundle(entry)));
  }
  return `${rendered
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n*$/u, "")}\n`;
}

function pack(): void {
  const rendered = renderPackedYaml();
  const mode = statSync(YAML_PATH).mode;
  const tmpPath = join(ROOT, `.mongodb-provisioning.yaml.${process.pid}`);
  try {
    writeFileSync(tmpPath, rendered);
    chmodSync(tmpPath, mode & 0o777);
    renameSync(tmpPath, YAML_PATH);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore cleanup
    }
    throw error;
  }
  for (const name of Object.keys(TESTS)) {
    console.log(`packed ${name} <- ${TESTS[name as keyof typeof TESTS]}`);
  }
  console.log(`done: ${YAML_PATH}`);
  console.log(`next: ax experiment validate ${YAML_PATH}`);
}

function check(): void {
  const current = readFileSync(YAML_PATH, "utf8");
  const rendered = renderPackedYaml();
  if (rendered !== current) {
    console.error(`${YAML_PATH} is stale; run npm run pack`);
    process.exit(1);
  }
  console.log(`packed tests are current: ${YAML_PATH}`);
}

const isCli = /pack-tests\.ts$/.test(process.argv[1] ?? "");
if (isCli) {
  const cliMode = process.argv[2] ?? "pack";
  if (cliMode !== "pack" && cliMode !== "--check") {
    console.error("usage: tsx pack-tests.ts [--check]");
    process.exit(2);
  }
  try {
    if (cliMode === "--check") {
      check();
    } else {
      pack();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
