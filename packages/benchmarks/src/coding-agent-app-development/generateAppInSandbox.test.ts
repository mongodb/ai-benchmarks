import type { Sandbox } from "@vercel/sandbox";
import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { generateAppInSandbox } from "./generateAppInSandbox";

jest.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: jest.fn(),
  },
}));

const mockCreateSandbox = VercelSandbox.create as jest.MockedFunction<
  typeof VercelSandbox.create
>;

const describeIfNotCi = process.env.CI ? describe.skip : describe;

type MockSandbox = Pick<Sandbox, "runCommand" | "stop" | "fs" | "writeFiles">;

function makeMockSandbox({
  files = {},
  mainCommandResult = {
    stdout: "agent stdout",
    stderr: "agent stderr",
    exitCode: 0,
  },
}: {
  files?: Record<string, string | { content: string; size: number }>;
  mainCommandResult?: { stdout: string; stderr: string; exitCode?: number };
} = {}): MockSandbox {
  const fileMap = new Map<string, { content: string; size: number }>();
  for (const [path, value] of Object.entries(files)) {
    const content = typeof value === "string" ? value : value.content;
    const size =
      typeof value === "string" ? Buffer.byteLength(content) : value.size;
    fileMap.set(path, { content, size });
  }

  const fs = {
    async readdir(dir: string) {
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const entriesByName = new Map<string, boolean>();

      for (const path of fileMap.keys()) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        const [name] = rest.split("/");
        const isDirectory = rest.includes("/");
        if (!entriesByName.has(name) || isDirectory) {
          entriesByName.set(name, isDirectory);
        }
      }

      if (entriesByName.size === 0) {
        throw new Error(`ENOENT: no such directory ${dir}`);
      }

      return [...entriesByName.entries()].map(([name, isDirectory]) => ({
        name,
        isDirectory: () => isDirectory,
      }));
    },
    async stat(path: string) {
      const file = fileMap.get(path);
      if (!file) throw new Error(`ENOENT: ${path}`);
      return { size: file.size, isDirectory: () => false };
    },
    async readFile(path: string) {
      const file = fileMap.get(path);
      if (!file) throw new Error(`ENOENT: ${path}`);
      return file.content;
    },
  };

  return {
    runCommand: jest.fn().mockResolvedValue({
      stdout: jest.fn().mockResolvedValue(mainCommandResult.stdout),
      stderr: jest.fn().mockResolvedValue(mainCommandResult.stderr),
      exitCode: mainCommandResult.exitCode ?? 0,
      cmdId: "test-command-id",
    }),
    writeFiles: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    fs,
  } as unknown as MockSandbox;
}

