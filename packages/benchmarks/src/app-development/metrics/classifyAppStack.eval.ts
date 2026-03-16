import "dotenv/config";
import { strict as assert } from "assert";
import { Eval, EvalScorer } from "mongodb-rag-core/braintrust";
import { BraintrustMiddleware } from "mongodb-rag-core/braintrust";
import { createOpenAI, wrapLanguageModel } from "mongodb-rag-core/aiSdk";
import { models } from "mongodb-rag-core/models";
import { assertEnvVars, BRAINTRUST_ENV_VARS } from "mongodb-rag-core";

import { classifyAppStack, AppStackClassification } from "./classifyAppStack";

interface ClassifyAppStackEvalCase {
  name: string;
  /** A synthetic "model generation" that the classifier will analyze. */
  input: string;
  /** Partial expected classification — only check dimensions we care about. */
  expected: Partial<AppStackClassification>;
  tags?: string[];
}

const evalCases: ClassifyAppStackEvalCase[] = [
  {
    name: "Express + Mongoose CRUD app",
    input: `
I'll build a task tracker API using Express and MongoDB.

\`\`\`bash
npm install express mongoose dotenv
\`\`\`

\`\`\`typescript
// src/index.ts
import express from 'express';
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_URI!);

const TaskSchema = new mongoose.Schema({
  title: String,
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const Task = mongoose.model('Task', TaskSchema);

const app = express();
app.use(express.json());

app.get('/tasks', async (req, res) => {
  const tasks = await Task.find();
  res.json(tasks);
});

app.post('/tasks', async (req, res) => {
  const task = await Task.create(req.body);
  res.status(201).json(task);
});

app.listen(3000);
\`\`\`
    `,
    expected: {
      programmingLanguage: "typescript",
      primaryDatabase: "mongodb",
      appFramework: "express",
      ormOrDatabaseClient: "mongoose",
      frontendFramework: null,
    },
    tags: ["mongodb", "typescript", "express"],
  },
  {
    name: "Next.js + MongoDB Node driver fullstack app",
    input: `
Let's create a blog with Next.js and MongoDB.

\`\`\`typescript
// lib/mongodb.ts
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI!);
const db = client.db('blog');
export const posts = db.collection('posts');

// app/page.tsx
import { posts } from '@/lib/mongodb';

export default async function Home() {
  const allPosts = await posts.find().sort({ date: -1 }).toArray();
  return (
    <main>
      {allPosts.map(post => (
        <article key={post._id.toString()}>
          <h2>{post.title}</h2>
          <p>{post.body}</p>
        </article>
      ))}
    </main>
  );
}
\`\`\`

Deploy to Vercel with \`vercel deploy\`.
    `,
    expected: {
      programmingLanguage: "typescript",
      primaryDatabase: "mongodb",
      appFramework: "nextjs",
      ormOrDatabaseClient: "mongodb-driver",
      frontendFramework: "react",
      deploymentInfrastructure: "Vercel",
    },
    tags: ["mongodb", "typescript", "nextjs"],
  },
  {
    name: "Python FastAPI + PyMongo REST API",
    input: `
Here's a FastAPI app with MongoDB for storing user profiles.

\`\`\`python
# main.py
from fastapi import FastAPI
from pymongo import MongoClient
from pydantic import BaseModel

app = FastAPI()
client = MongoClient("mongodb://localhost:27017")
db = client.profiles_db

class UserProfile(BaseModel):
    name: str
    email: str
    bio: str | None = None

@app.post("/users")
async def create_user(profile: UserProfile):
    result = db.users.insert_one(profile.model_dump())
    return {"id": str(result.inserted_id)}

@app.get("/users/{user_id}")
async def get_user(user_id: str):
    from bson import ObjectId
    user = db.users.find_one({"_id": ObjectId(user_id)})
    return user
\`\`\`
    `,
    expected: {
      programmingLanguage: "python",
      primaryDatabase: "mongodb",
      appFramework: "fastapi",
      ormOrDatabaseClient: "pymongo",
      frontendFramework: null,
    },
    tags: ["mongodb", "python", "fastapi"],
  },
  {
    name: "Django + MongoDB via Beanie ODM",
    input: `
We'll use FastAPI with Beanie (MongoDB ODM built on Motor) for an async inventory system.

\`\`\`python
# models.py
from beanie import Document

class Product(Document):
    name: str
    sku: str
    quantity: int
    price: float

    class Settings:
        name = "products"

# main.py
from fastapi import FastAPI
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

app = FastAPI()

@app.on_event("startup")
async def startup():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client.inventory, document_models=[Product])
\`\`\`
    `,
    expected: {
      programmingLanguage: "python",
      primaryDatabase: "mongodb",
      appFramework: "fastapi",
      ormOrDatabaseClient: "beanie",
    },
    tags: ["mongodb", "python"],
  },

  // --- Non-MongoDB stacks ---
  {
    name: "Next.js + Prisma + PostgreSQL",
    input: `
I'll set up a Next.js app with Prisma and PostgreSQL.

\`\`\`bash
npx create-next-app@latest my-app --typescript
cd my-app
npm install prisma @prisma/client
npx prisma init
\`\`\`

\`\`\`prisma
// prisma/schema.prisma
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

\`\`\`typescript
// app/api/users/route.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function GET() {
  const users = await prisma.user.findMany({ include: { posts: true } });
  return Response.json(users);
}
\`\`\`
    `,
    expected: {
      programmingLanguage: "typescript",
      primaryDatabase: "postgresql",
      appFramework: "nextjs",
      ormOrDatabaseClient: "prisma",
      frontendFramework: "react",
    },
    tags: ["postgresql", "typescript", "nextjs"],
  },
  {
    name: "Rails + PostgreSQL + ActiveRecord",
    input: `
Let's build a simple bookstore API with Ruby on Rails.

\`\`\`bash
rails new bookstore --api --database=postgresql
cd bookstore
rails generate model Book title:string author:string isbn:string price:decimal
rails db:migrate
\`\`\`

\`\`\`ruby
# app/models/book.rb
class Book < ApplicationRecord
  validates :title, presence: true
  validates :isbn, uniqueness: true
end

# app/controllers/books_controller.rb
class BooksController < ApplicationController
  def index
    @books = Book.all
    render json: @books
  end

  def create
    @book = Book.new(book_params)
    if @book.save
      render json: @book, status: :created
    else
      render json: @book.errors, status: :unprocessable_entity
    end
  end

  private
  def book_params
    params.require(:book).permit(:title, :author, :isbn, :price)
  end
end
\`\`\`
    `,
    expected: {
      programmingLanguage: "ruby",
      primaryDatabase: "postgresql",
      appFramework: "rails",
      ormOrDatabaseClient: "activerecord",
      frontendFramework: null,
    },
    tags: ["postgresql", "ruby", "rails"],
  },
  {
    name: "Flask + SQLAlchemy + SQLite",
    input: `
A simple Flask todo app using SQLite.

\`\`\`python
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///todos.db'
db = SQLAlchemy(app)

class Todo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task = db.Column(db.String(200), nullable=False)
    done = db.Column(db.Boolean, default=False)

with app.app_context():
    db.create_all()

@app.route('/todos', methods=['GET'])
def get_todos():
    return jsonify([{'id': t.id, 'task': t.task, 'done': t.done} for t in Todo.query.all()])

@app.route('/todos', methods=['POST'])
def add_todo():
    todo = Todo(task=request.json['task'])
    db.session.add(todo)
    db.session.commit()
    return jsonify({'id': todo.id}), 201
\`\`\`
    `,
    expected: {
      programmingLanguage: "python",
      primaryDatabase: "sqlite",
      appFramework: "flask",
      ormOrDatabaseClient: "sqlalchemy",
      frontendFramework: null,
    },
    tags: ["sqlite", "python", "flask"],
  },
  {
    name: "Spring Boot + MySQL + Hibernate",
    input: `
Here's a Java Spring Boot REST API with MySQL.

\`\`\`java
// src/main/java/com/example/model/Employee.java
@Entity
@Table(name = "employees")
public class Employee {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    private String department;
}

// src/main/java/com/example/repository/EmployeeRepository.java
@Repository
public interface EmployeeRepository extends JpaRepository<Employee, Long> {
    List<Employee> findByDepartment(String department);
}

// src/main/java/com/example/controller/EmployeeController.java
@RestController
@RequestMapping("/api/employees")
public class EmployeeController {
    @Autowired
    private EmployeeRepository repository;

    @GetMapping
    public List<Employee> getAll() {
        return repository.findAll();
    }
}
\`\`\`

\`\`\`yaml
# application.yml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/employeedb
    driver-class-name: com.mysql.cj.jdbc.Driver
  jpa:
    hibernate:
      ddl-auto: update
\`\`\`
    `,
    expected: {
      programmingLanguage: "java",
      primaryDatabase: "mysql",
      appFramework: "spring-boot",
      ormOrDatabaseClient: "hibernate",
      frontendFramework: null,
    },
    tags: ["mysql", "java", "spring-boot"],
  },
  {
    name: "SvelteKit + Supabase fullstack",
    input: `
I'll use SvelteKit with Supabase for a real-time chat app.

\`\`\`bash
npx sv create chat-app
cd chat-app
npm install @supabase/supabase-js
\`\`\`

\`\`\`typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// src/routes/chat/+page.svelte
<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { onMount } from 'svelte';

  let messages = [];

  onMount(() => {
    supabase
      .channel('messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => { messages = [...messages, payload.new]; })
      .subscribe();
  });
</script>

{#each messages as msg}
  <div class="message">{msg.content}</div>
{/each}
\`\`\`
    `,
    expected: {
      programmingLanguage: "typescript",
      primaryDatabase: "supabase",
      appFramework: "sveltekit",
      frontendFramework: "svelte",
    },
    tags: ["supabase", "typescript", "sveltekit"],
  },
  {
    name: "Go Gin + MongoDB",
    input: `
Building a REST API in Go with Gin and the MongoDB Go driver.

\`\`\`go
package main

import (
    "context"
    "net/http"
    "github.com/gin-gonic/gin"
    "go.mongodb.org/mongo-driver/bson"
    "go.mongodb.org/mongo-driver/mongo"
    "go.mongodb.org/mongo-driver/mongo/options"
)

var collection *mongo.Collection

type Item struct {
    ID    string  \`json:"id" bson:"_id,omitempty"\`
    Name  string  \`json:"name" bson:"name"\`
    Price float64 \`json:"price" bson:"price"\`
}

func main() {
    client, _ := mongo.Connect(context.TODO(),
        options.Client().ApplyURI("mongodb://localhost:27017"))
    collection = client.Database("store").Collection("items")

    r := gin.Default()
    r.GET("/items", getItems)
    r.POST("/items", createItem)
    r.Run(":8080")
}

func getItems(c *gin.Context) {
    cursor, _ := collection.Find(context.TODO(), bson.D{})
    var items []Item
    cursor.All(context.TODO(), &items)
    c.JSON(http.StatusOK, items)
}
\`\`\`
    `,
    expected: {
      programmingLanguage: "go",
      primaryDatabase: "mongodb",
      appFramework: "gin",
      ormOrDatabaseClient: "mongodb-driver",
      frontendFramework: null,
    },
    tags: ["mongodb", "go", "gin"],
  },
  {
    name: "Laravel + MySQL e-commerce",
    input: `
Let's create a product catalog with Laravel.

\`\`\`bash
composer create-project laravel/laravel shop
cd shop
php artisan make:model Product -mcr
\`\`\`

\`\`\`php
// database/migrations/create_products_table.php
Schema::create('products', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->text('description');
    $table->decimal('price', 8, 2);
    $table->timestamps();
});

// app/Models/Product.php
class Product extends Model
{
    use HasFactory;
    protected $fillable = ['name', 'description', 'price'];
}

// app/Http/Controllers/ProductController.php
class ProductController extends Controller
{
    public function index()
    {
        return Product::paginate(20);
    }
}
\`\`\`

\`\`\`env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_DATABASE=shop
\`\`\`
    `,
    expected: {
      programmingLanguage: "php",
      primaryDatabase: "mysql",
      appFramework: "laravel",
      ormOrDatabaseClient: "eloquent",
      frontendFramework: null,
    },
    tags: ["mysql", "php", "laravel"],
  },
  {
    name: "Vue + Firebase fullstack",
    input: `
A real-time notes app with Vue 3 and Firebase.

\`\`\`typescript
// src/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_KEY,
  projectId: 'my-notes-app',
});

export const db = getFirestore(app);
export const auth = getAuth(app);

// src/composables/useNotes.ts
import { collection, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { ref } from 'vue';

export function useNotes() {
  const notes = ref([]);

  onSnapshot(collection(db, 'notes'), (snapshot) => {
    notes.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });

  async function addNote(text: string) {
    await addDoc(collection(db, 'notes'), { text, createdAt: new Date() });
  }

  return { notes, addNote };
}
\`\`\`
    `,
    expected: {
      programmingLanguage: "typescript",
      primaryDatabase: "firestore",
      frontendFramework: "vue",
      authenticationApproach: "Firebase Auth",
    },
    tags: ["firebase", "typescript", "vue"],
  },
  {
    name: "Rust Actix + MongoDB",
    input: `
A REST API using Actix-web with MongoDB in Rust.

\`\`\`rust
use actix_web::{web, App, HttpServer, HttpResponse};
use mongodb::{Client, Collection};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct Todo {
    title: String,
    completed: bool,
}

async fn get_todos(db: web::Data<Collection<Todo>>) -> HttpResponse {
    let cursor = db.find(None, None).await.unwrap();
    let todos: Vec<Todo> = cursor.try_collect().await.unwrap();
    HttpResponse::Ok().json(todos)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let client = Client::with_uri_str("mongodb://localhost:27017").await.unwrap();
    let collection = client.database("tododb").collection::<Todo>("todos");

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(collection.clone()))
            .route("/todos", web::get().to(get_todos))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
\`\`\`
    `,
    expected: {
      programmingLanguage: "rust",
      primaryDatabase: "mongodb",
      appFramework: "actix",
      ormOrDatabaseClient: "mongodb-driver",
      frontendFramework: null,
    },
    tags: ["mongodb", "rust", "actix"],
  },
  {
    name: "NestJS + TypeORM + PostgreSQL",
    input: `
Setting up a NestJS app with TypeORM and Postgres.

\`\`\`typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'myapp',
      entities: [User],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([User]),
  ],
})
export class AppModule {}

// users/user.entity.ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;
}
\`\`\`

Containerized with Docker and deployed on Railway.
    `,
    expected: {
      programmingLanguage: "typescript",
      primaryDatabase: "postgresql",
      appFramework: "nestjs",
      ormOrDatabaseClient: "typeorm",
      frontendFramework: null,
    },
    tags: ["postgresql", "typescript", "nestjs"],
  },
  {
    name: "Vague generation — no code, just high-level description",
    input: `
I'd recommend building this as a web application. You could use a modern JavaScript
framework for the frontend and a robust backend with a database to store user data.
Consider adding authentication for security. The app could be deployed to a cloud
platform for scalability.
    `,
    expected: {
      programmingLanguage: null,
      primaryDatabase: null,
      appFramework: null,
      ormOrDatabaseClient: null,
      frontendFramework: null,
    },
    tags: ["edge-case", "vague"],
  },
  {
    name: "Multi-database with MongoDB as primary, Redis for caching",
    input: `
Here's the architecture for our e-commerce platform.

\`\`\`typescript
// db.ts
import mongoose from 'mongoose';
import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL);
mongoose.connect(process.env.MONGODB_URI!);

// models/Product.ts
const ProductSchema = new mongoose.Schema({
  name: String,
  price: Number,
  inventory: Number,
  categories: [String],
});
export const Product = mongoose.model('Product', ProductSchema);

// routes/products.ts
app.get('/products/:id', async (req, res) => {
  const cached = await redis.get(\`product:\${req.params.id}\`);
  if (cached) return res.json(JSON.parse(cached));

  const product = await Product.findById(req.params.id);
  await redis.setex(\`product:\${product.id}\`, 3600, JSON.stringify(product));
  res.json(product);
});
\`\`\`
    `,
    expected: {
      programmingLanguage: "typescript",
      primaryDatabase: "mongodb",
      ormOrDatabaseClient: "mongoose",
    },
    tags: ["mongodb", "multi-database", "edge-case"],
  },

  // --- Hard / tricky cases ---
  {
    name: "Prisma with MongoDB provider (not PostgreSQL)",
    input: `
Setting up the project with Prisma and MongoDB.

\`\`\`prisma
// prisma/schema.prisma
datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id    String @id @default(auto()) @map("_id") @db.ObjectId
  email String @unique
  name  String
  posts Post[]
}

model Post {
  id       String @id @default(auto()) @map("_id") @db.ObjectId
  title    String
  content  String
  author   User   @relation(fields: [authorId], references: [id])
  authorId String @db.ObjectId
}
\`\`\`

\`\`\`typescript
// app/api/users/route.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function GET() {
  const users = await prisma.user.findMany({ include: { posts: true } });
  return Response.json(users);
}
\`\`\`
    `,
    expected: {
      programmingLanguage: "typescript",
      primaryDatabase: "mongodb",
      ormOrDatabaseClient: "prisma",
    },
    tags: ["mongodb", "tricky", "prisma-mongodb"],
  },
  {
    name: "Supabase mentioned in comments but SQLite actually used",
    input: `
// Originally planned to use Supabase but switched to local SQLite for simplicity
// TODO: migrate to Supabase later

\`\`\`python
import sqlite3
from flask import Flask, jsonify, request

app = Flask(__name__)

def get_db():
    conn = sqlite3.connect('app.db')
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/items', methods=['GET'])
def get_items():
    db = get_db()
    items = db.execute('SELECT * FROM items').fetchall()
    return jsonify([dict(row) for row in items])

@app.route('/items', methods=['POST'])
def create_item():
    db = get_db()
    db.execute('INSERT INTO items (name, price) VALUES (?, ?)',
               (request.json['name'], request.json['price']))
    db.commit()
    return jsonify({'status': 'created'}), 201
\`\`\`
    `,
    expected: {
      programmingLanguage: "python",
      primaryDatabase: "sqlite",
      appFramework: "flask",
      ormOrDatabaseClient: null,
      frontendFramework: null,
    },
    tags: ["tricky", "misleading-comments"],
  },
  {
    name: "TypeScript types suggest MongoDB but app uses PostgreSQL",
    input: `
Building a document management system.

\`\`\`typescript
// types.ts — we model our data as documents even though we use Postgres
interface Document {
  id: string;
  title: string;
  content: string; // stored as JSONB
  metadata: Record<string, unknown>;
  collections: string[]; // tags, not MongoDB collections
}

// db.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, text, jsonb, uuid } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  content: jsonb('content'),
  metadata: jsonb('metadata'),
  collections: text('collections').array(),
});

// api.ts
import { Hono } from 'hono';
import { db, documents } from './db';
import { eq } from 'drizzle-orm';

const app = new Hono();

app.get('/documents', async (c) => {
  const docs = await db.select().from(documents);
  return c.json(docs);
});
\`\`\`
    `,
    expected: {
      programmingLanguage: "typescript",
      primaryDatabase: "postgresql",
      appFramework: "hono",
      ormOrDatabaseClient: "drizzle",
      frontendFramework: null,
    },
    tags: ["tricky", "misleading-naming"],
  },
  {
    name: "Multiple ORMs — Mongoose for data, Prisma for auth only",
    input: `
Architecture: MongoDB via Mongoose for all core application data.
Prisma + PostgreSQL only for the auth/session layer (NextAuth requires it).

\`\`\`typescript
// lib/mongoose.ts
import mongoose from 'mongoose';
mongoose.connect(process.env.MONGODB_URI!);

const ProductSchema = new mongoose.Schema({
  name: String,
  price: Number,
  inventory: Number,
  reviews: [{ user: String, rating: Number, text: String }],
});
export const Product = mongoose.model('Product', ProductSchema);

const OrderSchema = new mongoose.Schema({
  userId: String,
  items: [{ productId: mongoose.Schema.Types.ObjectId, qty: Number }],
  total: Number,
  status: { type: String, enum: ['pending', 'shipped', 'delivered'] },
});
export const Order = mongoose.model('Order', OrderSchema);

// lib/prisma.ts — auth only
import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();

// auth.config.ts
import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from './lib/prisma';

export const { handlers, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [/* ... */],
});
\`\`\`
    `,
    expected: {
      programmingLanguage: "typescript",
      primaryDatabase: "mongodb",
      appFramework: "nextjs",
      ormOrDatabaseClient: "mongoose",
      authenticationApproach: "NextAuth",
    },
    tags: ["mongodb", "tricky", "multi-orm"],
  },
  {
    name: "Rust with raw SQL — no ORM, ambiguous database",
    input: `
\`\`\`rust
use sqlx::postgres::PgPoolOptions;
use actix_web::{web, App, HttpServer, HttpResponse};

struct AppState {
    db: sqlx::PgPool,
}

async fn get_users(data: web::Data<AppState>) -> HttpResponse {
    let users = sqlx::query_as!(
        User,
        "SELECT id, name, email FROM users WHERE active = true ORDER BY created_at DESC"
    )
    .fetch_all(&data.db)
    .await
    .unwrap();

    HttpResponse::Ok().json(users)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect("postgres://localhost/myapp")
        .await
        .unwrap();

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState { db: pool.clone() }))
            .route("/users", web::get().to(get_users))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
\`\`\`
    `,
    expected: {
      programmingLanguage: "rust",
      primaryDatabase: "postgresql",
      appFramework: "actix",
      ormOrDatabaseClient: "sqlx-rust",
      frontendFramework: null,
    },
    tags: ["tricky", "raw-sql", "rust"],
  },
];

