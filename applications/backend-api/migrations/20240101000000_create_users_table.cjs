// applications/backend-api/migrations/YYYYMMDDHHMMSS_create_users_table.js
exports.up = function (knex) {
  return knex.schema.createTable("users", function (table) {
    table.increments("id").primary();
    table.string("email").notNullable().unique(); // Ensure unique emails per tenant potentially? Check constraints later.
    table.string("password_hash").notNullable();
    table.string("role").notNullable().defaultTo("user");
    table.string("company_code").notNullable(); // To associate user with a tenant
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    // Optional: Add index on company_code or (company_code, email) for performance
    // table.index(['company_code', 'email']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("users");
};
