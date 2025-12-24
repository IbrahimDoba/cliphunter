export const createTablesSQL = `
-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  video_url TEXT NOT NULL,
  status TEXT NOT NULL,
  progress TEXT NOT NULL,
  result TEXT,
  error TEXT,
  options TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Index for querying jobs by status and creation time
CREATE INDEX IF NOT EXISTS idx_jobs_status_created
ON jobs(status, created_at);

-- Index for querying jobs by updated time
CREATE INDEX IF NOT EXISTS idx_jobs_updated
ON jobs(updated_at);

-- YouTube accounts table for OAuth tokens
CREATE TABLE IF NOT EXISTS youtube_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_title TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Index for looking up by email
CREATE INDEX IF NOT EXISTS idx_youtube_accounts_email
ON youtube_accounts(email);
`;
