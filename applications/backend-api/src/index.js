import {Hono} from "hono";
import {Pool} from "pg";
import {logger} from "hono/logger"; // Import Hono's built-in logger
import {HTTPException} from "hono/http-exception";
import {serve} from "@hono/node-server";

const app = new Hono();

// --- Global config and DB pool ---
let tenantConfig = null;
let pool = null;
let initError = null;

// --- Asynchronous initialization function ---
async function initializeApp() {
  console.log("Initializing database pool using environment variables.");
  try {
    // Get DB config from environment variables injected by Helm
    const dbHost = process.env.DB_HOST;
    const dbPort = parseInt(process.env.DB_PORT || "5432", 10);
    const dbUser = process.env.DB_USER;
    const dbName = process.env.DB_NAME;
    const dbPassword = process.env.DB_PASSWORD;
    const companyCode = process.env.COMPANY_CODE; // Get company code directly

    if (!dbHost || !dbUser || !dbName || !dbPassword || !companyCode) {
      throw new Error(
        "Missing required database environment variables (DB_HOST, DB_USER, DB_NAME, DB_PASSWORD) or COMPANY_CODE"
      );
    }

    // Create DB pool using environment variables
    pool = new Pool({
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      // Add other pool options if needed (e.g., max connections)
      // ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    });

    // Store company code from env var
    tenantConfig = {company_code: companyCode};
    console.log(`Using Company Code: ${tenantConfig.company_code}`);

    // Test connection
    await pool.query("SELECT NOW()");
    console.log("Successfully connected to tenant database pool.");
  } catch (err) {
    initError = `Initialization failed: ${err.message}`;
    console.error(initError, err);
    // Clean up partially initialized resources if necessary
    if (pool) await pool.end();
    pool = null;
    tenantConfig = null;
  }
}

// --- Middleware to check initialization status ---
app.use("*", async (c, next) => {
  if (initError) {
    return c.json(
      {error: "Backend initialization failed", details: initError},
      503
    ); // Service Unavailable
  }
  if (!pool || !tenantConfig) {
    return c.json({error: "Backend is still initializing"}, 503);
  }
  // Make pool and config available in context
  c.set("pool", pool);
  c.set("config", tenantConfig);
  await next();
});

// --- Apply Logger Middleware ---
app.use("*", logger()); // Apply Hono's built-in logger

// --- Routes ---

// Simple health check (does not depend on full init)
app.get("/health", (c) => c.json({status: "ok"}));

// Endpoint to return the fetched tenant config (e.g., for frontend)
app.get("/api/config", (c) => {
  const config = c.get("config");
  // Return only necessary fields for the frontend
  return c.json({
    company_code: config.company_code,
    logo_url: config.company_logo, // Use the key from master-backend response
  });
});

// Hello World example (can be removed)
app.get("/api/hello-world", (c) => {
  return c.json({message: "Hello World from the Backend API!"});
});

// Network Logs endpoint
app.get("/api/logs", async (c) => {
  const dbPool = c.get("pool");
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  if (isNaN(limit) || isNaN(offset) || limit <= 0 || offset < 0) {
    return c.json({error: "Invalid limit or offset parameter"}, 400);
  }

  try {
    const countResult = await dbPool.query("SELECT COUNT(*) FROM network_log");
    const totalLogs = parseInt(countResult.rows[0].count, 10);

    const result = await dbPool.query(
      "SELECT * FROM network_log ORDER BY log_timestamp DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    return c.json({
      totalLogs: totalLogs,
      limit: limit,
      offset: offset,
      logs: result.rows,
    });
  } catch (err) {
    console.error("Error fetching logs:", err);
    throw new HTTPException(500, {
      message: "Internal server error fetching logs",
    });
  }
});

// --- Start the server ---

// Run initialization (async, don't wait here)
initializeApp();

// --- Middleware to check initialization status ---
// (Existing middleware remains unchanged - it handles 503 responses if init fails or is pending)
app.use("*", async (c, next) => {
  if (initError) {
    return c.json(
      {error: "Backend initialization failed", details: initError},
      503
    ); // Service Unavailable
  }
  if (!pool || !tenantConfig) {
    return c.json({error: "Backend is still initializing"}, 503);
  }
  // Make pool and config available in context
  c.set("pool", pool);
  c.set("config", tenantConfig);
  await next();
});

// --- Apply Logger Middleware ---
// (Existing middleware remains unchanged)
app.use("*", logger());

// --- Routes ---
// (Existing routes remain unchanged)
app.get("/health", (c) => c.json({status: "ok"}));
// ... other routes ...

// --- Start the server immediately ---
const port = parseInt(process.env.PORT || "3000", 10);
console.log(`Backend API server configured to run on port ${port}`);
serve({fetch: app.fetch, port}); // Start server regardless of init completion status
