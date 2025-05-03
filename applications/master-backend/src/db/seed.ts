import {drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";
import "dotenv/config";
import * as schema from "./schema"; // Import your schema

async function seedDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL environment variable is required for seeding"
    );
  }

  console.log("Starting database seeding...");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const db = drizzle(pool, {schema});

  const tenantsToSeed = [
    {
      companyCode: "DIR",
      name: "Directory Tenant Inc.",
      companyLogoUrl: "/logos/dir-logo.png", // Example logo URL
    },
    {
      companyCode: "CHA",
      name: "Chaos Engineering Ltd.",
      companyLogoUrl: "/logos/cha-logo.png", // Example logo URL
    },
    // Add more tenants if needed
  ];

  try {
    console.log("Seeding tenants...");
    // Insert tenants, do nothing if companyCode already exists
    const result = await db
      .insert(schema.tenants)
      .values(tenantsToSeed)
      .onConflictDoNothing({target: schema.tenants.companyCode})
      .returning(); // Optional: return inserted rows

    console.log(
      `Seeding complete. Inserted/skipped ${tenantsToSeed.length} tenants.`
    );
    if (result.length > 0) {
      console.log("Newly inserted tenants:", result);
    }
  } catch (error) {
    console.error("Error during seeding:", error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log("Seeding process finished.");
  }
}

seedDatabase();
