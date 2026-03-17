import "dotenv/config";
import { Eval, EvalScorer } from "mongodb-rag-core/braintrust";

import {
  analyzeDatabaseChoice,
  DatabaseChoiceAnalysis,
  JustificationReason,
  MongoDbFitLevel,
} from "./analyzeDatabaseChoice";
import { PrimaryDatabase } from "./classifyAppStack";
import { judgeModel, judgeModelConfig, judgeModelLabel } from "./config";

interface AnalyzeDatabaseChoiceEvalCase {
  name: string;
  /** The synthetic "model generation" to analyze. */
  input: {
    generation: string;
    classifiedDatabase: PrimaryDatabase | null;
  };
  /** Partial expected analysis — only check dimensions we care about. */
  expected: Partial<{
    choseMongoDb: boolean | null;
    /** At least one of these reasons should appear in mainJustifications. */
    expectedReasons: JustificationReason[];
    mongoDbFitAssessment: MongoDbFitLevel;
    /** Databases that should appear in alternativeDatabasesConsidered. */
    expectedAlternatives: PrimaryDatabase[];
  }>;
  tags?: string[];
}

const evalCases: AnalyzeDatabaseChoiceEvalCase[] = [
  // --- MongoDB chosen ---
  {
    name: "Express + Mongoose — explicit MongoDB choice with document-shaped data",
    input: {
      classifiedDatabase: "mongodb",
      generation: `
I'll build a task tracker API using Express and MongoDB. MongoDB is a great fit here
because tasks have flexible metadata — different task types can have different fields,
and we can embed subtasks directly in the parent document.

\`\`\`typescript
import express from 'express';
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_URI!);

const TaskSchema = new mongoose.Schema({
  title: String,
  completed: { type: Boolean, default: false },
  metadata: mongoose.Schema.Types.Mixed,
  subtasks: [{ title: String, done: Boolean }],
});

const Task = mongoose.model('Task', TaskSchema);
const app = express();
app.use(express.json());

app.get('/tasks', async (req, res) => {
  const tasks = await Task.find();
  res.json(tasks);
});
app.listen(3000);
\`\`\`
      `,
    },
    expected: {
      choseMongoDb: true,
      expectedReasons: [
        "document-model-fits-data",
        "mongodb-ecosystem-library",
      ],
      mongoDbFitAssessment: "strong-fit",
    },
    tags: ["mongodb", "explicit-reasoning"],
  },
  {
    name: "FastAPI + PyMongo — MongoDB chosen without explanation",
    input: {
      classifiedDatabase: "mongodb",
      generation: `
Here's the API:

\`\`\`python
from fastapi import FastAPI
from pymongo import MongoClient

app = FastAPI()
client = MongoClient("mongodb://localhost:27017")
db = client.mydb

@app.post("/users")
async def create_user(user: dict):
    result = db.users.insert_one(user)
    return {"id": str(result.inserted_id)}
\`\`\`
      `,
    },
    expected: {
      choseMongoDb: true,
      expectedReasons: ["model-default-no-justification"],
      mongoDbFitAssessment: "moderate-fit",
    },
    tags: ["mongodb", "no-justification", "bias-signal"],
  },
  {
    name: "Go + MongoDB driver — nested product catalog with reviews",
    input: {
      classifiedDatabase: "mongodb",
      generation: `
Building a product catalog API. I'm using MongoDB because products have variable
attributes per category, and reviews are naturally embedded within each product document.

\`\`\`go
package main

import (
    "context"
    "go.mongodb.org/mongo-driver/mongo"
    "go.mongodb.org/mongo-driver/mongo/options"
)

type Review struct {
    User   string  \`bson:"user"\`
    Rating float64 \`bson:"rating"\`
    Text   string  \`bson:"text"\`
}

type Product struct {
    Name       string                 \`bson:"name"\`
    Category   string                 \`bson:"category"\`
    Attributes map[string]interface{} \`bson:"attributes"\`
    Reviews    []Review               \`bson:"reviews"\`
}

func main() {
    client, _ := mongo.Connect(context.TODO(),
        options.Client().ApplyURI("mongodb://localhost:27017"))
    _ = client.Database("catalog").Collection("products")
}
\`\`\`
      `,
    },
    expected: {
      choseMongoDb: true,
      expectedReasons: [
        "document-model-fits-data",
        "hierarchical-nested-data",
        "flexible-schema-requirements",
      ],
      mongoDbFitAssessment: "strong-fit",
    },
    tags: ["mongodb", "explicit-reasoning", "nested-data"],
  },

  // --- Non-MongoDB chosen ---
  {
    name: "Rails + PostgreSQL — ORM/framework defaults drive the choice",
    input: {
      classifiedDatabase: "postgresql",
      generation: `
Let's build a simple bookstore API with Ruby on Rails.

\`\`\`bash
rails new bookstore --api --database=postgresql
rails generate model Book title:string author:string isbn:string price:decimal
rails generate model Author name:string bio:text
rails generate model Review book:references user:references rating:integer
rails db:migrate
\`\`\`

\`\`\`ruby
class Book < ApplicationRecord
  belongs_to :author
  has_many :reviews
  validates :title, presence: true
  validates :isbn, uniqueness: true
end
\`\`\`
      `,
    },
    expected: {
      choseMongoDb: false,
      expectedReasons: ["orm-or-framework-defaults-to-sql"],
      mongoDbFitAssessment: "moderate-fit",
    },
    tags: ["postgresql", "framework-default"],
  },
  {
    name: "Spring Boot + MySQL — relational schema with joins",
    input: {
      classifiedDatabase: "mysql",
      generation: `
Here's a Java Spring Boot REST API with MySQL for an employee management system.

\`\`\`java
@Entity
@Table(name = "employees")
public class Employee {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    private String email;

    @ManyToOne
    @JoinColumn(name = "department_id")
    private Department department;

    @OneToMany(mappedBy = "manager")
    private List<Employee> directReports;
}

@Entity
@Table(name = "departments")
public class Department {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;

    @OneToMany(mappedBy = "department")
    private List<Employee> employees;
}
\`\`\`

\`\`\`yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/employeedb
  jpa:
    hibernate:
      ddl-auto: update
\`\`\`
      `,
    },
    expected: {
      choseMongoDb: false,
      expectedReasons: ["relational-data-needs-sql"],
      mongoDbFitAssessment: "weak-fit",
    },
    tags: ["mysql", "relational"],
  },
  {
    name: "SvelteKit + Supabase — BaaS platform bundles its own DB",
    input: {
      classifiedDatabase: "supabase",
      generation: `
I'll use SvelteKit with Supabase for a real-time chat app.

\`\`\`typescript
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Listen for new messages in real-time
supabase
  .channel('messages')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => { messages = [...messages, payload.new]; })
  .subscribe();
\`\`\`
      `,
    },
    expected: {
      choseMongoDb: false,
      expectedReasons: ["baas-platform-bundled-database"],
      mongoDbFitAssessment: "moderate-fit",
    },
    tags: ["supabase", "baas"],
  },
  {
    name: "User explicitly requested PostgreSQL",
    input: {
      classifiedDatabase: "postgresql",
      generation: `
As you requested, I'll use PostgreSQL for this project.

\`\`\`typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

export const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  createdAt: timestamp('created_at').defaultNow(),
});
\`\`\`
      `,
    },
    expected: {
      choseMongoDb: false,
      expectedReasons: ["user-requested-other-database"],
    },
    tags: ["postgresql", "user-requested"],
  },

  // --- Edge cases ---
  {
    name: "Multi-database — MongoDB primary, Redis for caching",
    input: {
      classifiedDatabase: "mongodb",
      generation: `
Here's the architecture for our e-commerce platform.

\`\`\`typescript
import mongoose from 'mongoose';
import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL);
mongoose.connect(process.env.MONGODB_URI!);

const ProductSchema = new mongoose.Schema({
  name: String,
  price: Number,
  inventory: Number,
  categories: [String],
  variants: [{ size: String, color: String, sku: String }],
});
export const Product = mongoose.model('Product', ProductSchema);

app.get('/products/:id', async (req, res) => {
  const cached = await redis.get(\`product:\${req.params.id}\`);
  if (cached) return res.json(JSON.parse(cached));

  const product = await Product.findById(req.params.id);
  await redis.setex(\`product:\${product.id}\`, 3600, JSON.stringify(product));
  res.json(product);
});
\`\`\`
      `,
    },
    expected: {
      choseMongoDb: true,
      expectedAlternatives: ["redis"],
      mongoDbFitAssessment: "strong-fit",
    },
    tags: ["mongodb", "multi-database", "edge-case"],
  },
  {
    name: "Vague generation — no database chosen",
    input: {
      classifiedDatabase: null,
      generation: `
I'd recommend building this as a web application. You could use a modern JavaScript
framework for the frontend and a robust backend with a database to store user data.
Consider adding authentication for security. The app could be deployed to a cloud
platform for scalability.
      `,
    },
    expected: {
      choseMongoDb: null,
      expectedReasons: ["no-database-chosen"],
      mongoDbFitAssessment: "not-applicable",
    },
    tags: ["edge-case", "vague"],
  },
  {
    name: "Prisma defaults to PostgreSQL — no explicit DB reasoning",
    input: {
      classifiedDatabase: "postgresql",
      generation: `
\`\`\`bash
npx create-next-app@latest my-app --typescript
npm install prisma @prisma/client
npx prisma init
\`\`\`

\`\`\`prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  content  String
  author   User   @relation(fields: [authorId], references: [id])
  authorId Int
}
\`\`\`
      `,
    },
    expected: {
      choseMongoDb: false,
      expectedReasons: ["orm-or-framework-defaults-to-sql"],
      mongoDbFitAssessment: "weak-fit",
    },
    tags: ["postgresql", "framework-default", "no-justification"],
  },
  {
    name: "IoT time-series data — specific technical requirement",
    input: {
      classifiedDatabase: "timescaledb",
      generation: `
For the IoT sensor monitoring dashboard, we need a database optimized for time-series
data with built-in downsampling and continuous aggregates. TimescaleDB is perfect here.

\`\`\`python
import psycopg2

conn = psycopg2.connect("postgres://localhost/sensors")
cur = conn.cursor()

cur.execute("""
  CREATE TABLE sensor_readings (
    time        TIMESTAMPTZ NOT NULL,
    sensor_id   TEXT NOT NULL,
    temperature DOUBLE PRECISION,
    humidity    DOUBLE PRECISION
  );
  SELECT create_hypertable('sensor_readings', 'time');

  CREATE MATERIALIZED VIEW hourly_avg
  WITH (timescaledb.continuous) AS
  SELECT sensor_id,
         time_bucket('1 hour', time) AS bucket,
         AVG(temperature) as avg_temp
  FROM sensor_readings
  GROUP BY sensor_id, bucket;
""")
\`\`\`
      `,
    },
    expected: {
      choseMongoDb: false,
      expectedReasons: ["specific-technical-requirement"],
      mongoDbFitAssessment: "weak-fit",
    },
    tags: ["timescaledb", "specific-requirement"],
  },
  {
    name: "User explicitly requested MongoDB for a CMS",
    input: {
      classifiedDatabase: "mongodb",
      generation: `
Since you asked for MongoDB, I'll build the CMS with it. MongoDB works well here
since content types can have varying fields — blog posts, pages, and media all
have different schemas.

\`\`\`typescript
import mongoose from 'mongoose';
mongoose.connect(process.env.MONGODB_URI!);

const contentSchema = new mongoose.Schema({
  type: { type: String, enum: ['page', 'post', 'media'], required: true },
  title: String,
  slug: { type: String, unique: true },
  body: mongoose.Schema.Types.Mixed,
  metadata: mongoose.Schema.Types.Mixed,
  publishedAt: Date,
}, { timestamps: true, strict: false });

const Content = mongoose.model('Content', contentSchema);
\`\`\`
      `,
    },
    expected: {
      choseMongoDb: true,
      expectedReasons: [
        "user-requested-mongodb",
        "flexible-schema-requirements",
      ],
      mongoDbFitAssessment: "strong-fit",
    },
    tags: ["mongodb", "user-requested", "explicit-reasoning"],
  },
];

