import {readGlb,acc,writeGlb} from './glb.mjs';
import fs from 'fs';

const BANDS={ivory:[5,2],taupe:[14,3],'taupe-dark':[12,3]};
const TAG2BAND={'stone-masonry-light':'ivory','stone-masonry-mid':'taupe','stone-masonry-dark':'taupe-dark'};

export const P={
  base:0.42, keepMean:0.3, keepDetail:0.6,
  top:-0.30, bottom:0.48,
  ao:0.42, grad:0.10, modelGrad:0.10, keepStone:0.8,
  amp:{coursed:0.30,parts:0.30,mono:0.08,ground:0.30,heap:0.32},
  minDiff:{coursed:0.22,parts:0.24,mono:0.05,ground:0.22,heap:0.26}, maxJump:0.46,
  facet:0.07,
};

function mat4FromNode(n){
  if(n.matrix)return n.matrix.slice();
  const [x,y,z,w]=n.rotation||[0,0,0,1];const [sx,sy,sz]=n.scale||[1,1,1];const [tx,ty,tz]=n.translation||[0,0,0];
  return [(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0,2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,tx,ty,tz,1];
}
function mul(a,b){const o=new Array(16).fill(0);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)o[j*4+i]+=a[k*4+i]*b[j*4+k];return o}
function tp(m,p){return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]]}
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(a[0],a[1],a[2]);const norm=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l]};

function rng(seed){let s=0;for(const c of seed)s=(s*31+c.charCodeAt(0))>>>0;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296}}

function buildBVH(tris){
  const idx=tris.map((_,i)=>i);
  const nodes=[];
  function bb(ids){const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(const i of ids)for(const p of tris[i].p)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k])}return [mn,mx]}
  function make(ids){const [mn,mx]=bb(ids);const node={mn,mx};if(ids.length<=6){node.ids=ids;return node}
    const ax=[0,1,2].sort((a,b)=>(mx[b]-mn[b])-(mx[a]-mn[a]))[0];
    ids.sort((a,b)=>tris[a].c[ax]-tris[b].c[ax]);const h=ids.length>>1;node.l=make(ids.slice(0,h));node.r=make(ids.slice(h));return node}
  return make(idx);
}
function rayBox(o,d,mn,mx,tmax){let t0=0,t1=tmax;for(let k=0;k<3;k++){const inv=1/d[k];let a=(mn[k]-o[k])*inv,b=(mx[k]-o[k])*inv;if(a>b)[a,b]=[b,a];t0=Math.max(t0,a);t1=Math.min(t1,b);if(t0>t1)return false}return true}
function rayTri(o,d,t,tmax){const [a,b,c]=t.p;const e1=sub(b,a),e2=sub(c,a);const pv=cross(d,e2);const det=dot(e1,pv);if(Math.abs(det)<1e-12)return false;const iv=1/det;const tv=sub(o,a);const u=dot(tv,pv)*iv;if(u<0||u>1)return false;const q=cross(tv,e1);const v=dot(d,q)*iv;if(v<0||u+v>1)return false;const tt=dot(e2,q)*iv;return tt>1e-6&&tt<tmax}
function hit(node,tris,o,d,tmax){if(!rayBox(o,d,node.mn,node.mx,tmax))return false;if(node.ids){for(const i of node.ids)if(rayTri(o,d,tris[i],tmax))return true;return false}return hit(node.l,tris,o,d,tmax)||hit(node.r,tris,o,d,tmax)}

function classify(kind,segs,area,bbox,tris){
  const ext=sub(bbox[1],bbox[0]);
  if(/^obj-resource-stone|^env-terrain-rock|^str-fixture-marker-grave.*broken/.test(kind))return 'heap';
  let up=0,all=0;for(const t of tris){if(!t.m)continue;all+=t.a;if(t.n[1]>0.7)up+=t.a}
  if(/^str-access-(road|path)|^str-part-floor|^env-terrain-ground|^str-access-platform/.test(kind)&&up>0.35*all)return 'ground';
  const big=segs.filter(s=>!s.inset&&s.a>0.004*area).length;
  if(big>=8)return 'coursed';
  if(big>=2)return 'parts';
  return 'mono';
}

