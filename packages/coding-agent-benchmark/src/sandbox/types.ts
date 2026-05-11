export type GeneratedFile = {
  path: string;
  content: string;
};

export type ClaudeCodeRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  files: GeneratedFile[];
  durationMs: number;
};
