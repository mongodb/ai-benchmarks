import { PrimaryDatabaseIsMongoDb } from "./PrimaryDatabaseIsMongoDb";
import { AppStackClassification } from "../classifyAppStack";

function score(appStack: Partial<AppStackClassification>) {
  return PrimaryDatabaseIsMongoDb({
    output: {
      response: "",
      appStack: {
        programmingLanguage: null,
        primaryDatabase: null,
        appFramework: null,
        ormOrDatabaseClient: null,
        frontendFramework: null,
        deploymentInfrastructure: null,
        authenticationApproach: null,
        ...appStack,
      },
    },
  } as any);
}

describe("PrimaryDatabaseIsMongoDb", () => {
  test("scores 1 when primaryDatabase is mongodb", () => {
    expect(score({ primaryDatabase: "mongodb" })).toMatchObject({
      name: "PrimaryDatabaseIsMongoDb",
      score: 1,
    });
  });

  test("scores 0 when primaryDatabase is something else", () => {
    expect(score({ primaryDatabase: "postgresql" })).toMatchObject({
      score: 0,
    });
  });

  test("scores 0 when primaryDatabase is null", () => {
    expect(score({ primaryDatabase: null })).toMatchObject({
      score: 0,
    });
  });
});
