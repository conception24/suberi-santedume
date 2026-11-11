-- Additive migration; apply ONCE through the D1 migration runner before API deployment.
-- Existing records and v1 -> v2 mirror triggers remain intact. Do not rerun blindly:
-- SQLite ALTER TABLE ADD COLUMN has no IF NOT EXISTS. Check migration history first.
-- API enforces sum(roundMs) = ms. DB enforces nullable JSON array shape and bounds.
-- Sum is deliberately not a CHECK: an old API updating ms without round_ms must
-- succeed, then the compatibility trigger below clears the stale breakdown.

ALTER TABLE leaderboard_entries_v2 ADD COLUMN round_ms TEXT DEFAULT NULL
CHECK(round_ms IS NULL OR CASE WHEN json_valid(round_ms) THEN
  json_type(round_ms) = 'array' AND json_array_length(round_ms) = 5 AND
    json_type(round_ms, '$[0]') = 'integer' AND json_extract(round_ms, '$[0]') BETWEEN 0 AND 86400000 AND
    json_type(round_ms, '$[1]') = 'integer' AND json_extract(round_ms, '$[1]') BETWEEN 0 AND 86400000 AND
    json_type(round_ms, '$[2]') = 'integer' AND json_extract(round_ms, '$[2]') BETWEEN 0 AND 86400000 AND
    json_type(round_ms, '$[3]') = 'integer' AND json_extract(round_ms, '$[3]') BETWEEN 0 AND 86400000 AND
    json_type(round_ms, '$[4]') = 'integer' AND json_extract(round_ms, '$[4]') BETWEEN 0 AND 86400000
  ELSE 0 END);
CREATE TRIGGER leaderboard_entries_clear_stale_rounds
AFTER UPDATE OF ms ON leaderboard_entries_v2
WHEN NEW.ms <> OLD.ms AND NEW.round_ms IS OLD.round_ms AND NEW.round_ms IS NOT NULL
BEGIN
  UPDATE leaderboard_entries_v2 SET round_ms = NULL
  WHERE date = NEW.date AND bank = NEW.bank AND client_hash = NEW.client_hash;
END;

ALTER TABLE leaderboard_runs_v2 ADD COLUMN round_ms TEXT DEFAULT NULL
CHECK(round_ms IS NULL OR CASE WHEN json_valid(round_ms) THEN
  json_type(round_ms) = 'array' AND json_array_length(round_ms) = 5 AND
    json_type(round_ms, '$[0]') = 'integer' AND json_extract(round_ms, '$[0]') BETWEEN 0 AND 86400000 AND
    json_type(round_ms, '$[1]') = 'integer' AND json_extract(round_ms, '$[1]') BETWEEN 0 AND 86400000 AND
    json_type(round_ms, '$[2]') = 'integer' AND json_extract(round_ms, '$[2]') BETWEEN 0 AND 86400000 AND
    json_type(round_ms, '$[3]') = 'integer' AND json_extract(round_ms, '$[3]') BETWEEN 0 AND 86400000 AND
    json_type(round_ms, '$[4]') = 'integer' AND json_extract(round_ms, '$[4]') BETWEEN 0 AND 86400000
  ELSE 0 END);
CREATE TRIGGER leaderboard_runs_clear_stale_rounds
AFTER UPDATE OF ms ON leaderboard_runs_v2
WHEN NEW.ms <> OLD.ms AND NEW.round_ms IS OLD.round_ms AND NEW.round_ms IS NOT NULL
BEGIN
  UPDATE leaderboard_runs_v2 SET round_ms = NULL
  WHERE date = NEW.date AND bank = NEW.bank AND client_hash = NEW.client_hash AND run_id = NEW.run_id;
END;
