# Daily leaderboard backend

## Scope and privacy

This is a casual, self-reported daily-five leaderboard, not an anti-cheat system. Times, completion and hint counts are browser reports. A user can change local data or browser ID, so the limits below discourage accidental/repeated submissions, not determined abuse.

The public API exposes only rank, uppercase one-to-three-letter name, thinking time in milliseconds, and hint count. The UI must disclose that the name, time and hints become public before submission. A browser generates and remembers a UUID v4 `clientId`; the server hashes it with the day and question-bank version before storage. Raw browser IDs, IP addresses, email and accounts are not stored by this application. Cloudflare platform logs/analytics are separate from this application. Clearing browser data creates a different identity. The browser remembers the entered name locally.

## API contract

GET `/api/leaderboard?date=YYYY-MM-DD&bank=neutreeko-mixed65-20261104-v3`

Success (200): `{ "entries": [{ "rank": 1, "name": "ABC", "ms": 12345, "hints": 0 }], "date": "YYYY-MM-DD", "bank": "neutreeko-mixed65-20261104-v3" }`.

Valid calendar dates are accepted for reads. Returns at most 100 entries ordered by time, then record timestamp, then the internal hash. Equal times receive consecutive ranks with a deterministic tie-break, not joint ranks. Empty leaderboard returns `entries: []`.

POST `/api/leaderboard` with `Content-Type: application/json`, a same-origin `Origin` header, and body:

`{ "date": "YYYY-MM-DD", "bank": "neutreeko-mixed65-20261104-v3", "name": "ABC", "ms": 12345, "hints": 0, "clientId": "UUID-v4", "runId": "unique-run-id", "completed": 5 }`

- `name`: one to three ASCII uppercase letters. Frontend converts lowercase to uppercase; backend accepts only the normalized uppercase value.
- `ms`: integer 1–86,400,000; `hints`: integer 0–999.
- `clientId`: UUID v4, case insensitive. Use `crypto.randomUUID()` and persist in localStorage.
- `runId`: 8–80 ASCII letters, digits, underscores or hyphens. Generate once per completed daily-five run; retain it for retries. UUID v4 is suitable.
- `date`: start date of the daily set, either today or yesterday in JST. Future, older, and invalid dates rejected.
- `completed`: numeric 5. `bank`: exact version above.
- Maximum body size 2048 bytes, checked while streaming. No CORS permission is supplied. The same-origin restriction is not an authentication/anti-bot system.

Success (200): `{ "saved": true, "improved": true, "entry": { "rank": 1, "name": "ABC", "ms": 12345, "hints": 0 }, "date": "YYYY-MM-DD", "bank": "neutreeko-mixed65-20261104-v3" }`.

There is one best entry per browser/day/bank. First submission or strictly faster time sets `improved: true`. A tie/slower run keeps the earlier name/time/hints. A retry with the same run ID uses its original persisted payload, even if the request changed. `entry` always describes the browser's current best and may have rank greater than 100. D1 batch transactions and SQL conditional UPSERT prevent concurrent slower requests from overwriting a faster one.

Each browser/day/bank may submit up to 20 distinct runs. Existing run-ID retries still succeed after the cap. On success, `saved: true` means accepted/previously accepted, not necessarily a new best. Records currently have no automatic expiry. Review storage as usage grows; old run records may be removed after they fall outside the writable two-day window, while leaderboard entries can be retained.

Errors: `{ "error": "Japanese user-facing message" }`, with 400 invalid data/date, 403 cross-origin, 405 unsupported method, 413 oversized body, 415 wrong content type, 429 run cap, or 503 missing/unavailable database. No database details or browser IDs appear in errors. All responses have `Cache-Control: no-store`.

## Deployment checklist (not performed)

Requires Cloudflare account authorization, an approved D1 database and the existing Pages project. There is no API key embedded in the frontend and no need for paid features. Confirm current Cloudflare plan quotas before enabling.

1. Create a D1 database, and apply `migrations/0001_leaderboard.sql`, then `migrations/0002_short_names.sql` to it with the Cloudflare D1 SQL console or authorized Wrangler migration command. SQL file uses `CREATE ... IF NOT EXISTS` and is safe to reapply to its initial schema.
2. Bind this database in the existing Pages project's production settings with the exact name `LEADERBOARD_DB`. Use a separate test database for previews, not the production database.
3. Deploy the project with the root `functions/api/leaderboard.js` included and `dist/` as the public static output. A static-only GitHub Pages or `python -m http.server` preview cannot run the API. Cloudflare dashboard drag-and-drop static uploads do not build the Functions directory; use Git-integrated Pages or an authorized Wrangler Pages deployment that includes the root Functions directory.
4. Keep `migrations/`, `docs/`, `scripts/`, package metadata, backups and database exports OUTSIDE the public static output. Existing hosting configured to expose the repository root must be switched/verified before publishing this backend. This avoids exposing source/support files as public assets.
5. Consider a `_routes.json` in the static output with `version: 1`, `include: ["/api/*"]`, `exclude: []`, so only API requests invoke Functions. Ensure any sync/build check keeps the routing file intact.
6. Smoke-test production GET, actual browser POST, repeat POST, a slower run, a faster hinted run, and a missing-binding preview. Check that names/times/hints show correctly and API failure does not interrupt normal play. Do not claim deployment verified until these pass.

