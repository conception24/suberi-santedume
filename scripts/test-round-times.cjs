'use strict';
const fs=require('fs');
const harness=fs.readFileSync('test-app.cjs','utf8').split('(async()=>{')[0];
const tests=`
(async()=>{
 await settle();run("$('closeHelp').onclick();mode='daily';newChallenge()");
 assert.equal(run('dailyRoundTimes()'),null);
 // Ready-thinking time only. Replay of an already-cleared round still belongs to it.
 const expected=[];
 for(let i=0;i<5;i++){
   if(i)run("$('next').onclick()");
   run('startRound()');now+=1000*(i+1)+.35;await solve();
   if(i===0){run("$('retry').onclick()");now+=250.35;await solve();assert.equal(run('streak'),1)}
   expected.push(Math.max(1,Math.round(run('challengeTime()'))));
   if(i<4)assert.equal(run('dailyRoundTimes()'),null);
 }
 const actual=JSON.parse(run('JSON.stringify(dailyRoundTimes())'));
 assert.equal(actual.length,5);assert(actual.every(Number.isSafeInteger));
 assert.deepEqual(actual,expected.map((v,i)=>v-(expected[i-1]||0)));
 assert.equal(actual.reduce((a,b)=>a+b,0),Math.max(1,Math.round(run('challengeTime()'))));
 const stored=run('readDailyRecords()[challengeDate].runs.find(r=>r.id===dailyRunId)');assert.deepEqual(Array.from(stored.roundMs),actual);
 now+=10000;assert.deepEqual(JSON.parse(run('JSON.stringify(dailyRoundTimes())')),actual);
 // New challenge starts clean. Existing records are not fabricated or rewritten.
 run('newChallenge()');assert.equal(run('dailyRoundTimes()'),null);assert.equal(run('dailyRoundEnds.length'),0);
 // Exact-zero/fractional totals keep the posted minimum 1ms and never negative splits.
 run('challengeDone=true;challengeElapsed=0;dailyRoundEnds=[0,0,0,0,1]');assert.equal(run('dailyRoundTimes().join()'),'0,0,0,0,1');
 run('dailyRoundEnds=[0,20,10,20,30];challengeElapsed=30');assert.equal(run('dailyRoundTimes()'),null);
 run('dailyRoundEnds=[1,2,3,4];challengeElapsed=4');assert.equal(run('dailyRoundTimes()'),null);
 run("mode='random';dailyRoundEnds=[1,2,3,4,5];challengeElapsed=5");assert.equal(run('dailyRoundTimes()'),null);
 console.log(JSON.stringify({status:'passed',tests:'five round splits, repeated cleared puzzle, fractional rounding, total sum, persistence, restart, missing/invalid legacy splits'}));
})().catch(error=>{console.error(error);process.exitCode=1});`;
new Function('require','process',harness+tests)(require,process);
