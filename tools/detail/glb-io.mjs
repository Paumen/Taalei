import fs from 'fs';
export function read(f){const b=fs.readFileSync(f);const jl=b.readUInt32LE(12);const j=JSON.parse(b.slice(20,20+jl));const bin=b.slice(20+jl+8);
const acc=i=>{const a=j.accessors[i],v=j.bufferViews[a.bufferView];const off=(v.byteOffset||0)+(a.byteOffset||0);const n={SCALAR:1,VEC2:2,VEC3:3}[a.type];const T={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType];return new T(bin.buffer.slice(bin.byteOffset+off,bin.byteOffset+off+a.count*n*T.BYTES_PER_ELEMENT))};
const p=j.meshes[0].primitives[0];return {j,P:acc(p.attributes.POSITION),N:acc(p.attributes.NORMAL),U:acc(p.attributes.TEXCOORD_0),I:acc(p.indices)}}
export function write(f,j0,P,N,U,I){const j=JSON.parse(JSON.stringify(j0));const n=P.length/3;const Ia=n>65535?new Uint32Array(I):new Uint16Array(I);
const bufs=[Buffer.from(new Float32Array(P).buffer),Buffer.from(new Float32Array(N).buffer),Buffer.from(new Float32Array(U).buffer),Buffer.from(Ia.buffer,0,Ia.byteLength)];
let off=0;j.bufferViews=bufs.map((b,i)=>{const v={buffer:0,byteOffset:off,byteLength:b.length,target:i==3?34963:34962};off+=b.length;off=(off+3)&~3;return v});
const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<P.length;i++){const k=i%3;if(P[i]<mn[k])mn[k]=P[i];if(P[i]>mx[k])mx[k]=P[i]}
j.accessors=[{bufferView:0,componentType:5126,count:n,type:'VEC3',min:mn,max:mx},{bufferView:1,componentType:5126,count:n,type:'VEC3'},{bufferView:2,componentType:5126,count:n,type:'VEC2'},{bufferView:3,componentType:n>65535?5125:5123,count:I.length,type:'SCALAR'}];
const bin=Buffer.alloc(off);let o=0;for(const b of bufs){b.copy(bin,o);o+=b.length;o=(o+3)&~3}
j.buffers=[{byteLength:bin.length}];j.meshes[0].primitives[0]={attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:j.meshes[0].primitives[0].material};
let js=Buffer.from(JSON.stringify(j));const pad=(4-js.length%4)%4;js=Buffer.concat([js,Buffer.alloc(pad,0x20)]);
const h=Buffer.alloc(12);h.writeUInt32LE(0x46546C67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+js.length+8+bin.length,8);
const c1=Buffer.alloc(8);c1.writeUInt32LE(js.length,0);c1.writeUInt32LE(0x4E4F534A,4);const c2=Buffer.alloc(8);c2.writeUInt32LE(bin.length,0);c2.writeUInt32LE(0x004E4942,4);
fs.writeFileSync(f,Buffer.concat([h,c1,js,c2,bin]))}
export function weld(P,eps=1e-4){const m=new Map(),w=new Int32Array(P.length/3);let n=0;for(let i=0;i<P.length/3;i++){const k=Math.round(P[3*i]/eps)+','+Math.round(P[3*i+1]/eps)+','+Math.round(P[3*i+2]/eps);if(!m.has(k))m.set(k,n++);w[i]=m.get(k)}return {w,n}}
