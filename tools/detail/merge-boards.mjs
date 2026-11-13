import {read,write,weld} from './glb-io.mjs';
const [,, src, out]=process.argv;
const {j,P,N,U,I}=read(src);const {w}=weld(P);const T=I.length/3;
const par=new Map();const find=x=>{if(!par.has(x))par.set(x,x);while(par.get(x)!==x){par.set(x,par.get(par.get(x)));x=par.get(x)}return x};
for(let t=0;t<T;t++){const a=[0,1,2].map(k=>find(w[I[3*t+k]]));par.set(a[0],a[1]);par.set(find(a[1]),find(a[2]))}
const shells={};for(let t=0;t<T;t++)(shells[find(w[I[3*t]])]??=[]).push(t);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l)};
const vp=v=>[P[3*v],P[3*v+1],P[3*v+2]];
function eig(C){let V=[[1,0,0],[0,1,0],[0,0,1]];const A=C.map(r=>[...r]);for(let s=0;s<60;s++)for(let p=0;p<3;p++)for(let q=p+1;q<3;q++){if(Math.abs(A[p][q])<1e-15)continue;const th=0.5*Math.atan2(2*A[p][q],A[q][q]-A[p][p]),c=Math.cos(th),sn=Math.sin(th);for(let k=0;k<3;k++){const a=A[k][p],b=A[k][q];A[k][p]=c*a-sn*b;A[k][q]=sn*a+c*b}for(let k=0;k<3;k++){const a=A[p][k],b=A[q][k];A[p][k]=c*a-sn*b;A[q][k]=sn*a+c*b}for(let k=0;k<3;k++){const a=V[k][p],b=V[k][q];V[k][p]=c*a-sn*b;V[k][q]=sn*a+c*b}}
 return [0,1,2].map(i=>({l:A[i][i],v:[V[0][i],V[1][i],V[2][i]]})).sort((a,b)=>b.l-a.l)}
const boards=[],rest=[];
for(const ts of Object.values(shells)){
 const vs=[...new Set(ts.flatMap(t=>[I[3*t],I[3*t+1],I[3*t+2]]))];const uniq=new Set(vs.map(v=>w[v]));
 if(ts.length<8||ts.length>12||uniq.size!==8||ts.some(t=>U[2*I[3*t]]>0.25||U[2*I[3*t]+1]>0.25)){rest.push(ts);continue}
 const m=[0,0,0];for(const v of vs)for(let d=0;d<3;d++)m[d]+=P[3*v+d]/vs.length;
 const C=[[0,0,0],[0,0,0],[0,0,0]];for(const v of vs)for(let a=0;a<3;a++)for(let b=0;b<3;b++)C[a][b]+=(P[3*v+a]-m[a])*(P[3*v+b]-m[b]);
 const ax=eig(C).map(x=>x.v);let n=ax[2];if(n[1]<0)n=n.map(x=>-x);
 const ext=a=>{const d=vs.map(v=>dot(vp(v).map((x,k)=>x-m[k]),a));return Math.max(...d)-Math.min(...d)};
 const len=ext(ax[0]),wid=ext(ax[1]),thk=ext(ax[2]);
 if(n[1]<0.3||n[1]>0.95||thk>0.12||wid<0.08||len<0.25){rest.push(ts);continue}
 boards.push({ts,vs,m,n,len,wid,thk})}
