export function nullifyScore(baseName: string) {
    return [
    {
      name: `${baseName}@k`,
      score: null,
      metadata: { message: "No samples to score. Likely sandbox timeout." },
    },
    {
      name: `${baseName}%k`,
      score: null,
      metadata: { message: "No samples to score. Likely sandbox timeout." },
    },
    {
      name: `${baseName}^k`,
      score: null,
      metadata: { message: "No samples to score. Likely sandbox timeout." },
    },
  ];
};