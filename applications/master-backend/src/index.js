import "dotenv/config"; // Load .env file
import {serve} from "@hono/node-server";
import {Hono} from "hono";
import {cors} from "hono/cors";
import {Pool} from "pg";

const app = new Hono();

// Database Pool (replace with your actual connection details)
let pool;
try {
  pool = new Pool({
    connectionString: process.env.MASTER_DATABASE_URL,
    // Add SSL config if needed for external connection
    // ssl: {
    //   rejectUnauthorized: false // Or configure properly with CA certs
    // }
  });
  console.log("Connected to master database pool.");
} catch (err) {
  console.error("Error creating master database pool:", err);
  // Handle error appropriately - maybe exit the process?
}

// Simple health check endpoint
app.get("/health", (c) =>
  c.json({status: "ok", message: "Master backend is running"})
);

// --- Tenant Management API Endpoints (Example Stubs) ---

// GET /api/tenant-config?namespace=<namespace>
// Purpose: Get configuration for a specific tenant based on its namespace
app.get("/api/tenant-config", async (c) => {
  const namespace = c.req.query("namespace");
  if (!namespace) {
    return c.json({error: "Missing namespace query parameter"}, 400);
  }

  console.log(`Fetching config for namespace: ${namespace}`);

  try {
    // TODO: Query the master DB to find the tenant by namespace
    // Example query (adjust table/column names):
    // const result = await pool.query('SELECT company_code, logo_url, tenant_db_connection_string FROM tenants WHERE k8s_namespace = $1', [namespace]);
    // const config = result.rows[0];

    // --- Placeholder Response ---
    // Replace with actual data from DB
    const config = {
      company_code: namespace.replace("-tenant", ""), // Example: derive code from namespace
      logo_url: `https://example.com/logos/${namespace.replace(
        "-tenant",
        ""
      )}.png`, // Example logo URL
      some_other_setting: "value",
    };
    // --- End Placeholder ---

    if (config) {
      return c.json(config);
    } else {
      return c.json(
        {error: `Configuration not found for namespace: ${namespace}`},
        404
      );
    }
  } catch (err) {
    console.error(`Error fetching config for namespace ${namespace}:`, err);
    return c.json({error: "Internal server error"}, 500);
  }
});

// TODO: Add other endpoints as needed
// POST /api/tenants (Create a new tenant - provision namespace, db, deploy apps)
// DELETE /api/tenants/:tenantId (Delete a tenant)
// PUT /api/tenants/:tenantId (Update tenant config)

const port = parseInt(process.env.PORT || "3001", 10); // Use a different port than backend-api
console.log(`Master backend server running on port ${port}`);

serve({
  fetch: app.fetch,
  port: port,
});