const groups=[];for(const b of boards){let g=groups.find(g=>dot(g.n,b.n)>0.97&&Math.abs(dot(b.m,g.n)-g.d)<0.25);if(!g){g={n:b.n,d:dot(b.m,b.n),list:[]};groups.push(g)}g.list.push(b)}
const oP=[],oN=[],oU=[],oI=[];let merged=0;
const keep=ts=>{const map=new Map();for(const t of ts)for(let k=0;k<3;k++){const v=I[3*t+k];if(!map.has(v)){map.set(v,oP.length/3);oP.push(...vp(v));oN.push(N[3*v],N[3*v+1],N[3*v+2]);oU.push(U[2*v],U[2*v+1])}oI.push(map.get(v))}};
for(const ts of rest)keep(ts);
for(const g of groups){
 let n=[0,0,0];for(const b of g.list)for(let d=0;d<3;d++)n[d]+=b.n[d];n=norm(n);
 const down=norm([0,-1,0].map((x,k)=>x-n[k]*(-n[1])));const across=cross(n,down);
 for(const b of g.list){const r=a=>{const d=b.vs.map(v=>dot(vp(v),a));return [Math.min(...d),Math.max(...d)]};b.u=r(across);b.v=r(down);b.h=r(n)}
 const L=g.list.sort((a,b)=>a.u[0]-b.u[0]);const used=new Set();
 for(let i=0;i<L.length;i++){if(used.has(i))continue;const a=L[i];let best=-1,bd=1e9;
  for(let k=i+1;k<L.length;k++){if(used.has(k))continue;const b=L[k];const gap=b.u[0]-a.u[1];if(gap>0.08)continue;if(gap<-0.6*Math.min(a.u[1]-a.u[0],b.u[1]-b.u[0]))continue;
   const la=a.v[1]-a.v[0],lb=b.v[1]-b.v[0];if(Math.abs(la-lb)>0.3*Math.max(la,lb))continue;const dv=Math.abs((a.v[0]+a.v[1])/2-(b.v[0]+b.v[1])/2);if(dv>0.25*Math.min(la,lb))continue;
   if(Math.abs((a.h[0]+a.h[1])/2-(b.h[0]+b.h[1])/2)>0.06)continue;const sc=Math.abs(gap)+dv;if(sc<bd){bd=sc;best=k}}
  if(best<0){keep(a.ts);continue}
  used.add(best);const b=L[best];merged++;
  const u=[Math.min(a.u[0],b.u[0]),Math.max(a.u[1],b.u[1])],v=[Math.min(a.v[0],b.v[0]),Math.max(a.v[1],b.v[1])];
  const top=Math.max(a.h[1],b.h[1]);const h=[top-Math.max(a.h[1]-a.h[0],b.h[1]-b.h[0],0.012),top];
  const Wp=(x,y,z)=>[0,1,2].map(d=>across[d]*x+down[d]*y+n[d]*z);
  const rings=[v[0],v[1]].map(y=>[Wp(u[0],y,h[0]),Wp(u[1],y,h[0]),Wp(u[1],y,h[1]),Wp(u[0],y,h[1])]);
  const cen=[0,1,2].map(d=>rings.flat().reduce((s,q)=>s+q[d],0)/8);
  const near=(p,nn)=>{let bi=-1,bdd=1e9;for(const i2 of a.vs){const d=Math.hypot(P[3*i2]-p[0],P[3*i2+1]-p[1],P[3*i2+2]-p[2])+0.3*(1-(N[3*i2]*nn[0]+N[3*i2+1]*nn[1]+N[3*i2+2]*nn[2]));if(d<bdd){bdd=d;bi=i2}}return [U[2*bi],U[2*bi+1]]};
  const tri=(p,q,r)=>{let nn=cross(q.map((x,k)=>x-p[k]),r.map((x,k)=>x-p[k]));const l=Math.hypot(...nn);if(l<1e-12)return;nn=nn.map(x=>x/l);const mid=[0,1,2].map(d=>(p[d]+q[d]+r[d])/3-cen[d]);if(dot(nn,mid)<0){[q,r]=[r,q];nn=nn.map(x=>-x)}const base=oP.length/3;for(const z of [p,q,r]){oP.push(...z);oN.push(...nn);oU.push(...near(z,nn))}oI.push(base,base+1,base+2)};
  const quad=(p,q,r,s)=>{tri(p,q,r);tri(p,r,s)};
  for(let k=0;k<4;k++)quad(rings[0][k],rings[0][(k+1)%4],rings[1][(k+1)%4],rings[1][k]);quad(...rings[0]);quad(...rings[1])}}
write(out,j,oP,oN,oU,oI);console.log(src.split('/').pop(),T,'->',oI.length/3,'tris; roof boards',boards.length,'pairs merged',merged);
