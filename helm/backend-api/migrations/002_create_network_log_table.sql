-- Create the network_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS network_log (
    log_id SERIAL PRIMARY KEY,                  -- Auto-incrementing primary key
    log_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- Timestamp of the log entry
    http_method VARCHAR(10),                    -- HTTP method (GET, POST, etc.)
    request_path VARCHAR(2048),                 -- Requested path
    status_code INT,                            -- HTTP status code returned
    duration_ms NUMERIC(10, 2),                 -- Request processing duration in milliseconds
    source_ip VARCHAR(45),                      -- IP address of the client (best effort)
    request_id VARCHAR(50) UNIQUE               -- Optional: Unique request identifier
);

-- Optional: Add indexes for faster querying on frequently filtered columns
CREATE INDEX IF NOT EXISTS idx_network_log_timestamp ON network_log(log_timestamp);
CREATE INDEX IF NOT EXISTS idx_network_log_path ON network_log(request_path); 