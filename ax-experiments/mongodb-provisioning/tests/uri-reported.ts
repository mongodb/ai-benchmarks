import { extractMongoUris, transcriptPayloads } from "./lib.js";

export function main(): number {
  try {
    const text = transcriptPayloads();
    if (extractMongoUris(text).length === 0) {
      console.error("No MongoDB URI was found in transcript or stdout events");
      return 1;
    }
    console.log("Found a MongoDB URI in run evidence");
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
}
