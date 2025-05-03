// applications/backend-api/knexfile.js
// eslint-disable-next-line @typescript-eslint/no-var-requires
// require('dotenv').config({ path: '../../.env' }); // .env is usually not available in the container, rely on K8s env vars

module.exports = {
  // Define a common environment that reads directly from process.env
  // The migration job will use these environment variables injected by Kubernetes
  common: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432", 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      // ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined // Optional SSL
    },
    migrations: {
      directory: "./migrations",
      tableName: "knex_migrations",
    },
  },

  // You can still define development for local usage if needed,
  // but the migration job primarily uses the injected K8s env vars.
  development: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST || "localhost", // Default for local dev
      port: parseInt(process.env.DB_PORT || "5432", 10),
      user: process.env.DB_USER || "postgres", // Default for local dev
      password: process.env.DB_PASSWORD || "password", // Default for local dev
      database: process.env.DB_NAME || "backend_api_dev", // Different DB for local dev?
    },
    migrations: {
      directory: "./migrations",
      tableName: "knex_migrations",
    },
  },

  // Production environment explicitly using environment variables
  production: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432", 10),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      // ssl: { rejectUnauthorized: false } // Example for Cloud SQL
    },
    migrations: {
      directory: "./migrations",
      tableName: "knex_migrations",
    },
  },
};

// Use common settings as the default export for the migration job
// The NODE_ENV environment variable is typically used to select other environments
// but our job doesn't set NODE_ENV, so Knex might default to 'development'.
// We explicitly tell the command `--knexfile ./knexfile.js` and rely on the
// `common` config reading `process.env` set by the K8s Job spec.
// However, explicitly setting NODE_ENV in the job or defaulting to common might be safer.

// Let's assume the knex command without NODE_ENV defaults to 'development',
// so ensure 'development' also reads from process.env when running in K8s.
// Modify the development connection to prioritize process.env
module.exports.development.connection = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password", // Fallback might be insecure if job doesn't set password
  database: process.env.DB_NAME || "backend_api_dev",
};

// Default export for Knex CLI when no environment is specified
// module.exports = module.exports.common; // Or module.exports.production?
