const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {randomUUID} = require('node:crypto');
const root = path.join(__dirname, '..');
const modulePromise = import('data:text/javascript;base64,' + fs.readFileSync(path.join(root, 'functions/api/leaderboard.js')).toString('base64'));
const bank = 'neutreeko-mixed65-20261104-v3';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(root, 'migrations/0001_leaderboard.sql'), 'utf8'));
  sqlite.exec(fs.readFileSync(path.join(root, 'migrations/0002_short_names.sql'), 'utf8'));
  sqlite.exec(fs.readFileSync(path.join(root, 'migrations/0003_round_times.sql'), 'utf8'));
  const db = {
    prepare(sql) { return {bind(...args) {return {all: async () => ({results: sqlite.prepare(sql).all(...args)})};}}; },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {const results = []; for (const s of statements) results.push(await s.all()); sqlite.exec('COMMIT'); return results;}
      catch (e) {sqlite.exec('ROLLBACK'); throw e;}
    }, sqlite
  };
  return db;
}
async function setup() {
  const api = await modulePromise; const db = database();
  const body = {date: api.jstDate(), bank, name:'ABC', ms:12000, hints:0, clientId:randomUUID(), runId:randomUUID(), completed:5};
  async function call(method, payload, options = {}) {
    const url = `https://example.com/api/leaderboard?date=${body.date}&bank=${bank}`;
    const headers = {Origin:'https://example.com', 'Content-Type':'application/json', ...options.headers};
    const request = new Request(url, {method, headers, ...(method === 'POST' ? {body: typeof payload === 'string' ? payload : JSON.stringify(payload)} : {})});
    const res = await api.onRequest({request,env: options.env || {LEADERBOARD_DB:db}});
    return {status:res.status, data:await res.json(), headers:res.headers};
  }
  return {api, db, body, call};
}
test('empty, first, duplicate, slower, improved; no private ids', async () => {
  const {body, call, db} = await setup();
  assert.deepEqual((await call('GET')).data.entries, []);
  const first = await call('POST',body);
  assert.equal(first.status,200); assert.equal(first.data.improved,true);
  assert.deepEqual(first.data.entry,{rank:1,name:'ABC',ms:12000,hints:0,roundMs:null});
  const duplicate = await call('POST',{...body,name:'XYZ',ms:1,hints:4});
  assert.equal(duplicate.data.improved,false); assert.deepEqual(duplicate.data.entry,first.data.entry);
  assert.equal((await call('POST',{...body,runId:randomUUID(),ms:13000,name:'DEF',hints:1})).data.improved,false);
  const better = await call('POST',{...body,runId:randomUUID(),ms:11000,name:'XYZ',hints:2});
  assert.equal(better.data.improved,true); assert.equal(better.data.entry.name,'XYZ'); assert.equal(better.data.entry.hints,2);
  const publicResult = await call('GET');
  assert.equal(publicResult.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(Object.keys(publicResult.data.entries[0]).sort(),['hints','ms','name','rank','roundMs']);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM leaderboard_entries_v2').get().n,1);
  assert.ok(!JSON.stringify(publicResult.data).includes(body.clientId));
});
test('ranking orders time, ties stable, only 100 entries', async () => {
  const {body,call,db} = await setup();
  for(let i=0;i<105;i++) db.sqlite.prepare('INSERT INTO leaderboard_entries_v2 (date,bank,client_hash,name,ms,hints,created_at) VALUES (?,?,?,?,?,?,?)').run(body.date,bank,String(i).padStart(64,'0'),'ABC',100+i,0,i);
  const entries=(await call('GET')).data.entries;
  assert.equal(entries.length,100); assert.equal(entries[0].ms,100); assert.equal(entries[99].rank,100);
  const result=await call('POST',{...body,ms:100});
  assert.equal(result.data.entry.rank,2);
});
test('validation rejects malformed, forged origin, oversized and incomplete submissions',async()=>{
  const {body,call}=await setup();
  for(const patch of [{name:''},{name:'abc'},{name:'ABCD'},{name:'<A>'},{ms:0},{ms:1.5},{ms:86400001},{hints:-1},{hints:0.5},{hints:1000},{clientId:'fake'},{runId:'x'},{completed:4},{bank:'wrong'},{date:'2026-02-30'},{date:'2000-01-01'}])
    assert.equal((await call('POST',{...body,...patch})).status,400,JSON.stringify(patch));
  assert.equal((await call('POST',body,{headers:{Origin:'https://other.example'}})).status,403);
  assert.equal((await call('POST',body,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await call('POST',body,{headers:{'Content-Type':'text/plain'}})).status,415);
  assert.equal((await call('POST','{')).status,400);
  assert.equal((await call('POST',' '.repeat(2049))).status,413);
  assert.equal((await call('PUT')).status,405);
});
test('JST midnight accepts yesterday but not two days ago or tomorrow',async()=>{
  const {api,body}=await setup();const now=Date.parse('2026-11-10T15:00:00Z');
  assert.equal(api.jstDate(now),'2026-11-11');
  for (const date of ['2026-11-10','2026-11-11']) assert.equal(api.validateSubmission({...body,date},now),true);
  for (const date of ['2026-11-09','2026-11-12']) assert.equal(api.validateSubmission({...body,date},now),false);
});
test('bounded distinct runs, but retries remain idempotent at limit',async()=>{
  const {body,call}=await setup();
  await call('POST',body);
  for(let i=1;i<20;i++) assert.equal((await call('POST',{...body,runId:randomUUID()})).status,200);
  assert.equal((await call('POST',{...body,runId:randomUUID()})).status,429);
  assert.equal((await call('POST',body)).status,200);
});
test('database absence/failure is a safe Japanese 503',async()=>{
  const {call}=await setup();
  assert.equal((await call('GET',null,{env:{}})).status,503);
  const fail=await call('GET',null,{env:{LEADERBOARD_DB:{prepare(){throw Error('secret');}}}});
  assert.equal(fail.status,503); assert.ok(!fail.data.error.includes('secret'));
});
test('SQLite constraints reject invalid public values',async()=>{
  const {body,db}=await setup();
  assert.throws(()=>db.sqlite.prepare('INSERT INTO leaderboard_entries_v2 (date,bank,client_hash,name,ms,hints,created_at) VALUES (?,?,?,?,?,?,?)').run(body.date,bank,'a'.repeat(64),'aBC',1,0,0));
  assert.throws(()=>db.sqlite.prepare('INSERT INTO leaderboard_entries_v2 (date,bank,client_hash,name,ms,hints,created_at) VALUES (?,?,?,?,?,?,?)').run(body.date,bank,'a'.repeat(64),'ABC',1,-1,0));
});

test('one, two and three uppercase characters save; other characters rejected', async () => {
  const {body,call}=await setup();
  for(const name of ['A','AB','ABC']) {
    const res=await call('POST',{...body,name,clientId:randomUUID(),runId:randomUUID()});
    assert.equal(res.status,200);assert.equal(res.data.entry.name,name);
  }
  for(const name of ['', 'ABCD', 'a', 'aB', 'Ａ', '1', 'A B', 'A\n'])
    assert.equal((await call('POST',{...body,name})).status,400,name);
});
test('additive migration preserves old data, mirrors rollout writes and is repeatable', async () => {
  const sqlite=new DatabaseSync(':memory:');
  const original=fs.readFileSync(path.join(root,'migrations/0001_leaderboard.sql'),'utf8');
  const migration=fs.readFileSync(path.join(root,'migrations/0002_short_names.sql'),'utf8');
  sqlite.exec(original);
  const row=['2026-11-11',bank,'a'.repeat(64),'ABC',1000,2,123];
  const run=[...row.slice(0,3),'original-run',...row.slice(3)];
  sqlite.prepare('INSERT INTO leaderboard_entries VALUES (?,?,?,?,?,?,?)').run(...row);
  sqlite.prepare('INSERT INTO leaderboard_runs VALUES (?,?,?,?,?,?,?,?)').run(...run);
  sqlite.exec('BEGIN');sqlite.exec(migration);sqlite.exec('COMMIT');
  for(const table of ['entries','runs']) assert.deepEqual(sqlite.prepare(`SELECT * FROM leaderboard_${table}_v2`).all(),sqlite.prepare(`SELECT * FROM leaderboard_${table}`).all());
  sqlite.prepare('UPDATE leaderboard_entries SET ms=900, name=?').run('XYZ');
  assert.equal(sqlite.prepare('SELECT ms FROM leaderboard_entries_v2').get().ms,900);
  sqlite.prepare('INSERT INTO leaderboard_runs VALUES (?,?,?,?,?,?,?,?)').run(...run.slice(0,3),'late-old-run',...run.slice(4));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM leaderboard_runs_v2').get().n,2);
  sqlite.prepare('UPDATE leaderboard_entries_v2 SET ms=800, name=?').run('A');
  sqlite.exec(migration);
  assert.equal(sqlite.prepare('SELECT name FROM leaderboard_entries_v2').get().name,'A');
  assert.equal(sqlite.prepare('SELECT name FROM leaderboard_entries').get().name,'XYZ');
  for(const name of ['', 'abcd', 'ABCD','1']) assert.throws(()=>sqlite.prepare('UPDATE leaderboard_entries_v2 SET name=?').run(name));
  for(const name of ['A','AB','ABC']) sqlite.prepare('UPDATE leaderboard_runs_v2 SET name=?').run(name);
});
test('migration transaction rollback leaves original data intact',()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(root,'migrations/0001_leaderboard.sql'),'utf8'));
  sqlite.prepare('INSERT INTO leaderboard_entries VALUES (?,?,?,?,?,?,?)').run('2026-11-11',bank,'a'.repeat(64),'ABC',1000,0,123);
  const before=sqlite.prepare('SELECT * FROM leaderboard_entries').all();
  sqlite.exec('BEGIN');
  try {sqlite.exec(fs.readFileSync(path.join(root,'migrations/0002_short_names.sql'),'utf8'));sqlite.exec('SELECT * FROM intentional_missing_table');}
  catch {sqlite.exec('ROLLBACK');}
  assert.deepEqual(sqlite.prepare('SELECT * FROM leaderboard_entries').all(),before);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE '%_v2' OR type='trigger'").get().n,0);
});

