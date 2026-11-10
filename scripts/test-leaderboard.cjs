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
  assert.deepEqual(first.data.entry,{rank:1,name:'ABC',ms:12000,hints:0});
  const duplicate = await call('POST',{...body,name:'XYZ',ms:1,hints:4});
  assert.equal(duplicate.data.improved,false); assert.deepEqual(duplicate.data.entry,first.data.entry);
  assert.equal((await call('POST',{...body,runId:randomUUID(),ms:13000,name:'DEF',hints:1})).data.improved,false);
  const better = await call('POST',{...body,runId:randomUUID(),ms:11000,name:'XYZ',hints:2});
  assert.equal(better.data.improved,true); assert.equal(better.data.entry.name,'XYZ'); assert.equal(better.data.entry.hints,2);
  const publicResult = await call('GET');
  assert.equal(publicResult.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(Object.keys(publicResult.data.entries[0]).sort(),['hints','ms','name','rank']);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM leaderboard_entries').get().n,1);
  assert.ok(!JSON.stringify(publicResult.data).includes(body.clientId));
});
test('ranking orders time, ties stable, only 100 entries', async () => {
  const {body,call,db} = await setup();
  for(let i=0;i<105;i++) db.sqlite.prepare('INSERT INTO leaderboard_entries VALUES (?,?,?,?,?,?,?)').run(body.date,bank,String(i).padStart(64,'0'),'ABC',100+i,0,i);
  const entries=(await call('GET')).data.entries;
  assert.equal(entries.length,100); assert.equal(entries[0].ms,100); assert.equal(entries[99].rank,100);
  const result=await call('POST',{...body,ms:100});
  assert.equal(result.data.entry.rank,2);
});
test('validation rejects malformed, forged origin, oversized and incomplete submissions',async()=>{
  const {body,call}=await setup();
  for(const patch of [{name:'abc'},{name:'ABCD'},{name:'<A>'},{ms:0},{ms:1.5},{ms:86400001},{hints:-1},{hints:0.5},{hints:1000},{clientId:'fake'},{runId:'x'},{completed:4},{bank:'wrong'},{date:'2026-02-30'},{date:'2000-01-01'}])
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
  assert.throws(()=>db.sqlite.prepare('INSERT INTO leaderboard_entries VALUES (?,?,?,?,?,?,?)').run(body.date,bank,'a'.repeat(64),'aBC',1,0,0));
  assert.throws(()=>db.sqlite.prepare('INSERT INTO leaderboard_entries VALUES (?,?,?,?,?,?,?)').run(body.date,bank,'a'.repeat(64),'ABC',1,-1,0));
});
