"""Independent validator: exhaustive target-based moves (not generator ray algorithm)."""
import json, sys
from pathlib import Path
DIRECTIONS=[(x,y) for x in (-1,0,1) for y in (-1,0,1) if x or y]
def xy(n): return (n%5,n//5)
def won(pieces):
    p=set(map(xy,pieces))
    return any(all((x+k*dx,y+k*dy) in p for k in range(3)) for x,y in p for dx,dy in ((1,0),(0,1),(1,1),(1,-1)))
def moves(own,other):
    """Enumerate all 25 destination squares, require unobstructed aligned path and no continuation."""
    occupied=set(own)|set(other)
    result=[]
    for origin in own:
        x,y=xy(origin)
        for dest in range(25):
            if dest in occupied: continue
            a,b=xy(dest); dx=a-x; dy=b-y
            if dx and dy and abs(dx)!=abs(dy): continue
            sx=(dx>0)-(dx<0); sy=(dy>0)-(dy<0)
            distance=max(abs(dx),abs(dy))
            if not distance: continue
            if any((x+k*sx)+5*(y+k*sy) in occupied for k in range(1,distance)): continue
            nx,ny=a+sx,b+sy
            if 0<=nx<5 and 0<=ny<5 and nx+5*ny not in occupied: continue
            result.append((origin,dest))
    return result

def canonical(a,b):
    variants=[]
    for flip in (False,True):
        for rot in range(4):
            def transform(n):
                x,y=xy(n)
                if flip: x=4-x
                for _ in range(rot): x,y=4-y,x
                return x+5*y
            aa=tuple(sorted(map(transform,a)));bb=tuple(sorted(map(transform,b)))
            variants.extend([(aa,bb),(bb,aa)])
    return min(variants)

def normalize(p):
    return p['own'],p['other'],(p['solution']['from'],p['solution']['to'])

def main(path):
    data=json.loads(Path(path).read_text()); puzzles=data if isinstance(data,list) else data['puzzles']
    seen=set(); total=0
    for i,p in enumerate(puzzles):
        own,other,answer=normalize(p)
        assert len(own)==len(other)==3,(i,'piece count')
        assert len(set(own+other))==6 and all(type(n)==int and 0<=n<25 for n in own+other),(i,'invalid cell')
        assert not won(own) and not won(other),(i,'terminal position')
        legal=moves(own,other); wins=[m for m in legal if won([n for n in own if n!=m[0]]+[m[1]])]
        assert not wins,(i,'immediate win',wins)
        forcing=[]; reply_count=0
        for first in legal:
            aa=[n for n in own if n!=first[0]]+[first[1]]
            replies=moves(other,aa)
            for response in replies:
                bb=[n for n in other if n!=response[0]]+[response[1]]
                if won(bb): break
                finishes=[m for m in moves(aa,bb) if won([n for n in aa if n!=m[0]]+[m[1]])]
                if not finishes: break
            else:
                if replies: forcing.append(first)
        assert len(forcing)==1,(i,'unique forcing first move',forcing)
        assert answer==forcing[0],(i,'listed answer',answer,forcing)
        aa=[n for n in own if n!=answer[0]]+[answer[1]]
        expected=set(moves(other,aa))
        listed={(r['from'],r['to']) for r in p['replies']}
        assert expected==listed and len(listed)==len(p['replies']),(i,'reply coverage')
        for r in p['replies']:
            bb=[n for n in other if n!=r['from']]+[r['to']]
            assert not won(bb),(i,'opponent immediate win')
            finishes={m for m in moves(aa,bb) if won([n for n in aa if n!=m[0]]+[m[1]])}
            listed_finishes={(m['from'],m['to']) for m in r['wins']}
            assert finishes and finishes==listed_finishes,(i,'third ply wins mismatch')
        if 'path' in p:
            sides=[[7,21,23],[1,3,17]]; turn=0; repetitions={(tuple(sorted(sides[0])),tuple(sorted(sides[1])),0):1}
            for step,m in enumerate(p['path']):
                assert not won(sides[0]) and not won(sides[1]),(i,step,'path passes terminal')
                assert tuple(m) in moves(sides[turn],sides[1-turn]),(i,step,'illegal provenance move')
                sides[turn]=[n for n in sides[turn] if n!=m[0]]+[m[1]]
                turn=1-turn
                key=(tuple(sorted(sides[0])),tuple(sorted(sides[1])),turn)
                repetitions[key]=repetitions.get(key,0)+1
                assert repetitions[key]<3,(i,step,'threefold draw')
            assert p['turn']==turn and set(own)==set(sides[turn]) and set(other)==set(sides[1-turn]),(i,'path target mismatch')
            # Neither nonterminal move in the intended solution may trigger a threefold draw.
            future=[side[:] for side in sides]
            future[turn]=[n for n in future[turn] if n!=answer[0]]+[answer[1]]
            signature=(tuple(sorted(future[0])),tuple(sorted(future[1])),1-turn)
            assert repetitions.get(signature,0)<2,(i,'solution first move repeats threefold')
            for response in p['replies']:
                after=[side[:] for side in future]
                after[1-turn]=[n for n in after[1-turn] if n!=response['from']]+[response['to']]
                signature=(tuple(sorted(after[0])),tuple(sorted(after[1])),turn)
                assert repetitions.get(signature,0)<2,(i,'opponent reply repeats threefold')
        key=canonical(own,other)
        assert key not in seen,(i,'symmetry or color duplicate')
        seen.add(key);total+=len(legal)
    print(json.dumps({'puzzles':len(puzzles),'legal_moves_checked':total,'unique_forcing_first_moves':len(puzzles),'opponent_replies_checked':sum(len(p['replies']) for p in puzzles),'legal_reachable_provenance':len(puzzles),'D4_and_color_duplicates':0,'terminal_positions':0,'status':'passed'},ensure_ascii=False))
if __name__=='__main__': main(sys.argv[1] if len(sys.argv)>1 else Path(__file__).parent/'dist/puzzles.json')
