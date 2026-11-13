import {read,write,weld} from './glb-io.mjs';
const [,, src, out]=process.argv;
if(!src||!out){console.log('log-wall.mjs <in.glb> <out.glb>\nRebuilds each welded log wall as plain six-sided logs with flat ends,\nkeeping the rows, the staggered ends and the door and window openings.');process.exit(1)}
const {j,P,N,U,I}=read(src);const {w}=weld(P);const T=I.length/3;
const par=new Map();const find=x=>{if(!par.has(x))par.set(x,x);while(par.get(x)!==x){par.set(x,par.get(par.get(x)));x=par.get(x)}return x};
for(let t=0;t<T;t++){const a=[0,1,2].map(k=>find(w[I[3*t+k]]));par.set(a[0],a[1]);par.set(find(a[1]),find(a[2]))}
const shells={};for(let t=0;t<T;t++)(shells[find(w[I[3*t]])]??=[]).push(t);
const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
const oP=[],oN=[],oU=[],oI=[];let walls=0;
const keep=ts=>{const map=new Map();for(const t of ts)for(let k=0;k<3;k++){const v=I[3*t+k];if(!map.has(v)){map.set(v,oP.length/3);oP.push(P[3*v],P[3*v+1],P[3*v+2]);oN.push(N[3*v],N[3*v+1],N[3*v+2]);oU.push(U[2*v],U[2*v+1])}oI.push(map.get(v))}};
for(const ts of Object.values(shells)){
 const vs=[...new Set(ts.flatMap(t=>[I[3*t],I[3*t+1],I[3*t+2]]))];
 const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(const v of vs)for(let d=0;d<3;d++){mn[d]=Math.min(mn[d],P[3*v+d]);mx[d]=Math.max(mx[d],P[3*v+d])}
 const sx=mx[0]-mn[0],sy=mx[1]-mn[1],sz=mx[2]-mn[2];
 const wood=!ts.some(t=>U[2*I[3*t]]>0.25||U[2*I[3*t]+1]>0.25);
 const A=sx>sz?0:2,D=sx>sz?2:0;const thick=Math.min(sx,sz),long=Math.max(sx,sz);
 if(ts.length<300||!wood||sy<1||thick>0.4||long<1){keep(ts);continue}
 const S=v=>P[3*v+A],Y=v=>P[3*v+1],Qc=v=>P[3*v+D];
 const qmid=(mn[D]+mx[D])/2,qh=thick/2;
 const peakY=vs.filter(v=>Math.abs(Qc(v)-qmid)>0.8*qh).map(Y).sort((a,b)=>a-b);
 const cents=[];let run=[];for(const y of peakY){if(run.length&&y-run[run.length-1]>0.06){cents.push(run.reduce((a,b)=>a+b,0)/run.length);run=[]}run.push(y)}if(run.length)cents.push(run.reduce((a,b)=>a+b,0)/run.length);
 if(cents.length<3){keep(ts);continue}
 const bounds=[mn[1]];for(let i=0;i+1<cents.length;i++)bounds.push((cents[i]+cents[i+1])/2);bounds.push(mx[1]);
 const near=vs.filter(v=>bounds.some(b=>Math.abs(Y(v)-b)<0.012)).map(Qc).sort((a,b)=>a-b);
 const pct=(a,f)=>a[Math.min(a.length-1,Math.floor(a.length*f))];
 let qfv=near.length>8?pct(near,0.9):mx[D]-0.03,qbv=near.length>8?pct(near,0.1):mn[D]+0.03;
 if(qfv>mx[D]-0.01)qfv=mx[D]-0.03;if(qbv<mn[D]+0.01)qbv=mn[D]+0.03;
 const tri=ts.map(t=>{const a=I[3*t]*3,b=I[3*t+1]*3,c=I[3*t+2]*3;return [[P[a+A],P[a+1]],[P[b+A],P[b+1]],[P[c+A],P[c+1]]]});
 const inside=(s,y)=>tri.some(([a,b,c])=>{const d1=(s-b[0])*(a[1]-b[1])-(a[0]-b[0])*(y-b[1]),d2=(s-c[0])*(b[1]-c[1])-(b[0]-c[0])*(y-c[1]),d3=(s-a[0])*(c[1]-a[1])-(c[0]-a[0])*(y-a[1]);return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0))});
 const rows=[];
 for(let r=0;r+1<bounds.length;r++){const y0=bounds[r],y1=bounds[r+1],ym=(y0+y1)/2;const rv=vs.filter(v=>Y(v)>y0-0.01&&Y(v)<y1+0.01);
  const segs=[];let start=null,last=null;for(let s=mn[A]-0.01;s<=mx[A]+0.02;s+=0.02){const solid=inside(s,ym)||inside(s,ym+0.25*(y1-y0))||inside(s,ym-0.25*(y1-y0));if(solid){if(start===null)start=s;last=s}else if(start!==null){segs.push([start,last]);start=null}}if(start!==null)segs.push([start,last]);
  const snap=(s,dir)=>{let best=s,bd=0.05;for(const v of rv){const d=Math.abs(S(v)-s);if(d<bd){bd=d;best=S(v)}}return best};
  const core=rv.filter(v=>Math.abs(Y(v)-ym)<0.3*(y1-y0)).map(S);const ext=(s,lo)=>{const c=core.filter(x=>Math.abs(x-s)<0.2);return c.length?(lo?Math.min(...c):Math.max(...c)):snap(s)};
  rows.push({y0,y1,ym,qf:Math.max(...rv.map(Qc)),qb:Math.min(...rv.map(Qc)),segs:segs.filter(([a,b])=>b-a>0.04).map(([a,b],i,all)=>[i===0?ext(a,true):snap(a),i===all.length-1?ext(b,false):snap(b)])})}
 walls++;
 const nearUv=(p,n)=>{let best=-1,bd=1e9;for(const i of vs){const d=Math.hypot(P[3*i]-p[0],P[3*i+1]-p[1],P[3*i+2]-p[2])+0.3*(1-(N[3*i]*n[0]+N[3*i+1]*n[1]+N[3*i+2]*n[2]));if(d<bd){bd=d;best=i}}return [U[2*best],U[2*best+1]]};
 const W=(s,y,q)=>{const p=[0,y,0];p[A]=s;p[D]=q;return p};
 const emit=(a,b,c,ref)=>{let n=cross(b.map((x,k)=>x-a[k]),c.map((x,k)=>x-a[k]));const l=Math.hypot(...n);if(l<1e-12)return;n=n.map(x=>x/l);if(n[0]*ref[0]+n[1]*ref[1]+n[2]*ref[2]<0){[b,c]=[c,b];n=n.map(x=>-x)}const base=oP.length/3;const u=nearUv([0,1,2].map(k=>(a[k]+b[k]+c[k])/3),n);for(const q of [a,b,c]){oP.push(...q);oN.push(...n);const uq=nearUv(q,n);oU.push(u[0],Math.abs(uq[0]-u[0])<0.03?uq[1]:u[1])}oI.push(base,base+1,base+2)};
 const quad=(a,b,c,d,ref)=>{emit(a,b,c,ref);emit(a,c,d,ref)};
 const covered=(r,s0,s1)=>r>=0&&r<rows.length&&rows[r].segs.some(([a,b])=>a<=s0+0.03&&b>=s1-0.03);
 rows.forEach((row,r)=>{for(const [s0,s1] of row.segs){
  const sec=s=>[W(s,row.y0,qfv),W(s,row.ym,row.qf),W(s,row.y1,qfv),W(s,row.y1,qbv),W(s,row.ym,row.qb),W(s,row.y0,qbv)];
  const L=sec(s0),R=sec(s1);const dir=k=>{const v=[0,0,0];v[D]=k;return v};
  quad(L[0],R[0],R[1],L[1],dir(1));quad(L[1],R[1],R[2],L[2],dir(1));quad(L[3],R[3],R[4],L[4],dir(-1));quad(L[4],R[4],R[5],L[5],dir(-1));
  if(!covered(r+1,s0,s1))quad(L[2],R[2],R[3],L[3],[0,1,0]);
  if(!covered(r-1,s0,s1))quad(L[5],R[5],R[0],L[0],[0,-1,0]);
  const ax=k=>{const v=[0,0,0];v[A]=k;return v};
  for(const [C,k] of [[L,-1],[R,1]])for(let i=1;i<5;i++)emit(C[0],C[i],C[i+1],ax(k))}})}
write(out,j,oP,oN,oU,oI);console.log(src.split('/').pop(),T,'->',oI.length/3,'tris; walls rebuilt',walls);