function makeDimensionScorer(
  dimension: keyof AppStackClassification
): EvalScorer<
  string,
  AppStackClassification,
  Partial<AppStackClassification>,
  void
> {
  return (args) => {
    const name = `${dimension}Correct`;
    if (args.expected?.[dimension] === undefined) {
      return { name, score: null };
    }
    const expectedVal = args.expected[dimension];
    const outputVal = args.output?.[dimension] ?? null;

    // Case-insensitive comparison for free-text fields
    const matches =
      expectedVal === null && outputVal === null
        ? true
        : typeof expectedVal === "string" && typeof outputVal === "string"
        ? expectedVal.toLowerCase() === outputVal.toLowerCase()
        : expectedVal === outputVal;

    return {
      name,
      score: matches ? 1 : 0,
      metadata: { expected: expectedVal, actual: outputVal },
    };
  };
}

const scorers = [
  makeDimensionScorer("programmingLanguage"),
  makeDimensionScorer("primaryDatabase"),
  makeDimensionScorer("appFramework"),
  makeDimensionScorer("ormOrDatabaseClient"),
  makeDimensionScorer("frontendFramework"),
  makeDimensionScorer("deploymentInfrastructure"),
  makeDimensionScorer("authenticationApproach"),
];

async function main() {
  const judgeModelLabel = "gpt-4.1";
  const judgeModelConfig = models.find((m) => m.label === judgeModelLabel);
  assert(judgeModelConfig, `Model ${judgeModelLabel} not found`);

  const { BRAINTRUST_API_KEY, BRAINTRUST_ENDPOINT } = assertEnvVars({
    ...BRAINTRUST_ENV_VARS,
  });

  const openai = createOpenAI({
    apiKey: BRAINTRUST_API_KEY,
    baseURL: BRAINTRUST_ENDPOINT,
  });

  Eval("classify-app-stack", {
    data: evalCases,
    experimentName: judgeModelLabel,
    metadata: {
      description:
        "Evaluates whether the app stack classifier correctly identifies technology choices from model generations",
      model: judgeModelLabel,
    },
    maxConcurrency: judgeModelConfig.maxConcurrency,
    timeout: 30000,
    async task(input) {
      try {
        return await classifyAppStack({
          model: wrapLanguageModel({
            model: openai.chat(judgeModelLabel),
            middleware: [BraintrustMiddleware({ debug: true })],
          }),
          generation: input,
        });
      } catch (error) {
        console.error(`Error classifying input: ${input.slice(0, 100)}...`);
        console.error(error);
        throw error;
      }
    },
    scores: scorers,
  });
}

main();
