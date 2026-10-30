import {process as tone} from './masonry.mjs';
import fs from 'fs';
const cat=JSON.parse(fs.readFileSync('catalog/build/catalog.json'));
const list=(Array.isArray(cat)?cat:(cat.models||Object.values(cat))).filter(x=>x&&x.tags);
const by=Object.fromEntries(list.map(x=>[x.kit+'/'+x.name,x]));
const ids=process.argv.slice(2).flatMap(a=>a.split(',')).filter(Boolean);
for(const id of ids){const m=by[id];if(!m){console.log('not in catalogue',id);continue}
  const f='kits/workfiles/'+id+'.glb';console.log(id,JSON.stringify(tone(f,f,{kind:m.kind,tags:m.tags,id})))}
