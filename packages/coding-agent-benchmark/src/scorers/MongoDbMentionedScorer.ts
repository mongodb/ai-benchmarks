import { computeSampleMetrics } from "mongodb-rag-core/eval";
import { Score } from "autoevals";
import type {
  CodingAgentEvalScorer,
  CodingAgentSample,
} from "../eval/CodingAgentEval";
import {
  PrimaryDatabaseFromFilesIsMongoDb,
  MongoDbInPackageJson,
  MongoDbInImports,
} from "./files";
import {
  MentionsMongoDbInStdout,
  PrimaryDatabaseFromStdoutIsMongoDb,
} from "./stdout";

  /**
 * Passes per-sample if ANY individual MongoDB signal fires for that sample:
 * - stdout mentions MongoDB (string match)
 * - stdout classification identifies MongoDB as primary database
 * - package.json declares a MongoDB dependency
 * - a source file imports a MongoDB driver/ORM
 * - file classification identifies MongoDB as primary database
 */
export const MongoDbMentioned: CodingAgentEvalScorer = (args) => {
  const name = "MongoDbMentioned";
  const total = args.output.samples.length;

  const subScorers = [
    MentionsMongoDbInStdout(args),
    PrimaryDatabaseFromStdoutIsMongoDb(args),
    MongoDbInPackageJson(args),
    MongoDbInImports(args),
    PrimaryDatabaseFromFilesIsMongoDb(args),
  ] as Score[][];

  // // Each sub-scorer returns [@k, %k, ^k]; perSample lives on metadata of each.
  // const subPerSample = subScorers.map(
  //   (scores) =>
  //     (scores[0]?.metadata as { perSample: Array<{ pass: boolean }> }).perSample
  // );

  // const perSample = Array.from({ length: total }, (_, i) => ({
  //   pass: subPerSample.some((s) => s[i]?.pass === true),
  // }));
  // const correct = perSample.filter((s) => s.pass).length;
  // const metrics = computeSampleMetrics({ total, correct });

  return [
    ...subScorers.flat(),
    // TODO: Work on these holistic metrics later. 
    // It's a bigger lift than expected to handle the `null`s correctly, b/c 
    // we can't just iterate cleanly over the sampleResults.
    // { name: `${name}@k`, score: metrics["pass@k"], metadata: { ...metrics, perSample } },
    // { name: `${name}%k`, score: metrics["pass%k"], metadata: { ...metrics, perSample } },
    // { name: `${name}^k`, score: metrics["pass^k"], metadata: { ...metrics, perSample } },
  ];
};
