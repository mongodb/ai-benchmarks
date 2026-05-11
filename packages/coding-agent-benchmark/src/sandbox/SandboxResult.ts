export type GeneratedFile = {
  path: string;
  content: string;
};

export type SandboxResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  files: GeneratedFile[];
  durationMs: number;
};