function makeAgentConfig({
  env = { AGENT_API_KEY: "test-key" },
  setupCommands = ["npm install -g test-agent"],
  mainCommand = "test-agent --run",
}: {
  env?: Record<string, string>;
  setupCommands?: string[];
  mainCommand?: string;
} = {}) {
  return {
    id: "test-agent",
    env,
    buildSetupCommands: jest.fn().mockReturnValue(setupCommands),
    buildMainCommand: jest.fn().mockReturnValue(mainCommand),
  };
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

describe("generateAppInSandbox", () => {
  const originalVercelOidcToken = process.env.VERCEL_OIDC_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VERCEL_OIDC_TOKEN = "test-oidc-token";
  });

  afterAll(() => {
    if (originalVercelOidcToken === undefined) {
      delete process.env.VERCEL_OIDC_TOKEN;
    } else {
      process.env.VERCEL_OIDC_TOKEN = originalVercelOidcToken;
    }
  });

  test("requires a Vercel OIDC token before creating a sandbox", async () => {
    delete process.env.VERCEL_OIDC_TOKEN;

    await expect(
      generateAppInSandbox({
        agent: makeAgentConfig(),
        model: "test-model",
        systemPrompt: "Build complete apps.",
        input: makeInput(),
      })
    ).rejects.toThrow("VERCEL_OIDC_TOKEN is not set");

    expect(mockCreateSandbox).not.toHaveBeenCalled();
  });

  test("creates the sandbox with expected resources, timeout, and agent environment", async () => {
    const agent = makeAgentConfig({
      env: { AGENT_API_KEY: "test-key", AGENT_BASE_URL: "https://example.com" },
    });
    const sandbox = makeMockSandbox();
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    await generateAppInSandbox({
      agent,
      model: "test-model",
      systemPrompt: "Build complete apps.",
      input: makeInput(),
    });

    expect(mockCreateSandbox).toHaveBeenCalledWith({
      resources: { vcpus: 2 },
      timeout: 3 * 60 * 60 * 1000,
      env: agent.env,
    });
  });

  test("adds the Braintrust parent span to Claude Code custom headers", async () => {
    const agent = makeAgentConfig({
      env: {
        AGENT_API_KEY: "test-key",
        ANTHROPIC_CUSTOM_HEADERS: "x-existing-header: test",
      },
    });
    const sandbox = makeMockSandbox();
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    await generateAppInSandbox({
      agent,
      model: "test-model",
      systemPrompt: "Build complete apps.",
      input: makeInput(),
      braintrustParent: "span-export-value",
    });

    expect(mockCreateSandbox).toHaveBeenCalledWith({
      resources: { vcpus: 2 },
      timeout: 3 * 60 * 60 * 1000,
      env: {
        AGENT_API_KEY: "test-key",
        ANTHROPIC_CUSTOM_HEADERS:
          "x-existing-header: test\nx-bt-parent: span-export-value",
      },
    });
  });

  test("creates the output directory before setup commands", async () => {
    const sandbox = makeMockSandbox();
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    await generateAppInSandbox({
      agent: makeAgentConfig(),
      model: "test-model",
      systemPrompt: "Build complete apps.",
      input: makeInput(),
    });

    expect(sandbox.runCommand).toHaveBeenNthCalledWith(1, {
      cmd: "sh",
      args: [
        "-c",
        "mkdir -p /app && chown -R vercel-sandbox:vercel-sandbox /app",
      ],
      sudo: true,
    });
  });

  test("runs setup commands before the main agent command", async () => {
    const agent = makeAgentConfig({
      setupCommands: ["install agent", "authenticate agent"],
      mainCommand: "run agent",
    });
    const sandbox = makeMockSandbox();
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    await generateAppInSandbox({
      agent,
      model: "test-model",
      systemPrompt: "Build complete apps.",
      input: makeInput(),
    });

    expect(agent.buildSetupCommands).toHaveBeenCalledWith(agent.env);
    expect(sandbox.runCommand).toHaveBeenNthCalledWith(2, "sh", [
      "-c",
      "install agent",
    ]);
    expect(sandbox.runCommand).toHaveBeenNthCalledWith(3, "sh", [
      "-c",
      "authenticate agent",
    ]);
    expect(sandbox.runCommand).toHaveBeenNthCalledWith(4, {
      cmd: "sh",
      args: ["-c", "run agent"],
      cwd: "/app",
      detached: true,
    });
  });

  test("writes the formatted conversation prompt to a file before running the agent", async () => {
    const agent = makeAgentConfig({ mainCommand: "run agent" });
    const sandbox = makeMockSandbox();
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    await generateAppInSandbox({
      agent,
      model: "gpt-test",
      systemPrompt: "Build complete apps.",
      input: makeInput(),
    });

    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      {
        path: "/tmp/claude-prompt.txt",
        content: `<system>
Build complete apps.
</system>
<user>
Build a bookmark manager.
</user>
<assistant>
I'll build it.
</assistant>
<user>
Use MongoDB for storage.
</user>`,
      },
    ]);
    expect(agent.buildMainCommand).toHaveBeenCalledWith(
      "/tmp/claude-prompt.txt",
      "gpt-test"
    );
  });

  test("runs the main command when there are no setup commands", async () => {
    const agent = makeAgentConfig({
      setupCommands: [],
      mainCommand: "run agent",
    });
    const sandbox = makeMockSandbox();
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    await generateAppInSandbox({
      agent,
      model: "test-model",
      systemPrompt: "Build complete apps.",
      input: makeInput(),
    });

    expect(sandbox.runCommand).toHaveBeenCalledTimes(2);
    expect(sandbox.runCommand).toHaveBeenLastCalledWith({
      cmd: "sh",
      args: ["-c", "run agent"],
      cwd: "/app",
      detached: true,
    });
  });

  test("does not fail a detached main command with an unknown exit code", async () => {
    const sandbox = makeMockSandbox();
    (sandbox.runCommand as jest.Mock)
      .mockResolvedValueOnce({
        stdout: jest.fn().mockResolvedValue(""),
        stderr: jest.fn().mockResolvedValue(""),
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        stdout: jest.fn().mockResolvedValue("agent completed"),
        stderr: jest.fn().mockResolvedValue(""),
        exitCode: null,
      });
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    await expect(
      generateAppInSandbox({
        agent: makeAgentConfig({ setupCommands: [], mainCommand: "run agent" }),
        model: "test-model",
        systemPrompt: "Build complete apps.",
        input: makeInput(),
      })
    ).resolves.toMatchObject({
      stdout: "agent completed",
      stderr: "",
    });
  });

  test("stops the sandbox after a successful run", async () => {
    const sandbox = makeMockSandbox();
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    await generateAppInSandbox({
      agent: makeAgentConfig(),
      model: "test-model",
      systemPrompt: "Build complete apps.",
      input: makeInput(),
    });

    expect(sandbox.stop).toHaveBeenCalledTimes(1);
  });

  test("stops the sandbox and propagates setup command failures", async () => {
    const setupError = new Error("setup failed");
    const sandbox = makeMockSandbox();
    (sandbox.runCommand as jest.Mock).mockRejectedValueOnce(setupError);
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    await expect(
      generateAppInSandbox({
        agent: makeAgentConfig(),
        model: "test-model",
        systemPrompt: "Build complete apps.",
        input: makeInput(),
      })
    ).rejects.toThrow(setupError);

    expect(sandbox.stop).toHaveBeenCalledTimes(1);
  });

  test("stops the sandbox and propagates main command failures", async () => {
    const mainError = new Error("main command failed");
    const sandbox = makeMockSandbox();
    (sandbox.runCommand as jest.Mock)
      .mockResolvedValueOnce({ stdout: "setup stdout", stderr: "" })
      .mockRejectedValueOnce(mainError);
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    await expect(
      generateAppInSandbox({
        agent: makeAgentConfig(),
        model: "test-model",
        systemPrompt: "Build complete apps.",
        input: makeInput(),
      })
    ).rejects.toThrow(mainError);

    expect(sandbox.stop).toHaveBeenCalledTimes(1);
  });

  test("throws stdout and stderr when the main command exits nonzero", async () => {
    const sandbox = makeMockSandbox();
    (sandbox.runCommand as jest.Mock)
      .mockResolvedValueOnce({
        stdout: jest.fn().mockResolvedValue(""),
        stderr: jest.fn().mockResolvedValue(""),
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        stdout: jest.fn().mockResolvedValue("agent stdout"),
        stderr: jest.fn().mockResolvedValue("agent stderr"),
        exitCode: 1,
      });
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    await expect(
      generateAppInSandbox({
        agent: makeAgentConfig({ setupCommands: [], mainCommand: "run agent" }),
        model: "test-model",
        systemPrompt: "Build complete apps.",
        input: makeInput(),
      })
    ).rejects.toThrow(
      "Agent command exited with code 1\nSTDOUT:\nagent stdout\nSTDERR:\nagent stderr"
    );

    expect(sandbox.stop).toHaveBeenCalledTimes(1);
  });

  test("propagates sandbox creation failures", async () => {
    const creationError = new Error("creation failed");
    mockCreateSandbox.mockRejectedValue(creationError);

    await expect(
      generateAppInSandbox({
        agent: makeAgentConfig(),
        model: "test-model",
        systemPrompt: "Build complete apps.",
        input: makeInput(),
      })
    ).rejects.toThrow(creationError);
  });

  test("throws when sandbox creation returns no sandbox", async () => {
    mockCreateSandbox.mockResolvedValue(undefined as unknown as Sandbox);

    await expect(
      generateAppInSandbox({
        agent: makeAgentConfig(),
        model: "test-model",
        systemPrompt: "Build complete apps.",
        input: makeInput(),
      })
    ).rejects.toThrow("Sandbox creation failed");
  });
});

