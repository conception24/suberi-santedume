'use strict';
// dist is canonical. Mirror only its public files for repository-root hosting.
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),check=process.argv.includes('--check');
let count=0;
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const src=path.join(dir,e.name);if(e.isDirectory()){walk(src);continue}assert(e.isFile(),'Unsupported asset type');const rel=path.relative(dist,src),dest=path.join(root,rel);if(check){assert(fs.existsSync(dest)&&fs.readFileSync(src).equals(fs.readFileSync(dest)),`Root mirror differs: ${rel}; run npm run sync:root`)}else{fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest)}count++}}
walk(dist);console.log(JSON.stringify({status:'passed',mode:check?'check':'sync',files:count}));
