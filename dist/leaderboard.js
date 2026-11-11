'use strict';
// Optional shared leaderboard. Game state and local results remain independent.
const RANK_NAME_KEY='suberi-ranking-name-v1',RANK_CLIENT_KEY='suberi-ranking-client-v1';
let rankResult=null,rankDate='',rankBank='',rankRequest=0,rankSending=false,rankSubmittedRun='',rankClientMemory='',rankNameComposing=false;
function rankingSeconds(ms){return (Math.floor(ms/100)/10).toFixed(1)}
function rankingName(value){return String(value||'').normalize('NFKC').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)}
function rankingClientId(){
  const stored=read(RANK_CLIENT_KEY,'');if(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(stored))return stored;
  if(!rankClientMemory){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');rankClientMemory=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');save(RANK_CLIENT_KEY,rankClientMemory)}
  return rankClientMemory;
}
function currentRankingResult(){
  if(favoriteSession||mode!=='daily'||!challengeDone||streak!==5)return null;
  return {date:challengeDate,bank:bankVersionForDate(challengeDate),ms:Math.max(1,Math.round(challengeTime())),hints:hintUses,runId:dailyRunId,completed:5,roundMs:dailyRoundTimes()};
}
function syncLeaderboardResult(){
  const eligible=!!currentRankingResult();$('finishRankingButton').hidden=!eligible;
  $('finishRankingButton').textContent=rankSubmittedRun===dailyRunId?'ランキングを見る':'ランキングに載せる';
  $('finishHintSummary').textContent=hintUses?'ヒント'+hintUses+'回使用':'ヒントなし';
}
function updateRankSubmit(){
  $('rankingSubmit').disabled=rankSending||!rankResult||rankSubmittedRun===rankResult.runId||!/^[A-Z]{1,3}$/.test(rankingName($('rankingName').value));
  $('rankingSubmit').textContent=rankSending?'登録中…':rankResult&&rankSubmittedRun===rankResult.runId?'登録済み':'この記録を載せる';
}
async function rankingRequest(url,options={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
    const response=await fetch(url,{...options,signal:controller.signal,credentials:'same-origin',cache:'no-store'});
    const type=response.headers?.get('content-type')||'';
    if(!type.includes('application/json'))throw Error('ランキングを読み込めませんでした。時間をおいて再試行してください。');
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'ランキングの通信に失敗しました。再試行してください。');
    return data;
  }catch(error){if(error.name==='AbortError')throw Error('通信がタイムアウトしました。もう一度お試しください。');throw error}
  finally{clearTimeout(timeout)}
}
function showRankingEntries(entries,roundBests=null){
  $('rankingList').innerHTML='';
  if(!entries.length){const p=document.createElement('p');p.textContent='まだ登録がありません。今日の5問をクリアして、最初の記録を載せよう。';$('rankingList').append(p);return}
  const table=document.createElement('table');table.className='ranking-table';
  const caption=document.createElement('caption');caption.textContent=rankDate+' のタイムランキング';table.append(caption);
  const head=document.createElement('thead'),hr=document.createElement('tr');
  for(const label of ['順位','名前','タイム','ヒント']){const th=document.createElement('th');th.textContent=label;th.setAttribute('scope','col');hr.append(th)}head.append(hr);table.append(head);
  const body=document.createElement('tbody');
  for(const item of entries){
    const tr=document.createElement('tr');
    for(const value of [item.rank,item.name,rankingSeconds(item.ms)+'秒',item.hints?item.hints+'回使用':'なし']){const td=document.createElement('td');td.textContent=String(value);tr.append(td)}
    if(item.hints)tr.className='ranking-hinted';body.append(tr);
    const detail=document.createElement('tr');detail.className='ranking-round-row';const cell=document.createElement('td');cell.setAttribute('colspan','4');
    const splits=document.createElement('div');splits.className='ranking-rounds';splits.setAttribute('aria-label',item.name+' の各問題タイム');
    for(let i=0;i<5;i++){
      const ms=Array.isArray(item.roundMs)?item.roundMs[i]:null,known=Number.isSafeInteger(ms)&&ms>=0;
      const fastest=known&&Array.isArray(roundBests)&&ms===roundBests[i];
      const part=document.createElement('div');part.className='ranking-round'+(fastest?' ranking-round-best':'');
      const label=document.createElement('span');label.textContent='問'+(i+1);
      const value=document.createElement('strong');value.textContent=known?rankingSeconds(ms)+'秒':'—';
      part.append(label);part.append(value);
      if(fastest){const badge=document.createElement('small');badge.textContent='★ 最速';part.append(badge)}
      part.setAttribute('aria-label','問'+(i+1)+(known?' '+rankingSeconds(ms)+'秒':' 内訳なし')+(fastest?'・この問題の最速':''));splits.append(part)
    }
    cell.append(splits);detail.append(cell);body.append(detail)
  }
  table.append(body);$('rankingList').append(table);
}
async function loadRanking(){
  const request=++rankRequest,date=rankDate,bank=rankBank;
  $('rankingLoadStatus').textContent='ランキングを読み込み中…';$('rankingRefresh').disabled=true;$('rankingList').innerHTML='';
  try{const data=await rankingRequest('/api/leaderboard?date='+encodeURIComponent(date)+'&bank='+encodeURIComponent(bank));if(request!==rankRequest)return;
    if(!Array.isArray(data.entries))throw Error('ランキングを読み込めませんでした。');
    showRankingEntries(data.entries,data.roundBests);$('rankingLoadStatus').textContent=data.entries.length?'合計タイム順 · 上位100件':'';
  }catch(error){if(request===rankRequest)$('rankingLoadStatus').textContent=error.message||'読み込みに失敗しました。再試行してください。'}
  finally{if(request===rankRequest)$('rankingRefresh').disabled=false}
}
function openRanking(fromResult=false){
  if(rankSending)return;
  rankNameComposing=false;rankResult=fromResult?currentRankingResult():null;
  rankDate=rankResult?.date||jstDate();rankBank=rankResult?.bank||bankVersionForDate(rankDate);
  $('rankingTitle').textContent='デイリーランキング';$('rankingDate').textContent=rankDate+'（日本時間）';
  $('rankingForm').hidden=!rankResult;$('rankingName').value=rankingName(read(RANK_NAME_KEY,''));
  $('rankingStatus').textContent='';
  $('rankingResultSummary').textContent=rankResult?(rankingSeconds(rankResult.ms)+'秒 · '+(rankResult.hints?'ヒント'+rankResult.hints+'回使用':'ヒントなし')):'';
  updateRankSubmit();showPanel('rankingDialog','closeRanking',$(fromResult?'finishRankingButton':'rankingButton'));loadRanking();
}
async function submitRanking(event){
  event?.preventDefault();if(rankSending||!rankResult||rankSubmittedRun===rankResult.runId)return;
  const name=rankingName($('rankingName').value);$('rankingName').value=name;
  if(!/^[A-Z]{1,3}$/.test(name)){$('rankingStatus').textContent='英字1〜3文字で入力してください。小文字は大文字になります。';updateRankSubmit();return}
  let clientId;try{clientId=rankingClientId()}catch{$('rankingStatus').textContent='このブラウザーでは登録に必要な識別子を作れません。Chromeなどで開き直してください。';return}
  rankSending=true;updateRankSubmit();save(RANK_NAME_KEY,name);$('rankingStatus').textContent='';
  const result={...rankResult,name,clientId};
  try{const response=await rankingRequest('/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
    if(response.saved!==true)throw Error('登録結果を確認できませんでした。もう一度お試しください。');
    rankSubmittedRun=result.runId;$('rankingStatus').textContent=response.improved===false?'登録を確認しました。このブラウザーの最速記録を残しています。':'ランキングに登録しました！';
    syncLeaderboardResult();await loadRanking();
  }catch(error){$('rankingStatus').textContent=(error.message||'通信に失敗しました。')+' この記録のまま再試行できます。'}
  finally{rankSending=false;updateRankSubmit()}
}
// Mobile keyboards may emit only composing input events before compositionend.
// Keep the button in sync during composition; do not rewrite the IME buffer until commit.
function normalizeRankingInput(){const input=$('rankingName'),name=rankingName(input.value);if(input.value!==name)input.value=name;updateRankSubmit()}
$('rankingName').oncompositionstart=()=>{rankNameComposing=true;updateRankSubmit()};
$('rankingName').oncompositionend=()=>{rankNameComposing=false;normalizeRankingInput()};
$('rankingName').oninput=event=>{if(rankNameComposing||event?.isComposing){updateRankSubmit();return}normalizeRankingInput()};
$('rankingName').onchange=normalizeRankingInput;
$('rankingName').onblur=()=>{rankNameComposing=false;normalizeRankingInput()};
$('rankingForm').onsubmit=submitRanking;
$('rankingButton').onclick=()=>openRanking();
$('finishRankingButton').onclick=()=>openRanking(true);
$('rankingRefresh').onclick=loadRanking;
wirePanel('rankingDialog','closeRanking','rankingButton');
syncLeaderboardResult();
