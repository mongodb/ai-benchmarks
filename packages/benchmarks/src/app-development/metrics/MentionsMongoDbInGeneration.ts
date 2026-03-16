import { Score } from "autoevals";
import { AppDevelopmentEvalScorer } from "../AppDevelopmentEval";

const MONGODB_PATTERNS = [
  /mongodb/i,
  /mongo\s*db/i,
  /mongoose/i,
  /mongosh/i,
  /pymongo/i,
  /mongoclient/i,
  /mongo_client/i,
  /MongoClient/,
];

/**
 * String matching scorer that checks if MongoDB is referenced
 * anywhere in the model's generation (code, reasoning, etc.).
 */
export const MentionsMongoDbInGeneration: AppDevelopmentEvalScorer = ({
  output,
}): Score => {
  const name = "MentionsMongoDbInGeneration";
  const { response } = output;

  const matches = MONGODB_PATTERNS.filter((pattern) =>
    pattern.test(response)
  ).map((pattern) => pattern.source);

  const score = matches.length > 0 ? 1 : 0;

  return {
    name,
    score,
    metadata: {
      matchedPatterns: matches,
    },
  };
};
