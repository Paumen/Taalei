import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { repack, fixBounds } from './mesh-edit.mjs';

const HELP = `fold-material.mjs --material <name> --to <band> <workfile.glb> [...]

Moves the faces of material <name> into the colormap primitive of the same mesh,
painted in <band> of kits/colormap.png: lightest at the top of the folded faces,
darkest at the bottom (UV 0.15 to 0.75 of the band). The material is dropped once
nothing uses it.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS = JSON.parse(readFileSync(resolve(ROOT, 'lint', 'materials.json'), 'utf8')).bands;
const TOP = 0.15;
const BOTTOM = 0.75;

function cellOf(band) {
  const cell = BANDS[band];
  if (!cell) throw new Error(`no such band: ${band}`);
  return cell.split(',').map(Number);
}

const floats = (values) => {
  const data = Float32Array.from(values);
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
};

function dropUnused(json, replaced) {
  const used = new Set();
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives) {
    if (prim.indices !== undefined) used.add(prim.indices);
    for (const a of Object.values(prim.attributes)) used.add(a);
    for (const t of prim.targets ?? []) for (const a of Object.values(t)) used.add(a);
  }
  for (const anim of json.animations ?? []) for (const s of anim.samplers) { used.add(s.input); used.add(s.output); }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) used.add(skin.inverseBindMatrices);
  const map = new Map();
  const kept = [];
  json.accessors.forEach((a, i) => { if (used.has(i)) { map.set(i, kept.length); kept.push(a); } });
  const at = (i) => map.get(i);
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives) {
    if (prim.indices !== undefined) prim.indices = at(prim.indices);
    for (const k of Object.keys(prim.attributes)) prim.attributes[k] = at(prim.attributes[k]);
    for (const t of prim.targets ?? []) for (const k of Object.keys(t)) t[k] = at(t[k]);
  }
  for (const anim of json.animations ?? []) for (const s of anim.samplers) { s.input = at(s.input); s.output = at(s.output); }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = at(skin.inverseBindMatrices);
  json.accessors = kept;
  return new Map([...replaced].filter(([i]) => map.has(i)).map(([i, b]) => [map.get(i), b]));
}

function dropMaterial(json, index) {
  const prims = (json.meshes ?? []).flatMap((m) => m.primitives);
  if (prims.some((p) => p.material === index)) return;
  json.materials.splice(index, 1);
  for (const p of prims) if (p.material > index) p.material--;
}

function fold(file, name, cell) {
  const glb = readGlb(file);
  const { json } = glb;
  const target = json.materials.findIndex((m) => m.name === name);
  if (target < 0) throw new Error(`${file}: no material ${name}`);
  const colormap = json.materials.findIndex((m) => m.name === 'colormap');
  if (colormap < 0) throw new Error(`${file}: no colormap material`);
  let replaced = new Map();
  let folded = 0;
  for (const mesh of json.meshes) {
    const from = mesh.primitives.filter((p) => p.material === target);
    if (!from.length) continue;
    const base = mesh.primitives.find((p) => p.material === colormap);
    if (!base) throw new Error(`${file}: mesh ${mesh.name} has ${name} but no colormap primitive`);
    if (base.targets || from.some((p) => p.targets)) throw new Error(`${file}: morph targets are not supported`);
    const names = Object.keys(base.attributes);
    if (!names.includes('TEXCOORD_0')) throw new Error(`${file}: colormap primitive has no UVs`);
    const columns = Object.fromEntries(names.map((n) => [n, Array.from(readAccessor(glb, base.attributes[n]).data)]));
    const indices = Array.from(readAccessor(glb, base.indices).data);
    for (const prim of from) {
      for (const n of names) if (n !== 'TEXCOORD_0' && prim.attributes[n] === undefined) throw new Error(`${file}: ${name} lacks ${n}`);
      const pos = readAccessor(glb, prim.attributes.POSITION).data;
      const count = pos.length / 3;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < count; i++) { lo = Math.min(lo, pos[i * 3 + 1]); hi = Math.max(hi, pos[i * 3 + 1]); }
      const offset = columns.POSITION.length / 3;
      for (const n of names) {
        if (n === 'TEXCOORD_0') {
          for (let i = 0; i < count; i++) {
            const t = hi > lo ? (hi - pos[i * 3 + 1]) / (hi - lo) : 0.5;
            columns[n].push((cell[0] + 0.5) / 16, (cell[1] + TOP + t * (BOTTOM - TOP)) / 4);
          }
        } else columns[n].push(...readAccessor(glb, prim.attributes[n]).data);
      }
      const own = prim.indices === undefined ? [...Array(count).keys()] : Array.from(readAccessor(glb, prim.indices).data);
      for (const v of own) indices.push(v + offset);
      folded += own.length / 3;
    }
    for (const n of names) {
      const accessor = json.accessors[base.attributes[n]];
      if (accessor.componentType !== 5126) throw new Error(`${file}: ${n} is not float`);
      accessor.count = columns.POSITION.length / 3;
      replaced.set(base.attributes[n], floats(columns[n]));
    }
    const accessor = json.accessors[base.indices];
    const big = columns.POSITION.length / 3 > 65535;
    const data = big ? Uint32Array.from(indices) : Uint16Array.from(indices);
    accessor.componentType = big ? 5125 : 5123;
    accessor.count = data.length;
    replaced.set(base.indices, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    mesh.primitives = mesh.primitives.filter((p) => p.material !== target);
  }
  replaced = dropUnused(json, replaced);
  dropMaterial(json, target);
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, json, glb.bin, writeFileSync);
  return folded;
}

const argv = process.argv.slice(2);
if (!argv.length || argv.includes('--help')) {
  console.log(HELP);
  process.exit(argv.length ? 0 : 1);
}
const options = {};
const files = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) options[argv[i].slice(2)] = argv[++i];
  else files.push(argv[i]);
}
if (!options.material || !options.to) throw new Error('--material and --to are required');
const cell = cellOf(options.to);
for (const file of files) console.log(`${file}: ${fold(file, options.material, cell)} triangles ${options.material} -> ${options.to}`);
