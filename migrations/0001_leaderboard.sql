-- Apply once to the Cloudflare D1 database bound as LEADERBOARD_DB.
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  date TEXT NOT NULL CHECK(length(date) = 10),
  bank TEXT NOT NULL CHECK(bank = 'neutreeko-mixed65-20261104-v3'),
  client_hash TEXT NOT NULL CHECK(length(client_hash) = 64),
  name TEXT NOT NULL CHECK(length(name) = 3 AND name NOT GLOB '*[^A-Z]*'),
  ms INTEGER NOT NULL CHECK(typeof(ms) = 'integer' AND ms BETWEEN 1 AND 86400000),
  hints INTEGER NOT NULL CHECK(typeof(hints) = 'integer' AND hints BETWEEN 0 AND 999),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(date, bank, client_hash)
);
CREATE INDEX IF NOT EXISTS leaderboard_order ON leaderboard_entries(date, bank, ms, created_at, client_hash);
CREATE TABLE IF NOT EXISTS leaderboard_runs (
  date TEXT NOT NULL CHECK(length(date) = 10),
  bank TEXT NOT NULL CHECK(bank = 'neutreeko-mixed65-20261104-v3'),
  client_hash TEXT NOT NULL CHECK(length(client_hash) = 64),
  run_id TEXT NOT NULL CHECK(length(run_id) BETWEEN 8 AND 80),
  name TEXT NOT NULL CHECK(length(name) = 3 AND name NOT GLOB '*[^A-Z]*'),
  ms INTEGER NOT NULL CHECK(typeof(ms) = 'integer' AND ms BETWEEN 1 AND 86400000),
  hints INTEGER NOT NULL CHECK(typeof(hints) = 'integer' AND hints BETWEEN 0 AND 999),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(date, bank, client_hash, run_id)
);