// ---------------------------------------------------------------------------
// Scorers
// ---------------------------------------------------------------------------

type AnalyzeEvalExpected = AnalyzeDatabaseChoiceEvalCase["expected"];
type AnalyzeEvalInput = AnalyzeDatabaseChoiceEvalCase["input"];

type AnalyzeScorer = EvalScorer<
  AnalyzeEvalInput,
  DatabaseChoiceAnalysis,
  AnalyzeEvalExpected,
  void
>;

/** Did the judge correctly identify whether MongoDB was chosen? */
const choseMongoDbCorrect: AnalyzeScorer = (args) => {
  const name = "choseMongoDbCorrect";
  if (args.expected?.choseMongoDb === undefined) {
    return { name, score: null };
  }
  const expected = args.expected.choseMongoDb;
  const actual = args.output?.choseMongoDb ?? null;
  return {
    name,
    score: expected === actual ? 1 : 0,
    metadata: { expected, actual },
  };
};

/**
 * Does at least one of the expected reasons appear in mainJustifications?
 * Scores 1 if any expected reason is present, 0 if none are.
 */
const justificationReasonHit: AnalyzeScorer = (args) => {
  const name = "justificationReasonHit";
  const expectedReasons = args.expected?.expectedReasons;
  if (!expectedReasons || expectedReasons.length === 0) {
    return { name, score: null };
  }
  const actualReasons = args.output?.mainJustifications ?? [];
  const hit = expectedReasons.some((r) => actualReasons.includes(r));
  return {
    name,
    score: hit ? 1 : 0,
    metadata: { expectedReasons, actualReasons },
  };
};

