// Deterministic breadth-first provenance search. Invoked by generate-counter-threat.py.
#include <bits/stdc++.h>
using namespace std;
constexpr int N=2300;
struct Triple { int p[3]; unsigned mask; bool win; };
vector<Triple> ts; vector<int> ids(1<<25,-1), parent(N*N,-2); vector<unsigned char> iw(N*N); int tr[8][N];
int moves(int a,int b,int *out) {
 int n=0; unsigned occ=ts[a].mask|ts[b].mask;
 for(int p:ts[a].p) for(int dy=-1;dy<=1;dy++) for(int dx=-1;dx<=1;dx++) {
  if(!dx&&!dy)continue; int x=p%5,y=p/5;
  while(x+dx>=0&&x+dx<5&&y+dy>=0&&y+dy<5&&!(occ&(1u<<((y+dy)*5+x+dx)))){x+=dx;y+=dy;}
  int q=y*5+x; if(q!=p)out[n++]=ids[ts[a].mask^(1u<<p)^(1u<<q)];
 } return n;
}
int canonical(int a,int b) {int k=INT_MAX;for(int f=0;f<8;f++){int u=tr[f][a],v=tr[f][b];k=min({k,u*N+v,v*N+u});}return k;}
int main(int argc,char**argv) {
 for(int x=0;x<25;x++)for(int y=x+1;y<25;y++)for(int z=y+1;z<25;z++){
  Triple t={{x,y,z},(1u<<x)|(1u<<y)|(1u<<z),false};
  for(int p:t.p)for(auto [dx,dy]:vector<pair<int,int>>{{1,0},{0,1},{1,1},{-1,1}}){int xx=p%5+2*dx,yy=p/5+2*dy;if(xx>=0&&xx<5&&yy>=0&&yy<5&&(t.mask&(1u<<(p+dx+5*dy)))&&(t.mask&(1u<<(p+2*dx+10*dy))))t.win=true;}
  ids[t.mask]=ts.size();ts.push_back(t);
 }
 for(int a=0;a<N;a++)for(int f=0;f<8;f++){unsigned m=0;for(int p:ts[a].p){int x=p%5,y=p/5;if(f>=4)x=4-x;for(int r=0;r<f%4;r++){int xx=4-y;y=x;x=xx;}m|=1u<<(y*5+x);}tr[f][a]=ids[m];}
 set<int> seen;unsigned ma,mb;ifstream old(argv[1]);while(old>>ma>>mb)seen.insert(canonical(ids[ma],ids[mb]));
 for(int a=0;a<N;a++)for(int b=0;b<N;b++)if(!(ts[a].mask&ts[b].mask)&&!ts[a].win&&!ts[b].win){int mm[24],n=moves(a,b,mm);for(int i=0;i<n;i++)if(ts[mm[i]].win){iw[a*N+b]=1;break;}}
 int start=ids[(1u<<7)|(1u<<21)|(1u<<23)]*N+ids[(1u<<1)|(1u<<3)|(1u<<17)];
 vector<int> queue{start};parent[start]=-1;int counts[2]={0,0};int quota=stoi(argv[2]);
 for(size_t j=0;j<queue.size()&&(counts[0]<quota||counts[1]<quota);j++) {
  int state=queue[j],a=state/N,b=state%N,mm[24],n=moves(a,b,mm);
  if(!iw[state]&&iw[b*N+a]&&!seen.count(canonical(a,b))){
   int solutions=0,bad=0;
   for(int i=0;i<n;i++){int aa=mm[i];if(iw[b*N+aa]){bad++;continue;}int rr[24],rn=moves(b,aa,rr);bool force=rn>0;for(int r=0;r<rn;r++)if(!iw[aa*N+rr[r]]){force=false;break;}if(force)solutions++;}
   int type=solutions>1;
   if(solutions&&bad&&counts[type]<quota){
    vector<pair<int,int>> path;int s=state;
    while(parent[s]!=-1){int prev=parent[s],before=prev/N,after=s%N;unsigned diff=ts[before].mask^ts[after].mask;path.push_back({__builtin_ctz(diff&ts[before].mask),__builtin_ctz(diff&ts[after].mask)});s=prev;}
    reverse(path.begin(),path.end());
    cout<<ts[a].mask<<' '<<ts[b].mask<<' '<<solutions<<' '<<path.size();for(auto [p,q]:path)cout<<' '<<p<<' '<<q;cout<<'\n';
    seen.insert(canonical(a,b));counts[type]++;
    if((counts[0]+counts[1])%25==0)cerr<<"Selected "<<counts[0]<<" unique + "<<counts[1]<<" multiple\n";
   }
  }
  for(int i=0;i<n;i++)if(!ts[mm[i]].win){int next=b*N+mm[i];if(parent[next]==-2){parent[next]=state;queue.push_back(next);}}
 }
 cerr<<"Selected "<<counts[0]<<" unique + "<<counts[1]<<" multiple from "<<queue.size()<<" discovered states\n";
 return counts[0]==quota&&counts[1]==quota?0:1;
}
