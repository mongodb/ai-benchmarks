import { appDevelopmentDatasets } from "./datasets";

describe("appDevelopmentDatasets", () => {
  test("exposes the five expected dataset keys", () => {
    expect(Object.keys(appDevelopmentDatasets).sort()).toEqual([
      "all",
      "customer_success_stories_long",
      "customer_success_stories_short",
      "db_agnostic",
      "mongodb_optimal",
    ]);
  });

  test("all loads every app-development case", async () => {
    const cases = await appDevelopmentDatasets.all.getDataset();
    expect(cases).toHaveLength(104);
  });

  test("mongodb_optimal and db_agnostic partition all", async () => {
    const optimal = await appDevelopmentDatasets.mongodb_optimal.getDataset();
    const agnostic = await appDevelopmentDatasets.db_agnostic.getDataset();
    expect(optimal).toHaveLength(52);
    expect(agnostic).toHaveLength(52);
    expect(
      optimal.every((c) => c.tags?.includes("mongodb-optimal"))
    ).toBe(true);
    expect(
      agnostic.every((c) => !c.tags?.includes("mongodb-optimal"))
    ).toBe(true);
  });

  test("customer success stories load in both lengths", async () => {
    const short =
      await appDevelopmentDatasets.customer_success_stories_short.getDataset();
    const long =
      await appDevelopmentDatasets.customer_success_stories_long.getDataset();
    expect(short).toHaveLength(201);
    expect(long).toHaveLength(201);
  });

  test("preserves eval case shape and metadata", async () => {
    const [first] =
      await appDevelopmentDatasets.customer_success_stories_short.getDataset();
    expect(first.input.name).toEqual(expect.any(String));
    expect(first.input.messages[0]).toEqual({
      role: "user",
      content: expect.any(String),
    });
    expect(first.metadata).toMatchObject({
      fit: "Best-fit",
      source: "real",
      length: "short",
    });
    expect(first.metadata?.db_problem).toEqual(expect.any(String));
  });

  test("long story content is longer than the short counterpart", async () => {
    const short =
      await appDevelopmentDatasets.customer_success_stories_short.getDataset();
    const long =
      await appDevelopmentDatasets.customer_success_stories_long.getDataset();
    expect(long[0].input.messages[0].content.length).toBeGreaterThan(
      short[0].input.messages[0].content.length
    );
  });
});
