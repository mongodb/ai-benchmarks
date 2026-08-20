import {
  extractMongoUris,
  isAtlasCloudUri,
  methodId,
  transcriptPayloads,
} from "./lib.js";

const CLOUD_BOUND = new Set(["atlas-cli-cloud", "atlas-ephemeral"]);

export function main(): number {
  try {
    const method = methodId();
    const text = transcriptPayloads();
    if (!CLOUD_BOUND.has(method)) {
      console.log(`method-constraint is not applied for ${method}`);
      return 0;
    }
    const cloudUris = extractMongoUris(text).filter(isAtlasCloudUri);
    if (cloudUris.length === 0) {
      console.error(
        "Cloud-bound prompt requires an Atlas cloud URI (*.mongodb.net), not a local URI",
      );
      return 1;
    }
    console.log("Found an Atlas cloud URI for the cloud-bound prompt");
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}
