import {read,write,weld} from './glb-io.mjs';
const [,, src, out]=process.argv;
const {j,P,N,U,I}=read(src);const {w}=weld(P);const T=I.length/3;
const par=new Map();const find=x=>{if(!par.has(x))par.set(x,x);while(par.get(x)!==x){par.set(x,par.get(par.get(x)));x=par.get(x)}return x};
for(let t=0;t<T;t++){const a=[0,1,2].map(k=>find(w[I[3*t+k]]));par.set(a[0],a[1]);par.set(find(a[1]),find(a[2]))}
const shells={};for(let t=0;t<T;t++)(shells[find(w[I[3*t]])]??=[]).push(t);

const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
const vp=v=>[P[3*v],P[3*v+1],P[3*v+2]];
function eig(C){let V=[[1,0,0],[0,1,0],[0,0,1]];const A=C.map(r=>[...r]);for(let s=0;s<60;s++)for(let p=0;p<3;p++)for(let q=p+1;q<3;q++){if(Math.abs(A[p][q])<1e-15)continue;const th=0.5*Math.atan2(2*A[p][q],A[q][q]-A[p][p]),c=Math.cos(th),sn=Math.sin(th);for(let k=0;k<3;k++){const a=A[k][p],b=A[k][q];A[k][p]=c*a-sn*b;A[k][q]=sn*a+c*b}for(let k=0;k<3;k++){const a=A[p][k],b=A[q][k];A[p][k]=c*a-sn*b;A[q][k]=sn*a+c*b}for(let k=0;k<3;k++){const a=V[k][p],b=V[k][q];V[k][p]=c*a-sn*b;V[k][q]=sn*a+c*b}}
 return [0,1,2].map(i=>({l:A[i][i],v:[V[0][i],V[1][i],V[2][i]]})).sort((a,b)=>b.l-a.l)}
function fit(ts,open){
 const vs=[...new Set(ts.flatMap(t=>[I[3*t],I[3*t+1],I[3*t+2]]))];
 const m=[0,0,0];for(const v of vs)for(let d=0;d<3;d++)m[d]+=P[3*v+d]/vs.length;
 const C=[[0,0,0],[0,0,0],[0,0,0]];for(const v of vs)for(let a=0;a<3;a++)for(let b=0;b<3;b++)C[a][b]+=(P[3*v+a]-m[a])*(P[3*v+b]-m[b]);
 const ax=eig(C).map(x=>x.v);ax[2]=cross(ax[0],ax[1]);
 const loc=vs.map(v=>{const d=vp(v).map((x,k)=>x-m[k]);return [dot(d,ax[0]),dot(d,ax[1]),dot(d,ax[2])]});
 const t0=Math.min(...loc.map(l=>l[0])),t1=Math.max(...loc.map(l=>l[0])),len=t1-t0;if(len<1e-4)return null;
 const sec=(lo,hi)=>{const s=loc.filter(l=>l[0]>=lo-1e-6&&l[0]<=hi+1e-6);if(s.length<3)return null;return {b:[Math.min(...s.map(l=>l[1])),Math.max(...s.map(l=>l[1]))],c:[Math.min(...s.map(l=>l[2])),Math.max(...s.map(l=>l[2]))]}};
 const s0=sec(t0,t0+0.12*len),s1=sec(t1-0.12*len,t1);if(!s0||!s1)return null;
 for(const q of [s0,s1])for(const k of ['b','c'])if(q[k][1]-q[k][0]<0.012){const mid=(q[k][0]+q[k][1])/2;q[k]=[mid-0.006,mid+0.006]}
 for(const l of loc){const f=(l[0]-t0)/len;for(const k of ['b','c']){const lo=s0[k][0]+(s1[k][0]-s0[k][0])*f,hi=s0[k][1]+(s1[k][1]-s0[k][1])*f,x=l[k==='b'?1:2];if(x<lo-0.04||x>hi+0.04)return null}}
 let area=0,al=0,vol=0;for(const t of ts){const [a,b,c]=[0,1,2].map(k=>vp(I[3*t+k]));const n=cross(b.map((x,k)=>x-a[k]),c.map((x,k)=>x-a[k]));const A=Math.hypot(...n)/2;if(A<1e-12)continue;area+=A;const u=n.map(x=>x/(2*A));if(ax.some(e=>Math.abs(dot(u,e))>0.95))al+=A;vol+=dot(a.map((x,k)=>x-m[k]),n)/6}
 if(al/area<0.85)return null;
 const W=(t,b,c)=>[0,1,2].map(d=>m[d]+ax[0][d]*t+ax[1][d]*b+ax[2][d]*c);
 const rings=[[t0,s0],[t1,s1]].map(([t,s])=>[W(t,s.b[0],s.c[0]),W(t,s.b[1],s.c[0]),W(t,s.b[1],s.c[1]),W(t,s.b[0],s.c[1])]);
 const bv=((s0.b[1]-s0.b[0])*(s0.c[1]-s0.c[0])+(s1.b[1]-s1.b[0])*(s1.c[1]-s1.c[0]))/2*len;
 
 return {rings,vs}}
