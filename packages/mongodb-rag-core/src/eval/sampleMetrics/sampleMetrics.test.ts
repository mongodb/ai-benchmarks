import {
  passAtK,
  passPercentK,
  passPowerK,
  computeSampleMetrics,
} from "./sampleMetrics";

describe("passAtK", () => {
  test("returns 0 when no samples pass", () => {
    expect(passAtK({ total: 5, correct: 0 })).toBe(0);
  });

  test("returns 1 when all samples pass", () => {
    expect(passAtK({ total: 5, correct: 5 })).toBe(1);
  });

  test("returns 1 when at least one sample passes and k=n", () => {
    expect(passAtK({ total: 3, correct: 1 })).toBe(1);
    expect(passAtK({ total: 3, correct: 2 })).toBe(1);
  });

  test("returns 0 for empty input", () => {
    expect(passAtK({ total: 0, correct: 0 })).toBe(0);
  });

  test("single sample — equals raw result", () => {
    expect(passAtK({ total: 1, correct: 1 })).toBe(1);
    expect(passAtK({ total: 1, correct: 0 })).toBe(0);
  });
});

describe("passPercentK", () => {
  test("returns correct proportion", () => {
    expect(passPercentK({ total: 4, correct: 2 })).toBe(0.5);
    expect(passPercentK({ total: 3, correct: 1 })).toBeCloseTo(0.333, 2);
    expect(passPercentK({ total: 5, correct: 5 })).toBe(1);
    expect(passPercentK({ total: 5, correct: 0 })).toBe(0);
  });

  test("returns 0 for empty input", () => {
    expect(passPercentK({ total: 0, correct: 0 })).toBe(0);
  });
});

describe("passPowerK", () => {
  test("returns 1 when all samples pass", () => {
    expect(passPowerK({ total: 5, correct: 5 })).toBe(1);
  });

  test("returns 0 when no samples pass", () => {
    expect(passPowerK({ total: 5, correct: 0 })).toBe(0);
  });

  test("70% rate with k=10 gives ~2.8%", () => {
    expect(passPowerK({ total: 10, correct: 7 })).toBeCloseTo(
      Math.pow(0.7, 10),
      5
    );
  });

  test("50% rate with k=2 gives 25%", () => {
    expect(passPowerK({ total: 2, correct: 1 })).toBe(0.25);
  });

  test("single sample — equals raw result", () => {
    expect(passPowerK({ total: 1, correct: 1 })).toBe(1);
    expect(passPowerK({ total: 1, correct: 0 })).toBe(0);
  });
});

describe("computeSampleMetrics", () => {
  test("returns all three metrics", () => {
    const result = computeSampleMetrics({ total: 4, correct: 3 });
    expect(result["pass@k"]).toBe(1);
    expect(result["pass%k"]).toBe(0.75);
    expect(result["pass^k"]).toBeCloseTo(Math.pow(0.75, 4), 5);
    expect(result.total).toBe(4);
    expect(result.correct).toBe(3);
  });

  test("with sampleSize=1, all three metrics are identical", () => {
    const pass = computeSampleMetrics({ total: 1, correct: 1 });
    expect(pass["pass@k"]).toBe(1);
    expect(pass["pass%k"]).toBe(1);
    expect(pass["pass^k"]).toBe(1);

    const fail = computeSampleMetrics({ total: 1, correct: 0 });
    expect(fail["pass@k"]).toBe(0);
    expect(fail["pass%k"]).toBe(0);
    expect(fail["pass^k"]).toBe(0);
  });
});
