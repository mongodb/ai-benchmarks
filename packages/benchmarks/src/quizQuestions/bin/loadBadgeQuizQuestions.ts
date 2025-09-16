import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { QuizQuestionData, QuizQuestionDataSchema } from "../QuizQuestionData";
import { makeTags } from "./makeTags";

const testDataPath = path.resolve(__dirname, "..", "..", "..", "testData");
const csvFileInPath = path.resolve(testDataPath, "badge-questions.csv");
const jsonFileOutPath = path.resolve(testDataPath, "badge-questions.json");

const ANSWER_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/**
 * Validates and parses correct answers from the Answer column.
 * Only accepts single letters (A-H) that correspond to available answer columns.
 */
const parseCorrectAnswers = (answerString: string | undefined, availableColumns: string[]): string[] => {
  if (!answerString || typeof answerString !== 'string') {
    return [];
  }
  // Split by comma or whitespace, trim, and filter out empty strings
  const rawAnswers = answerString
    .split(/[,\s]+/)
    .map(answer => answer.trim())
    .filter(Boolean);
  // Validate that answers are single letters A-H that exist in available columns
  const validAnswers = rawAnswers.filter(answer => {
    return /^[A-H]$/.test(answer) && availableColumns.includes(answer);
  });
  return validAnswers;
};

/**
 * Creates an array of answer objects for a quiz question.
 * Each answer object contains the answer text, an isCorrect flag, and its label.
 * Correctness is determined by matching the label (e.g., "A") against the correctAnswers array.
 */
const createAnswersArray = (
  row: Record<string, string>, 
  answerColumns: string[], 
  correctAnswers: string[]
): { answer: string; isCorrect: boolean; label: string }[] => {
  const columnsWithContent = answerColumns.filter(label => row[label] && row[label].trim() !== "");
  return columnsWithContent.map((label) => {
    return {
      answer: row[label] || "",
      isCorrect: correctAnswers.includes(label),
      label,
    };
  });
};

// TODO: this is a hack to get the tags for the questions, using the Skill Topic name. Revisit this to find a better way to tag all questions belonging to the same skill
const assessmentNameToTagsMap = {
  'MongoDB Aggregation Fundamentals': ['aggregation'],
  'MongoDB Query Optimization Techniques': ['query'],
  "From Relational Model (SQL) to MongoDB's Document Model": ['data_modeling'],
  'MongoDB Schema Design Patterns and Antipatterns': ['data_modeling'],
  'MongoDB Advanced Schema Design Patterns and Antipatterns': ['data_modeling'],
  'MongoDB Schema Design Optimization': ['data_modeling'],
  'Building AI Agents with MongoDB': ['gen_ai'],
  'Building AI-Powered Search with MongoDB Vector Search': ['gen_ai'],
  'Building RAG Apps Using MongoDB': ['gen_ai'],
  'MongoDB Indexing Design Fundamentals': ['indexing'],
  'Monitoring MongoDB with Built-in Tools': ['monitoring_tuning_and_automation'],
  'Optimizing MongoDB Performance with Tuning Tools': ['monitoring_tuning_and_automation'],
  'CRUD Operations in MongoDB': ['query'], 
  'Search with MongoDB': ['search'],
  'Securing MongoDB Atlas: Authentication & Authorization': ['security'],
  'Securing MongoDB Self-Managed: Authentication & Authorization': ['security'],
  'MongoDB Sharding Strategies': ['sharding'],
  'Optimizing and Maintaining MongoDB Cluster Reliability': ['performance_at_scale'],
};

const parseCSV = async (filePath: string): Promise<QuizQuestionData[]> => {
  return new Promise((resolve, reject) => {
    const results: QuizQuestionData[] = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        try {
          const correctAnswers = parseCorrectAnswers(row.Answer, ANSWER_COLUMNS);
          if (row.Answer && correctAnswers.length === 0) {
            console.warn(`Warning: No valid answers found for question "${row["Question Text"]?.substring(0, 50)}...". Answer column: "${row.Answer}"`);
          }
          const assessmentName = row["Assessment"]?.trim();
          const tags = assessmentName in assessmentNameToTagsMap 
            ? assessmentNameToTagsMap[assessmentName as keyof typeof assessmentNameToTagsMap] 
            : [];
          const questionData: QuizQuestionData = QuizQuestionDataSchema.parse({
            questionText: row["Question Text"],
            title: assessmentName,
            topicType: "badge", // Defaulting topic type
            questionType: correctAnswers.length >= 2 ? "multipleCorrect" : "singleCorrect",
            answers: createAnswersArray(row, ANSWER_COLUMNS, correctAnswers),
            explanation: row["Reference"],
            tags: [...tags, ...(row["tags"] ? row["tags"].split(",") : [])],
          });
          questionData.tags = makeTags(questionData);
          results.push(questionData);
        } catch (error) {
          console.error("Validation error:", error);
        }
      })
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
};

(async () => {
  try {
    console.log("Parsing CSV file ", csvFileInPath);
    const quizQuestions = await parseCSV(csvFileInPath);
    fs.writeFileSync(
      jsonFileOutPath,
      JSON.stringify(quizQuestions, null, 2),
      "utf-8"
    );
    console.log("Quiz questions written to ", jsonFileOutPath);
  } catch (error) {
    console.error("Error parsing CSV:", error);
  }
})();
