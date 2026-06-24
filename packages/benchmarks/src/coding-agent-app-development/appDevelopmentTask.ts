import {
  generateAppInSandbox,
  GenerateAppInSandboxParams,
} from "./generateAppInSandbox";
import {
  CodingAgentAppDevelopmentEvalCaseInput,
  CodingAgentAppDevelopmentEvalTask,
  CodingAgentAppDevelopmentTaskOutput,
} from "./CodingAgentAppDevelopmentEval";
import { EvalHooks, EvalParameters } from "mongodb-rag-core/braintrust";

export function makeAppDevelopmentTask(
  args: Omit<GenerateAppInSandboxParams, "input">
): CodingAgentAppDevelopmentEvalTask {
  return async function appDevelopmentTask(
    input: CodingAgentAppDevelopmentEvalCaseInput,
    hooks: EvalHooks<void, any, EvalParameters>
  ) {
    const braintrustParent = await hooks.span.export();
    const { files, databaseLibraries, stdout } = await generateAppInSandbox({
      ...args,
      input,
      braintrustParent,
    });
    return {
      files,
      databaseLibraries,
      transcript: stdout,
    } satisfies CodingAgentAppDevelopmentTaskOutput;
  };
}
