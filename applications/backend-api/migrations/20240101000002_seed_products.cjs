// applications/backend-api/migrations/YYYYMMDDHHMMSS_seed_products.js
exports.up = async function (knex) {
  const companyCode = process.env.COMPANY_CODE;

  if (!companyCode) {
    console.warn(
      "COMPANY_CODE environment variable is not set. Skipping product seeding."
    );
    return; // Do not proceed without company code
  }

  console.log(`Seeding initial product for company: ${companyCode}`);

  // Insert a sample product associated with the tenant
  return knex("products").insert({
    name: "Sample Widget",
    description: "A basic sample widget provided for initial setup.",
    price: 19.99,
    company_code: companyCode, // Associate with the current tenant
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
};

exports.down = async function (knex) {
  const companyCode = process.env.COMPANY_CODE;

  if (!companyCode) {
    console.warn(
      "COMPANY_CODE environment variable is not set. Skipping product seed deletion."
    );
    return;
  }

  console.log(`Removing sample product seed for company: ${companyCode}`);

  // Delete the specific sample product for this tenant
  return knex("products")
    .where({company_code: companyCode, name: "Sample Widget"})
    .del();
};
