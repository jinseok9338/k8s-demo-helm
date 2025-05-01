import {serve} from "@hono/node-server";
import {Hono} from "hono";
import {cors} from "hono/cors";
import {Pool} from "pg";

const app = new Hono();

// --- Database Connection Pool ---
// Reads connection details from environment variables
// Recommended: DATABASE_URL="postgresql://user:password@host:port/database"
// Or individual variables: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Use DATABASE_URL if available
  // Or fallback to individual env vars (adjust names as needed)
  // host: process.env.PGHOST,
  // port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
  // database: process.env.PGDATABASE,
  // user: process.env.PGUSER,
  // password: process.env.PGPASSWORD,
  // ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false // Example for SSL
});

pool.on("connect", () => {
  console.log("Connected to the database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1); // Consider appropriate error handling/restart strategy
});
// --- End Database Connection Pool ---

// Apply CORS middleware to allow all origins
app.use(cors());

// Health check endpoint - let's add a DB check
app.get("/health", async (c) => {
  try {
    // Check database connection
    const client = await pool.connect();
    await client.query("SELECT 1"); // Simple query to check connection
    client.release();
    return c.json({
      status: "ok",
      message: "Backend API is healthy!",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return c.json(
      {
        status: "error",
        message: "Backend API health check failed.",
        database: "disconnected",
        error: error.message,
      },
      503
    ); // Service Unavailable
  }
});

// Simple root endpoint
app.get("/", (c) => {
  return c.text("Hello from Backend API (Hono.js)!");
});

// New endpoint to get company config by company_code
app.get("/config/:company_code", async (c) => {
  const companyCode = c.req.param("company_code");
  if (!companyCode) {
    return c.json({error: "company_code parameter is required"}, 400);
  }

  try {
    const result = await pool.query(
      "SELECT company_code, logo_url FROM company_config WHERE company_code = $1",
      [companyCode]
    );

    if (result.rows.length === 0) {
      return c.json({error: "Company configuration not found"}, 404);
    }

    return c.json(result.rows[0]);
  } catch (error) {
    console.error(`Error fetching config for ${companyCode}:`, error);
    return c.json({error: "Failed to retrieve company configuration"}, 500);
  }
});

// New endpoint for frontend
app.get("/hello-world", (c) => {
  return c.json({message: "Hello World from the Backend API! 👋"});
});

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port: port,
});
