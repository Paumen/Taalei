#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, readAccessor, meshShells } from '../../catalog/tools/glb.mjs';
import { readPng } from '../../catalog/tools/png.mjs';
import { BANDEN } from './leerbanden.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COLUMNS = 16;
const ROWS = 4;

const HELP = `bronkleur.mjs <kit>/<model> <source file> [--texture <png>]
  Reports, per shell of kits/workfiles/<kit>/<model>.glb, the colour that shell
  carried in the source pack, and the band nearest to it.

  The source file is the pack's own .gltf or .glb, unzipped out of kits/sources.
  Its texture is found beside it unless --texture names one.

  Use it when a mark says a colour is wrong: it separates an import that
  collapsed two source colours into one band from an import that is faithful and
  it is the source itself that reads badly. Those need opposite fixes.

  Shell numbers are the ones reband.mjs --list prints.`;

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(`--${name}`);
  if (at === -1) return null;
  const value = argv[at + 1];
  argv.splice(at, value === undefined || value.startsWith('--') ? 1 : 2);
  return value ?? '';
};

const textureArg = flag('texture');
const [id, sourceArg] = argv;
if (!id || !sourceArg) {
  console.log(HELP);
  process.exit(1);
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

// The band a colour reads as, by straight distance in sRGB. Close enough to say
// whether a source colour had a band at all; the bible decides which one it takes.
const atlas = readPng(join(ROOT, 'kits', 'colormap.png'));
const bandColour = new Map();
for (const [name, [column, row]] of Object.entries(BANDEN)) {
  const x = Math.floor((column + 0.5) * (atlas.width / COLUMNS));
  const y = Math.floor((row + 0.5) * (atlas.height / ROWS));
  const o = (y * atlas.width + x) * 4;
  bandColour.set(name, [atlas.pixels[o], atlas.pixels[o + 1], atlas.pixels[o + 2]]);
}
function nearestBand(rgb) {
  let best = null;
  let bestGap = Infinity;
  for (const [name, c] of bandColour) {
    const gap = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (gap < bestGap) {
      bestGap = gap;
      best = name;
    }
  }
  return { band: best, gap: Math.round(Math.sqrt(bestGap)) };
}

// A .gltf keeps its buffer and image beside it; a .glb carries the buffer inside and
// still points at the image by name. Both end up as the same {json, bin} pair.
function readSource(file) {
  const dir = dirname(file);
  if (extname(file).toLowerCase() === '.glb') {
    const glb = readGlb(file);
    return { glb, dir };
  }
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const uri = json.buffers?.[0]?.uri;
  if (!uri || uri.startsWith('data:')) throw new Error(`${file}: expected a .bin beside the .gltf`);
  return { glb: { json, bin: readFileSync(join(dir, decodeURIComponent(uri))) }, dir };
}

const { glb: source, dir: sourceDir } = readSource(resolve(sourceArg));
const texturePath = textureArg
  ? resolve(textureArg)
  : join(sourceDir, decodeURIComponent(source.json.images?.[0]?.uri ?? ''));
if (!source.json.images?.[0]?.uri && !textureArg) throw new Error(`${sourceArg}: no image, name one with --texture`);
if (!existsSync(texturePath)) throw new Error(`texture not found: ${texturePath}`);
const texture = readPng(texturePath);

// Source colour per vertex position. Positions are the join between the two files:
// the import scales by a node transform, not by baking, so the mesh coordinates
// still match. A workfile that no longer lines up reports as unmatched.
const key = (x, y, z) => [x, y, z].map((v) => Math.round(v * 10000)).join(',');
const sourceAt = new Map();
for (const mesh of source.json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    if (prim.attributes?.TEXCOORD_0 === undefined || prim.attributes?.POSITION === undefined) continue;
    const uv = readAccessor(source, prim.attributes.TEXCOORD_0);
    const pos = readAccessor(source, prim.attributes.POSITION);
    for (let i = 0; i < uv.count; i++) {
      const x = Math.min(Math.max(Math.floor(uv.data[i * 2] * texture.width), 0), texture.width - 1);
      const y = Math.min(Math.max(Math.floor(uv.data[i * 2 + 1] * texture.height), 0), texture.height - 1);
      const o = (y * texture.width + x) * 4;
      const at = key(pos.data[i * 3], pos.data[i * 3 + 1], pos.data[i * 3 + 2]);
      if (!sourceAt.has(at)) sourceAt.set(at, []);
      sourceAt.get(at).push([texture.pixels[o], texture.pixels[o + 1], texture.pixels[o + 2]]);
    }
  }
}

const work = readGlb(join(ROOT, 'kits', 'workfiles', `${id}.glb`));
const bandOfCell = new Map(Object.entries(BANDEN).map(([name, [c, r]]) => [`${c},${r}`, name]));
const prims = meshShells(work);

let at = 0;
let matched = 0;
let total = 0;
console.log(`${id} against ${sourceArg}`);
for (const prim of prims) {
  const uv = readAccessor(work, prim.uv);
  const position = prim.prim.attributes?.POSITION;
  const pos = position === undefined ? null : readAccessor(work, position);
  for (const members of prim.members) {
    at++;
    const tally = new Map();
    const bands = new Set();
    for (const i of members) {
      total++;
      const column = Math.min(Math.max(Math.floor(uv.data[i * 2] * COLUMNS), 0), COLUMNS - 1);
      const row = Math.min(Math.max(Math.floor(uv.data[i * 2 + 1] * ROWS), 0), ROWS - 1);
      bands.add(bandOfCell.get(`${column},${row}`) ?? `${column},${row}`);
      if (!pos) continue;
      const found = sourceAt.get(key(pos.data[i * 3], pos.data[i * 3 + 1], pos.data[i * 3 + 2]));
      if (!found) continue;
      matched++;
      for (const rgb of found) {
        const k = hex(...rgb);
        if (!tally.has(k)) tally.set(k, { rgb, n: 0 });
        tally.get(k).n++;
      }
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1].n - a[1].n);
    if (!ranked.length) {
      console.log(`  ${String(at).padStart(4)}  ${String(members.length).padStart(4)} vtx  ${[...bands].join(' ').padEnd(12)} no match in the source`);
      continue;
    }
    const [top, info] = ranked[0];
    const near = nearestBand(info.rgb);
    const share = Math.round((info.n / [...tally.values()].reduce((s, v) => s + v.n, 0)) * 100);
    console.log(
      `  ${String(at).padStart(4)}  ${String(members.length).padStart(4)} vtx  ${[...bands].join(' ').padEnd(12)} ` +
        `source ${top} (${share}%)  nearest ${near.band} off by ${near.gap}`,
    );
  }
}
const unmatched = total - matched;
if (unmatched) console.log(`${unmatched} of ${total} vertices had no source position; the workfile may have been edited since import`);