test('round times validate and persist with the original run and total best', async()=>{
  const {body,call}=await setup();
  const rounds=[0,1000,2000,3000,6000];
  let res=await call('POST',{...body,roundMs:rounds});
  assert.equal(res.status,200);assert.deepEqual(res.data.entry.roundMs,rounds);
  res=await call('POST',{...body,roundMs:[1000,1000,1000,1000,8000]});
  assert.equal(res.data.improved,false);assert.deepEqual(res.data.entry.roundMs,rounds);
  res=await call('POST',{...body,runId:randomUUID(),ms:13000,roundMs:[1,1,1,1,12996]});
  assert.equal(res.data.improved,false);assert.deepEqual(res.data.entry.roundMs,rounds);
  assert.deepEqual((await call('GET')).data.roundBests,rounds);
  res=await call('POST',{...body,runId:randomUUID(),ms:11000,roundMs:[1000,1000,1000,1000,7000]});
  assert.equal(res.data.improved,true);assert.deepEqual(res.data.entry.roundMs,[1000,1000,1000,1000,7000]);
  res=await call('POST',{...body,runId:randomUUID(),ms:10000});
  assert.equal(res.data.improved,true);assert.equal(res.data.entry.roundMs,null);
  assert.equal((await call('GET')).data.roundBests,null);
});
test('optional breakdown accepts old clients/null and rejects invalid arrays',async()=>{
  const {body,call,api}=await setup();
  assert.equal((await call('GET')).data.roundBests,null);
  for(const roundMs of [undefined,null]) {
    const res=await call('POST',{...body,clientId:randomUUID(),roundMs});
    assert.equal(res.status,200);assert.equal(res.data.entry.roundMs,null);
  }
  for(const roundMs of [[],[1,2,3,4],[1,2,3,4,5,6],[1,2,3,4,5],[-1,1,0,0,12000],[0.5,0.5,0,0,11999],[null,0,0,0,12000],['0',0,0,0,12000],{},'[]',[0,0,0,0,86400001]])
    assert.equal((await call('POST',{...body,roundMs})).status,400,JSON.stringify(roundMs));
  assert.equal(api.validateSubmission({...body,roundMs:[NaN,0,0,0,12000]}),false);
  assert.equal(api.validateSubmission({...body,roundMs:new Array(5)}),false);
});
test('round minima include all participants, ties and day/bank scoping',async()=>{
  const {body,call,db}=await setup();
  const insert=db.sqlite.prepare('INSERT INTO leaderboard_entries_v2 (date,bank,client_hash,name,ms,hints,created_at,round_ms) VALUES (?,?,?,?,?,?,?,?)');
  for(let i=0;i<101;i++) insert.run(body.date,bank,String(i).padStart(64,'0'),'ABC',100+i,0,i,JSON.stringify([10,20,20,20,30+i]));
  insert.run(body.date,bank,'z'.repeat(64),'Z',1000,0,1000,JSON.stringify([1,2,3,4,990]));
  insert.run('2000-01-01',bank,'z'.repeat(64),'Z',1,0,1000,JSON.stringify([0,0,0,0,1]));
  const res=await call('GET');assert.equal(res.status,200);assert.equal(res.data.entries.length,100);
  assert.deepEqual(res.data.roundBests,[1,2,3,4,30]);
  assert.ok(res.data.entries.every(e=>e.roundMs[0]!==1));
  assert.ok(res.data.entries.filter(e=>e.roundMs[1]===20).length>1);
  // Exact milliseconds, not displayed seconds, determine the aggregate minimum.
  insert.run(body.date,bank,'y'.repeat(64),'Y',2000,0,1001,JSON.stringify([1,2,3,4,1990]));
  assert.deepEqual((await call('GET')).data.roundBests,[1,2,3,4,30]);
});
test('round migration retains rows/mirror triggers and old SQL writes remain compatible',()=>{
  const sql=new DatabaseSync(':memory:');
  for(const file of ['0001_leaderboard.sql','0002_short_names.sql'])sql.exec(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
  const row=['2026-11-11',bank,'a'.repeat(64),'ABC',1000,2,123];
  sql.prepare('INSERT INTO leaderboard_entries VALUES (?,?,?,?,?,?,?)').run(...row);
  sql.prepare('INSERT INTO leaderboard_runs VALUES (?,?,?,?,?,?,?,?)').run(...row.slice(0,3),'original-run',...row.slice(3));
  const before=sql.prepare('SELECT * FROM leaderboard_entries_v2').all();
  const triggers=sql.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
  sql.exec('BEGIN');sql.exec(fs.readFileSync(path.join(root,'migrations/0003_round_times.sql'),'utf8'));sql.exec('COMMIT');
  assert.deepEqual(sql.prepare('SELECT date,bank,client_hash,name,ms,hints,created_at FROM leaderboard_entries_v2').all(),before);
  assert.equal(sql.prepare('SELECT round_ms FROM leaderboard_entries_v2').get().round_ms,null);
  assert.equal(sql.prepare('SELECT round_ms FROM leaderboard_runs_v2').get().round_ms,null);
  for(const t of triggers)assert.deepEqual(sql.prepare('SELECT name,sql FROM sqlite_master WHERE name=?').get(t.name),t);
  sql.prepare('UPDATE leaderboard_entries_v2 SET round_ms=?').run('[100,100,100,100,600]');
  // Existing v1 mirror performs an old-style update, which must clear stale detail.
  sql.exec('UPDATE leaderboard_entries SET ms=900');
  assert.equal(sql.prepare('SELECT round_ms FROM leaderboard_entries_v2').get().round_ms,null);
  sql.prepare('UPDATE leaderboard_entries_v2 SET round_ms=?').run('[100,100,100,100,500]');
  // The previous name-fix API's explicit-column UPSERT still works after migration.
  sql.prepare(`INSERT INTO leaderboard_entries_v2 (date,bank,client_hash,name,ms,hints,created_at)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(date,bank,client_hash) DO UPDATE SET
    name=excluded.name,ms=excluded.ms,hints=excluded.hints,created_at=excluded.created_at WHERE excluded.ms<leaderboard_entries_v2.ms`).run(...row.slice(0,4),800,1,124);
  const updated=sql.prepare('SELECT ms,round_ms FROM leaderboard_entries_v2').get();assert.equal(updated.ms,800);assert.equal(updated.round_ms,null);
  for(const bad of ['no-json','null','{}','[1,2]','[1,2,3,4,null]','[1,2,3,4,-1]','[1,2,3,4,0.5]'])assert.throws(()=>sql.prepare('UPDATE leaderboard_entries_v2 SET round_ms=?').run(bad));
});
test('round migration rolls back both added columns on transaction failure',()=>{
  const sql=new DatabaseSync(':memory:');
  for(const file of ['0001_leaderboard.sql','0002_short_names.sql'])sql.exec(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
  sql.prepare('INSERT INTO leaderboard_entries_v2 VALUES (?,?,?,?,?,?,?)').run('2026-11-11',bank,'a'.repeat(64),'A',1000,0,123);
  const before=sql.prepare('SELECT * FROM leaderboard_entries_v2').all();
  sql.exec('BEGIN');
  try{sql.exec(fs.readFileSync(path.join(root,'migrations/0003_round_times.sql'),'utf8'));sql.exec('SELECT * FROM intentional_missing_table');}catch{sql.exec('ROLLBACK');}
  assert.deepEqual(sql.prepare('SELECT * FROM leaderboard_entries_v2').all(),before);
  for(const table of ['entries','runs'])assert.ok(!sql.prepare(`PRAGMA table_info(leaderboard_${table}_v2)`).all().some(c=>c.name==='round_ms'));
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE '%clear_stale_rounds'").get().n,0);
});
