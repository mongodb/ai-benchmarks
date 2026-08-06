import { appDevelopmentDatasets } from "./datasets";

const NOTABLE_CUSTOMER_SUCCESS_STORIES = [
  "task_0037",
  "task_0009",
  "task_0086",
  "task_0104",
  "task_0056",
  "task_0016",
  "task_0021",
  "task_0064",
];

describe("appDevelopmentDatasets", () => {
  test("exposes the seven expected dataset keys", () => {
    expect(Object.keys(appDevelopmentDatasets).sort()).toEqual([
      "all",
      "customer_success_stories_long",
      "customer_success_stories_notable_long",
      "customer_success_stories_notable_short",
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

  test("notable customer success stories (short) load only the notable ids", async () => {
    const notable =
      await appDevelopmentDatasets.customer_success_stories_notable_short.getDataset();
    expect(notable).toHaveLength(NOTABLE_CUSTOMER_SUCCESS_STORIES.length);
    expect(
      notable.every(
        (c) =>
          typeof c.metadata.id === "string" &&
          NOTABLE_CUSTOMER_SUCCESS_STORIES.includes(c.metadata.id)
      )
    ).toBe(true);
  });

  test("notable customer success stories (long) load only the notable ids", async () => {
    const notable =
      await appDevelopmentDatasets.customer_success_stories_notable_long.getDataset();
    expect(notable).toHaveLength(NOTABLE_CUSTOMER_SUCCESS_STORIES.length);
    expect(
      notable.every(
        (c) =>
          typeof c.metadata.id === "string" &&
          NOTABLE_CUSTOMER_SUCCESS_STORIES.includes(c.metadata.id)
      )
    ).toBe(true);
  });
});
