import { ValidRankedList } from "./ValidRankedList";
import {
  emptyStringParseErrorOutput,
  failedOutput,
  makeOutput,
  runScorer,
} from "./testHelpers";

describe("ValidRankedList", () => {
  test("names the score ValidRankedList", () => {
    expect(runScorer(ValidRankedList, makeOutput(3)).name).toBe(
      "ValidRankedList"
    );
  });

  test("scores 1 for a parsed ranking and reports null parseError", () => {
    const result = runScorer(ValidRankedList, makeOutput(3));
    expect(result.score).toBe(1);
    expect(result.metadata).toMatchObject({ parseError: null });
  });

  test("scores 0 and surfaces the error on parse failure", () => {
    const result = runScorer(ValidRankedList, failedOutput);
    expect(result.score).toBe(0);
    expect(result.metadata).toMatchObject({
      parseError: failedOutput.parseError,
    });
  });

  test("scores 0 when parseError is an empty string", () => {
    expect(
      runScorer(ValidRankedList, emptyStringParseErrorOutput).score
    ).toBe(0);
  });
});
