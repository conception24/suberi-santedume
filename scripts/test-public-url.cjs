'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'suberi-url-test-'));
try{
 fs.mkdirSync(path.join(tmp,'scripts'));fs.mkdirSync(path.join(tmp,'dist'));
 const original=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
 fs.copyFileSync(path.join(root,'scripts/configure-public-url.cjs'),path.join(tmp,'scripts/configure-public-url.cjs'));
 for(const base of ['https://example.github.io/suberi-santedume/','https://example.pages.dev/']){
  fs.writeFileSync(path.join(tmp,'dist/index.html'),original);
  const result=spawnSync(process.execPath,[path.join(tmp,'scripts/configure-public-url.cjs'),base],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const configured=fs.readFileSync(path.join(tmp,'dist/index.html'),'utf8');assert(configured.includes(`property="og:url" content="${base}"`));assert(configured.includes(new URL('assets/social-card.png',base).href));
  const local=[...configured.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>m[1]).filter(v=>!/^https?:/.test(v)&&v!=='./');local.push('puzzles.json');
  for(const ref of local){assert(!ref.startsWith('/'),'root-absolute asset would break a GitHub project site');assert(fs.existsSync(path.join(root,'dist',ref)));assert(new URL(ref,base).pathname.startsWith(new URL(base).pathname))}
  const again=spawnSync(process.execPath,[path.join(tmp,'scripts/configure-public-url.cjs'),base],{encoding:'utf8'});assert.equal(again.status,0);assert.equal(fs.readFileSync(path.join(tmp,'dist/index.html'),'utf8'),configured,'configuration must be idempotent');
 }
 for(const invalid of ['http://example.test/','https://user:password@example.test/','https://example.test/?x=1','https://example.test/#a','https://example.test/index.html','/relative/']){
  const before=fs.readFileSync(path.join(tmp,'dist/index.html'),'utf8');assert.notEqual(spawnSync(process.execPath,[path.join(tmp,'scripts/configure-public-url.cjs'),invalid],{encoding:'utf8'}).status,0);assert.equal(fs.readFileSync(path.join(tmp,'dist/index.html'),'utf8'),before)
 }
 console.log(JSON.stringify({status:'passed',bases:['GitHub project subpath','Cloudflare root'],checks:['relative assets and puzzle data','absolute social URLs','idempotence','invalid URL leaves files unchanged'],networkRequests:0}));
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
