"""Original reachable three-ply puzzle generator. Deterministic seed; no external puzzles."""
import random,json,time
from functools import lru_cache
R=random.Random(20261022)
D=[(x,y) for y in [-1,0,1] for x in [-1,0,1] if x or y]
@lru_cache(maxsize=150000)
def moves(a,b):
 occ=set(a+b);out=[]
 for p in a:
  for dx,dy in D:
   x,y=p%5,p//5
   while 0<=x+dx<5 and 0<=y+dy<5 and (y+dy)*5+x+dx not in occ:x+=dx;y+=dy
   q=y*5+x
   if q!=p:out.append((p,q))
 return tuple(out)
def apply(a,m):return tuple(sorted(m[1] if p==m[0] else p for p in a))
@lru_cache(maxsize=2500)
def won(a):
 s=set(a)
 return any(0<=p%5+2*dx<5 and 0<=p//5+2*dy<5 and p+dx+5*dy in s and p+2*dx+10*dy in s for p in a for dx,dy in [(1,0),(0,1),(1,1),(-1,1)])
@lru_cache(maxsize=150000)
def wins(a,b):return tuple(m for m in moves(a,b) if won(apply(a,m)))
def key(a,b):
 keys=[]
 for f in range(8):
  def trans(p):
   x,y=p%5,p//5
   if f>=4:x=4-x
   for _ in range(f%4):x,y=4-y,x
   return y*5+x
  aa,bb=tuple(sorted(map(trans,a))),tuple(sorted(map(trans,b)))
  keys.extend([(aa,bb),(bb,aa)])
 return min(keys)
def forcing(a,b):
 solutions=[]
 for m in moves(a,b):
  aa=apply(a,m);replies=[]
  for reply in moves(b,aa):
   bb=apply(b,reply)
   if won(bb):break
   ww=wins(aa,bb)
   if not ww:break
   replies.append(dict(from_=reply[0],to=reply[1],wins=[dict(from_=x,to=y) for x,y in ww]))
  else:
   if replies:solutions.append((m,replies))
  if len(solutions)>1:break
 return solutions

def main():
 puzzles=[];seen=set();tested=set();games=0;start=time.time()
 while len(puzzles)<200:
  games+=1;a,b=(7,21,23),(1,3,17);path=[];history={(a,b,0):1};turn=0
  for ply in range(75):
   own,other=(a,b) if turn==0 else (b,a)
   if won(a) or won(b):break
   mm=moves(own,other)
   sig=(own,other)
   if len(path)>=4 and sig not in tested and not wins(own,other):
    tested.add(sig)
    solutions=forcing(own,other)
    if len(solutions)==1:
     k=key(own,other)
     if k not in seen:
      seen.add(k);m,replies=solutions[0]
      puzzles.append(dict(id=len(puzzles)+1,own=own,other=other,solution=dict(from_=m[0],to=m[1]),replies=replies,path=path[:],turn=turn))
      if len(puzzles)%25==0:print('Generated',len(puzzles),'games',games,'seconds',round(time.time()-start,1),flush=True)
      if len(puzzles)>=200:break
   if not mm:break
   m=R.choice(mm);path.append(list(m))
   if turn==0:a=apply(a,m)
   else:b=apply(b,m)
   turn=1-turn;sig=(a,b,turn);history[sig]=history.get(sig,0)+1
   if history[sig]>=3:break
 raw=json.dumps(puzzles,separators=(',',':')).replace('"from_":','"from":')
 with open('dist/puzzles.json','w') as f:f.write(raw)
 print('Generated',len(puzzles),'puzzles from',games,'games in',round(time.time()-start,1),'seconds')
if __name__=='__main__':main()
