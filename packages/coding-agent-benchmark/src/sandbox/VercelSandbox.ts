import { Sandbox } from "@vercel/sandbox";

type VercelSandboxService = {
  createSnapshot: (runtime: string) => Promise<Sandbox>;

  createSandbox: (snapshotId: string) => Promise<Sandbox>;
}