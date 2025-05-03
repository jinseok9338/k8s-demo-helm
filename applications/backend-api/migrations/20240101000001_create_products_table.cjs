// applications/backend-api/migrations/YYYYMMDDHHMMSS_create_products_table.js
exports.up = function (knex) {
  return knex.schema.createTable("products", function (table) {
    table.increments("id").primary();
    table.string("name").notNullable();
    table.text("description");
    table.decimal("price", 10, 2); // Example: Price up to 99,999,999.99
    table.string("company_code").notNullable(); // To associate product with a tenant
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    // Optional: Add index on company_code for performance
    // table.index('company_code');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTable("products");
};
