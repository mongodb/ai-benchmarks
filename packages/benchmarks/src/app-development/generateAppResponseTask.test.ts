import { MockLanguageModelV3 } from "mongodb-rag-core/aiSdk";
import { makeGenerateAppResponseTask } from "./generateAppResponseTask";
import { AppStackClassification } from "./classifyAppStack";
import { DatabaseChoiceAnalysis } from "./analyzeDatabaseChoice";
import { SelfReflection } from "./selfReflectOnDatabaseChoice";

jest.mock("./classifyAppStack", () => ({
  ...jest.requireActual("./classifyAppStack"),
  classifyAppStack: jest.fn(),
}));

jest.mock("./analyzeDatabaseChoice", () => ({
  ...jest.requireActual("./analyzeDatabaseChoice"),
  analyzeDatabaseChoice: jest.fn(),
}));

jest.mock("./selfReflectOnDatabaseChoice", () => ({
  ...jest.requireActual("./selfReflectOnDatabaseChoice"),
  selfReflectOnDatabaseChoice: jest.fn(),
}));

import { classifyAppStack } from "./classifyAppStack";
import { analyzeDatabaseChoice } from "./analyzeDatabaseChoice";
import { selfReflectOnDatabaseChoice } from "./selfReflectOnDatabaseChoice";

const mockAppStack: AppStackClassification = {
  programmingLanguage: "typescript",
  primaryDatabase: "mongodb",
  appFramework: "express",
  ormOrDatabaseClient: "mongoose",
  frontendFramework: null,
  deploymentInfrastructure: null,
  authenticationApproach: null,
};

const mockDatabaseAnalysis: DatabaseChoiceAnalysis = {
  choseMongoDb: true,
  alternativeDatabasesConsidered: [],
  mainJustifications: ["document-model-fits-data"],
  mongoDbFitAssessment: "strong-fit",
  analysisOfChoice: "The app uses Mongoose with embedded documents.",
};

const mockSelfReflection: SelfReflection = {
  chosenDatabase: "mongodb",
  consideredMongoDb: true,
  reasonsForChoice: ["document-model-fits-data"],
  whyMongoDb: "Document model fits the data well.",
  whyNotMongoDb: null,
  mongoDbFitAssessment: "strong-fit",
  alternativesConsidered: [],
  wouldChangeChoice: false,
  reflection: "I chose MongoDB because the data is document-shaped.",
};

function makeMockModel(responseText: string) {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: "text", text: responseText }],
      usage: {
        inputTokens: { total: 10, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 50, text: 50, reasoning: 0 },
      },
      finishReason: "stop",
      sources: [],
      warnings: [],
    } as any,
  });
}

const mockHooks = {} as any;

describe("makeGenerateAppResponseTask", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (classifyAppStack as jest.Mock).mockResolvedValue(mockAppStack);
    (analyzeDatabaseChoice as jest.Mock).mockResolvedValue(mockDatabaseAnalysis);
    (selfReflectOnDatabaseChoice as jest.Mock).mockResolvedValue(mockSelfReflection);
  });

  test("returns single sample by default", async () => {
    const task = makeGenerateAppResponseTask({
      subjectModel: makeMockModel("Here's an Express + MongoDB app..."),
      judgeModel: makeMockModel("unused"),
    });

    const result = await task(
      { name: "test", messages: [{ role: "user", content: "Build an app" }] },
      mockHooks
    );

    expect(result.samples).toHaveLength(1);
    expect(result.samples[0].response).toBe(
      "Here's an Express + MongoDB app..."
    );
    expect(result.samples[0].appStack).toEqual(mockAppStack);
    expect(result.samples[0].databaseAnalysis).toEqual(mockDatabaseAnalysis);
    expect(result.samples[0].selfReflection).toEqual(mockSelfReflection);
  });

  test("returns multiple samples when sampleSize > 1", async () => {
    const task = makeGenerateAppResponseTask({
      subjectModel: makeMockModel("Here's an app..."),
      judgeModel: makeMockModel("unused"),
      sampleSize: 3,
    });

    const result = await task(
      { name: "test", messages: [{ role: "user", content: "Build an app" }] },
      mockHooks
    );

    expect(result.samples).toHaveLength(3);
    result.samples.forEach((sample) => {
      expect(sample.response).toBe("Here's an app...");
      expect(sample.appStack).toEqual(mockAppStack);
    });
  });

  test("calls classifyAppStack with judge model", async () => {
    const judgeModel = makeMockModel("unused");
    const task = makeGenerateAppResponseTask({
      subjectModel: makeMockModel("My app code..."),
      judgeModel,
    });

    await task(
      { name: "test", messages: [{ role: "user", content: "Build an app" }] },
      mockHooks
    );

    expect(classifyAppStack).toHaveBeenCalledWith({
      model: judgeModel,
      generation: "My app code...",
    });
  });

  test("calls analyzeDatabaseChoice with classified database", async () => {
    const judgeModel = makeMockModel("unused");
    const task = makeGenerateAppResponseTask({
      subjectModel: makeMockModel("My app code..."),
      judgeModel,
    });

    await task(
      { name: "test", messages: [{ role: "user", content: "Build an app" }] },
      mockHooks
    );

    expect(analyzeDatabaseChoice).toHaveBeenCalledWith({
      model: judgeModel,
      generation: "My app code...",
      classifiedDatabase: "mongodb",
    });
  });

  test("calls selfReflectOnDatabaseChoice with subject model and original messages", async () => {
    const subjectModel = makeMockModel("My app code...");
    const task = makeGenerateAppResponseTask({
      subjectModel,
      judgeModel: makeMockModel("unused"),
    });

    await task(
      { name: "test", messages: [{ role: "user", content: "Build an app" }] },
      mockHooks
    );

    expect(selfReflectOnDatabaseChoice).toHaveBeenCalledWith({
      model: subjectModel,
      originalMessages: [{ role: "user", content: "Build an app" }],
      generation: "My app code...",
    });
  });

  test("prepends system prompt when provided", async () => {
    const subjectModel = makeMockModel("My app code...");
    const task = makeGenerateAppResponseTask({
      subjectModel,
      judgeModel: makeMockModel("unused"),
      systemPrompt: "You are a coding assistant.",
    });

    await task(
      { name: "test", messages: [{ role: "user", content: "Build an app" }] },
      mockHooks
    );

    expect(selfReflectOnDatabaseChoice).toHaveBeenCalledWith({
      model: subjectModel,
      originalMessages: [
        { role: "system", content: "You are a coding assistant." },
        { role: "user", content: "Build an app" },
      ],
      generation: "My app code...",
    });
  });

  test("sampleSize calls each function the right number of times", async () => {
    const task = makeGenerateAppResponseTask({
      subjectModel: makeMockModel("code"),
      judgeModel: makeMockModel("unused"),
      sampleSize: 3,
    });

    await task(
      { name: "test", messages: [{ role: "user", content: "Build an app" }] },
      mockHooks
    );

    expect(classifyAppStack).toHaveBeenCalledTimes(3);
    expect(analyzeDatabaseChoice).toHaveBeenCalledTimes(3);
    expect(selfReflectOnDatabaseChoice).toHaveBeenCalledTimes(3);
  });
});
