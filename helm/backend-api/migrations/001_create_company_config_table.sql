-- Create the company_config table if it doesn't exist
CREATE TABLE IF NOT EXISTS company_config (
    company_code VARCHAR(50) PRIMARY KEY,  -- Unique identifier for the company
    logo_url VARCHAR(255),                -- URL for the company's logo
    -- Optional: Add timestamps for tracking
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Optional: Add an index if you frequently query by company_code (PRIMARY KEY already creates one)
-- CREATE INDEX IF NOT EXISTS idx_company_config_code ON company_config(company_code); 