No database creation, account login, migration against production, deployment, or remote write was performed as part of the local implementation.

## Tests

Run from the repository root with Node 22.13+ (Node 24 recommended):

`node --test scripts/test-leaderboard.cjs`

No external dependencies. Tests import the exact Pages Function and exercise its SQL against Node's in-memory SQLite via a minimal D1 adapter. They cover first save, best-time preservation, duplicate payload idempotency, hinted improvements, ranks/top-100, invalid input/body limits, same-origin enforcement, JST rollover, per-browser cap, safe failures and CHECK constraints. This verifies SQL semantics and handler behavior, not a live Cloudflare D1 deployment or Cloudflare concurrent-request scheduling. The existing application test suite remains separately required.


## Upgrade existing production database for 1–3-letter names

Apply `migrations/0002_short_names.sql` BEFORE deploying the new API. Keep `0001_leaderboard.sql` unchanged; changing its CREATE IF NOT EXISTS constraint does not update an existing table. No lazy migration occurs during API requests.

The upgrade creates `leaderboard_entries_v2` and `leaderboard_runs_v2`, with CHECK constraints permitting one to three uppercase ASCII letters. It adds old-to-v2 insert/update triggers before copying rows. Existing v1 tables remain intact and the old application can continue writing during rollout. Backfill/retry never overwrites a faster v2 best record or an existing run's original payload. No DROP, DELETE, rename or rewrite of original data is used.

Preferred authorized execution is Cloudflare's D1 migration runner, which applies each migration transactionally: `wrangler d1 migrations apply DATABASE_NAME --remote`. Use the actual verified database name, not this placeholder, and review pending migrations first. If the existing database was initialized manually, do not assume Wrangler migration history exists: inspect it before using the runner. Both migration files are idempotent for this initial schema. For the dashboard SQL console, submit the entire `0002_short_names.sql` through its supported execution flow; do not insert explicit BEGIN/COMMIT (D1 rejects SQL-managed transactions). If the console reports partial/uncertain success, inspect tables/triggers and rerun the idempotent script if needed before deployment. D1 migrations/batch provides transactionality; independent console statement execution should not be described as atomic.

Before migration, take a D1 export or available restore point under the user's approved backup workflow. Keep it private, outside dist. The original tables also retain the original data after migration; verify their contents remain present. Immediately after migration, run these read-only checks. All three `missing` results must be zero, and the trigger count must be four. These checks disclose only counts, not browser hashes.

```sql
SELECT COUNT(*) AS missing_original_entries
FROM leaderboard_entries old
LEFT JOIN leaderboard_entries_v2 new
ON new.date=old.date AND new.bank=old.bank AND new.client_hash=old.client_hash
WHERE new.client_hash IS NULL OR new.ms > old.ms;
SELECT COUNT(*) AS missing_original_runs FROM (
  SELECT date,bank,client_hash,run_id,name,ms,hints,created_at FROM leaderboard_runs
  EXCEPT
  SELECT date,bank,client_hash,run_id,name,ms,hints,created_at FROM leaderboard_runs_v2
);
SELECT COUNT(*) AS missing_original_equal_best_details
FROM leaderboard_entries old JOIN leaderboard_entries_v2 new
ON new.date=old.date AND new.bank=old.bank AND new.client_hash=old.client_hash
WHERE new.ms=old.ms AND (new.name<>old.name OR new.hints<>old.hints OR new.created_at<>old.created_at);
SELECT COUNT(*) AS mirror_trigger_count FROM sqlite_master
WHERE type='trigger' AND name IN (
'leaderboard_entries_mirror_insert','leaderboard_entries_mirror_update',
'leaderboard_runs_mirror_insert','leaderboard_runs_mirror_update');
SELECT 'v1_entries' AS table_name, COUNT(*) AS records FROM leaderboard_entries
UNION ALL SELECT 'v2_entries', COUNT(*) FROM leaderboard_entries_v2
UNION ALL SELECT 'v1_runs', COUNT(*) FROM leaderboard_runs
UNION ALL SELECT 'v2_runs', COUNT(*) FROM leaderboard_runs_v2;
```

At the pre-deploy checkpoint, v1/v2 counts and all fields should match unless another v2 writer is already active. Preserve the verified export/restore point and record counts. Deploy only after migration/checks succeed. New API reads and writes only v2; old-to-v2 triggers bridge old deployment requests during cutover. Do not insert fabricated test scores in production.

Rollback: before any v2-only writes, keeping/restoring the prior application leaves v1 untouched. Once new short-name records exist, restoring the old v1 API would hide these records and is NOT a complete rollback. Prefer a forward fix or revert the UI while retaining v2-capable API access. Preserve both versions and any export until a deliberate reconciliation is verified. Do not drop v2 or restore an earlier snapshot over new scores. The triggers only mirror old-to-new, not new-to-old, because v1 cannot store short names.

Added tests verify 1/2/3-letter saves, malformed/empty/non-ASCII names, exact backfill of original entries/runs, old-deployment writes after migration, repeatable migration without clobbering a faster short-name record, and transaction rollback with original data intact. These are local SQLite tests; live D1 execution still requires verification.
