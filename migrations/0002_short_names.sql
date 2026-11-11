-- Additive migration: preserve v1 tables and mirror old deployment writes.
-- Apply with the D1 migrations transaction runner (no explicit BEGIN/COMMIT).
CREATE TABLE IF NOT EXISTS leaderboard_entries_v2 (
  date TEXT NOT NULL CHECK(length(date) = 10),
  bank TEXT NOT NULL CHECK(bank = 'neutreeko-mixed65-20261104-v3'),
  client_hash TEXT NOT NULL CHECK(length(client_hash) = 64),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 3 AND name NOT GLOB '*[^A-Z]*'),
  ms INTEGER NOT NULL CHECK(typeof(ms) = 'integer' AND ms BETWEEN 1 AND 86400000),
  hints INTEGER NOT NULL CHECK(typeof(hints) = 'integer' AND hints BETWEEN 0 AND 999),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(date, bank, client_hash)
);
CREATE INDEX IF NOT EXISTS leaderboard_order_v2 ON leaderboard_entries_v2(date, bank, ms, created_at, client_hash);
CREATE TABLE IF NOT EXISTS leaderboard_runs_v2 (
  date TEXT NOT NULL CHECK(length(date) = 10),
  bank TEXT NOT NULL CHECK(bank = 'neutreeko-mixed65-20261104-v3'),
  client_hash TEXT NOT NULL CHECK(length(client_hash) = 64),
  run_id TEXT NOT NULL CHECK(length(run_id) BETWEEN 8 AND 80),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 3 AND name NOT GLOB '*[^A-Z]*'),
  ms INTEGER NOT NULL CHECK(typeof(ms) = 'integer' AND ms BETWEEN 1 AND 86400000),
  hints INTEGER NOT NULL CHECK(typeof(hints) = 'integer' AND hints BETWEEN 0 AND 999),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(date, bank, client_hash, run_id)
);

CREATE TRIGGER IF NOT EXISTS leaderboard_entries_mirror_insert
AFTER INSERT ON leaderboard_entries
BEGIN
  INSERT INTO leaderboard_entries_v2 (date, bank, client_hash, name, ms, hints, created_at)
  VALUES (NEW.date, NEW.bank, NEW.client_hash, NEW.name, NEW.ms, NEW.hints, NEW.created_at)
  ON CONFLICT(date, bank, client_hash) DO UPDATE SET name = excluded.name, ms = excluded.ms, hints = excluded.hints, created_at = excluded.created_at WHERE excluded.ms < leaderboard_entries_v2.ms;
END;

CREATE TRIGGER IF NOT EXISTS leaderboard_entries_mirror_update
AFTER UPDATE ON leaderboard_entries
BEGIN
  INSERT INTO leaderboard_entries_v2 (date, bank, client_hash, name, ms, hints, created_at)
  VALUES (NEW.date, NEW.bank, NEW.client_hash, NEW.name, NEW.ms, NEW.hints, NEW.created_at)
  ON CONFLICT(date, bank, client_hash) DO UPDATE SET name = excluded.name, ms = excluded.ms, hints = excluded.hints, created_at = excluded.created_at WHERE excluded.ms < leaderboard_entries_v2.ms;
END;

INSERT INTO leaderboard_entries_v2 (date, bank, client_hash, name, ms, hints, created_at)
SELECT date, bank, client_hash, name, ms, hints, created_at FROM leaderboard_entries WHERE 1
ON CONFLICT(date, bank, client_hash) DO UPDATE SET name = excluded.name, ms = excluded.ms, hints = excluded.hints, created_at = excluded.created_at WHERE excluded.ms < leaderboard_entries_v2.ms;

CREATE TRIGGER IF NOT EXISTS leaderboard_runs_mirror_insert
AFTER INSERT ON leaderboard_runs
BEGIN
  INSERT INTO leaderboard_runs_v2 (date, bank, client_hash, run_id, name, ms, hints, created_at)
  VALUES (NEW.date, NEW.bank, NEW.client_hash, NEW.run_id, NEW.name, NEW.ms, NEW.hints, NEW.created_at)
  ON CONFLICT(date, bank, client_hash, run_id) DO NOTHING;
END;

CREATE TRIGGER IF NOT EXISTS leaderboard_runs_mirror_update
AFTER UPDATE ON leaderboard_runs
BEGIN
  INSERT INTO leaderboard_runs_v2 (date, bank, client_hash, run_id, name, ms, hints, created_at)
  VALUES (NEW.date, NEW.bank, NEW.client_hash, NEW.run_id, NEW.name, NEW.ms, NEW.hints, NEW.created_at)
  ON CONFLICT(date, bank, client_hash, run_id) DO NOTHING;
END;

INSERT INTO leaderboard_runs_v2 (date, bank, client_hash, run_id, name, ms, hints, created_at)
SELECT date, bank, client_hash, run_id, name, ms, hints, created_at FROM leaderboard_runs WHERE 1
ON CONFLICT(date, bank, client_hash, run_id) DO NOTHING;
