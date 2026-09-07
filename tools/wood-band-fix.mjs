#!/usr/bin/env node
// W1 says the tag names the band; W2 says that where a model takes several bands its own
// gradient decides which surface goes to which, lighter end to lighter band. This moves a
// model's wood onto the bands its tags name.
//   one band wanted   -> the whole gradient goes into it, centred, spacing kept
//   as many as it has  -> its groups map in order, lightest to lightest; v is untouched
//   any other count    -> reported, never guessed at
//
// --only takes a list of kit/name ids, or @path to read them one per line, and limits
// the run to those. Without it every catalogued model with a wood tag is considered,
// including ones color-lint does not flag: a model already carrying the band its tag
// names passes M42 while a second wood band sits beside it, and moving that one is a
// change to how the model looks rather than a fix. Naming the models keeps the two apart.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const SIZE = 512, CELL_W = 32, CELL_H = 128;
const WANT = { planks: 0, 'worked-planks': 1, beam: 2, logs: 3, bark: 3 };
const dry = process.argv.includes('--dry');
const onlyArg = process.argv[process.argv.indexOf('--only') + 1];
const only = process.argv.includes('--only')
  ? new Set((onlyArg.startsWith('@') ? readFileSync(onlyArg.slice(1), 'utf8').split('\n') : onlyArg.split(','))
      .map((s) => s.trim()).filter(Boolean))
  : null;
const catalog = JSON.parse(readFileSync('catalog/catalog.json', 'utf8'));

const readGlb = (p) => { const b = readFileSync(p); const cs = []; let o = 12;
  while (o + 8 <= b.length) { const len = b.readUInt32LE(o), t = b.readUInt32LE(o + 4);
    cs.push({ type: t, data: Buffer.from(b.subarray(o + 8, o + 8 + len)) }); o += 8 + len; } return cs; };
const writeGlb = (p, cs) => { const parts = [];
  for (const c of cs) { const pad = (4 - (c.data.length % 4)) % 4; const h = Buffer.alloc(8);
    h.writeUInt32LE(c.data.length + pad, 0); h.writeUInt32LE(c.type, 4);
    parts.push(h, c.data, Buffer.alloc(pad, c.type === 0x4E4F534A ? 0x20 : 0)); }
  const body = Buffer.concat(parts); const h = Buffer.alloc(12);
  h.writeUInt32LE(0x46546C67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + body.length, 8);
  writeFileSync(p, Buffer.concat([h, body])); };

let moved = 0, already = 0; const ambiguous = [];
let skipped = 0;
for (const model of catalog.models) {
  if (only && !only.has(`${model.kit}/${model.name}`)) { skipped++; continue; }
  const want = [...new Set((model.tags ?? []).map((t) => WANT[t]).filter((c) => c !== undefined))].sort();
  if (!want.length) continue;
  const path = join('kits/workfiles', model.kit, `${model.name}.glb`);
  let cs; try { cs = readGlb(path); } catch { continue; }
  const jc = cs.find((c) => c.type === 0x4E4F534A), bc = cs.find((c) => c.type === 0x004E4942);
  if (!jc || !bc) continue;
  const json = JSON.parse(jc.data.toString('utf8')); const bin = bc.data;

  const accs = new Set();
  for (const m of json.meshes ?? []) for (const pr of m.primitives ?? [])
    for (const k of Object.keys(pr.attributes ?? {})) if (k.startsWith('TEXCOORD_')) accs.add(pr.attributes[k]);
  const slots = []; let lo = Infinity, hi = -Infinity;
  for (const ai of accs) {
    const a = json.accessors[ai]; if (a.componentType !== 5126 || a.type !== 'VEC2') continue;
    const bv = json.bufferViews[a.bufferView];
    const stride = bv.byteStride || 8, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    for (let e = 0; e < a.count; e++) {
      const off = base + e * stride;
      const u = bin.readFloatLE(off), v = bin.readFloatLE(off + 4);
      const col = Math.floor(u * SIZE / CELL_W), row = Math.floor(v * SIZE / CELL_H);
      if (row !== 0 || col > 3) continue;
      const r = col + (v * SIZE) / CELL_H;
      lo = Math.min(lo, r); hi = Math.max(hi, r);
      slots.push({ off, col, v, r });
    }
  }
  if (!slots.length) continue;
  const have = [...new Set(slots.map((s) => s.col))].sort();
  if (have.length === want.length && have.every((c, i) => c === want[i])) { already++; continue; }

  const id = `${model.kit}/${model.name}`;
  if (want.length === 1) {
    const cell = want[0], span = hi - lo;
    const wanted = Math.min(span, 0.92), start = 0.5 - wanted / 2;
    for (const s of slots) {
      const t = span > 1e-9 ? (s.r - lo) / span : 0.5;
      if (!dry) { bin.writeFloatLE((cell * CELL_W + CELL_W / 2) / SIZE, s.off);
        bin.writeFloatLE(((start + t * wanted) * CELL_H) / SIZE, s.off + 4); }
    }
  } else if (have.length === want.length) {
    const map = new Map(have.map((c, i) => [c, want[i]]));
    for (const s of slots) {
      const cell = map.get(s.col);
      if (!dry) bin.writeFloatLE((cell * CELL_W + CELL_W / 2) / SIZE, s.off);
    }
  } else { ambiguous.push(`${id}  on ${have.join(',')} but tagged for ${want.join(',')}`); continue; }

  for (const ai of accs) {
    const a = json.accessors[ai]; if (!a.min || !a.max) continue;
    const bv = json.bufferViews[a.bufferView];
    const stride = bv.byteStride || 8, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const us = [], vs = [];
    for (let e = 0; e < a.count; e++) { const off = base + e * stride;
      us.push(bin.readFloatLE(off)); vs.push(bin.readFloatLE(off + 4)); }
    a.min[0] = Math.min(...us); a.min[1] = Math.min(...vs);
    a.max[0] = Math.max(...us); a.max[1] = Math.max(...vs);
  }
  if (!dry) { jc.data = Buffer.from(JSON.stringify(json), 'utf8'); writeGlb(path, cs); }
  moved++;
}
console.log(`${dry ? '[dry] ' : ''}${already} already right, ${moved} recoloured, ${ambiguous.length} ambiguous${only ? `, ${skipped} outside --only` : ''}`);
if (only) {
  const seen = new Set(catalog.models.map((m) => `${m.kit}/${m.name}`));
  for (const id of only) if (!seen.has(id)) console.log('  ? ' + id + '  not in the catalogue');
}
for (const a of ambiguous) console.log('  ? ' + a);
