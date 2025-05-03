// applications/master-backend/src/db/schema.ts
// Define your database tables and relationships here using Drizzle ORM syntax.
// Example (replace with your actual schema):

import {
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";

// Define possible tenant statuses (consider using a PostgreSQL enum type in production for stricter control)
export type TenantStatus =
  | "pending"
  | "deploying"
  | "active"
  | "failed"
  | "deleting";

// Define the structure for Helm release names JSONB column
export interface HelmReleaseNames {
  database?: string;
  backendApi?: string;
  userFrontend?: string;
  // Add other components if needed
}

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  companyCode: varchar("company_code", {length: 10}).notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", {withTimezone: true})
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", {withTimezone: true})
    .notNull()
    .defaultNow(),
  companyLogoUrl: text("company_logo_url"),
  status: varchar("status", {length: 50}).notNull().default("pending"),
  namespace: varchar("namespace", {length: 63}),
  helmReleaseNames: jsonb("helm_release_names").$type<HelmReleaseNames>(),
});
