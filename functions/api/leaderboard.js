const BANK = 'neutreeko-mixed65-20261104-v3';
const MAX_BODY = 2048;
const MAX_RUNS = 20;
const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RANKED = `SELECT ROW_NUMBER() OVER (ORDER BY ms, created_at, client_hash) AS rank,
  name, ms, hints, round_ms, client_hash FROM leaderboard_entries_v2 WHERE date = ? AND bank = ?`;

function publicEntry(row) {
  const {round_ms, ...entry} = row;
  return {...entry, roundMs: round_ms == null ? null : JSON.parse(round_ms)};
}
function validRounds(roundMs, ms) {
  return roundMs == null || (Array.isArray(roundMs) && roundMs.length === 5
    && Array.from(roundMs).every(n => Number.isSafeInteger(n) && n >= 0 && n <= DAY)
    && roundMs.reduce((sum, n) => sum + n, 0) === ms);
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
  }});
}
function error(message, status) { return json({error: message}, status); }
function validDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
export function jstDate(now = Date.now()) { return new Date(now + 9 * 3600000).toISOString().slice(0, 10); }
export function validateSubmission(value, now = Date.now()) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return false;
  const {date, bank, name, ms, hints, clientId, runId, completed} = value;
  return validDate(date) && (date === jstDate(now) || date === jstDate(now - DAY))
    && bank === BANK && typeof name === 'string' && /^[A-Z]{1,3}$/.test(name)
    && Number.isSafeInteger(ms) && ms >= 1 && ms <= DAY
    && Number.isSafeInteger(hints) && hints >= 0 && hints <= 999
    && typeof clientId === 'string' && UUID.test(clientId)
    && typeof runId === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(runId)
    && completed === 5 && validRounds(value.roundMs, ms);
}
async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw new Error('large');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('json');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new Error('large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function browserHash(clientId, date, bank) {
  const bytes = new TextEncoder().encode(`suberi-leaderboard-v1:${date}:${bank}:${clientId.toLowerCase()}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({request, env}) {
  const url = new URL(request.url);
  if (!['GET', 'POST'].includes(request.method)) return error('この操作には対応していません。', 405);
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin ||
        (request.headers.get('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) {
      return error('同じサイトから登録してください。', 403);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
      return error('JSON形式で送信してください。', 415);
    }
  }
  if (!env?.LEADERBOARD_DB) return error('ランキングは準備中です。しばらくしてからお試しください。', 503);
  try {
    if (request.method === 'GET') {
      const date = url.searchParams.get('date'); const bank = url.searchParams.get('bank');
      if (!validDate(date) || bank !== BANK) return error('日付または問題セットが正しくありません。', 400);
      // One transactional read snapshot keeps entries and all-participant minima consistent.
      const results = await env.LEADERBOARD_DB.batch([
        env.LEADERBOARD_DB.prepare(`SELECT rank, name, ms, hints, round_ms FROM (${RANKED}) ORDER BY rank LIMIT 100`).bind(date, bank),
        env.LEADERBOARD_DB.prepare(`SELECT
          MIN(json_extract(round_ms, '$[0]')) AS r0, MIN(json_extract(round_ms, '$[1]')) AS r1,
          MIN(json_extract(round_ms, '$[2]')) AS r2, MIN(json_extract(round_ms, '$[3]')) AS r3,
          MIN(json_extract(round_ms, '$[4]')) AS r4
          FROM leaderboard_entries_v2 WHERE date = ? AND bank = ? AND round_ms IS NOT NULL`).bind(date, bank)
      ]);
      const minima = results[1].results[0];
      const roundBests = minima.r0 == null ? null : [minima.r0, minima.r1, minima.r2, minima.r3, minima.r4];
      return json({entries: results[0].results.map(publicEntry), roundBests, date, bank});
    }
    let body;
    try { body = await readBody(request); }
    catch (e) { return error(e.message === 'large' ? '送信データが大きすぎます。' : '送信データを読み取れませんでした。', e.message === 'large' ? 413 : 400); }
    if (!validateSubmission(body)) return error('登録内容を確認してください。登録できるのは本日・前日（日本時間）の5問完了記録です。', 400);
    const {date, bank, name, ms, hints, runId} = body;
    const roundMs = body.roundMs == null ? null : JSON.stringify(body.roundMs);
    const hash = await browserHash(body.clientId, date, bank);
    const db = env.LEADERBOARD_DB;
    // D1 batch is transactional: preserve the first payload for a run, then update only for a better time.
    const result = await db.batch([
      db.prepare(`INSERT INTO leaderboard_runs_v2 (date, bank, client_hash, run_id, name, ms, hints, created_at, round_ms)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE
        (SELECT COUNT(*) FROM leaderboard_runs_v2 WHERE date = ? AND bank = ? AND client_hash = ?) < ?
        ON CONFLICT(date, bank, client_hash, run_id) DO NOTHING`).bind(date, bank, hash, runId, name, ms, hints, Date.now(), roundMs, date, bank, hash, MAX_RUNS),
      db.prepare(`INSERT INTO leaderboard_entries_v2 (date, bank, client_hash, name, ms, hints, created_at, round_ms)
        SELECT date, bank, client_hash, name, ms, hints, created_at, round_ms FROM leaderboard_runs_v2
        WHERE date = ? AND bank = ? AND client_hash = ? AND run_id = ?
        ON CONFLICT(date, bank, client_hash) DO UPDATE SET
        name = excluded.name, ms = excluded.ms, hints = excluded.hints, created_at = excluded.created_at, round_ms = excluded.round_ms
        WHERE excluded.ms < leaderboard_entries_v2.ms RETURNING name, ms, hints`).bind(date, bank, hash, runId),
      db.prepare('SELECT run_id FROM leaderboard_runs_v2 WHERE date = ? AND bank = ? AND client_hash = ? AND run_id = ?').bind(date, bank, hash, runId),
      db.prepare(`SELECT rank, name, ms, hints, round_ms FROM (${RANKED}) WHERE client_hash = ?`).bind(date, bank, hash)
    ]);
    if (!result[2].results.length) return error('本日の登録回数の上限に達しました。', 429);
    return json({saved: true, improved: result[1].results.length > 0, entry: publicEntry(result[3].results[0]), date, bank});
  } catch {
    // Do not log payloads, browser identifiers, or provider error details.
    return error('ランキングを利用できませんでした。しばらくしてからお試しください。', 503);
  }
}
