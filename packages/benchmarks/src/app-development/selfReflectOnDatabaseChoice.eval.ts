import "dotenv/config";
import { strict as assert } from "assert";
import { Eval, EvalScorer } from "mongodb-rag-core/braintrust";
import { BraintrustMiddleware } from "mongodb-rag-core/braintrust";
import { createOpenAI, wrapLanguageModel } from "mongodb-rag-core/aiSdk";
import { models } from "mongodb-rag-core/models";
import { assertEnvVars, BRAINTRUST_ENV_VARS } from "mongodb-rag-core";

import {
  selfReflectOnDatabaseChoice,
  SelfReflection,
} from "./selfReflectOnDatabaseChoice";
import { PrimaryDatabase } from "./classifyAppStack";
import { JustificationReason, MongoDbFitLevel } from "./analyzeDatabaseChoice";

interface SelfReflectEvalCase {
  name: string;
  input: {
    originalMessages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
    generation: string;
  };
  expected: Partial<{
    chosenDatabase: PrimaryDatabase | null;
    consideredMongoDb: boolean;
    expectedReasons: JustificationReason[];
    mongoDbFitAssessment: MongoDbFitLevel;
    whyNotMongoDbPresent: boolean;
    whyMongoDbPresent: boolean;
    wouldChangeChoice: boolean;
  }>;
  tags?: string[];
}

