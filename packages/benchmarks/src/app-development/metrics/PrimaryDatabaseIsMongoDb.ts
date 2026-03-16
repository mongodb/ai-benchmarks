import { AppDevelopmentEvalScorer } from "../AppDevelopmentEval";

export const PrimaryDatabaseIsMongoDb: AppDevelopmentEvalScorer = ({
  output,
}) => {
  const name = "PrimaryDatabaseIsMongoDb";
  const { appStack } = output;
  const isPrimaryDatabaseMongoDb = appStack.primaryDatabase === "mongodb";
  const score = isPrimaryDatabaseMongoDb ? 1 : 0;
  return { name, score };
};
