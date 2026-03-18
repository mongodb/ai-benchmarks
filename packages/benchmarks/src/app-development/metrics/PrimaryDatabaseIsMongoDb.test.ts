import { PrimaryDatabaseIsMongoDb } from "./PrimaryDatabaseIsMongoDb";
import { AppStackClassification } from "../classifyAppStack";

const defaultAppStack: AppStackClassification = {
  programmingLanguage: null,
  primaryDatabase: null,
  appFramework: null,
  ormOrDatabaseClient: null,
  frontendFramework: null,
  deploymentInfrastructure: null,
  authenticationApproach: null,
};

function makeSample(primaryDatabase: AppStackClassification["primaryDatabase"]) {
  return {
    response: "",
    appStack: { ...defaultAppStack, primaryDatabase },
    databaseAnalysis: {} as any,
    selfReflection: {} as any,
  };
}

function score(
  databases: AppStackClassification["primaryDatabase"][]
) {
  return PrimaryDatabaseIsMongoDb({
    output: { samples: databases.map(makeSample) },
  } as any) as Array<{ name: string; score: number }>;
}

describe("PrimaryDatabaseIsMongoDb", () => {
  test("single sample — all metrics are 1 when mongodb", () => {
    const results = score(["mongodb"]);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "PrimaryDatabaseIsMongoDb@k", score: 1 }),
        expect.objectContaining({ name: "PrimaryDatabaseIsMongoDb%k", score: 1 }),
        expect.objectContaining({ name: "PrimaryDatabaseIsMongoDb^k", score: 1 }),
      ])
    );
  });

  test("single sample — all metrics are 0 when not mongodb", () => {
    const results = score(["postgresql"]);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "PrimaryDatabaseIsMongoDb@k", score: 0 }),
        expect.objectContaining({ name: "PrimaryDatabaseIsMongoDb%k", score: 0 }),
        expect.objectContaining({ name: "PrimaryDatabaseIsMongoDb^k", score: 0 }),
      ])
    );
  });

  test("multiple samples — mixed results", () => {
    const results = score(["mongodb", "postgresql", "mongodb"]);
    const byName = Object.fromEntries(results.map((r) => [r.name, r.score]));

    // 2/3 pass
    expect(byName["PrimaryDatabaseIsMongoDb@k"]).toBe(1); // at least one passes
    expect(byName["PrimaryDatabaseIsMongoDb%k"]).toBeCloseTo(2 / 3, 5);
    expect(byName["PrimaryDatabaseIsMongoDb^k"]).toBeCloseTo(
      Math.pow(2 / 3, 3),
      5
    );
  });

  test("multiple samples — all pass", () => {
    const results = score(["mongodb", "mongodb", "mongodb"]);
    const byName = Object.fromEntries(results.map((r) => [r.name, r.score]));

    expect(byName["PrimaryDatabaseIsMongoDb@k"]).toBe(1);
    expect(byName["PrimaryDatabaseIsMongoDb%k"]).toBe(1);
    expect(byName["PrimaryDatabaseIsMongoDb^k"]).toBe(1);
  });

  test("multiple samples — none pass", () => {
    const results = score(["postgresql", "mysql"]);
    const byName = Object.fromEntries(results.map((r) => [r.name, r.score]));

    expect(byName["PrimaryDatabaseIsMongoDb@k"]).toBe(0);
    expect(byName["PrimaryDatabaseIsMongoDb%k"]).toBe(0);
    expect(byName["PrimaryDatabaseIsMongoDb^k"]).toBe(0);
  });

  test("null primaryDatabase counts as not mongodb", () => {
    const results = score([null]);
    const byName = Object.fromEntries(results.map((r) => [r.name, r.score]));
    expect(byName["PrimaryDatabaseIsMongoDb%k"]).toBe(0);
  });
});
