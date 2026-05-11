import { LanguageModel } from "mongodb-rag-core/aiSdk";
import {
  AppStackClassification,
  classifyAppStack,
} from "../classifyAppStack";

const STDOUT_CHAR_LIMIT = 60_000;

/**
 * Classify the technology stack referenced in the coding agent's stdout
 * conversation text. Truncates very long stdout to stay within judge model
 * context. Some agents can generate very long narrations.
 */
export async function classifyStdoutAppStack({
  model,
  stdout,
}: {
  model: LanguageModel;
  stdout: string;
}): Promise<AppStackClassification> {
  const trimmed =
    stdout.length > STDOUT_CHAR_LIMIT
      ? stdout.slice(0, STDOUT_CHAR_LIMIT) + "\n\n[truncated]"
      : stdout;
  return classifyAppStack({ model, generation: trimmed });
}
