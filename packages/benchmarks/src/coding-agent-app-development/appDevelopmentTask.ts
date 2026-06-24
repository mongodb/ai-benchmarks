import {
  generateAppInSandbox,
  GenerateAppInSandboxParams,
} from "./generateAppInSandbox";
import {
  CodingAgentAppDevelopmentEvalCaseInput,
  CodingAgentAppDevelopmentEvalTask,
  CodingAgentAppDevelopmentTaskOutput,
} from "./CodingAgentAppDevelopmentEval";

export function makeAppDevelopmentTask(
  args: Omit<GenerateAppInSandboxParams, "input">
): CodingAgentAppDevelopmentEvalTask {
  return async function appDevelopmentTask(
    input: CodingAgentAppDevelopmentEvalCaseInput
  ) {
    const { files, databaseLibraries, stdout } = await generateAppInSandbox({
      ...args,
      input,
    });
    return {
      files,
      databaseLibraries,
      transcript: stdout,
    } satisfies CodingAgentAppDevelopmentTaskOutput;
  };
}