export function process(inPath,outPath,{kind='',tags=[],id='',opts={}}={}){
  const Q={...P,...opts};
  const g=readGlb(inPath);const J=g.json;
  const want=new Set();for(const t of tags)if(TAG2BAND[t])want.add(BANDS[TAG2BAND[t]].join(','));
  const tris=[];const prims=[];
  const world=new Array(J.nodes.length);
  const walk=(i,m)=>{const w=mul(m,mat4FromNode(J.nodes[i]));world[i]=w;for(const c of J.nodes[i].children||[])walk(c,w)};
  for(const r of J.scenes[J.scene||0].nodes)walk(r,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  J.nodes.forEach((n,ni)=>{if(n.mesh==null||!world[ni])return;J.meshes[n.mesh].primitives.forEach((pr,pi)=>{
    const pos=acc(g,pr.attributes.POSITION),uv=acc(g,pr.attributes.TEXCOORD_0);
    const ix=pr.indices!=null?acc(g,pr.indices).data:Uint32Array.from({length:pos.count},(_,i)=>i);
    const P_={pr,pos,uv,ix,mesh:n.mesh,pi,tri0:tris.length,wp:[]};prims.push(P_);
    for(let v=0;v<pos.count;v++)P_.wp.push(tp(world[ni],[pos.data[3*v],pos.data[3*v+1],pos.data[3*v+2]]));
    for(let k=0;k<ix.length;k+=3){const vs=[ix[k],ix[k+1],ix[k+2]];const p=vs.map(v=>P_.wp[v]);
      const cr=cross(sub(p[1],p[0]),sub(p[2],p[0]));const a=len(cr)/2;
      const u0=uv.data[2*vs[0]],v0=uv.data[2*vs[0]+1];const cell=Math.floor(u0*16)+','+Math.floor(v0*4);
      tris.push({P:P_,vs,p,n:norm(cr),a,c:[(p[0][0]+p[1][0]+p[2][0])/3,(p[0][1]+p[1][1]+p[2][1])/3,(p[0][2]+p[1][2]+p[2][2])/3],cell,m:want.has(cell),
        ev:vs.map(v=>uv.data[2*v+1]*4-Math.floor(v0*4))});}
  })});
  const mt=tris.filter(t=>t.m);if(!mt.length)return {skipped:'no masonry cell'};
  const bbox=[[1e9,1e9,1e9],[-1e9,-1e9,-1e9]];for(const t of tris)for(const p of t.p)for(let k=0;k<3;k++){bbox[0][k]=Math.min(bbox[0][k],p[k]);bbox[1][k]=Math.max(bbox[1][k],p[k])}
  const size=len(sub(bbox[1],bbox[0]));const eps=size*2e-4;
  const key=p=>p.map(x=>Math.round(x/eps)).join(',');
  const wid=new Map();const wv=t=>t.p.map(p=>{const k=key(p);if(!wid.has(k))wid.set(k,wid.size);return wid.get(k)});
  tris.forEach(t=>t.w=wv(t));
  const edges=new Map();tris.forEach((t,i)=>{if(!t.m)return;for(let e=0;e<3;e++){const a=t.w[e],b=t.w[(e+1)%3];const k=a<b?a+'_'+b:b+'_'+a;(edges.get(k)||edges.set(k,[]).get(k)).push(i)}});
  const par=tris.map((_,i)=>i);const f=i=>par[i]===i?i:(par[i]=f(par[i]));const un=(a,b)=>{a=f(a);b=f(b);if(a!==b)par[a]=b};
  const fpar=tris.map((_,i)=>i);const ff=i=>fpar[i]===i?i:(fpar[i]=ff(fpar[i]));
  const concave=new Map();
  for(const [k,l] of edges){for(let x=0;x<l.length;x++)for(let y=x+1;y<l.length;y++){const A=tris[l[x]],B=tris[l[y]];if(A.cell!==B.cell)continue;
    const cosang=dot(A.n,B.n);const opp=B.p[[0,1,2].find(i=>!A.w.includes(B.w[i]))??0];
    const s=dot(A.n,sub(opp,A.c));const isConcave=s>eps*2&&cosang<0.97;
    if(isConcave){(concave.get(l[x])||concave.set(l[x],[]).get(l[x])).push(l[y]);(concave.get(l[y])||concave.set(l[y],[]).get(l[y])).push(l[x]);continue}
    un(l[x],l[y]);if(cosang>0.88){const a=ff(l[x]),b=ff(l[y]);if(a!==b)fpar[a]=b}}}
  const segMap=new Map();
  tris.forEach((t,i)=>{if(!t.m)return;const r=f(i);if(!segMap.has(r))segMap.set(r,{tris:[],a:0,c:[0,0,0],nb:new Set(),mn:[1e9,1e9,1e9],mx:[-1e9,-1e9,-1e9],nsum:[0,0,0]});const s=segMap.get(r);s.tris.push(i);s.a+=t.a;for(let k=0;k<3;k++){s.c[k]+=t.c[k]*t.a;s.nsum[k]+=t.n[k]*t.a}for(const p of t.p)for(let k=0;k<3;k++){s.mn[k]=Math.min(s.mn[k],p[k]);s.mx[k]=Math.max(s.mx[k],p[k])}});
  const segs=[...segMap.values()];segs.forEach((s,i)=>{s.id=i;s.c=s.c.map(x=>x/s.a);for(const ti of s.tris)tris[ti].seg=s});
  for(const [i,l] of concave)for(const j of l){const a=tris[i].seg,b=tris[j].seg;if(a&&b&&a!==b){a.nb.add(b);b.nb.add(a)}}
  const pad=size*0.01;
  for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){const A=segs[i],B=segs[j];if([0,1,2].every(k=>A.mn[k]-pad<=B.mx[k]&&B.mn[k]-pad<=A.mx[k])){A.nb.add(B);B.nb.add(A)}}
  for(const s of segs){const nn=len(s.nsum)/s.a;s.planar=nn>0.97;let cv=0,tot=0;for(const ti of s.tris){tot++;if(concave.has(ti))cv++}
    s.inset=s.planar&&s.nb.size>0&&[...s.nb].some(o=>o.a>s.a*2)&&cv>0;}
  const area=segs.reduce((a,s)=>a+s.a,0);
  const cls=opts.cls||classify(kind,segs,area,bbox,tris);
  const R=rng(id||inPath);
  const amp=Q.amp[cls];
  let em0=0,ea0=0;for(const t of mt){em0+=(t.ev[0]+t.ev[1]+t.ev[2])/3*t.a;ea0+=t.a}em0/=ea0;
  for(const s of segs){let m=0;for(const ti of s.tris){const t=tris[ti];m+=(t.ev[0]+t.ev[1]+t.ev[2])/3*t.a}s.ex=Math.max(-0.3,Math.min(0.3,(m/s.a-em0)*Q.keepStone))}
  const order=[...segs].sort((a,b)=>b.a-a.a);
  const ph=[R()*6.28,R()*6.28,R()*6.28];const fr=2*Math.PI/(size*0.9);
  const field=c=>0.5*(Math.sin(c[0]*fr+ph[0])*Math.cos(c[2]*fr+ph[1])+0.6*Math.sin(c[1]*fr*1.3+ph[2]))/1.6;
  const levels=[-1,-0.75,-0.5,-0.25,0,0.25,0.5,0.75,1];
  const stones=segs.filter(s=>!s.inset);
  if(stones.length<=6)for(const a of stones)for(const b of stones)if(a!==b)a.nb.add(b);
  const D=Q.minDiff[cls];
  for(const s of order){if(s.inset)continue;
    const nbt=[...s.nb].filter(o=>o.tone!=null&&!o.inset).map(o=>o.tone);
    const fv=field(s.c)*amp;
    let best=0,bs=-1e9;for(const L of levels){const v=Math.max(-0.32,Math.min(0.32,s.ex+L*amp));
      const md=nbt.length?Math.min(...nbt.map(t=>Math.abs(t-v))):D;const mx=nbt.length?Math.max(...nbt.map(t=>Math.abs(t-v))):0;
      const sc=Math.min(md,D)/D-Math.max(0,mx-Q.maxJump)*4-0.35*Math.abs(v-s.ex-fv)/amp+R()*0.15;if(sc>bs){bs=sc;best=v}}
    s.tone=best;}
  for(const s of segs){if(!s.inset)continue;const nb=[...s.nb].filter(o=>o.tone!=null);s.tone=nb.length?nb.reduce((a,o)=>a+o.tone*o.a,0)/nb.reduce((a,o)=>a+o.a,0):0}
  const facetTone=new Map();
  const isRoofKind=/^str-building|^str-part-roof|^str-canopy/.test(kind);
  for(const s of segs){const ny=s.nsum[1]/len(s.nsum);s.roof=isRoofKind&&ny>0.3&&ny<0.97&&s.planar===false&&s.a>area*0.08&&(s.mn[1]-bbox[0][1])>(bbox[1][1]-bbox[0][1])*0.4}
  let em=0,ea=0;for(const t of mt){for(const v of t.ev){em+=v*t.a/3}ea+=t.a}em/=ea;
  for(const s of segs){let m=0;for(const ti of s.tris){const t=tris[ti];m+=(t.ev[0]+t.ev[1]+t.ev[2])/3*t.a}s.em=m/s.a}
  const base=(1-Q.keepMean)*Q.base+Q.keepMean*em;
  const bvh=buildBVH(tris);
  const segExt=segs.filter(s=>!s.inset).map(s=>len(sub(s.mx,s.mn))).sort((a,b)=>a-b);
  const med=segExt[segExt.length>>1]||size;
  const aoDist=Math.min(size*0.3,Math.max(med*1.2,size*0.06));
  const dirs=[];const RR=rng('ao');for(let i=0;i<20;i++){const u=(i+0.5)/20,phi=i*2.39996;const r=Math.sqrt(u);dirs.push([r*Math.cos(phi),Math.sqrt(1-u),r*Math.sin(phi)])}
  const aoCache=new Map();
  const ao=(p,n)=>{const k=key(p)+'|'+n.map(x=>x.toFixed(2)).join(',');if(aoCache.has(k))return aoCache.get(k);
    const t1=Math.abs(n[1])<0.9?norm(cross(n,[0,1,0])):norm(cross(n,[1,0,0]));const t2=cross(n,t1);
    const o=[p[0]+n[0]*eps*4,p[1]+n[1]*eps*4,p[2]+n[2]*eps*4];let h=0;
    for(const d of dirs){const w=[t1[0]*d[0]+n[0]*d[1]+t2[0]*d[2],t1[1]*d[0]+n[1]*d[1]+t2[1]*d[2],t1[2]*d[0]+n[2]*d[1]+t2[2]*d[2]];if(hit(bvh,tris,o,w,aoDist))h++}
    const r=h/dirs.length;aoCache.set(k,r);return r};
  const H0=bbox[0][1],H=bbox[1][1]-bbox[0][1]||1;
  const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  tris.forEach((t,i)=>t.idx=i);
  const fArea=new Map();for(const t of mt){const r=ff(t.idx);fArea.set(r,(fArea.get(r)||0)+t.a)}
  const facets=new Map();for(const s of segs)for(const ti of s.tris){const r=ff(ti);if(!facets.has(r))facets.set(r,(R()-0.5)*2*Q.facet)}
  const facetW=t=>{const fa=fArea.get(ff(t.idx))||0;return Math.min(1.4,0.3+fa/(area*0.05))};
  for(const t of tris){if(!t.m)continue;const s=t.seg;if(s.roof){t.nv=t.ev.slice();continue}
    const ny=t.n[1];const or=ny>=0?Q.top*smooth(0.3,0.9,ny):Q.bottom*smooth(0.15,0.75,-ny);
    const sh=s.mx[1]-s.mn[1];
    {let acc_=ao(t.c,t.n)*2;for(const p of t.p)acc_+=ao([p[0]*0.6+t.c[0]*0.4,p[1]*0.6+t.c[1]*0.4,p[2]*0.6+t.c[2]*0.4],t.n);t.aoF=Q.ao*acc_/5}
    t.nv=t.p.map((p,ci)=>{
      const hs=sh>size*0.02?(p[1]-s.mn[1])/sh:0.5;const hm=(p[1]-H0)/H;
      const g=Q.grad*(0.5-hs)*(cls==='ground'?0.5:1)+(cls==='ground'?0:Q.modelGrad*(0.5-hm));
      const a=t.aoF;
      const d=Math.max(-0.2,Math.min(0.2,(t.ev[ci]-s.em)*Q.keepDetail));
      return Math.max(0.03,Math.min(0.97,base+s.tone+or+g+a+d+(facets.get(ff(t.idx))||0)*facetW(t)));
    });}
  rebuild(g,prims,tris);
  writeGlb(g,outPath);
  const st={cls,segs:segs.length,stones:segs.filter(s=>!s.inset).length,insets:segs.filter(s=>s.inset).length,roofs:segs.filter(s=>s.roof).length,base:+base.toFixed(3),aoDist:+aoDist.toFixed(3)};
  return st;
}

