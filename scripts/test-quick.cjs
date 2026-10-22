'use strict';
const {spawnSync}=require('child_process'),path=require('path');
for(const file of ['qa.cjs','scripts/test-public-url.cjs','test-app.cjs']){
 const r=spawnSync(process.execPath,[file],{cwd:path.resolve(__dirname,'..'),env:{...process.env,FAST_QA:'1'},stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)
}
