import {defineConfig} from "drizzle-kit";
import dotenv from "dotenv";
import path from "path";

// Also load .env specifically for this application, potentially overriding root .env values
dotenv.config({path: path.resolve(__dirname, ".env"), override: true});

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required, check .env file"
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts", // Path to your schema file
  out: "./drizzle", // Directory to output migration files
  dialect: "postgresql", // Specify PostgreSQL dialect
  dbCredentials: {
    url: process.env.DATABASE_URL, // Get connection string from env var
  },
  verbose: true,
  strict: true,
});