function rebuild(g,prims,tris){
  const J=g.json;const NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
  for(const P_ of prims){
    const map=new Map();const newIx=[];const src=[];
    const nT=P_.ix.length/3;
    for(let k=0;k<nT;k++){const t=tris[P_.tri0+k];for(let c=0;c<3;c++){const v=t.vs[c];
      const nv=t.nv?t.nv[c]:null;const kk=v+'|'+(nv==null?'x':nv.toFixed(3));
      if(!map.has(kk)){map.set(kk,src.length);src.push([v,nv,t.cell])}newIx.push(map.get(kk))}}
    const attrs=P_.pr.attributes;
    for(const name of Object.keys(attrs)){
      const a=acc(g,attrs[name]);const n=a.n;const C=a.data.constructor;const out=new C(src.length*n);
      src.forEach(([v,nv,cell],i)=>{for(let k=0;k<n;k++)out[i*n+k]=a.data[v*n+k];
        if(name==='TEXCOORD_0'&&nv!=null){const row=+cell.split(',')[1];out[i*n+1]=(row+0.02+nv*0.96)/4}});
      attrs[name]=addAcc(g,out,J.accessors[attrs[name]],src.length);
    }
    const IC=src.length>65535?Uint32Array:Uint16Array;
    P_.pr.indices=addAcc(g,IC.from(newIx),{componentType:IC===Uint32Array?5125:5123,type:'SCALAR'},newIx.length,true);
  }
  compact(g);
}
function addAcc(g,data,tmpl,count,isIdx){
  const J=g.json;const buf=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
  const off=Math.ceil(g.bin.length/4)*4;g.bin=Buffer.concat([g.bin,Buffer.alloc(off-g.bin.length),buf]);
  J.bufferViews.push({buffer:0,byteOffset:off,byteLength:buf.length,...(isIdx?{target:34963}:{target:34962})});
  const a={bufferView:J.bufferViews.length-1,componentType:tmpl.componentType,count,type:tmpl.type};
  if(tmpl.normalized)a.normalized=true;
  if(tmpl.min&&tmpl.type!=='SCALAR'){const n={VEC2:2,VEC3:3,VEC4:4}[tmpl.type];const mn=new Array(n).fill(Infinity),mx=new Array(n).fill(-Infinity);for(let i=0;i<count;i++)for(let k=0;k<n;k++){mn[k]=Math.min(mn[k],data[i*n+k]);mx[k]=Math.max(mx[k],data[i*n+k])}a.min=mn;a.max=mx}
  J.accessors.push(a);return J.accessors.length-1;
}
function compact(g){
  const J=g.json;const used=new Set();
  const mark=i=>{if(i!=null)used.add(i)};
  for(const m of J.meshes)for(const p of m.primitives){mark(p.indices);for(const k in p.attributes)mark(p.attributes[k]);for(const t of p.targets||[])for(const k in t)mark(t[k])}
  for(const s of J.skins||[])mark(s.inverseBindMatrices);
  for(const a of J.animations||[])for(const s of a.samplers){mark(s.input);mark(s.output)}
  const keepBV=new Set();for(const i of used)keepBV.add(J.accessors[i].bufferView);
  for(const im of J.images||[])if(im.bufferView!=null)keepBV.add(im.bufferView);
  const accMap=new Map();const newAcc=[];J.accessors.forEach((a,i)=>{if(used.has(i)){accMap.set(i,newAcc.length);newAcc.push(a)}});
  const bvMap=new Map();const newBV=[];const parts=[];let off=0;
  J.bufferViews.forEach((bv,i)=>{if(!keepBV.has(i))return;const pad=(4-off%4)%4;if(pad){parts.push(Buffer.alloc(pad));off+=pad}
    parts.push(g.bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength));bvMap.set(i,newBV.length);newBV.push({...bv,byteOffset:off});off+=bv.byteLength});
  g.bin=Buffer.concat(parts);J.bufferViews=newBV;newAcc.forEach(a=>a.bufferView=bvMap.get(a.bufferView));J.accessors=newAcc;
  const ra=i=>i==null?i:accMap.get(i);
  for(const m of J.meshes)for(const p of m.primitives){if(p.indices!=null)p.indices=ra(p.indices);for(const k in p.attributes)p.attributes[k]=ra(p.attributes[k]);for(const t of p.targets||[])for(const k in t)t[k]=ra(t[k])}
  for(const s of J.skins||[])if(s.inverseBindMatrices!=null)s.inverseBindMatrices=ra(s.inverseBindMatrices);
  for(const a of J.animations||[])for(const s of a.samplers){s.input=ra(s.input);s.output=ra(s.output)}
  for(const im of J.images||[])if(im.bufferView!=null)im.bufferView=bvMap.get(im.bufferView);
}