const evalCases: SelfReflectEvalCase[] = [
  {
    name: "Express + Mongoose — model should recognize it chose MongoDB deliberately",
    input: {
      originalMessages: [
        {
          role: "user",
          content:
            "Build me a task tracker API. Tasks have flexible metadata that varies by type, and subtasks should be nested inside parent tasks.",
        },
      ],
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
      chosenDatabase: "mongodb",
      consideredMongoDb: true,
      expectedReasons: ["document-model-fits-data", "flexible-schema-requirements"],
      mongoDbFitAssessment: "strong-fit",
      whyMongoDbPresent: true,
      whyNotMongoDbPresent: false,
      wouldChangeChoice: false,
    },
    tags: ["mongodb", "deliberate-choice"],
  },
  {
    name: "FastAPI + PyMongo — model should admit lack of justification",
    input: {
      originalMessages: [
        {
          role: "user",
          content: "Create a simple user CRUD API in Python.",
        },
      ],
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

@app.get("/users/{user_id}")
async def get_user(user_id: str):
    from bson import ObjectId
    user = db.users.find_one({"_id": ObjectId(user_id)})
    return user
\`\`\`
      `,
    },
    expected: {
      chosenDatabase: "mongodb",
      consideredMongoDb: true,
      whyMongoDbPresent: true,
      whyNotMongoDbPresent: false,
    },
    tags: ["mongodb", "default-choice"],
  },
  {
    name: "Rails + PostgreSQL — should explain why not MongoDB",
    input: {
      originalMessages: [
        {
          role: "user",
          content:
            "Build a bookstore API with Ruby on Rails. Books belong to authors, and reviews reference both books and users.",
        },
      ],
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
      chosenDatabase: "postgresql",
      whyNotMongoDbPresent: true,
      whyMongoDbPresent: false,
      expectedReasons: ["orm-or-framework-defaults-to-sql"],
    },
    tags: ["postgresql", "framework-default"],
  },
  {
    name: "User explicitly requested PostgreSQL — model should acknowledge",
    input: {
      originalMessages: [
        {
          role: "user",
          content:
            "Build a notes app using PostgreSQL and Drizzle ORM. I want to use Postgres specifically.",
        },
      ],
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
      chosenDatabase: "postgresql",
      expectedReasons: ["user-requested-other-database"],
      whyNotMongoDbPresent: true,
      whyMongoDbPresent: false,
      wouldChangeChoice: false,
    },
    tags: ["postgresql", "user-requested"],
  },
  {
    name: "Next.js + Prisma — should reflect on framework default driving choice",
    input: {
      originalMessages: [
        {
          role: "user",
          content: "Set up a blog with Next.js and Prisma. Users can create posts.",
        },
      ],
      generation: `
\`\`\`bash
npx create-next-app@latest my-blog --typescript
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
      chosenDatabase: "postgresql",
      expectedReasons: ["orm-or-framework-defaults-to-sql"],
      whyNotMongoDbPresent: true,
      whyMongoDbPresent: false,
    },
    tags: ["postgresql", "framework-default"],
  },
  {
    name: "User requested MongoDB for a CMS — model should confirm deliberate choice",
    input: {
      originalMessages: [
        {
          role: "user",
          content:
            "Build a headless CMS using MongoDB. Content types should have flexible schemas — pages, posts, and media all have different fields.",
        },
      ],
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
      chosenDatabase: "mongodb",
      consideredMongoDb: true,
      expectedReasons: ["user-requested-mongodb", "flexible-schema-requirements"],
      mongoDbFitAssessment: "strong-fit",
      whyMongoDbPresent: true,
      whyNotMongoDbPresent: false,
      wouldChangeChoice: false,
    },
    tags: ["mongodb", "user-requested"],
  },
  {
    name: "SvelteKit + Supabase — BaaS drove the choice",
    input: {
      originalMessages: [
        {
          role: "user",
          content: "Build a real-time chat app with SvelteKit and Supabase.",
        },
      ],
      generation: `
I'll use SvelteKit with Supabase for the real-time chat.

\`\`\`typescript
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

supabase
  .channel('messages')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => { messages = [...messages, payload.new]; })
  .subscribe();
\`\`\`
      `,
    },
    expected: {
      chosenDatabase: "supabase",
      expectedReasons: ["baas-platform-bundled-database"],
      whyNotMongoDbPresent: true,
      whyMongoDbPresent: false,
    },
    tags: ["supabase", "baas", "user-requested"],
  },
  {
    name: "Vague prompt, model chose MongoDB without strong signal",
    input: {
      originalMessages: [
        {
          role: "user",
          content: "Build me a simple inventory management system.",
        },
      ],
      generation: `
\`\`\`typescript
import express from 'express';
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_URI!);

const ItemSchema = new mongoose.Schema({
  name: String,
  quantity: Number,
  price: Number,
});

const Item = mongoose.model('Item', ItemSchema);
const app = express();
app.use(express.json());

app.get('/items', async (req, res) => res.json(await Item.find()));
app.post('/items', async (req, res) => res.json(await Item.create(req.body)));
app.listen(3000);
\`\`\`
      `,
    },
    expected: {
      chosenDatabase: "mongodb",
      consideredMongoDb: true,
      whyMongoDbPresent: true,
      whyNotMongoDbPresent: false,
    },
    tags: ["mongodb", "vague-prompt", "default-choice"],
  },
  {
    name: "Spring Boot + MySQL — relational data with joins",
    input: {
      originalMessages: [
        {
          role: "user",
          content:
            "Create an employee management system in Java. Employees belong to departments, and managers have direct reports.",
        },
      ],
      generation: `
Here's a Java Spring Boot REST API with MySQL.

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
      chosenDatabase: "mysql",
      expectedReasons: ["relational-data-needs-sql"],
      mongoDbFitAssessment: "weak-fit",
      whyNotMongoDbPresent: true,
      whyMongoDbPresent: false,
    },
    tags: ["mysql", "relational"],
  },
];

type SelfReflectExpected = SelfReflectEvalCase["expected"];
type SelfReflectInput = SelfReflectEvalCase["input"];

type SelfReflectScorer = EvalScorer<
  SelfReflectInput,
  SelfReflection,
  SelfReflectExpected,
  void
>;

const chosenDatabaseCorrect: SelfReflectScorer = (args) => {
  const name = "chosenDatabaseCorrect";
  if (args.expected?.chosenDatabase === undefined) {
    return { name, score: null };
  }
  const expected = args.expected.chosenDatabase;
  const actual = args.output?.chosenDatabase ?? null;
  return {
    name,
    score: expected === actual ? 1 : 0,
    metadata: { expected, actual },
  };
};

const consideredMongoDbCorrect: SelfReflectScorer = (args) => {
  const name = "consideredMongoDbCorrect";
  if (args.expected?.consideredMongoDb === undefined) {
    return { name, score: null };
  }
  return {
    name,
    score: args.expected.consideredMongoDb === args.output?.consideredMongoDb ? 1 : 0,
    metadata: {
      expected: args.expected.consideredMongoDb,
      actual: args.output?.consideredMongoDb,
    },
  };
};

const justificationReasonHit: SelfReflectScorer = (args) => {
  const name = "justificationReasonHit";
  const expectedReasons = args.expected?.expectedReasons;
  if (!expectedReasons || expectedReasons.length === 0) {
    return { name, score: null };
  }
  const actualReasons = args.output?.reasonsForChoice ?? [];
  const hit = expectedReasons.some((r) => actualReasons.includes(r));
  return {
    name,
    score: hit ? 1 : 0,
    metadata: { expectedReasons, actualReasons },
  };
};

const fitAssessmentCorrect: SelfReflectScorer = (args) => {
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

/** whyMongoDb should be non-null when expected, null when not. */
const whyMongoDbDirectionCorrect: SelfReflectScorer = (args) => {
  const name = "whyMongoDbDirectionCorrect";
  if (
    args.expected?.whyMongoDbPresent === undefined &&
    args.expected?.whyNotMongoDbPresent === undefined
  ) {
    return { name, score: null };
  }

  let correct = true;

  if (args.expected?.whyMongoDbPresent !== undefined) {
    const hasWhyMongoDb =
      args.output?.whyMongoDb != null && args.output.whyMongoDb.trim().length > 0;
    if (hasWhyMongoDb !== args.expected.whyMongoDbPresent) correct = false;
  }

  if (args.expected?.whyNotMongoDbPresent !== undefined) {
    const hasWhyNotMongoDb =
      args.output?.whyNotMongoDb != null && args.output.whyNotMongoDb.trim().length > 0;
    if (hasWhyNotMongoDb !== args.expected.whyNotMongoDbPresent) correct = false;
  }

  return {
    name,
    score: correct ? 1 : 0,
    metadata: {
      whyMongoDb: args.output?.whyMongoDb?.slice(0, 100) ?? null,
      whyNotMongoDb: args.output?.whyNotMongoDb?.slice(0, 100) ?? null,
    },
  };
};

const hasReflection: SelfReflectScorer = (args) => {
  const name = "hasReflection";
  const reflection = args.output?.reflection ?? "";
  return {
    name,
    score: reflection.trim().length > 20 ? 1 : 0,
    metadata: { reflectionLength: reflection.length },
  };
};

const scorers = [
  chosenDatabaseCorrect,
  consideredMongoDbCorrect,
  justificationReasonHit,
  fitAssessmentCorrect,
  whyMongoDbDirectionCorrect,
  hasReflection,
];

async function main() {
  const modelLabel = "gpt-4.1";
  const modelConfig = models.find((m) => m.label === modelLabel);
  assert(modelConfig, `Model ${modelLabel} not found`);

  const { BRAINTRUST_API_KEY, BRAINTRUST_ENDPOINT } = assertEnvVars({
    ...BRAINTRUST_ENV_VARS,
  });

  const openai = createOpenAI({
    apiKey: BRAINTRUST_API_KEY,
    baseURL: BRAINTRUST_ENDPOINT,
  });

  Eval("self-reflect-database-choice", {
    data: evalCases,
    experimentName: modelLabel,
    metadata: {
      description:
        "Evaluates whether a model can honestly self-reflect on its database choice",
      model: modelLabel,
    },
    maxConcurrency: modelConfig.maxConcurrency,
    timeout: 60000,
    async task(input) {
      try {
        return await selfReflectOnDatabaseChoice({
          model: wrapLanguageModel({
            model: openai.chat(modelLabel),
            middleware: [BraintrustMiddleware({ debug: true })],
          }),
          originalMessages: input.originalMessages,
          generation: input.generation,
        });
      } catch (error) {
        console.error(
          `Error reflecting: ${input.generation.slice(0, 100)}...`
        );
        console.error(error);
        throw error;
      }
    },
    scores: scorers,
  });
}

main();
