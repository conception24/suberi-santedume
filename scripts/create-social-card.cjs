'use strict';
// Code-native cover: reuses the actual puzzle, UI palette, 5x5 geometry and emoji tile proportions.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {createCanvas,GlobalFonts}=require('@napi-rs/canvas');
const boldFont=process.env.SOCIAL_FONT_BOLD||'/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
const regularFont=process.env.SOCIAL_FONT_REGULAR||'/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
if(!fs.existsSync(boldFont)||!fs.existsSync(regularFont))throw Error('日本語フォントのパスを SOCIAL_FONT_BOLD / SOCIAL_FONT_REGULAR に指定してください。配信用PNGは生成済みです。');
GlobalFonts.registerFromPath(boldFont,'CoverJP');GlobalFonts.registerFromPath(regularFont,'CoverJPRegular');
const source=fs.readFileSync('dist/app.js','utf8'),rules={Set,Math};vm.createContext(rules);vm.runInContext(source.slice(source.indexOf('const dirs='),source.indexOf('const same=')),rules);
const p=JSON.parse(fs.readFileSync('dist/puzzles.json','utf8'))[0],from=3,to=15;
assert(rules.moves(p.own,p.other).some(m=>m.from===from&&m.to===to),'Arrow must be a legal complete slide');
assert.deepEqual(p.own,[3,20,22]);assert.deepEqual(p.other,[0,16,23]);
const cv=createCanvas(1200,630),c=cv.getContext('2d');
const ink='#211b3c',lemon='#ffe62d',mint='#58f0bd',paper='#fffaf3';
function rounded(x,y,w,h,r,fill,stroke=null,lw=0){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.stroke()}}
function jp(text,x,y,size,color=paper,stroke=false){c.font=`900 ${size}px CoverJP`;c.lineJoin='round';if(stroke){c.strokeStyle=ink;c.lineWidth=4;c.strokeText(text,x,y)}c.fillStyle=color;c.fillText(text,x,y)}
function emoji(text,x,y,size){c.font=`${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,x,y);c.textAlign='left';c.textBaseline='alphabetic'}
const gradient=c.createLinearGradient(0,0,1200,630);gradient.addColorStop(0,'#792bff');gradient.addColorStop(.54,'#d313c6');gradient.addColorStop(1,'#ff3e88');c.fillStyle=gradient;c.fillRect(0,0,1200,630);
// The app logo: bare ice icon, yellow "すべり" and mint "三手詰め", dark outline.
emoji('🧊',70,76,63);jp('すべり',116,96,52,lemon,true);jp('三手詰め',272,96,52,mint,true);
jp('すべる、',47,218,61,lemon);jp('ひらめく、',47,298,61,lemon);jp('３つをならべる。',47,378,46,mint);
rounded(50,418,495,91,20,paper,ink,3);jp('あなた',72,472,23,ink);emoji('🍝',220,463,62);jp('対',294,477,28,ink);emoji('🐧',385,463,62);jp('相手',461,472,23,ink);
jp('ニュートリーコのファンメイド',49,566,28,paper);
// Same rounded lemon surround / checkerboard / rounded emoji tiles as the app.
const bx=648,by=71,size=480,cell=size/5;
rounded(bx-16+6,by-16+7,size+32,size+32,23,ink);rounded(bx-16,by-16,size+32,size+32,23,lemon,ink,4);
c.save();c.beginPath();c.roundRect(bx,by,size,size,12);c.clip();for(let i=0;i<25;i++){c.fillStyle=i%2?'#fce6f2':'#fff9ee';c.fillRect(bx+i%5*cell,by+Math.floor(i/5)*cell,cell,cell)}
c.strokeStyle='#d8c5d4';c.lineWidth=1;for(let i=1;i<5;i++){c.beginPath();c.moveTo(bx+i*cell,by);c.lineTo(bx+i*cell,by+size);c.moveTo(bx,by+i*cell);c.lineTo(bx+size,by+i*cell);c.stroke()}c.restore();c.beginPath();c.roundRect(bx,by,size,size,12);c.strokeStyle=ink;c.lineWidth=2;c.stroke();
const point=pos=>({x:bx+(pos%5+.5)*cell,y:by+(Math.floor(pos/5)+.5)*cell});
// Arrival marker is centered on cell 15, not a partial-stop square.
const end=point(to);c.beginPath();c.arc(end.x,end.y,23,0,Math.PI*2);c.fillStyle='#b9a4ff6b';c.fill();c.strokeStyle='#5d36d7';c.lineWidth=4;c.stroke();
[p.own,p.other].forEach((pieces,side)=>pieces.forEach(pos=>{const pt=point(pos),w=size*.153,x=pt.x-w/2,y=pt.y-w/2,r=w*.24;rounded(x,y+4,w,w,r,side?'#c6a980':'#8b64ca');rounded(x,y,w,w,r,side?'#fff1c8':'#f2e8ff','#382454',2);emoji(side?'🐧':'🍝',pt.x,pt.y,size*.108)}));
// A single arrow leaves the top-right pasta at its tile edge and reaches the legal endpoint.
const start=point(from),dx=end.x-start.x,dy=end.y-start.y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,edge=44;
const sx=start.x+ux*edge,sy=start.y+uy*edge,ex=end.x,ey=end.y;
function arrow(width,color){c.strokeStyle=color;c.fillStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(sx,sy);c.lineTo(ex-ux*16,ey-uy*16);c.stroke();const head=25,half=14;c.beginPath();c.moveTo(ex,ey);c.lineTo(ex-ux*head-uy*half,ey-uy*head+ux*half);c.lineTo(ex-ux*head+uy*half,ey-uy*head-ux*half);c.closePath();c.fill()}
arrow(12,paper);arrow(7,'#b51e7d');
fs.writeFileSync('dist/assets/social-card.png',cv.toBuffer('image/png'));
console.log(JSON.stringify({width:1200,height:630,arrow:{from,to,path:[3,7,11,15]},verifiedLegal:true,positions:p.own.concat(p.other),asset:'dist/assets/social-card.png'}));
