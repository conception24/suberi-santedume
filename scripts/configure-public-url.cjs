'use strict';
// Updates only static social metadata; never contacts or publishes to any host.
const fs=require('fs'),path=require('path');
const raw=process.argv[2]||process.env.PUBLIC_SITE_URL;
if(!raw){console.error('公開先URLを指定してください: node scripts/configure-public-url.cjs https://YOUR-HOST/suberi-santedume/');process.exit(1)}
let base;try{base=new URL(raw)}catch{console.error('有効な絶対URLではありません。');process.exit(1)}
if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash){console.error('認証情報・クエリ・#を含まない https:// の公開URLを指定してください。');process.exit(1)}
if(/\.html?$/i.test(base.pathname)){console.error('index.html ではなく、サイトのフォルダURLを指定してください。');process.exit(1)}
if(!base.pathname.endsWith('/'))base.pathname+='/';
const escape=s=>s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const target=path.join(__dirname,'../dist/index.html'),html=fs.readFileSync(target,'utf8');
const begin='<!-- PUBLIC_URL_METADATA_START -->',end='<!-- PUBLIC_URL_METADATA_END -->';
if(!html.includes(begin)||!html.includes(end)){console.error('公開URL設定用マーカーが見つかりません。ファイルは変更していません。');process.exit(1)}
const card=new URL('assets/social-card.png',base).href;
const block=[begin,`  <meta property="og:url" content="${escape(base.href)}">`,`  <meta property="og:image" content="${escape(card)}">`,`  <meta name="twitter:image" content="${escape(card)}">`,'  '+end].join('\n');
fs.writeFileSync(target,html.slice(0,html.indexOf(begin))+block+html.slice(html.indexOf(end)+end.length));
console.log('静的メタデータを設定しました: '+base.href+'（公開操作は行っていません）');
