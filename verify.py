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
    seen=set(); ids=set(); total=0; unique=0; multiple=0; replies_checked=0; reachable=0; counter_threats=0; tagged_counter_threats=0
    for i,p in enumerate(puzzles):
        own,other,answer=normalize(p)
        assert p['id'] not in ids,(i,'duplicate id')
        ids.add(p['id'])
        assert len(own)==len(other)==3,(i,'piece count')
        assert len(set(own+other))==6 and all(type(n)==int and 0<=n<25 for n in own+other),(i,'invalid cell')
        assert not won(own) and not won(other),(i,'terminal position')
        legal=moves(own,other)
        def apply(pieces,move): return [n for n in pieces if n!=move[0]]+[move[1]]
        assert not any(won(apply(own,m)) for m in legal),(i,'immediate win')
        forcing=[]; punishable=[]
        for first in legal:
            aa=apply(own,first); replies=moves(other,aa)
            if any(won(apply(other,r)) for r in replies):
                punishable.append(first)
                continue
            if replies and all(any(won(apply(aa,m)) for m in moves(aa,apply(other,r))) for r in replies):
                forcing.append(first)
        solutions=p.get('solutions',[dict(p['solution'],replies=p['replies'])])
        listed=[(s['from'],s['to']) for s in solutions]
        assert forcing and set(forcing)==set(listed) and len(listed)==len(set(listed)),(i,'all forcing first moves',forcing,listed)
        if 'solutions' not in p:
            assert len(forcing)==1,(i,'legacy unique forcing first move')
        assert answer==listed[0] and p['replies']==solutions[0]['replies'],(i,'canonical solution mismatch')
        counter_threats+=bool(punishable)
        if p.get('pattern')=='counter-threat':
            assert punishable,(i,'no punishable wrong first move')
            assert any(won(apply(other,m)) for m in moves(other,own)),(i,'no initial counter threat')
            assert 'path' in p,(i,'missing counter-threat provenance')
            tagged_counter_threats+=1
        repetitions={}; sides=None
        if 'path' in p:
            sides=[[7,21,23],[1,3,17]]; turn=0
            repetitions={(tuple(sorted(sides[0])),tuple(sorted(sides[1])),0):1}
            for step,m in enumerate(p['path']):
                assert not won(sides[0]) and not won(sides[1]),(i,step,'path passes terminal')
                assert tuple(m) in moves(sides[turn],sides[1-turn]),(i,step,'illegal provenance move')
                sides[turn]=apply(sides[turn],m); turn=1-turn
                signature=(tuple(sorted(sides[0])),tuple(sorted(sides[1])),turn)
                repetitions[signature]=repetitions.get(signature,0)+1
                assert repetitions[signature]<3,(i,step,'threefold draw')
            assert p['turn']==turn and set(own)==set(sides[turn]) and set(other)==set(sides[1-turn]),(i,'path target mismatch')
            reachable+=1
        for solution in solutions:
            first=(solution['from'],solution['to']); aa=apply(own,first)
            expected=set(moves(other,aa))
            listed_replies={(r['from'],r['to']) for r in solution['replies']}
            assert expected==listed_replies and len(listed_replies)==len(solution['replies']),(i,'reply coverage')
            if sides is not None:
                future=[side[:] for side in sides]; future[turn]=aa
                signature=(tuple(sorted(future[0])),tuple(sorted(future[1])),1-turn)
                assert repetitions.get(signature,0)<2,(i,'solution first move repeats threefold')
            for response in solution['replies']:
                bb=apply(other,(response['from'],response['to']))
                assert not won(bb),(i,'opponent immediate win')
                finishes={m for m in moves(aa,bb) if won(apply(aa,m))}
                listed_finishes=[(m['from'],m['to']) for m in response['wins']]
                assert finishes and finishes==set(listed_finishes) and len(listed_finishes)==len(set(listed_finishes)),(i,'third ply wins mismatch')
                if sides is not None:
                    after=[side[:] for side in future]; after[1-turn]=bb
                    signature=(tuple(sorted(after[0])),tuple(sorted(after[1])),turn)
                    assert repetitions.get(signature,0)<2,(i,'opponent reply repeats threefold')
                replies_checked+=1
        key=canonical(own,other)
        assert key not in seen,(i,'symmetry or color duplicate')
        seen.add(key); total+=len(legal)
        unique+=len(forcing)==1; multiple+=len(forcing)>1
    print(json.dumps({'puzzles':len(puzzles),'legal_moves_checked':total,'unique_forcing_first_moves':unique,'multiple_forcing_first_moves':multiple,'counter_threat_puzzles':counter_threats,'tagged_counter_threat_puzzles':tagged_counter_threats,'opponent_replies_checked':replies_checked,'legal_reachable_provenance':reachable,'D4_and_color_duplicates':0,'terminal_positions':0,'status':'passed'},ensure_ascii=False))
if __name__=='__main__': main(sys.argv[1] if len(sys.argv)>1 else Path(__file__).parent/'dist/puzzles.json')
