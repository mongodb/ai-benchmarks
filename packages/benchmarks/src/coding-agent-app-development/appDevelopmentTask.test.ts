import { makeAppDevelopmentTask } from "./appDevelopmentTask";
import { generateAppInSandbox } from "./generateAppInSandbox";

jest.mock("./generateAppInSandbox", () => ({
  generateAppInSandbox: jest.fn(),
}));

const mockGenerateAppInSandbox = generateAppInSandbox as jest.MockedFunction<
  typeof generateAppInSandbox
>;

function makeMockHooks() {
  return {
    span: {
      export: jest.fn().mockResolvedValue("span-export-value"),
    },
  } as any;
}

function makeInput() {
  return {
    name: "bookmark-app",
    messages: [
      { role: "user" as const, content: "Build a bookmark manager." },
      { role: "assistant" as const, content: "I'll build it." },
      { role: "user" as const, content: "Use MongoDB for storage." },
    ],
  };
}

function makeTaskArgs() {
  return {
    agent: {
      id: "test-agent",
      env: { AGENT_API_KEY: "test-key" },
      buildSetupCommands: jest.fn().mockReturnValue(["install test-agent"]),
      buildMainCommand: jest.fn().mockReturnValue("run test-agent"),
    },
    model: "test-model",
    systemPrompt: "Build complete apps.",
  };
}

describe("makeAppDevelopmentTask", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("calls generateAppInSandbox with task args and eval input", async () => {
    mockGenerateAppInSandbox.mockResolvedValue({
      files: {},
      databaseLibraries: [],
      stdout: "",
      stderr: "",
    });
    const args = makeTaskArgs();
    const input = makeInput();
    const hooks = makeMockHooks();

    const task = makeAppDevelopmentTask(args);
    await task(input, hooks);

    expect(hooks.span.export).toHaveBeenCalledTimes(1);
    expect(mockGenerateAppInSandbox).toHaveBeenCalledTimes(1);
    expect(mockGenerateAppInSandbox).toHaveBeenCalledWith({
      ...args,
      input,
      braintrustParent: "span-export-value",
    });
  });

  test("returns files, detected database libraries, and stdout transcript", async () => {
    const files = {
      "package.json": JSON.stringify({
        dependencies: { mongodb: "^6.0.0" },
      }),
      "src/index.ts": "import { MongoClient } from 'mongodb';",
    };
    const databaseLibraries = [
      {
        library: "mongodb",
        database: "mongodb" as const,
        packageJsonPath: "package.json",
        field: "dependencies" as const,
      },
    ];
    mockGenerateAppInSandbox.mockResolvedValue({
      files,
      databaseLibraries,
      stdout: "created a MongoDB app",
      stderr: "sandbox warning",
    });

    const task = makeAppDevelopmentTask(makeTaskArgs());
    const result = await task(makeInput(), makeMockHooks());

    expect(result).toEqual({
      files,
      databaseLibraries,
      transcript: "created a MongoDB app",
    });
    expect(result).not.toHaveProperty("stderr");
  });

  test("returns empty output fields without adding metadata", async () => {
    mockGenerateAppInSandbox.mockResolvedValue({
      files: {},
      databaseLibraries: [],
      stdout: "",
      stderr: "",
    });

    const task = makeAppDevelopmentTask(makeTaskArgs());
    const result = await task(makeInput(), makeMockHooks());

    expect(result).toEqual({
      files: {},
      databaseLibraries: [],
      transcript: "",
    });
    expect(result).not.toHaveProperty("metadata");
  });

  test("propagates sandbox generation failures", async () => {
    const generationError = new Error("sandbox failed");
    mockGenerateAppInSandbox.mockRejectedValue(generationError);

    const task = makeAppDevelopmentTask(makeTaskArgs());

    await expect(task(makeInput(), makeMockHooks())).rejects.toThrow(
      generationError
    );
  });
});
