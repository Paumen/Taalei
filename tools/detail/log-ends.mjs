import {read,write,weld} from './glb-io.mjs';
const [,, src, out, ringsArg]=process.argv;const K=+(ringsArg||3);
const {j,P,N,U,I}=read(src);const {w}=weld(P);const T=I.length/3;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const vp=v=>[P[3*v],P[3*v+1],P[3*v+2]];
const cellOf=t=>Math.floor(U[2*I[3*t]]*8)+','+Math.floor(U[2*I[3*t]+1]*4);
const fn=t=>{const [a,b,c]=[0,1,2].map(k=>vp(I[3*t+k]));return cross(sub(b,a),sub(c,a))};
const adj=new Map();for(let t=0;t<T;t++)for(let k=0;k<3;k++){const a=w[I[3*t+k]],b=w[I[3*t+(k+1)%3]];const key=a<b?a+'_'+b:b+'_'+a;(adj.get(key)||adj.set(key,[]).get(key)).push(t)}
const seen=new Uint8Array(T);const drop=new Uint8Array(T);const oP=[],oN=[],oU=[],oI=[];let done=0,skipped=0;
const push=(p,n,uv)=>{oP.push(...p);oN.push(...n);oU.push(...uv);return oP.length/3-1};
for(let s=0;s<T;s++){if(seen[s]||cellOf(s)!=='0,0')continue;
 const A=fn(s),Al=Math.hypot(...A);if(Al<1e-12){seen[s]=1;continue}
 const comp=[s];seen[s]=1;const n0=A.map(x=>x/Al);
 for(let q=0;q<comp.length;q++){const t=comp[q];for(let k=0;k<3;k++){const a=w[I[3*t+k]],b=w[I[3*t+(k+1)%3]];for(const o of adj.get(a<b?a+'_'+b:b+'_'+a)){if(seen[o]||cellOf(o)!=='0,0')continue;const n=fn(o),l=Math.hypot(...n);if(l<1e-12||Math.abs(dot(n,n0))/l<0.985)continue;seen[o]=1;comp.push(o)}}}
 if(comp.length<24){continue}
 const e=new Map();for(const t of comp)for(let k=0;k<3;k++){const a=w[I[3*t+k]],b=w[I[3*t+(k+1)%3]];const key=a<b?a+'_'+b:b+'_'+a;e.set(key,(e.get(key)||0)+1);}
 const pos=new Map();for(const t of comp)for(let k=0;k<3;k++)pos.set(w[I[3*t+k]],vp(I[3*t+k]));
 const nb=new Map();let ne=0;for(const [key,c] of e)if(c===1){ne++;const [a,b]=key.split('_').map(Number);(nb.get(a)||nb.set(a,[]).get(a)).push(b);(nb.get(b)||nb.set(b,[]).get(b)).push(a)}
 let nrm=[0,0,0];for(const t of comp){const n=fn(t);for(let d=0;d<3;d++)nrm[d]+=n[d]}const nl=Math.hypot(...nrm);const compArea=nl/2;nrm=nrm.map(x=>x/nl);
 let L=null;
 if(ne>=3&&![...nb.values()].some(x=>x.length!==2)){const start=nb.keys().next().value;const loop=[start];let prev=-1,cur=start;for(;;){const nx=nb.get(cur).find(x=>x!==prev);if(nx===start||nx===undefined)break;loop.push(nx);prev=cur;cur=nx;if(loop.length>ne)break}if(loop.length===ne)L=loop.map(v=>pos.get(v))}
 if(!L){const e1=cross(nrm,Math.abs(nrm[0])<0.9?[1,0,0]:[0,1,0]);const l1=Math.hypot(...e1);const ex=e1.map(x=>x/l1),ey=cross(nrm,ex);const pts=[...pos.values()].map(p=>({p,x:dot(p,ex),y:dot(p,ey)})).sort((a,b)=>a.x-b.x||a.y-b.y);const cr=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);const lo=[];for(const q of pts){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q)}const up=[];for(const q of pts.reverse()){while(up.length>=2&&cr(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q)}const h=lo.slice(0,-1).concat(up.slice(0,-1));let ha=0;for(let i=0;i<h.length;i++){const q=h[(i+1)%h.length];ha+=h[i].x*q.y-q.x*h[i].y}ha=Math.abs(ha)/2;if(h.length<3||Math.abs(ha-compArea)>0.06*compArea){skipped++;continue}L=h.map(q=>q.p)}
 const cen=[0,1,2].map(d=>L.reduce((a,p)=>a+p[d],0)/L.length);
 let area=[0,0,0];for(let i=0;i<L.length;i++){const c=cross(sub(L[i],cen),sub(L[(i+1)%L.length],cen));for(let d=0;d<3;d++)area[d]+=c[d]}
 if(dot(area,nrm)<0)L=L.reverse();
 for(let ch=true;ch&&L.length>3;){ch=false;for(let i=0;i<L.length;i++){const a=L[(i+L.length-1)%L.length],b=L[i],c=L[(i+1)%L.length];const ac=sub(c,a),l=Math.hypot(...ac)||1;const d=Math.hypot(...cross(sub(b,a),ac))/l;if(d<0.0008){L.splice(i,1);ch=true;break}}}
 const per=[0];for(let i=0;i<L.length;i++)per.push(per[i]+Math.hypot(...sub(L[(i+1)%L.length],L[i])));const tot=per[L.length];
 if(L.length<=6&&comp.length<40){continue}
 const at=f=>{const d=((f%1)+1)%1*tot;let i=0;while(i<L.length-1&&per[i+1]<d)i++;const u=(d-per[i])/(per[i+1]-per[i]||1);const a=L[i],b=L[(i+1)%L.length];return [0,1,2].map(k=>a[k]+(b[k]-a[k])*u)};
 const vs=[];for(const t of comp)for(let k=0;k<3;k++)vs.push(U[2*I[3*t+k]+1]);vs.sort((a,b)=>a-b);const vA=vs[Math.floor(vs.length*0.1)],vB=vs[Math.floor(vs.length*0.9)];
 if(vB-vA<0.03){continue}
 const i0=oI.length,p0=oP.length,n0v=oN.length,u0=oU.length;
 const uu=U[2*I[3*comp[0]]];const tone=q=>[uu,q%2?vB:vA];
 const hex=sc=>[0,1,2,3,4,5].map(i=>{const p=at((i+0.5)/6);return [0,1,2].map(k=>cen[k]+(p[k]-cen[k])*sc)});
 const e1=cross(nrm,Math.abs(nrm[0])<0.9?[1,0,0]:[0,1,0]);const l1=Math.hypot(...e1);const ex=e1.map(x=>x/l1),ey=cross(nrm,ex);
 const ang=p=>{const d=sub(p,cen);return Math.atan2(dot(d,ey),dot(d,ex))};
 const mk=(pts,q)=>pts.map(p=>({i:push(p,nrm,tone(q)),a:ang(p)})).sort((x,y)=>x.a-y.a);
 let O=mk(L,0);
 for(let r=1;r<K;r++){const h=hex(1-r/K);const H=mk(h,r);const n=O.length,m=H.length;
  let j0=0,bd=9;for(let k=0;k<m;k++){let d=Math.abs(H[k].a-O[0].a);d=Math.min(d,2*Math.PI-d);if(d<bd){bd=d;j0=k}}
  const oa=i=>O[i%n].a+(i>=n?2*Math.PI:0);
  const base=(()=>{let x=H[j0].a;while(x-O[0].a>Math.PI)x-=2*Math.PI;while(x-O[0].a<-Math.PI)x+=2*Math.PI;return x})();
  const ha=k=>{let x=H[(j0+k)%m].a;while(x<base-1e-9)x+=2*Math.PI;if(k>=m)x=base+2*Math.PI;return x};
  let i=0,jj=0;while(i<n||jj<m){const no=i<n?oa(i+1):1e9,nh=jj<m?ha(jj+1):1e9;if(no<=nh){oI.push(O[i%n].i,O[(i+1)%n].i,H[(j0+jj)%m].i);i++}else{oI.push(O[i%n].i,H[(j0+jj+1)%m].i,H[(j0+jj)%m].i);jj++}}
  O=mk(h,r)}
 const c=push(cen,nrm,tone(K));for(let i=0;i<O.length;i++)oI.push(O[i].i,O[(i+1)%O.length].i,c);
 let bad=false;for(let q=i0;q<oI.length;q+=3){const [a,b,d]=[0,1,2].map(k=>[oP[3*oI[q+k]],oP[3*oI[q+k]+1],oP[3*oI[q+k]+2]]);if(dot(cross(sub(b,a),sub(d,a)),nrm)<-1e-10){bad=true;break}}
 if(bad){oI.length=i0;oP.length=p0;oN.length=n0v;oU.length=u0;skipped++;continue}
 for(const t of comp)drop[t]=1;done++}
const map=new Map();for(let t=0;t<T;t++){if(drop[t])continue;for(let k=0;k<3;k++){const v=I[3*t+k];if(!map.has(v))map.set(v,push(vp(v),[N[3*v],N[3*v+1],N[3*v+2]],[U[2*v],U[2*v+1]]));oI.push(map.get(v))}}
write(out,j,oP,oN,oU,oI);console.log(src.split('/').pop(),T,'->',oI.length/3,'tris; ends redone',done,'skipped',skipped);
