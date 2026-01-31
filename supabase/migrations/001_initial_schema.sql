-- Webhook endpoints
CREATE TABLE endpoints (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Captured webhook requests
CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT REFERENCES endpoints(id) ON DELETE CASCADE,
  method TEXT,
  headers JSONB,
  query JSONB,
  body TEXT,
  raw_body TEXT,
  ip TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster endpoint lookups
CREATE INDEX idx_requests_endpoint ON requests(endpoint_id);
CREATE INDEX idx_requests_timestamp ON requests(timestamp DESC);

-- Enable RLS
ALTER TABLE endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Allow all operations (public app, no auth required)
CREATE POLICY "Allow all on endpoints" ON endpoints FOR ALL USING (true);
CREATE POLICY "Allow all on requests" ON requests FOR ALL USING (true);