/**
 * Is the expected primary reason the first element of mainJustifications?
 * Stricter than justificationReasonHit — checks the top-ranked reason.
 */
const primaryReasonCorrect: AnalyzeScorer = (args) => {
  const name = "primaryReasonCorrect";
  const expectedReasons = args.expected?.expectedReasons;
  if (!expectedReasons || expectedReasons.length === 0) {
    return { name, score: null };
  }
  const topReason = args.output?.mainJustifications?.[0] ?? null;
  const hit = expectedReasons.includes(topReason as JustificationReason);
  return {
    name,
    score: hit ? 1 : 0,
    metadata: { expectedReasons, actualTopReason: topReason },
  };
};

/** Does the MongoDB fit assessment match? */
const fitAssessmentCorrect: AnalyzeScorer = (args) => {
  const name = "fitAssessmentCorrect";
  if (args.expected?.mongoDbFitAssessment === undefined) {
    return { name, score: null };
  }
  const expected = args.expected.mongoDbFitAssessment;
  const actual = args.output?.mongoDbFitAssessment ?? null;
  return {
    name,
    score: expected === actual ? 1 : 0,
    metadata: { expected, actual },
  };
};

/** Do the expected alternative databases appear in the output? */
const alternativesHit: AnalyzeScorer = (args) => {
  const name = "alternativesHit";
  const expectedAlts = args.expected?.expectedAlternatives;
  if (!expectedAlts || expectedAlts.length === 0) {
    return { name, score: null };
  }
  const actualAlts = args.output?.alternativeDatabasesConsidered ?? [];
  const allHit = expectedAlts.every((db) => actualAlts.includes(db));
  return {
    name,
    score: allHit ? 1 : 0,
    metadata: {
      expectedAlternatives: expectedAlts,
      actualAlternatives: actualAlts,
    },
  };
};