describeIfNotCi("generateAppInSandbox light integration", () => {
  const originalVercelOidcToken = process.env.VERCEL_OIDC_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VERCEL_OIDC_TOKEN = "test-oidc-token";
  });

  afterAll(() => {
    if (originalVercelOidcToken === undefined) {
      delete process.env.VERCEL_OIDC_TOKEN;
    } else {
      process.env.VERCEL_OIDC_TOKEN = originalVercelOidcToken;
    }
  });

  test("returns command output, extracted files, and detected database libraries", async () => {
    const agent = makeAgentConfig({
      setupCommands: [],
      mainCommand: "run agent",
    });
    const sandbox = makeMockSandbox({
      files: {
        "/app/package.json": JSON.stringify({
          dependencies: { mongodb: "^6.0.0", express: "^4.0.0" },
          devDependencies: { "better-sqlite3": "^11.0.0" },
        }),
        "/app/src/index.ts": "import { MongoClient } from 'mongodb';",
        "/app/node_modules/mongodb/index.js": "ignored dependency",
      },
      mainCommandResult: {
        stdout: "created app",
        stderr: "agent warning",
      },
    });
    mockCreateSandbox.mockResolvedValue(sandbox as Sandbox);

    const result = await generateAppInSandbox({
      agent,
      model: "test-model",
      systemPrompt: "Build complete apps.",
      input: makeInput(),
    });

    expect(result).toEqual({
      files: {
        "package.json": JSON.stringify({
          dependencies: { mongodb: "^6.0.0", express: "^4.0.0" },
          devDependencies: { "better-sqlite3": "^11.0.0" },
        }),
        "src/index.ts": "import { MongoClient } from 'mongodb';",
      },
      databaseLibraries: [
        {
          library: "mongodb",
          database: "mongodb",
          packageJsonPath: "package.json",
          field: "dependencies",
        },
        {
          library: "better-sqlite3",
          database: "sqlite",
          packageJsonPath: "package.json",
          field: "devDependencies",
        },
      ],
      stdout: "created app",
      stderr: "agent warning",
    });
  });
});
