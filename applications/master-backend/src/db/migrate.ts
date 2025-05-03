import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {Pool} from "pg";
import "dotenv/config";

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL environment variable is required for migrations"
    );
  }

  console.log("Starting database migration...");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1, // Use a single connection for migrations
  });

  try {
    const db = drizzle(pool);

    await migrate(db, {migrationsFolder: "./drizzle"});

    console.log("Migrations applied successfully!");
  } catch (error) {
    console.error("Error applying migrations:", error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log("Migration process finished.");
  }
}

runMigrations();
