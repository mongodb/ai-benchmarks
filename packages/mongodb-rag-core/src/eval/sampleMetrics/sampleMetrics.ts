/**
 * Helper functions for computing pass@k, pass^k, and pass%k metrics
 * over multiple samples of a task.
 *
 * Given n samples where c are correct (k = n):
 * - pass@k: probability at least one of k random samples passes
 * - pass%k: raw success rate (c / n)
 * - pass^k: probability of k consecutive successes — (c/n)^k
 *
 * Reference: https://www.philschmid.de/agents-pass-at-k-pass-power-k
 */

/**
 * Compute the binomial coefficient C(n, k) = n! / (k! * (n-k)!).
 * Uses iterative multiplication to avoid overflow for reasonable n.
 */
function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n - k) k = n - k;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

export interface SampleMetricsInput {
  /** Total number of samples (n). */
  total: number;
  /** Number of correct/passing samples (c). */
  correct: number;
}

/**
 * pass@k: probability that at least one of k random samples passes.
 *
 * Formula: 1 - C(n-c, k) / C(n, k)
 * When k = n, this is 1 if c > 0, 0 if c === 0.
 */
export function passAtK({ total: n, correct: c }: SampleMetricsInput): number {
  if (n === 0) return 0;
  if (c === 0) return 0;
  if (c >= n) return 1;
  return 1 - binomial(n - c, n) / binomial(n, n);
}

/**
 * pass%k: raw success rate across samples.
 *
 * Formula: c / n
 */
export function passPercentK({
  total: n,
  correct: c,
}: SampleMetricsInput): number {
  if (n === 0) return 0;
  return c / n;
}

/**
 * pass^k: probability of succeeding on all k consecutive attempts.
 *
 * Formula: (c/n)^k, where k = n (sample size).
 */
export function passPowerK({
  total: n,
  correct: c,
}: SampleMetricsInput): number {
  if (n === 0) return 0;
  return Math.pow(c / n, n);
}

export interface SampleMetricsResult {
  "pass@k": number;
  "pass%k": number;
  "pass^k": number;
  total: number;
  correct: number;
}

/**
 * Compute all three sample metrics at once.
 */
export function computeSampleMetrics(
  input: SampleMetricsInput
): SampleMetricsResult {
  return {
    "pass@k": passAtK(input),
    "pass%k": passPercentK(input),
    "pass^k": passPowerK(input),
    total: input.total,
    correct: input.correct,
  };
}