const oP=[],oN=[],oU=[],oI=[];let swapped=0,kept=0;
const keep=ts=>{kept++;const map=new Map();for(const t of ts)for(let k=0;k<3;k++){const v=I[3*t+k];if(!map.has(v)){map.set(v,oP.length/3);oP.push(...vp(v));oN.push(N[3*v],N[3*v+1],N[3*v+2]);oU.push(U[2*v],U[2*v+1])}oI.push(map.get(v))}};
const emit=({rings,vs})=>{swapped++;const all=rings.flat();const cen=[0,1,2].map(d=>all.reduce((s,q)=>s+q[d],0)/8);
 const near=(p,n)=>{let best=-1,bd=1e9;for(const i of vs){const d=Math.hypot(P[3*i]-p[0],P[3*i+1]-p[1],P[3*i+2]-p[2])+0.3*(1-(N[3*i]*n[0]+N[3*i+1]*n[1]+N[3*i+2]*n[2]));if(d<bd){bd=d;best=i}}return [U[2*best],U[2*best+1]]};
 const tri=(a,b,c)=>{let n=cross(b.map((x,k)=>x-a[k]),c.map((x,k)=>x-a[k]));const l=Math.hypot(...n);if(l<1e-12)return;n=n.map(x=>x/l);const mid=[0,1,2].map(d=>(a[d]+b[d]+c[d])/3-cen[d]);if(dot(n,mid)<0){[b,c]=[c,b];n=n.map(x=>-x)}const base=oP.length/3;const u0=near(a,n);for(const q of [a,b,c]){oP.push(...q);oN.push(...n);const u=near(q,n);oU.push(Math.floor(u[0]*8)===Math.floor(u0[0]*8)&&Math.floor(u[1]*4)===Math.floor(u0[1]*4)?u[0]:u0[0],Math.floor(u[0]*8)===Math.floor(u0[0]*8)&&Math.floor(u[1]*4)===Math.floor(u0[1]*4)?u[1]:u0[1])}oI.push(base,base+1,base+2)};
 const quad=(a,b,c,d)=>{tri(a,b,c);tri(a,c,d)};
 for(let k=0;k<4;k++)quad(rings[0][k],rings[0][(k+1)%4],rings[1][(k+1)%4],rings[1][k]);quad(...rings[0]);quad(...rings[1])};
for(const ts of Object.values(shells)){
 if(ts.length<=12||ts.length>180||ts.some(t=>U[2*I[3*t]]>0.25||U[2*I[3*t]+1]>0.25)){keep(ts);continue}
 const f=fit(ts,false);if(f){emit(f);continue}
 if(ts.length>=40){let top=-1,ty=-1e9;for(const t of ts)for(let k=0;k<3;k++){const v=I[3*t+k];if(P[3*v+1]>ty){ty=P[3*v+1];top=v}}
  const vs=[...new Set(ts.flatMap(t=>[I[3*t],I[3*t+1],I[3*t+2]]))];const mn=[0,1,2].map(d=>Math.min(...vs.map(v=>P[3*v+d]))),mx=[0,1,2].map(d=>Math.max(...vs.map(v=>P[3*v+d])));
  const d=mx[0]-mn[0]>mx[2]-mn[2]?0:2;const ridge=P[3*top+d];
  if(ty-mn[1]>0.15&&ridge-mn[d]>0.25*(mx[d]-mn[d])&&mx[d]-ridge>0.25*(mx[d]-mn[d])){const cz=t=>(P[3*I[3*t]+d]+P[3*I[3*t+1]+d]+P[3*I[3*t+2]+d])/3;const A=ts.filter(t=>cz(t)<ridge),B=ts.filter(t=>cz(t)>=ridge);if(A.length>=6&&B.length>=6){const fa=fit(A,true),fb=fit(B,true);if(fa&&fb){emit(fa);emit(fb);continue}}}}
 keep(ts)}
write(out,j,oP,oN,oU,oI);console.log(src.split('/').pop(),T,'->',oI.length/3,'tris; plain boards',swapped,'kept shells',kept);