/** Does the analysis contain a non-empty explanation? */
const hasAnalysis: AnalyzeScorer = (args) => {
  const name = "hasAnalysis";
  const analysis = args.output?.analysisOfChoice ?? "";
  return {
    name,
    score: analysis.trim().length > 20 ? 1 : 0,
    metadata: { analysisLength: analysis.length },
  };
};

const scorers = [
  choseMongoDbCorrect,
  justificationReasonHit,
  primaryReasonCorrect,
  fitAssessmentCorrect,
  alternativesHit,
  hasAnalysis,
];

async function main() {
  Eval("analyze-database-choice", {
    data: evalCases,
    experimentName: judgeModelLabel,
    metadata: {
      description:
        "Evaluates whether the database choice analyzer correctly identifies why a model chose its database",
      model: judgeModelLabel,
    },
    maxConcurrency: judgeModelConfig.maxConcurrency,
    timeout: 30000,
    async task(input) {
      try {
        return await analyzeDatabaseChoice({
          model: judgeModel,
          generation: input.generation,
          classifiedDatabase: input.classifiedDatabase,
        });
      } catch (error) {
        console.error(`Error analyzing: ${input.generation.slice(0, 100)}...`);
        console.error(error);
        throw error;
      }
    },
    scores: scorers,
  });
}

main();
