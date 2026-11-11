'use strict';
const $=id=>document.getElementById(id), board=$('board');
const dirs=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
function moves(a,b){const occ=new Set([...a,...b]),out=[];for(const p of a)for(const [dx,dy]of dirs){let x=p%5,y=Math.floor(p/5);while(x+dx>=0&&x+dx<5&&y+dy>=0&&y+dy<5&&!occ.has(x+dx+5*(y+dy))){x+=dx;y+=dy}const q=x+5*y;if(q!==p)out.push({from:p,to:q})}return out}
function moved(a,m){return a.map(p=>p===m.from?m.to:p)}
function won(a){const s=new Set(a);return a.some(p=>[[1,0],[0,1],[1,1],[-1,1]].some(([dx,dy])=>p%5+2*dx>=0&&p%5+2*dx<5&&Math.floor(p/5)+2*dy>=0&&Math.floor(p/5)+2*dy<5&&s.has(p+dx+5*dy)&&s.has(p+2*dx+10*dy)))}
const same=(a,b)=>a.from===b.from&&a.to===b.to;
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
let puzzles=[],order=[],index=0,puzzle,own=[],other=[],selected=null,phase=0,busy=false,finished=false,practice=false,started=0,elapsed=0,streak=0,total=0,correct=0,best=read('suberi-best',0),skin=['plain','cat','emoji'].includes(read('suberi-skin','plain'))?read('suberi-skin','plain'):'plain',sound=read('suberi-sound',true)!==false,audio,master,lastHover=0,token=0,attemptCounted=false,intro=false,introToken=0,hintUses=0,challengeStarted=0,challengeElapsed=0,challengeDone=false,emojiPairIndex=-1,firstSelected=false,confettiToken=0,winSlots=[],currentHintUses=0,playedBoards=[],currentBoard=null,hintPreview=false,hintUsedThisAttempt=false,mode=read('suberi-mode','daily')==='random'?'random':'daily',challengeDate='',thinkingTotal=0,thinkingSince=null,dailyRunId='',mistakes=0,lastCheckpoint=0,hiddenAt=0,roundState='WAIT_START',pendingMode=null,dailyRoundEnds=[];
// Versioned, canonical puzzle IDs keep daily selection stable across browsers and file ordering.
const BANK_VERSION='neutreeko-mixed65-20261104-v3',PUZZLE_BANK_VERSION='neutreeko-mixed-20261104-v2',LEGACY_BANK_VERSION='neutreeko-200-20261022-v1',MIXED_DAILY_START='2026-11-04',DAILY_STORAGE='suberi-daily-results-v1';
function jstDate(ms=Date.now()){return new Date(ms+9*60*60*1000).toISOString().slice(0,10)}
function hashSeed(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function seededRandom(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
// Classify the actual board, including the 15 legacy puzzles with a counter-win.
const threatCache=new WeakMap(),randomBags=[[],[]],recentPuzzleIds=[];
function isCounterThreat(p){if(!threatCache.has(p))threatCache.set(p,moves(p.own,p.other).some(first=>{const a=moved(p.own,first);return moves(p.other,a).some(reply=>won(moved(p.other,reply)))}));return threatCache.get(p)}
function shuffledWith(items,random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function bankVersionForDate(date){return date<MIXED_DAILY_START?LEGACY_BANK_VERSION:BANK_VERSION}
function dailyOrder(date,bank=puzzles){
  const canonical=bank.map((p,i)=>i).sort((a,b)=>bank[a].id-bank[b].id),random=seededRandom(hashSeed(bankVersionForDate(date)+':'+date));
  // Preserve every pre-release daily, including today's already-started games.
  if(date<MIXED_DAILY_START)return shuffledWith(canonical.filter(i=>bank[i].id<=200),random).slice(0,5);
  const count=random()<.75?3:4,threat=shuffledWith(canonical.filter(i=>isCounterThreat(bank[i])),random),regular=shuffledWith(canonical.filter(i=>!isCounterThreat(bank[i])),random);
  return shuffledWith([...threat.slice(0,count),...regular.slice(0,5-count)],random)
}
function randomOrder(){
  const count=Math.random()<.75?3:4,types=shuffledWith([...Array(count).fill(1),...Array(5-count).fill(0)],Math.random);
  return types.map(type=>{if(!randomBags[type].length)randomBags[type]=shuffle(puzzles.filter(p=>Number(isCounterThreat(p))===type).map(p=>p.id));let at=randomBags[type].findIndex(id=>!recentPuzzleIds.includes(id));if(at<0)at=0;const id=randomBags[type].splice(at,1)[0];recentPuzzleIds.push(id);if(recentPuzzleIds.length>12)recentPuzzleIds.shift();return puzzles.findIndex(p=>p.id===id)})
}
function replyChoice(list,a,b){if(mode!=='daily')return list[Math.floor(Math.random()*list.length)];const sorted=[...list].sort((x,y)=>x.from-y.from||x.to-y.to),key=[bankVersionForDate(challengeDate),challengeDate,puzzle?.id,[...a].sort((x,y)=>x-y),[...b].sort((x,y)=>x-y)].join(':');return sorted[hashSeed(key)%sorted.length]}
function resultLabel(){return '5連勝'}
function snapshotLabel(p){return p.mode==='daily'?`${p.date} · 問${p.round}`:`No. ${String(p.id).padStart(3,'0')}`}
function readDailyRecords(){const data=read(DAILY_STORAGE,{});return data&&typeof data==='object'&&!Array.isArray(data)?data:{}}
// Cumulative boundaries avoid per-round rounding drift; finalization includes retries
// of an already-cleared puzzle until the user actually advances to the next one.
function dailyRoundTimes(){
  if(mode!=='daily'||!challengeDone||dailyRoundEnds.length!==5)return null;
  let previous=0;const times=[];for(const end of dailyRoundEnds){if(!Number.isSafeInteger(end)||end<previous)return null;times.push(end-previous);previous=end}
  return previous===Math.max(1,Math.round(challengeTime()))?times:null
}
function saveDailyResult(){
  if(favoriteSession||mode!=='daily'||!challengeDate||!dailyRunId||!puzzle)return;
  const records=readDailyRecords(),day=records[challengeDate]||{bank:bankVersionForDate(challengeDate),runs:[]};if(!Array.isArray(day.runs))day.runs=[];
  const item={id:dailyRunId,bank:bankVersionForDate(challengeDate),completed:challengeDone,cleared:streak,ms:Math.round(challengeTime()),hints:hintUses,mistakes,roundMs:dailyRoundTimes(),updatedAt:Date.now()},at=day.runs.findIndex(r=>r.id===dailyRunId);if(at<0)day.runs.push(item);else day.runs[at]=item;day.runs=day.runs.slice(-20);records[challengeDate]=day;save(DAILY_STORAGE,records)
}
function dailyRecordGroups(day){const runs=(day.runs||[]).filter(r=>r&&Number.isFinite(r.ms));return [...new Set(runs.map(r=>r.bank||LEGACY_BANK_VERSION))].map(bank=>({bank,runs:runs.filter(r=>(r.bank||LEGACY_BANK_VERSION)===bank)}))}
function openDailyRecords(){
  stopThinking();saveDailyResult();const records=readDailyRecords();$('dailyRecordsList').innerHTML='';const dates=Object.keys(records).sort().reverse();
  if(!dates.length){const p=document.createElement('p');p.textContent='まだ記録がありません。今日の5問から始めよう。';$('dailyRecordsList').append(p)}
  for(const date of dates)for(const {bank,runs} of dailyRecordGroups(records[date])){const completed=runs.filter(r=>r.completed),best=[...completed].sort((a,b)=>a.ms-b.ms)[0],latest=runs.at(-1);if(!latest)continue;const row=document.createElement('section');row.className='daily-record';const title=document.createElement('strong');title.textContent=date+(bank!==bankVersionForDate(date)?'（旧版）':'');const text=document.createElement('p'),r=best||latest;text.textContent=`${best?'5問クリア':`途中 ${r.cleared}/5問`} · ${(r.ms/1000).toFixed(1)}秒 · ヒント${r.hints}回`;row.append(title);row.append(text);const note=document.createElement('small');note.textContent=best?`${completed.length}回クリア · 最速の記録${r.mistakes?` · ミス${r.mistakes}回`:''}`:'この端末に保存された途中記録';row.append(note);$('dailyRecordsList').append(row)}
  showPanel('dailyRecordsDialog','closeDailyRecords')
}
function modeCaption(){if(mode==='random')return 'ランダム · 5連勝チャレンジ';return challengeDate+' · '+(challengeDate!==jstDate()?'開始日の5問／次の挑戦で更新':'毎日0時更新（日本時間）')}
function updateModeLabels(){const date=challengeDate||jstDate();$('dailyMode').textContent=`デイリー ${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`;$('dailyMode').title=modeCaption();$('dailyMode').setAttribute('aria-label',`デイリー ${date}。毎日0時更新、日本時間`)}
function applyMode(next){stopThinking();saveDailyResult();mode=next;save('suberi-mode',mode);newChallenge()}
function switchMode(next){
  if(favoriteSession)return;
  if(!['daily','random'].includes(next)||next===mode&&(mode!=='daily'||challengeDate===jstDate()))return;
  if(puzzle&&!challengeDone&&(roundState!=='WAIT_START'||challengeTime()>0||streak>0||hintUses>0)){pendingMode=next;showPanel('modeDialog','cancelMode',$(next==='daily'?'dailyMode':'randomMode'));return}
  applyMode(next)
}
const cells=[],stones=[];for(let i=0;i<25;i++){const b=document.createElement('button');b.className='cell'+(i%2?' tinted':'')+(i%5===4?' edge-right':'')+(i>=20?' edge-bottom':'');b.style.left=(i%5)*20+'%';b.style.top=Math.floor(i/5)*20+'%';b.setAttribute('aria-label',`${Math.floor(i/5)+1}行${i%5+1}列`);b.tabIndex=-1;b.onclick=()=>destination(i);board.append(b);cells.push(b)}
const cat='<svg viewBox="0 0 100 105" aria-hidden="true"><path class="cat-edge" transform="translate(0 7)" d="M22 37 17 13 39 26Q50 22 61 26L83 13 78 37Q91 67 69 78Q50 88 31 78Q9 67 22 37Z"/><path class="cat-face" d="M22 37 17 13 39 26Q50 22 61 26L83 13 78 37Q91 67 69 78Q50 88 31 78Q9 67 22 37Z"/><path d="m25 29-3-8 9 7m44 1 3-8-9 7" fill="none" class="cat-detail" stroke-width="3"/><g class="cat-detail"><ellipse cx="36" cy="51" rx="3.2" ry="4.5"/><ellipse cx="64" cy="51" rx="3.2" ry="4.5"/><path d="m46 60 4 4 4-4Z"/></g><path d="M50 64v4m0-1q-6 7-11 0m11 0q6 7 11 0M15 57l14 3m-15 6 15-1m56-8-14 3m15 6-15-1" fill="none" class="cat-detail cat-whisker" stroke-width="2.3" stroke-linecap="round"/></svg>';
for(let i=0;i<6;i++){const b=document.createElement('button');b.className='stone'+(i>2?' other':'');b.onclick=()=>select(own[i]);b.onpointerenter=e=>{if(e.pointerType==='mouse'&&i<3&&!busy&&!finished&&performance.now()-lastHover>130){beep('hover');lastHover=performance.now()}};board.append(b);stones.push(b)}
function unlock(){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();if(!master){master=audio.createGain();master.connect(audio.destination)}master.gain.setValueAtTime(1,audio.currentTime);if(audio.state==='suspended')audio.resume()}catch{}}
function beep(type){if(!sound||!audio||audio.state!=='running')return;try{if(type==='opponent-win'){sadChime();return}if(type==='win'){winChime();return}if(type==='champion'){championFanfare();return}const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime;const freq={hover:440,tap:560,move:360,win:880,fail:180}[type]||400;o.type='sine';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*(type==='win'?1.5:.8),t+.09);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(type==='hover'?.012:.035,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+.13);o.connect(g);g.connect(master||audio.destination);o.start(t);o.stop(t+.14)}catch{}}
// The playtest's descending sigh, routed through the existing mute gain.
function sadChime(){const t=audio.currentTime;[293.66,277.18,220,146.83].forEach((f,i)=>{const o=audio.createOscillator(),g=audio.createGain(),at=t+i*.26;o.type='triangle';o.frequency.setValueAtTime(f,at);o.frequency.exponentialRampToValueAtTime(f*.88,at+.38);g.gain.setValueAtTime(.0001,at);g.gain.linearRampToValueAtTime(.055,at+.025);g.gain.exponentialRampToValueAtTime(.0001,at+.65);o.connect(g);g.connect(master||audio.destination);o.start(at);o.stop(at+.7)})}
// Soft major-sixth bell: a rising arpeggio plus a brief resolving chord.
function winPitch(n=streak){return 2**(Math.max(0,Math.min(4,n-1))/12)}
function winChime(){const t=audio.currentTime,pitch=winPitch();[523.25,659.25,783.99,1046.5].forEach((f,i)=>{const at=t+i*.065;for(const [ratio,level] of [[1,.035],[2,.009]]){const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(f*ratio*pitch,at);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(level,at+.012);g.gain.exponentialRampToValueAtTime(.0001,at+.55);o.connect(g);g.connect(master||audio.destination);o.start(at);o.stop(at+.57)}})}
// Five-win finale: a longer major fanfare, layered bells, chord and soft timpani.
function championFanfare(){
  const t=audio.currentTime;
  const tone=(freq,at,duration,level,type='sine')=>{const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq*winPitch(5),at);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(level,at+.015);g.gain.exponentialRampToValueAtTime(.0001,at+duration);o.connect(g);g.connect(master||audio.destination);o.start(at);o.stop(at+duration+.03)};
  [523.25,659.25,783.99,1046.5,783.99,1046.5,1318.51,1567.98].forEach((f,i)=>{tone(f,t+i*.13,.65,.035,'triangle');tone(f*2,t+i*.13,.5,.009)});
  [261.63,523.25,659.25,783.99,1046.5].forEach(f=>tone(f,t+1.12,1.8,.026));
  [0,.39,.78,1.12].forEach(at=>tone(82.41,t+at,.25,.065));
}
// Independent shuffle bags: 40 distinct icons on each side before a repeat.
const playerEmojiPool=[['🍝','パスタ'],['🍮','プリン'],['🧻','トイレットペーパー'],['🍕','ピザ'],['🥦','ブロッコリー'],['🍩','ドーナツ'],['🧀','チーズ'],['🍙','おにぎり'],['🪥','歯ブラシ'],['🥐','クロワッサン'],['🌵','サボテン'],['💎','宝石'],['🧲','磁石'],['🎸','ギター'],['🎈','風船'],['🔑','鍵'],['👑','王冠'],['⚽','サッカーボール'],['⏰','目覚まし時計'],['🎲','サイコロ'],['📷','カメラ'],['🎁','プレゼント'],['🧯','消火器'],['🧦','靴下'],['🥨','プレッツェル'],['🍉','スイカ'],['🍒','さくらんぼ'],['🌽','トウモロコシ'],['🍄','キノコ'],['🥕','ニンジン'],['🍔','ハンバーガー'],['🧇','ワッフル'],['🍤','エビフライ'],['🍫','チョコレート'],['🍿','ポップコーン'],['🥑','アボカド'],['🍍','パイナップル'],['🥝','キウイ'],['🍋','レモン'],['🍎','リンゴ']];
const opponentEmojiPool=[['🧟','ゾンビ'],['🦖','恐竜'],['👽','宇宙人'],['🐙','タコ'],['🦈','サメ'],['🦄','ユニコーン'],['🐸','カエル'],['🤖','ロボット'],['🦆','アヒル'],['🐢','カメ'],['🦀','カニ'],['🦋','チョウ'],['🐝','ミツバチ'],['🐧','ペンギン'],['🦉','フクロウ'],['🦇','コウモリ'],['🦁','ライオン'],['🐯','トラ'],['🐼','パンダ'],['🐨','コアラ'],['🐵','サル'],['🐷','ブタ'],['🐮','ウシ'],['🐺','オオカミ'],['🦊','キツネ'],['🐰','ウサギ'],['🐹','ハムスター'],['🐞','テントウムシ'],['🐌','カタツムリ'],['🦎','トカゲ'],['🐊','ワニ'],['🐳','クジラ'],['🦒','キリン'],['🐘','ゾウ'],['🦔','ハリネズミ'],['🦥','ナマケモノ'],['🦜','オウム'],['🦚','クジャク'],['🦢','ハクチョウ'],['🦂','サソリ']];
const emojiPairs=[[['🍝','パスタ'],['🧟','ゾンビ']]],playerEmojiBag=[],opponentEmojiBag=[],recentPlayerEmoji=[],recentOpponentEmoji=[];
function drawEmoji(pool,bag,recent){if(!bag.length)bag.push(...shuffle([...pool]));let index=bag.findIndex(item=>!recent.includes(item[0]));if(index<0)index=0;const item=bag.splice(index,1)[0];recent.push(item[0]);if(recent.length>12)recent.shift();return item}
function newEmojiPair(){const pair=[drawEmoji(playerEmojiPool,playerEmojiBag,recentPlayerEmoji),drawEmoji(opponentEmojiPool,opponentEmojiBag,recentOpponentEmoji)];emojiPairIndex=emojiPairs.push(pair)-1}
function sideName(side){return skin==='emoji'?(emojiPairs[Math.max(0,emojiPairIndex)][side][1]):skin==='cat'?(side?'白猫':'黒猫'):(side?'白い石':'紫の石')}
function prompt(){return ''}
function paintSkin(){
  $('plain').setAttribute('aria-pressed',skin==='plain');$('cats').setAttribute('aria-pressed',skin==='cat');$('emojis').setAttribute('aria-pressed',skin==='emoji');
  for(let i=0;i<6;i++){const b=stones[i];b.classList.toggle('cat',skin==='cat');b.classList.toggle('emoji',skin==='emoji');if(skin==='cat')b.innerHTML=cat;else{b.innerHTML='';if(skin==='emoji'){const glyph=document.createElement('span');glyph.className='emoji-glyph';glyph.setAttribute('aria-hidden','true');glyph.textContent=emojiPairs[Math.max(0,emojiPairIndex)][i<3?0:1][0];b.append(glyph)}}}
  if(currentBoard){currentBoard.skin=skin;currentBoard.emojiPair=emojiPairIndex}$('matchup').hidden=false;const pair=emojiPairs[Math.max(0,emojiPairIndex)];
  [$('matchupOwn'),$('matchupOther')].forEach((icon,side)=>{icon.className='matchup-icon '+skin+(side?' other':'');icon.innerHTML='';if(skin==='emoji')icon.textContent=pair[side][0];else if(skin==='cat')icon.innerHTML=cat;icon.setAttribute('aria-hidden','true')});$('matchup').setAttribute('aria-label',`あなたは${sideName(0)}、相手は${sideName(1)}`);
}
function setSkin(s){if(!['plain','cat','emoji'].includes(s))return;if(favoriteSession){setFavoriteSkin(s);return}skin=s;save('suberi-skin',s);paintSkin();if(puzzle){render();if(!intro&&!finished&&!busy)status(phase===2?'あと1手。3個そろえる手を探そう':prompt())}}
function render(){for(let i=0;i<6;i++){const pos=i<3?own[i]:other[i-3],b=stones[i];b.style.left=(pos%5*20+2.35)+'%';b.style.top=(Math.floor(pos/5)*20+2.35)+'%';b.classList.toggle('selected',i<3&&pos===selected);b.classList.toggle('hint-origin',hintPreview&&i<3&&pos===puzzle.solution.from);b.classList.toggle('ready',i<3&&roundState==='READY'&&phase===0&&!busy&&!finished&&!intro&&!firstSelected);b.classList.toggle('winning',finished&&(i<3?won(own):won(other)));b.disabled=i>2||roundState!=='READY'||busy||finished;b.setAttribute('aria-label',`${i<3?'あなた':'相手'}の${sideName(i<3?0:1)} ${Math.floor(pos/5)+1}行${pos%5+1}列`)}const targets=hintPreview?[puzzle.solution.to]:selected===null?[]:moves(own,other).filter(m=>m.from===selected).map(m=>m.to);cells.forEach((c,i)=>{c.classList.toggle('destination',targets.includes(i));c.classList.toggle('hint-target',hintPreview&&i===puzzle.solution.to);c.tabIndex=!busy&&targets.includes(i)?0:-1;c.disabled=busy||!targets.includes(i);c.setAttribute('aria-label',`${Math.floor(i/5)+1}行${i%5+1}列${targets.includes(i)?'へ移動':''}`)});for(let i=0;i<3;i++)$('step'+i).classList.toggle('active',phase===i);$('dailyMode').setAttribute('aria-pressed',mode==='daily');$('randomMode').setAttribute('aria-pressed',mode==='random');updateModeLabels();
$('historyButton').hidden=!challengeDone;$('status').hidden=topView||challengeDone||!$('status').textContent;
for(let i=0;i<5;i++){const slot=$('slot'+i),done=winSlots[i],active=i===streak&&!challengeDone;const hinted=done?done.hints>0:active&&currentHintUses>0;slot.classList.toggle('cleared',!!done);slot.classList.toggle('current',active);slot.classList.toggle('hinted',hinted);const label=hinted?(done?'<span class="slot-check">✓</span>':'')+'<span class="slot-hint">HINT</span>':done?'✓':String(i+1);if(slot.innerHTML!==label)slot.innerHTML=label;slot.setAttribute('aria-label',`${i+1}問目 ${done?'クリア':active?'挑戦中':'未挑戦'}${hinted?'・ヒント使用':''}`)}
$('newChallenge').hidden=!challengeDone;$('hint').hidden=challengeDone;$('hint').disabled=topView||roundState!=='READY'||busy||challengeDone||(finished&&attemptCounted)||hintUsedThisAttempt;$('startRound').hidden=roundState!=='WAIT_START'||!puzzle||challengeDone;$('startRound').textContent=String(Math.min(5,streak+1)).replace(/[0-9]/g,d=>String.fromCharCode(d.charCodeAt(0)+65248))+'戦目：スタート';board.classList.toggle('waiting-start',roundState==='WAIT_START');
$('retry').hidden=topView||!!favoriteSession&&finished&&attemptCounted||selected!==null||!canRetry();$('next').hidden=topView||!!favoriteSession||busy||challengeDone||selected!==null||!finished||((mode==='daily'||won(other))&&!attemptCounted);$('boardTools').hidden=$('retry').hidden&&$('next').hidden;
if(typeof syncLeaderboardResult==='function')syncLeaderboardResult();$('finishShare').hidden=topView||!challengeDone;$('finishShareLabel').textContent=resultLabel()+'をシェア ↗';$('newChallenge').textContent=mode==='daily'?'もう一度デイリーに挑戦する':'もう一度５連勝チャレンジをする';document.body.classList.toggle('top-view',topView);$('number').textContent='';$('number').hidden=true;$('helpButton').textContent=topView?'遊び方':'TOP';$('helpButton').setAttribute('aria-label',topView?'遊び方':'TOPに戻る');$('helpButton').setAttribute('aria-haspopup',topView?'dialog':'false');$('favoriteProblemName').hidden=!favoriteSession;$('favoriteFinishOverlay').hidden=!favoriteSession||!finished||!attemptCounted||busy||topView;$('favoriteNext').hidden=!favoriteNextItem();$('topResume').hidden=!topView||roundState==='WAIT_START'||!puzzle;$('resumeFromTop').disabled=busy;$('resumeFromTop').textContent=challengeDone?'結果を見る':'続きを遊ぶ';placeBoardTools();syncThinking();$('timer').textContent=timeString(challengeTime())}
function status(s,cls=''){$('status').textContent=s;$('status').className='status '+cls;$('status').hidden=!s||challengeDone}
function stopThinking(){if(thinkingSince!==null){thinkingTotal+=Math.max(0,performance.now()-thinkingSince);thinkingSince=null}}
function anyPanelOpen(){return ['helpDialog','historyDialog','dailyRecordsDialog','rankingDialog','externalDialog','modeDialog','favoritesDialog'].some(id=>$(id).open)}
function syncThinking(){const ready=!topView&&!!puzzle&&roundState==='READY'&&!intro&&!busy&&!finished&&!challengeDone&&!anyPanelOpen()&&!document.hidden;if(ready){if(thinkingSince===null)thinkingSince=performance.now()}else stopThinking()}
function challengeTime(){return challengeDone?challengeElapsed:thinkingTotal+(thinkingSince===null?0:Math.max(0,performance.now()-thinkingSince))}
function startTimer(){syncThinking()}
// Large controls use free space, or dock below the board if no safe space fits.
function canRetry(){return !!puzzle&&roundState==='READY'&&!busy&&!challengeDone&&(finished||(phase===2&&!moves(own,other).some(m=>won(moved(own,m)))))}
function boardToolPlacement(a,b,count,size){
  const buttonWidth=Math.max(104,Math.min(126,size*.28)),buttonSize=46,width=count*buttonWidth+(count-1)*8,height=buttonSize+4;
  const candidates=[12,11,13,7,17,6,8,16,18,...Array.from({length:25},(_,i)=>i)];
  const clear=n=>{const x=(n%5+.5)*size/5,y=(Math.floor(n/5)+.5)*size/5;return x>width/2+4&&x<size-width/2-4&&y>height/2+4&&y<size-height/2-4&&[...a,...b].every(p=>Math.abs(x-(p%5+.5)*size/5)>width/2+size*.0765+4||Math.abs(y-(Math.floor(p/5)+.5)*size/5)>height/2+size*.0765+7)};
  return {cell:candidates.find(clear)??null,buttonWidth,buttonSize,width,height};
}
function placeBoardTools(){
  const count=Number(!$('retry').hidden)+Number(!$('next').hidden);if(!count){$('toolsDock').hidden=true;return}
  const {cell,buttonWidth,buttonSize}=boardToolPlacement(own,other,count,board.clientWidth||440),tools=$('boardTools');
  tools.style.setProperty('--tool-width',`${buttonWidth}px`);tools.style.setProperty('--tool-size',`${buttonSize}px`);tools.classList.toggle('docked',cell===null);$('toolsDock').hidden=cell!==null;
  if(cell===null)$('toolsDock').append(tools);else{board.append(tools);tools.style.left=(cell%5*20+10)+'%';tools.style.top=(Math.floor(cell/5)*20+10)+'%'}
}
function celebrate(grand=false){
  const layer=$('confetti'),mine=++confettiToken;layer.innerHTML='';layer.classList.toggle('grand',grand);board.classList.toggle('grand-win',grand);
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const colors=['#ffe62d','#58f0bd','#ff4a98','#a886ff','#fffaf3'];
  for(let i=0;i<(grand?180:48);i++){const bit=document.createElement('i');bit.style.left=(2+Math.random()*96)+'%';bit.style.background=colors[i%colors.length];bit.style.setProperty('--drift',(Math.random()-.5)*(grand?440:180)+'px');bit.style.setProperty('--spin',(Math.random()-.5)*1400+'deg');bit.style.animationDelay=(grand?Math.floor(i/60)*.7+Math.random()*.3:Math.random()*.18)+'s';bit.style.animationDuration=(grand?2.3+Math.random():1.25+Math.random()*.7)+'s';if(grand&&i%4===0)bit.className='confetti-star';layer.append(bit)}
  if(grand)for(let i=0;i<3;i++){const ring=document.createElement('b');ring.className='victory-burst';ring.style.left=[22,78,50][i]+'%';ring.style.top=[30,40,24][i]+'%';ring.style.animationDelay=(.2+i*.55)+'s';layer.append(ring)}
  setTimeout(()=>{if(mine===confettiToken){layer.innerHTML='';layer.classList.remove('grand');board.classList.remove('grand-win')}},grand?5200:2200);
}
window.addEventListener?.('resize',placeBoardTools);
function timeString(ms){const t=Math.floor(ms/100);return `${String(Math.floor(t/600)).padStart(2,'0')}:${String(Math.floor(t/10)%60).padStart(2,'0')}.${t%10}`}
setInterval(()=>{$('timer').textContent=timeString(challengeTime());updateModeLabels();if(Date.now()-lastCheckpoint>5000){lastCheckpoint=Date.now();saveDailyResult()}},100);
function select(p){if(topView||roundState!=='READY'||anyPanelOpen()||busy||finished||!own.includes(p))return;unlock();startTimer();firstSelected=true;selected=selected===p?null:p;beep('tap');render()}
function finish(ok,reason=''){
  stopThinking();finished=true;selected=null;
  if(!favoriteSession&&!attemptCounted){total++;if(ok){correct++;streak++;attemptCounted=true;winSlots.push({hints:currentHintUses,id:puzzle.id});best=Math.max(best,streak);save('suberi-best',best)}else{mistakes++;if(mode!=='daily'&&!won(other)){streak=0;winSlots=[]}}}
  if(favoriteSession)attemptCounted=ok;
  elapsed=started?performance.now()-started:0;
  if(!favoriteSession&&streak>=5&&!challengeDone){challengeElapsed=challengeTime();challengeDone=true;if(mode==='daily')dailyRoundEnds[4]=Math.max(1,Math.round(challengeElapsed))}saveDailyResult();
  beep(ok?(challengeDone?'champion':'win'):won(other)?'opponent-win':'fail');
  status(ok?(challengeDone?resultLabel()+'！':favoriteSession?'お気に入りの練習クリア！':practice?'もう一度クリア！':`正解！ あと${5-streak}${mode==='daily'?'問':'連勝'}`):won(other)?'':(reason||'3手目ではそろえられませんでした。もう一度！'),ok?'success':'error');
  if(ok||won(other)){celebrate(ok&&challengeDone);const a=[...(ok?own:other)].sort((a,b)=>a-b);$('winLine').innerHTML=`<line x1="${a[0]%5*100+50}" y1="${Math.floor(a[0]/5)*100+50}" x2="${a[2]%5*100+50}" y2="${Math.floor(a[2]/5)*100+50}"/>`}render()
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// Exact three-ply defense only: win now, otherwise minimize the player's next wins.
function chooseReply(a,b){const candidates=moves(b,a).map(m=>{const next=moved(b,m);return {...m,immediate:won(next),finishes:moves(a,next).filter(w=>won(moved(a,w))).length}});const wins=candidates.filter(m=>m.immediate);if(wins.length)return replyChoice(wins,a,b);const min=Math.min(...candidates.map(m=>m.finishes));const best=candidates.filter(m=>m.finishes===min);return replyChoice(best,a,b)}
async function destination(to,demo=false){
  if(topView||roundState!=='READY'||anyPanelOpen()||selected===null||busy||finished)return;const m={from:selected,to};if(!moves(own,other).some(n=>same(m,n)))return;unlock();startTimer();const myToken=token;busy=true;selected=null;own=moved(own,m);beep('move');render();await pause(demo?520:330);if(token!==myToken)return;
  if(phase===0){phase=1;status('相手が考えています…');render();await pause(demo?1000:900);if(token!==myToken)return;
    const reply=chooseReply(own,other);if(!reply){busy=false;finish(false,'相手の合法手がありません');return}other=moved(other,reply);beep('move');render();await pause(demo?520:400);if(token!==myToken)return;
    if(won(other)){busy=false;finish(false);return}phase=2;busy=false;status('あと1手。3個そろえる手を探そう');render()
  }else{busy=false;finish(won(own))}
}
function matchingStart(current,target){const remaining=target.filter(pos=>!current.includes(pos));return current.length===target.length?current.map(pos=>target.includes(pos)?pos:remaining.shift()):[...target]}
function resetPositions(a,b,preserve=true){
  // Flush the reset with transitions OFF. Never animate a reset as a legal move.
  board.classList.add('position-reset');
  own=preserve?matchingStart(own,a):[...a];other=preserve?matchingStart(other,b):[...b];
  render();void board.offsetWidth;board.classList.remove('position-reset');
}
function officialSides(){const sides=[[7,21,23],[1,3,17]];return [sides[puzzle.turn],sides[1-puzzle.turn]]}
function finishIntro(skip=true){introToken++;intro=false;busy=false;roundState='READY';if(skip)resetPositions(puzzle.own,puzzle.other);board.classList.remove('introducing');board.classList.remove('intro-reset');$('introControls').hidden=true;status(prompt());render()}
function cancelIntroForPanel(){
  if(!intro)return;introToken++;intro=false;busy=false;roundState='WAIT_START';stopThinking();board.classList.remove('introducing');board.classList.remove('intro-reset');$('introControls').hidden=true;status('');resetPositions(...officialSides(),false)
}
function startRound(){
  if(!puzzle||roundState!=='WAIT_START'||busy||challengeDone||anyPanelOpen()||document.hidden)return;
  topView=false;unlock();roundState='INTRO';intro=true;busy=true;render();
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finishIntro();return}
  return playIntro()
}
async function playIntro(){
  if(!puzzle||anyPanelOpen()||document.hidden)return;
  const mine=++introToken,myToken=token;roundState='INTRO';intro=true;busy=true;[own,other]=officialSides().map(s=>[...s]);board.classList.add('introducing');board.classList.add('intro-reset');$('introControls').hidden=false;status('出題の準備中…');render();
  const path=puzzle.path||[],delay=Math.max(35,Math.min(70,3000/Math.max(1,path.length)));board.style.setProperty('--intro-slide',`${delay*.9}ms`);
  await pause(30);if(mine!==introToken||myToken!==token)return;board.classList.remove('intro-reset');await pause(170);
  for(let i=0;i<path.length;i++){if(mine!==introToken||myToken!==token)return;const [from,to]=path[i];if(i%2===puzzle.turn)own=moved(own,{from,to});else other=moved(other,{from,to});render();await pause(delay)}
  if(mine===introToken&&myToken===token)finishIntro(false)
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function loadPuzzle(retry=false,showIntro=!retry,keepHintLock=false){
  if(challengeDone)return;stopThinking();if(!keepHintLock)hintUsedThisAttempt=false;hintPreview=false;board.classList.remove('hint-demo');firstSelected=false;confettiToken++;$('confetti').innerHTML='';$('confetti').classList.remove('grand');board.classList.remove('grand-win');token++;introToken++;intro=false;board.classList.remove('introducing');board.classList.remove('intro-reset');
  if(retry){practice=favoriteSession?true:attemptCounted;if(favoriteSession)attemptCounted=false}else{
    if(mode==='daily'&&!favoriteSession&&attemptCounted&&index>0)dailyRoundEnds[index-1]=Math.round(thinkingTotal);
    practice=false;attemptCounted=false;currentHintUses=0;
    if(index>=order.length){if(mode==='daily')return;order=randomOrder();index=0}
    puzzle=puzzles[order[index++]];newEmojiPair();
    currentBoard={id:puzzle.id,mode,date:challengeDate,round:index,own:[...puzzle.own],other:[...puzzle.other],skin,emojiPair:emojiPairIndex};playedBoards.push(currentBoard);if(playedBoards.length>5)playedBoards.shift();paintSkin()
  }
  roundState=showIntro?'WAIT_START':'READY';selected=null;phase=0;busy=keepHintLock;finished=false;started=0;elapsed=0;$('timer').textContent=timeString(challengeTime());$('winLine').innerHTML='';$('number').hidden=true;$('number').textContent='';status(prompt());$('introControls').hidden=true;if(roundState==='WAIT_START')resetPositions(...officialSides(),false);else resetPositions(puzzle.own,puzzle.other,retry);saveDailyResult()
}
async function useHint(){
  if(topView||!puzzle||roundState!=='READY'||anyPanelOpen()||busy||challengeDone||(finished&&attemptCounted)||hintUsedThisAttempt)return;
  // Consume once per attempt, synchronously. Explicit reset rearms; history stays cumulative.
  hintUsedThisAttempt=true;currentHintUses++;hintUses++;if(attemptCounted){const slot=winSlots.find(s=>s.id===puzzle.id);if(slot)slot.hints=currentHintUses}stopThinking();busy=true;$('hint').disabled=true;unlock();saveDailyResult();
  loadPuzzle(true,false,true);const mine=token;busy=true;firstSelected=true;hintPreview=true;selected=puzzle.solution.from;board.classList.add('hint-demo');status(puzzle.solutions?.length>1?'正解の初手の一例です。この駒を、光る点まで動かします':'この駒を、光る点まで動かします');render();
  await pause(650);if(mine!==token)return;hintPreview=false;busy=false;
  await destination(puzzle.solution.to,true);if(mine!==token)return;board.classList.remove('hint-demo');if(!finished&&!busy)status('あと1手を自分でそろえよう');render()
}
function newChallenge(){
  if(favoriteSession)return;topView=true;
  stopThinking();saveDailyResult();token++;introToken++;challengeDone=false;thinkingTotal=0;thinkingSince=null;challengeStarted=0;challengeElapsed=0;hintUses=0;currentHintUses=0;winSlots=[];dailyRoundEnds=[];playedBoards=[];currentBoard=null;streak=0;total=0;correct=0;mistakes=0;puzzle=null;practice=false;attemptCounted=false;
  challengeDate=mode==='daily'?jstDate():'';dailyRunId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);order=mode==='daily'?dailyOrder(challengeDate):randomOrder();index=0;if(puzzles.length)loadPuzzle()
}
// Only immutable puzzle-start positions are exported; no solutions or move markers.
function shareText(){const date=challengeDate.split('-');return `#すべり三手詰め${mode==='daily'?` デイリー問題（${Number(date[1])}月${Number(date[2])}日）`:' ランダム問題'}\n5連勝（${(challengeTime()/1000).toFixed(1)}秒）ヒント${hintUses}回使用\n#ニュートリーコファンメイド`}
function drawStartBoard(ctx,snapshot,x,y,size){
  const cell=size/5;ctx.save();ctx.translate(x,y);
  for(let n=0;n<25;n++){ctx.fillStyle=n%2?'#fce6f2':'#fff9ee';ctx.fillRect(n%5*cell,Math.floor(n/5)*cell,cell,cell)}
  ctx.strokeStyle='#d8c5d4';ctx.lineWidth=1;for(let n=1;n<5;n++){ctx.beginPath();ctx.moveTo(n*cell,0);ctx.lineTo(n*cell,size);ctx.moveTo(0,n*cell);ctx.lineTo(size,n*cell);ctx.stroke()}
  ctx.strokeStyle='#211b3c';ctx.lineWidth=3;ctx.strokeRect(0,0,size,size);
  [snapshot.own,snapshot.other].forEach((pieces,side)=>pieces.forEach(pos=>{
    const cx=(pos%5+.5)*cell,cy=(Math.floor(pos/5)+.5)*cell,r=cell*.35;ctx.save();ctx.translate(cx,cy);
    if(snapshot.skin==='emoji'){
      ctx.font=`${cell*.7}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(emojiPairs[snapshot.emojiPair][side][0],0,cell*.02);
    }else if(snapshot.skin==='cat'){
      ctx.scale(r/32,r/32);ctx.beginPath();ctx.moveTo(-25,-10);ctx.lineTo(-29,-32);ctx.lineTo(-10,-21);ctx.quadraticCurveTo(0,-26,10,-21);ctx.lineTo(29,-32);ctx.lineTo(25,-10);ctx.bezierCurveTo(40,28,-40,28,-25,-10);ctx.fillStyle=side?'#fffefa':'#25292b';ctx.fill();ctx.strokeStyle=side?'#9d9a96':'#080a0c';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle=side?'#353b3b':'#edf0e9';for(const eye of [-11,11]){ctx.beginPath();ctx.ellipse(eye,-4,2.3,3.2,0,0,Math.PI*2);ctx.fill()}ctx.beginPath();ctx.moveTo(-3,5);ctx.lineTo(3,5);ctx.lineTo(0,9);ctx.fill();
    }else{ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle=side?'#fff4dc':'#8060f2';ctx.fill();ctx.strokeStyle='#382454';ctx.lineWidth=2;ctx.stroke()}
    ctx.restore();
  }));ctx.restore();
}
function buildShareImage(snapshots){
  if(!snapshots.length)return null;
  const cols=snapshots.length===1?1:2,rows=Math.ceil(snapshots.length/cols),card=364,gap=24,margin=28,header=118;
  const canvas=document.createElement('canvas');canvas.width=margin*2+cols*card+(cols-1)*gap;canvas.height=header+rows*410+(rows-1)*gap+40;
  const c=canvas.getContext('2d');if(!c)throw Error('canvas unavailable');
  c.fillStyle='#8d2ced';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#ffe62d';c.font='bold 32px sans-serif';c.fillText('すべり三手詰め',margin,46);c.fillStyle='#fffaf3';c.font='bold 18px sans-serif';c.fillText(`${resultLabel()} · ${(challengeTime()/1000).toFixed(1)}秒 · ヒント${hintUses}回使用`,margin,82);
  snapshots.forEach((p,i)=>{const x=margin+(i%cols)*(card+gap),y=header+Math.floor(i/cols)*(410+gap);c.fillStyle='#211b3c';c.fillRect(x+5,y+6,card,410);c.fillStyle='#fffaf3';c.fillRect(x,y,card,410);c.fillStyle='#211b3c';c.font='bold 18px sans-serif';c.fillText(`${snapshotLabel(p)} · 出題時の配置`,x+22,y+30);drawStartBoard(c,p,x+22,y+49,320);c.font='13px sans-serif';c.fillStyle='#62586f';c.fillText(p.skin==='emoji'?`あなた ${emojiPairs[p.emojiPair][0][0]}   VS   ${emojiPairs[p.emojiPair][1][0]} 相手`:p.skin==='cat'?'あなた：黒猫　／　相手：白猫':'あなた：紫　／　相手：白',x+22,y+394)});
  return {dataUrl:canvas.toDataURL('image/png'),filename:'suberi-three-puzzles.png',width:canvas.width,height:canvas.height,count:snapshots.length};
}
function openTweet(){if(!challengeDone)return;window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent(shareText())+'&url='+encodeURIComponent(location.origin+location.pathname),'_blank','noopener,noreferrer')}
function saveBoards(snapshots){
  try{const data=buildShareImage(snapshots);if(!data)return;const link=document.createElement('a');link.href=data.dataUrl;link.download=mode==='daily'?`suberi-daily-${challengeDate}${snapshots.length===1?'-round-'+snapshots[0].round:''}.png`:snapshots.length===1?`suberi-puzzle-${snapshots[0].id}.png`:data.filename;document.body.append(link);link.click();link.remove();$('historyStatus').textContent='PNG画像を保存しました。'}catch{$('historyStatus').textContent='画像を保存できませんでした。もう一度お試しください。'}
}
let historySkin=skin;
function displaySnapshot(p,chosen=skin){return {...p,skin:chosen,emojiPair:Number.isInteger(p.emojiPair)&&emojiPairs[p.emojiPair]?p.emojiPair:Math.max(0,emojiPairIndex)}}
function appendSnapshotMatchup(card,p){
 const row=document.createElement('div');row.className='matchup snapshot-matchup';
 for(let side=0;side<2;side++){
  const group=document.createElement('span');group.className='matchup-side';const label=document.createElement('span');label.textContent=side?'相手':'あなた';const icon=document.createElement('b');icon.className='matchup-icon '+p.skin+(side?' other':'');icon.setAttribute('aria-hidden','true');
  if(p.skin==='cat')icon.innerHTML=cat;else if(p.skin==='emoji')icon.textContent=emojiPairs[p.emojiPair][side][0];
  group.append(label);group.append(icon);row.append(group)
 }
 card.append(row)
}
function renderHistoryBoards(){
 $('historyBoards').innerHTML='';
 for(const [id,value] of [['historyPlain','plain'],['historyCats','cat'],['historyEmojis','emoji']])$(id).setAttribute('aria-pressed',historySkin===value);
 playedBoards.forEach(original=>{
 const p=displaySnapshot(original,historySkin),card=document.createElement('section');card.className='history-card';
 const cv=document.createElement('canvas');cv.width=320;cv.height=320;try{drawStartBoard(cv.getContext('2d'),p,4,4,312)}catch{}card.append(cv);
 const label=document.createElement('strong');label.textContent=snapshotLabel(p);card.append(label);appendSnapshotMatchup(card,p);
 const image=document.createElement('button');image.textContent='この盤面を画像保存';image.onclick=()=>saveBoards([p]);card.append(image);
 const favorite=document.createElement('button');favorite.textContent='☆ お気に入りに保存';favorite.disabled=readFavorites().some(f=>f.key===favoriteKey(p));if(favorite.disabled)favorite.textContent='★ 保存済み';
 favorite.onclick=()=>{if(addFavorite(p,'historyStatus')){favorite.textContent='★ 保存済み';favorite.disabled=true}};card.append(favorite);$('historyBoards').append(card)
 })
}
function openHistory(){
 if(!challengeDone)return;historySkin=skin;$('historyStatus').textContent='出題時の配置です。あなたの駒は各盤面の下で確認できます。答えは載りません。';renderHistoryBoards();showPanel('historyDialog','closeHistory')
}
for(const [id,value] of [['historyPlain','plain'],['historyCats','cat'],['historyEmojis','emoji']])$(id).onclick=()=>{historySkin=value;renderHistoryBoards()};
$('historyButton').onclick=openHistory;$('closeHistory').onclick=()=>$('historyDialog').close();$('saveAllBoards').onclick=()=>saveBoards(playedBoards.map(p=>displaySnapshot(p,historySkin)));
$('hint').onclick=useHint;$('newChallenge').onclick=newChallenge;
$('skipIntro').onclick=()=>{if(intro&&!anyPanelOpen())finishIntro()};$('startRound').onclick=startRound;
$('sound').onclick=()=>{sound=!sound;save('suberi-sound',sound);if(!sound&&master)master.gain.setValueAtTime(0,audio.currentTime);unlock();$('sound').innerHTML=`♪ <span>${sound?'ON':'OFF'}</span>`;$('sound').setAttribute('aria-pressed',sound);$('sound').setAttribute('aria-label',`効果音を${sound?'オフ':'オン'}にする`);beep('tap')};$('plain').onclick=()=>setSkin('plain');$('cats').onclick=()=>setSkin('cat');$('emojis').onclick=()=>{if(skin==='emoji'){newEmojiPair();if(favoriteSession)favoriteView.emojiPair=emojiPairIndex}setSkin('emoji')};$('retry').onclick=()=>{if(canRetry())loadPuzzle(true)};$('next').onclick=()=>{if(puzzles.length&&!busy&&finished&&(mode!=='daily'&&!won(other)||attemptCounted))loadPuzzle()};$('finishShareButton').onclick=openTweet;

let panelReturnFocus=null;
function showPanel(id,closeId,opener=null){stopThinking();cancelIntroForPanel();panelReturnFocus=opener||document.activeElement;$(id).showModal();$(closeId).focus()}
function wirePanel(id,closeId,fallback){const dialog=$(id);$(closeId).onclick=()=>dialog.close();dialog.onclose=()=>{if(id==='modeDialog')pendingMode=null;(panelReturnFocus||$(fallback))?.focus();panelReturnFocus=null;syncThinking()};dialog.onclick=e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}}
function openHelp(){showPanel('helpDialog','closeHelp',$('helpButton'))}
wirePanel('helpDialog','closeHelp','helpButton');wirePanel('historyDialog','closeHistory','historyButton');wirePanel('dailyRecordsDialog','closeDailyRecords','dailyRecordsButton');wirePanel('externalDialog','stayHere','officialLink');wirePanel('modeDialog','cancelMode','dailyMode');
$('confirmMode').onclick=()=>{const next=pendingMode;$('modeDialog').close();if(next)applyMode(next)};
$('helpButton').onclick=()=>topView?openHelp():goTop();$('dailyRecordsButton').onclick=openDailyRecords;$('dailyMode').onclick=()=>switchMode('daily');$('randomMode').onclick=()=>switchMode('random');
const FAVORITES_STORAGE='suberi-favorites-v1';
let favoriteSession=null,favoriteView=null,pendingDeleteKey=null,pendingDeleteButton=null,topView=true;
function puzzleBankVersion(p){return p.id<=200?LEGACY_BANK_VERSION:PUZZLE_BANK_VERSION}
function favoriteKey(p){return puzzleBankVersion(p)+':'+p.id}
function validFavorite(f){const p=f?.puzzle;if(!p||!Array.isArray(p.own)||!Array.isArray(p.other))return false;const positions=[...p.own,...p.other];return typeof f.key==='string'&&Number.isInteger(p.id)&&p.own.length===3&&p.other.length===3&&positions.every(n=>Number.isInteger(n)&&n>=0&&n<25)&&new Set(positions).size===6&&!won(p.own)&&!won(p.other)&&p.solution&&moves(p.own,p.other).some(m=>same(m,p.solution))}
function readFavorites(){const data=read(FAVORITES_STORAGE,[]);return Array.isArray(data)?data.filter(validFavorite):[]}
function writeFavorites(items,statusId,message){try{localStorage.setItem(FAVORITES_STORAGE,JSON.stringify(items));$(statusId).textContent=message;$('favoritesTitle').textContent='お気に入り（'+items.length+'問）';return true}catch{$(statusId).textContent='保存できませんでした。端末の空き容量やブラウザーの保存設定を確認して、もう一度お試しください。';return false}}
function addFavorite(snapshot,statusId){
 const items=readFavorites(),key=favoriteKey(snapshot);
 if(items.some(f=>f.key===key)){$(statusId).textContent='この問題は保存済みです。';return true}
 const source=puzzles.find(p=>p.id===snapshot.id);if(!source){$(statusId).textContent='問題を保存できませんでした。';return false}
 return writeFavorites([...items,{key,bank:puzzleBankVersion(snapshot),label:snapshotLabel(snapshot),savedAt:Date.now(),puzzle:JSON.parse(JSON.stringify(source))}],statusId,'お気に入りに保存しました。この端末で再プレイできます。')
}

function ensureFavoriteView(){if(!favoriteView)favoriteView={skin:'plain',emojiPair:Math.max(0,emojiPairIndex),returnTop:topView}}
function hideFavoriteNotice(){$('favoritesNotice').hidden=true;$('favoritesNoticeToggle').setAttribute('aria-expanded','false')}
function setFavoriteSkin(value){
 if(!['plain','cat','emoji'].includes(value))return;ensureFavoriteView();favoriteView.skin=value;resetDeleteConfirmation();hideFavoriteNotice();
 if(favoriteSession){skin=value;emojiPairIndex=favoriteView.emojiPair;paintSkin();render()}else renderFavorites()
}
function favoriteNextItem(){if(!favoriteSession)return null;const items=readFavorites(),at=items.findIndex(p=>p.key===favoriteSession.key);return at<0?null:items[at+1]||null}
function resetDeleteConfirmation(){if(pendingDeleteButton)pendingDeleteButton.textContent='削除';pendingDeleteKey=null;pendingDeleteButton=null}
function renderFavorites(){
 ensureFavoriteView();const list=$('favoritesList');list.innerHTML='';const items=readFavorites();$('favoritesTitle').textContent='お気に入り（'+items.length+'問）';
 $('favoritesLegend').innerHTML='';appendSnapshotMatchup($('favoritesLegend'),{skin:favoriteView.skin,emojiPair:favoriteView.emojiPair});
 for(const [id,value] of [['favoritesPlain','plain'],['favoritesCats','cat'],['favoritesEmojis','emoji']])$(id).setAttribute('aria-pressed',favoriteView.skin===value);
 if(!items.length){const empty=document.createElement('p');empty.textContent='まだお気に入りがありません。5問終了後「５試合の配置を見る・保存」から好きな問題を保存できます。';list.append(empty)}
 items.forEach(item=>{
 const card=document.createElement('section');card.className='history-card';const p={...item.puzzle,skin:favoriteView.skin,emojiPair:favoriteView.emojiPair};
 const cv=document.createElement('canvas');cv.width=320;cv.height=320;try{drawStartBoard(cv.getContext('2d'),p,4,4,312)}catch{}card.append(cv);
 const label=document.createElement('strong');label.textContent=item.label||'お気に入りの問題';card.append(label);
 const play=document.createElement('button');play.textContent='振り返りプレイ';play.onclick=()=>{resetDeleteConfirmation();openFavoriteReplay(item)};card.append(play);
 const remove=document.createElement('button');remove.textContent='削除';remove.onclick=()=>{
  if(pendingDeleteKey!==item.key){resetDeleteConfirmation();pendingDeleteKey=item.key;pendingDeleteButton=remove;remove.textContent='本当に削除？';$('favoritesStatus').textContent='もう一度押すと削除します。別の操作でキャンセルできます。';return}
  if(writeFavorites(readFavorites().filter(f=>f.key!==item.key),'favoritesStatus','お気に入りから削除しました。')){resetDeleteConfirmation();renderFavorites();$('closeFavorites').focus()}
 };card.append(remove);list.append(card)
 })
}
function openFavorites(){ensureFavoriteView();topView=false;resetDeleteConfirmation();hideFavoriteNotice();$('favoritesStatus').textContent='';renderFavorites();showPanel('favoritesDialog','closeFavorites',$('favoritesButton'));render()}
function openFavoriteReplay(item){
 if(favoriteSession||busy||intro){$('favoritesStatus').textContent='駒の動きが終わってから再プレイしてください。';return}
 ensureFavoriteView();stopThinking();saveDailyResult();
 favoriteSession={state:{skin,order,index,puzzle,own,other,selected,phase,busy,finished,practice,started,elapsed,streak,total,correct,best,attemptCounted,intro,hintUses,challengeStarted,challengeElapsed,challengeDone,emojiPairIndex,firstSelected,winSlots,currentHintUses,playedBoards,currentBoard,hintPreview,hintUsedThisAttempt,mode,challengeDate,thinkingTotal,thinkingSince,dailyRunId,mistakes,lastCheckpoint,hiddenAt,roundState,pendingMode,dailyRoundEnds},status:$('status').textContent,statusClass:$('status').className,winLine:$('winLine').innerHTML};
 $('favoritesDialog').close();loadFavoriteReplay(item)
}
function loadFavoriteReplay(item){
 if(!favoriteSession)return;resetDeleteConfirmation();hideFavoriteNotice();stopThinking();
 favoriteSession.key=item.key||favoriteKey(item.puzzle);favoriteSession.label=item.label||'お気に入りの問題';
 token++;introToken++;puzzle=item.puzzle;order=[];index=0;own=[...puzzle.own];other=[...puzzle.other];selected=null;phase=0;busy=false;finished=false;practice=true;started=0;elapsed=0;streak=0;total=0;correct=0;attemptCounted=false;intro=false;hintUses=0;challengeStarted=0;challengeElapsed=0;challengeDone=false;firstSelected=false;winSlots=[];currentHintUses=0;playedBoards=[];currentBoard=null;hintPreview=false;hintUsedThisAttempt=false;thinkingTotal=0;thinkingSince=null;mistakes=0;roundState='WAIT_START';pendingMode=null;dailyRoundEnds=[];
 skin=favoriteView.skin;emojiPairIndex=favoriteView.emojiPair;topView=false;
 $('favoriteProblemName').textContent=favoriteSession.label;$('favoriteProblemName').setAttribute('title',favoriteSession.label);
 $('favoritePracticeBanner').hidden=false;document.body.classList.add('favorite-practice');paintSkin();loadPuzzle(true,true);$('startRound').focus()
}
function nextFavoriteReplay(){if(!favoriteSession||!finished||!attemptCounted||busy)return;const next=favoriteNextItem();if(next)loadFavoriteReplay(next)}
function leaveFavoriteReplay(openList=true){
 if(!favoriteSession)return;stopThinking();token++;introToken++;confettiToken++;$('confetti').innerHTML='';$('confetti').classList.remove('grand');board.classList.remove('grand-win','introducing','intro-reset','hint-demo');
 const saved=favoriteSession;favoriteSession=null;({skin,order,index,puzzle,own,other,selected,phase,busy,finished,practice,started,elapsed,streak,total,correct,best,attemptCounted,intro,hintUses,challengeStarted,challengeElapsed,challengeDone,emojiPairIndex,firstSelected,winSlots,currentHintUses,playedBoards,currentBoard,hintPreview,hintUsedThisAttempt,mode,challengeDate,thinkingTotal,thinkingSince,dailyRunId,mistakes,lastCheckpoint,hiddenAt,roundState,pendingMode,dailyRoundEnds}=saved.state);thinkingSince=null;
 $('favoritePracticeBanner').hidden=true;$('favoriteFinishOverlay').hidden=true;document.body.classList.remove('favorite-practice');$('introControls').hidden=true;
 $('winLine').innerHTML=saved.winLine;paintSkin();status(saved.status);$('status').className=saved.statusClass;if(openList)openFavorites();render()
}
function goTop(){
 stopThinking();topView=true;confettiToken++;$('confetti').innerHTML='';$('confetti').classList.remove('grand');board.classList.remove('grand-win');if(favoriteSession)leaveFavoriteReplay(false);favoriteView=null;resetDeleteConfirmation();hideFavoriteNotice();cancelIntroForPanel();
 for(const id of ['helpDialog','historyDialog','dailyRecordsDialog','rankingDialog','externalDialog','modeDialog','favoritesDialog'])if($(id).open)$(id).close();
 topView=true;saveDailyResult();render();$('helpButton').focus()
}
$('favoritesButton').onclick=()=>favoriteSession?leaveFavoriteReplay():openFavorites();$('leaveFavoriteReplay').onclick=()=>leaveFavoriteReplay();
$('favoriteAgain').onclick=()=>{if(favoriteSession&&canRetry())loadPuzzle(true)};
$('favoriteNext').onclick=nextFavoriteReplay;$('favoriteList').onclick=()=>leaveFavoriteReplay();
$('favoritesTop').onclick=goTop;
$('resumeFromTop').onclick=()=>{topView=false;render()};
for(const [id,value] of [['favoritesPlain','plain'],['favoritesCats','cat'],['favoritesEmojis','emoji']])$(id).onclick=()=>setFavoriteSkin(value);
$('favoritesNoticeToggle').onclick=()=>{resetDeleteConfirmation();const show=$('favoritesNotice').hidden;$('favoritesNotice').hidden=!show;$('favoritesNoticeToggle').setAttribute('aria-expanded',show)};
wirePanel('favoritesDialog','closeFavorites','favoritesButton');
const favoritesClose=$('favoritesDialog').onclose;$('favoritesDialog').onclose=()=>{resetDeleteConfirmation();hideFavoriteNotice();if(!favoriteSession&&favoriteView){topView=favoriteView.returnTop;favoriteView=null}favoritesClose();render()};
$('favoritesDialog').addEventListener?.('keydown',e=>{if(e.key==='Escape'){e.preventDefault();$('favoritesDialog').close()}});
$('favoritesDialog').addEventListener?.('click',e=>{if(e.target!==pendingDeleteButton)resetDeleteConfirmation()});
function confirmOfficial(e){e.preventDefault();showPanel('externalDialog','stayHere',e.currentTarget||$('officialLink'))}
$('officialLink').onclick=confirmOfficial;$('subtitleOfficial').onclick=confirmOfficial;$('visitOfficial').onclick=()=>{$('externalDialog').close();window.open('https://www.neutreeko.net/index.htm','_blank','noopener,noreferrer')};
document.addEventListener?.('visibilitychange',()=>{if(document.hidden){hiddenAt=Date.now();stopThinking();saveDailyResult()}else{if(hiddenAt&&Date.now()-hiddenAt>30*60*1000&&!anyPanelOpen())openHelp();syncThinking()}});window.addEventListener?.('pagehide',()=>{stopThinking();saveDailyResult()});
openHelp();
$('sound').innerHTML=`♪ <span>${sound?'ON':'OFF'}</span>`;$('sound').setAttribute('aria-pressed',sound);$('sound').setAttribute('aria-label',`効果音を${sound?'オフ':'オン'}にする`);setSkin(skin);fetch('puzzles-v2.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{puzzles=data;newChallenge()}).catch(()=>status('読み込めませんでした。ページを再読み込みしてください。','error'));

