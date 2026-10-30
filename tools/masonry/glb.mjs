import fs from 'fs';
const CT={5126:Float32Array,5123:Uint16Array,5125:Uint32Array,5121:Uint8Array,5122:Int16Array,5120:Int8Array};
const NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
export function readGlb(p){
  const b=fs.readFileSync(p);const jl=b.readUInt32LE(12);
  const json=JSON.parse(b.slice(20,20+jl).toString());
  const bo=20+jl;const bl=b.readUInt32LE(bo);const bin=b.slice(bo+8,bo+8+bl);
  return {json,bin:Buffer.from(bin)};
}
export function acc(g,i){
  const a=g.json.accessors[i];const bv=g.json.bufferViews[a.bufferView];
  const C=CT[a.componentType];const n=NC[a.type];
  const off=(bv.byteOffset||0)+(a.byteOffset||0);const stride=bv.byteStride||0;
  const es=C.BYTES_PER_ELEMENT*n;
  if(stride&&stride!==es){const out=new C(a.count*n);for(let k=0;k<a.count;k++){const v=new C(g.bin.buffer,g.bin.byteOffset+off+k*stride,n);out.set(v,k*n)}return {data:out,n,count:a.count,shared:false}}
  const arr=new C(g.bin.buffer.slice(g.bin.byteOffset+off,g.bin.byteOffset+off+a.count*es));
  return {data:arr,n,count:a.count,off,shared:true};
}
export function writeAcc(g,i,data){
  const a=g.json.accessors[i];const bv=g.json.bufferViews[a.bufferView];
  const off=(bv.byteOffset||0)+(a.byteOffset||0);const n=NC[a.type];const stride=bv.byteStride||0;
  const buf=Buffer.from(data.buffer,data.byteOffset,data.byteLength);
  if(stride&&stride!==4*n){for(let k=0;k<a.count;k++)buf.copy(g.bin,off+k*stride,k*4*n,(k+1)*4*n)}else buf.copy(g.bin,off);
}
export function writeGlb(g,p){
  const js=Buffer.from(JSON.stringify(g.json));const jp=Buffer.alloc((4-js.length%4)%4,0x20);
  const jb=Buffer.concat([js,jp]);const bp=Buffer.alloc((4-g.bin.length%4)%4,0);const bb=Buffer.concat([g.bin,bp]);
  const h=Buffer.alloc(12);h.writeUInt32LE(0x46546C67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(12+8+jb.length+8+bb.length,8);
  const c1=Buffer.alloc(8);c1.writeUInt32LE(jb.length,0);c1.writeUInt32LE(0x4E4F534A,4);
  const c2=Buffer.alloc(8);c2.writeUInt32LE(bb.length,0);c2.writeUInt32LE(0x004E4942,4);
  if(g.json.buffers)g.json.buffers[0].byteLength=g.bin.length;
  fs.writeFileSync(p,Buffer.concat([h,c1,jb,c2,bb]));
}
