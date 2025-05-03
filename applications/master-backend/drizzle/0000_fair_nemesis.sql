CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_code" varchar(10) NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"company_logo_url" text,
	CONSTRAINT "tenants_company_code_unique" UNIQUE("company_code")
);
