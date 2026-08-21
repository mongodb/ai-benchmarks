import { type ToolCall, toolCallRows } from "./lib.js";

export type ConnectionClassification =
  | "application-operation"
  | "readiness-only"
  | "unrecognized-candidate"
  | "no-evidence";

const COMPLETED = new Set(["completed", "success", "succeeded"]);

const EXIT_CODE_FAILURE =
  /"exit_code"\s*:\s*[1-9]|exit code[=: ]+[1-9]/i;
const CONNECT_FAILURE =
  /econnrefused|connection refused|could not connect to server|server selection timed out|serverselectiontimeouterror|unable to open database file/i;
const APPLICATION_OK = /[{,]\s*"?ok"?\s*:\s*1\b/;

const MONGO_CANDIDATE =
  /mongosh|mongodb(\+srv)?:\/\/|mongoclient|pymongo|from mongodb|require[^\n]*mongodb/i;
const MONGO_OPERATION =
  /runcommand|db\.[a-z0-9_$-]+\(|db\.[a-z0-9_$-]+\.(find|findone|insert|aggregate|count|update|delete|createindex)|\.(connect|command|find|findone|insertone|insertmany|aggregate|countdocuments|updateone|updatemany|deleteone|deletemany)\(/i;
const MONGO_START =
  /(^|[;&|\s])mongod([;&|\s]|$)|systemctl\s+start\s+mongod|service\s+mongod\s+start|docker\s+run[^\n]*mongo|docker\s+compose[^\n]*mongo|atlas\s+deployments\s+(setup|start)/i;
const MONGO_WEAK =
  /(\/dev\/tcp\/[^/ ]+\/27017|create_connection[^\n]*27017|nc\s[^\n]*27017|ss\s[^\n]*27017)/i;

function textOf(call: ToolCall): string {
  return `${call.input}\n${outputBody(call)}`.toLowerCase();
}

function outputBody(call: ToolCall): string {
  const raw = call.output;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "aggregated_output" in parsed &&
      typeof (parsed as { aggregated_output: unknown }).aggregated_output === "string"
    ) {
      return (parsed as { aggregated_output: string }).aggregated_output;
    }
  } catch {
    // Tool output is not a JSON envelope.
  }
  return raw;
}

function isCompleted(call: ToolCall): boolean {
  return COMPLETED.has(call.status.toLowerCase());
}

function processFailed(call: ToolCall): boolean {
  const status = call.status.toLowerCase();
  const text = textOf(call);
  return (
    status === "failed" ||
    status === "error" ||
    EXIT_CODE_FAILURE.test(text) ||
    CONNECT_FAILURE.test(text)
  );
}

function hasApplicationOk(call: ToolCall): boolean {
  return APPLICATION_OK.test(outputBody(call)) && !CONNECT_FAILURE.test(textOf(call));
}

function commandFailed(call: ToolCall): boolean {
  if (isCandidate(call) && isOperation(call) && hasApplicationOk(call)) {
    return false;
  }
  return processFailed(call);
}

function isSuccessfulApplicationOp(call: ToolCall): boolean {
  if (!isCandidate(call) || !isOperation(call)) {
    return false;
  }
  if (CONNECT_FAILURE.test(textOf(call))) {
    return false;
  }
  if (hasApplicationOk(call)) {
    return true;
  }
  return isCompleted(call) && !processFailed(call);
}

function isCandidate(call: ToolCall): boolean {
  return MONGO_CANDIDATE.test(call.input);
}

function isOperation(call: ToolCall): boolean {
  return MONGO_OPERATION.test(call.input);
}

function isStart(call: ToolCall): boolean {
  return MONGO_START.test(call.input);
}

function isWeak(call: ToolCall): boolean {
  return MONGO_WEAK.test(call.input);
}

export function classifyConnection(calls: ToolCall[]): ConnectionClassification {
  const lastStart = calls.reduce(
    (max, call, index) => (isStart(call) ? index : max),
    -1,
  );
  const lastSuccess = calls.reduce((max, call, index) => {
    if (index < lastStart) {
      return max;
    }
    if (isSuccessfulApplicationOp(call)) {
      return index;
    }
    return max;
  }, -1);
  const laterFailures = calls.filter(
    (call, index) =>
      index > lastSuccess &&
      commandFailed(call) &&
      isCandidate(call) &&
      isOperation(call),
  ).length;

  if (lastSuccess >= 0 && laterFailures === 0) {
    return "application-operation";
  }
  if (calls.some((call) => isCompleted(call) && !commandFailed(call) && isWeak(call))) {
    return "readiness-only";
  }
  if (calls.some((call) => isCompleted(call) && isCandidate(call))) {
    return "unrecognized-candidate";
  }
  return "no-evidence";
}

export function main(): number {
  try {
    const classification = classifyConnection(toolCallRows());
    switch (classification) {
      case "application-operation":
        console.log(
          "Found a successful mongodb application-level operation in agent tool calls",
        );
        return 0;
      case "readiness-only":
        console.error(
          "Only readiness/TCP evidence was found for mongodb; an application-level operation is required",
        );
        return 1;
      case "unrecognized-candidate":
        console.error(
          "Completed mongodb candidate calls were found, but no recognized successful application operation matched the codebook",
        );
        return 1;
      default:
        console.error(
          "No completed mongodb connection evidence was found in agent tool calls",
        );
        return 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}
