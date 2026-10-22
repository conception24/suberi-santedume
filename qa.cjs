// Buildless asset checks; interactive logic lives in test-app.cjs.
// No browser launch: use the supported managed browser for actual visual QA.
'use strict';
const fs=require('fs'),assert=require('assert'),path=require('path');
const html=fs.readFileSync('dist/index.html','utf8'),css=fs.readFileSync('dist/style.css','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'Duplicate HTML IDs');
const assets=[...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map(m=>m[1]).filter(x=>!/^https?:/.test(x)&&x!=='./');for(const file of assets)assert(fs.statSync(path.join('dist',file)).size>0,`Missing asset ${file}`);
assert(html.includes('<html lang="ja">'));assert(html.includes('width=device-width,initial-scale=1'));assert(html.includes('role="status"'));assert(html.includes('aria-labelledby="externalTitle"'));assert(css.includes('@media(prefers-reduced-motion:reduce)'));assert(css.includes('[hidden]{display:none!important}'));
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'Unbalanced CSS');
for(const file of ['rule-slide.svg','rule-win.svg']){const svg=fs.readFileSync('dist/assets/'+file,'utf8');assert(svg.startsWith('<svg'));assert(svg.includes('<title>'));assert(!/https?:\/\/(?!www.w3.org)/.test(svg),'External SVG dependency');}
assert(css.includes('.actions #hint{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:auto;min-height:52px'), 'Hint two-line label must be centered without a fixed-height squeeze');
assert(css.includes('.actions #hint>span{display:block;margin:0;font-size:12px;line-height:1.2;white-space:nowrap}'));
console.log(JSON.stringify({status:'passed',uniqueHtmlIds:ids.length,localAssets:assets,checks:['Japanese language and viewport','live status and labelled confirmation dialog','reduced motion and hidden control styles','original self-contained SVG diagrams','no browser launched']}));
