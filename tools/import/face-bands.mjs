import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { readGlb, writeGlb, readAccessor } from '../../catalog/tools/glb.mjs';
import { readPng } from '../../catalog/tools/png.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen, alleBestanden } from '../../catalog/tools/bronmodellen.mjs';
import { repack, fixBounds, welder, editablePrimitives, vertexAdder, faceNormal, primitiveMatrix } from './mesh-edit.mjs';

const HELP = `face-bands.mjs [--dry] <workfile.glb> [...]

Evens out the colour of triangles that should read as one surface.

A triangle whose corners sit in different cells of kits/colormap.png takes one
of those cells: the one closest in colour to the triangle in the source model,
else the one most of its corners have. The other corners move into it, keeping
their place in the cell.

A flat face is a run of triangles sharing edges and lying in one plane. A flat
face is evened when all of these hold:
- every corner of the face is a real corner of its outline: no point inside
  it, none on a straight stretch of its rim;
- every triangle is found in the source model the workfile names, and the
  source colours of its triangles, each the mean over the triangle, are one
  colour in light or shade: in CIELAB within 30 in lightness and 15 in hue and
  saturation (a and b) of each other;
- no triangle is in the twine cell.
Its triangles then all take the cell covering most of its area, and each corner
one UV for all triangles that meet there: the mean of the corners already in
that cell, else of all of them.

Needs the source packs (Paumen/lp-sources cloned next to this repo). A
workfile with no source, or triangles not found in it, keeps those faces.
--dry reports without writing.`;

const COPLANAR = 0.9995;
const STRAIGHT = Math.cos((2 * Math.PI) / 180);
const SAME_UV = 1e-6;
const SAME_LIGHTNESS = 30;
const SAME_HUE = 15;
const TWINE = '14,2';
const SAMPLE_STEPS = 6;
const MATCH = 2e-3;

const ATLAS = readPng(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'kits', 'colormap.png'));
const atlasColour = ([u, v]) => {
  const x = Math.min(Math.max(Math.floor(u * ATLAS.width), 0), ATLAS.width - 1);
  const y = Math.min(Math.max(Math.floor(v * ATLAS.height), 0), ATLAS.height - 1);
  const at = (y * ATLAS.width + x) * 4;
  return [ATLAS.pixels[at], ATLAS.pixels[at + 1], ATLAS.pixels[at + 2]];
};

const cellOf = ([u, v]) => `${Math.floor(u * 16)},${Math.floor(v * 4)}`;
const into = ([u, v], cell) => {
  const [cu, cv] = cellOf([u, v]).split(',').map(Number);
  const [tu, tv] = cell.split(',').map(Number);
  return [u + (tu - cu) / 16, v + (tv - cv) / 4];
};
const sameUv = (a, b) => Math.abs(a[0] - b[0]) < SAME_UV && Math.abs(a[1] - b[1]) < SAME_UV;
const edgeKey = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
const linear = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const srgb = (v) => Math.round(Math.min(Math.max(v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055, 0), 1) * 255);

const packs = new Map();
function pack(naam) {
  if (packs.has(naam)) return packs.get(naam);
  const loaded = [];
  for (const bronkit of BRONKITS.filter((k) => k.naam === naam)) {
    try {
      const { modellen, uitgepakt } = bronModellen(bronkit);
      const mapPath = join(uitgepakt, 'texture-map.json');
      const rules = new Map(existsSync(mapPath)
        ? Object.entries(JSON.parse(readFileSync(mapPath, 'utf8'))).map(([file, rule]) => [basename(file), rule])
        : []);
      const images = alleBestanden(uitgepakt).filter((f) => /\.(png|jpe?g|tga)$/i.test(f));
      for (const model of modellen) loaded.push({ model, rules, images });
    } catch {
      continue;
    }
  }
  packs.set(naam, loaded);
  return loaded;
}

function findSource(json) {
  const tag = json.asset?.extras?.taaleiland;
  if (!tag?.bron || !tag?.bronmodel) return null;
  const bare = (s) => basename(String(s), extname(String(s))).toLowerCase();
  const all = pack(tag.bron);
  return all.find((s) => s.model.naam === tag.bronmodel)
    ?? all.find((s) => bare(s.model.naam) === bare(tag.bronmodel))
    ?? all.find((s) => bare(s.model.bestand) === bare(tag.bronmodel))
    ?? null;
}

const images = new Map();
function readImage(path) {
  if (images.has(path)) return images.get(path);
  let file = path;
  if (extname(path).toLowerCase() !== '.png') {
    file = join(tmpdir(), `taalei-bands-${createHash('sha1').update(path).digest('hex').slice(0, 12)}.png`);
    if (!existsSync(file)) execFileSync('convert', [path, file]);
  }
  const png = readPng(file);
  images.set(path, png);
  return png;
}

function textureOf(source, primitive) {
  const rule = source.rules.get(basename(source.model.bestand));
  const assigned = rule?.materials?.[primitive.materiaal.naam] ?? (rule?.texture ? rule : null);
  const wanted = assigned ? assigned.texture : primitive.materiaal.textuur;
  const tint = assigned?.tint && [0, 2, 4].map((k) => parseInt(assigned.tint.replace('#', '').slice(k, k + 2), 16));
  const colour = tint || primitive.materiaal.kleur || [255, 255, 255];
  if (!wanted) return { texture: null, colour };
  if (existsSync(wanted)) return { texture: wanted, colour };
  const name = basename(wanted).toLowerCase();
  const stem = basename(name, extname(name));
  const texture = source.images.find((f) => basename(f).toLowerCase() === name)
    ?? source.images.find((f) => basename(f, extname(f)).toLowerCase() === stem)
    ?? (source.images.length === 1 ? source.images[0] : null);
  return { texture, colour };
}

function sourceTriangles(source) {
  const out = [];
  for (const primitive of source.model.primitieven) {
    const { texture, colour } = textureOf(source, primitive);
    const png = texture && primitive.uvs ? readImage(texture) : null;
    const { posities: p, indices, uvs } = primitive;
    for (let t = 0; t < indices.length; t += 3) {
      const corners = [0, 1, 2].map((k) => indices[t + k]);
      const centre = [0, 1, 2].map((k) => corners.reduce((sum, i) => sum + p[i * 3 + k], 0) / 3);
      out.push({
        centre,
        shape: shape(corners.map((i) => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]])),
        colour: () => {
          const sum = [0, 0, 0];
          let n = 0;
          if (png) {
            const uv = corners.map((i) => [uvs[i * 2], uvs[i * 2 + 1]]);
            for (let i = 0; i < SAMPLE_STEPS; i++) {
              for (let j = 0; j < SAMPLE_STEPS - i; j++) {
                const a = (i + 1 / 3) / SAMPLE_STEPS;
                const b = (j + 1 / 3) / SAMPLE_STEPS;
                const c = 1 - a - b;
                const u = a * uv[0][0] + b * uv[1][0] + c * uv[2][0];
                const v = a * uv[0][1] + b * uv[1][1] + c * uv[2][1];
                const x = Math.floor((u - Math.floor(u)) * png.width) % png.width;
                const y = Math.floor((v - Math.floor(v)) * png.height) % png.height;
                const at = (y * png.width + x) * 4;
                for (let k = 0; k < 3; k++) sum[k] += linear(png.pixels[at + k]) * linear(colour[k]);
                n++;
              }
            }
          } else {
            for (const i of corners) {
              for (let k = 0; k < 3; k++) sum[k] += linear(colour[k]) * (primitive.hoekkleuren ? primitive.hoekkleuren[i * 3 + k] : 1);
              n++;
            }
          }
          return sum.map((v) => srgb(v / n));
        },
      });
    }
  }
  return out;
}

const ROTATIONS = [];
for (const axes of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) {
  for (let s = 0; s < 8; s++) ROTATIONS.push({ axes, signs: [0, 1, 2].map((k) => ((s >> k) & 1 ? -1 : 1)) });
}
const PROBES = 160;
const CANDIDATES = 40;

function shape(corners) {
  const edges = [0, 1, 2].map((k) => Math.hypot(...[0, 1, 2].map((j) => corners[(k + 1) % 3][j] - corners[k][j]))).sort((a, b) => b - a);
  return { longest: edges[0], key: edges[0] ? `${Math.round((edges[1] / edges[0]) * 50)},${Math.round((edges[2] / edges[0]) * 50)}` : null };
}

function align(ours, theirs, extent) {
  const byShape = new Map();
  theirs.forEach((s, i) => {
    if (!s.shape.key) return;
    if (!byShape.has(s.shape.key)) byShape.set(s.shape.key, []);
    byShape.get(s.shape.key).push(i);
  });
  const step = Math.max(1, Math.floor(ours.length / PROBES));
  let best = null;
  for (const r of ROTATIONS) {
    const votes = new Map();
    for (let i = 0; i < ours.length; i += step) {
      const o = ours[i];
      const list = byShape.get(o.shape.key);
      if (!list || !o.shape.longest) continue;
      const turned = r.axes.map((k, j) => o.centre[k] * r.signs[j]);
      const counted = new Set();
      for (const s of list.slice(0, CANDIDATES)) {
        const scale = theirs[s].shape.longest / o.shape.longest;
        const offset = [0, 1, 2].map((k) => theirs[s].centre[k] - scale * turned[k]);
        const key = [Math.round(Math.log(scale) * 100), ...offset.map((v) => Math.round((v / extent) * 200))].join(',');
        if (counted.has(key)) continue;
        counted.add(key);
        const vote = votes.get(key) ?? { n: 0, scale, offset };
        vote.n++;
        votes.set(key, vote);
      }
    }
    for (const vote of votes.values()) if (!best || vote.n > best.n) best = { ...vote, r };
  }
  return best;
}

function sourceColours(glb) {
  const source = findSource(glb.json);
  if (!source) return null;
  const theirs = sourceTriangles(source);
  if (!theirs.length) return null;
  const ours = [];
  for (const prim of editablePrimitives(glb.json)) {
    const m = primitiveMatrix(glb.json, prim);
    const pos = readAccessor(glb, prim.attributes.POSITION).data;
    const idx = readAccessor(glb, prim.indices).data;
    const world = (i) => [0, 1, 2].map((r) => m[r] * pos[i * 3] + m[4 + r] * pos[i * 3 + 1] + m[8 + r] * pos[i * 3 + 2] + m[12 + r]);
    for (let t = 0; t < idx.length; t += 3) {
      const corners = [0, 1, 2].map((k) => world(idx[t + k]));
      ours.push({ prim, t: t / 3, centre: [0, 1, 2].map((k) => (corners[0][k] + corners[1][k] + corners[2][k]) / 3), shape: shape(corners) });
    }
  }
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const s of theirs) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], s.centre[k]); hi[k] = Math.max(hi[k], s.centre[k]); }
  const extent = Math.max(...hi.map((v, k) => v - lo[k])) || 1;
  const fit = align(ours, theirs, extent);
  if (!fit) return null;
  const tolerance = extent * MATCH;
  const grid = new Map();
  const cell = (c) => c.map((v) => Math.floor(v / tolerance));
  theirs.forEach((s, i) => {
    const key = cell(s.centre).join(',');
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });
  const colours = new Map();
  for (const o of ours) {
    if (!colours.has(o.prim)) colours.set(o.prim, new Map());
    const turned = fit.r.axes.map((k, j) => o.centre[k] * fit.r.signs[j]);
    const c = turned.map((v, k) => fit.scale * v + fit.offset[k]);
    const [x, y, z] = cell(c);
    let found = -1;
    let nearest = tolerance;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
      for (const i of grid.get(`${x + a},${y + b},${z + d}`) ?? []) {
        if (theirs[i].shape.key !== o.shape.key) continue;
        const distance = Math.hypot(...[0, 1, 2].map((k) => theirs[i].centre[k] - c[k]));
        if (distance < nearest) { nearest = distance; found = i; }
      }
    }
    if (found >= 0) colours.get(o.prim).set(o.t, theirs[found].colour);
  }
  return colours;
}

function outlineIsCorners(region, corner, point) {
  const uses = new Map();
  for (const t of region) for (let k = 0; k < 3; k++) {
    const e = edgeKey(corner(t, k), corner(t, (k + 1) % 3));
    uses.set(e, (uses.get(e) ?? 0) + 1);
  }
  const next = new Map();
  for (const t of region) for (let k = 0; k < 3; k++) {
    const a = corner(t, k), b = corner(t, (k + 1) % 3);
    if (uses.get(edgeKey(a, b)) !== 1) continue;
    if (next.has(a)) return false;
    next.set(a, b);
  }
  const all = new Set(region.flatMap((t) => [0, 1, 2].map((k) => corner(t, k))));
  if (next.size !== all.size) return false;
  const loop = [];
  let at = next.keys().next().value;
  while (at !== undefined && loop.length <= all.size) {
    loop.push(at);
    at = next.get(at);
    if (at === loop[0]) break;
  }
  if (at !== loop[0] || loop.length !== all.size) return false;
  for (let i = 0; i < loop.length; i++) {
    const [a, b, c] = [-1, 0, 1].map((d) => point(loop[(i + d + loop.length) % loop.length]));
    const u = [0, 1, 2].map((k) => b[k] - a[k]);
    const v = [0, 1, 2].map((k) => c[k] - b[k]);
    const lu = Math.hypot(...u), lv = Math.hypot(...v);
    if (!lu || !lv) return false;
    if ((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv) > STRAIGHT) return false;
  }
  return true;
}

function lab([r, g, b]) {
  const [x, y, z] = [
    (0.4124 * linear(r) + 0.3576 * linear(g) + 0.1805 * linear(b)) / 0.95047,
    0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b),
    (0.0193 * linear(r) + 0.1192 * linear(g) + 0.9505 * linear(b)) / 1.08883,
  ].map((v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function sourceAgrees(region, colours) {
  if (!colours) return false;
  const seen = [];
  for (const t of region) {
    const colour = colours.get(t);
    if (!colour) return false;
    seen.push(lab(colour()));
  }
  for (let i = 0; i < seen.length; i++) {
    for (let j = i + 1; j < seen.length; j++) {
      if (Math.abs(seen[i][0] - seen[j][0]) > SAME_LIGHTNESS) return false;
      if (Math.hypot(seen[i][1] - seen[j][1], seen[i][2] - seen[j][2]) > SAME_HUE) return false;
    }
  }
  return true;
}

function evenPrimitive(glb, prim, replaced, colours) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const base = pos.length / 3;
  const source = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
  const uvs = Array.from({ length: base }, (_, i) => [source[i * 2], source[i * 2 + 1]]);
  const origin = Array.from({ length: base }, (_, i) => i);
  const idx = Array.from(readAccessor(glb, prim.indices).data);
  const { weld } = welder(pos);
  const welded = Array.from({ length: base }, (_, i) => weld(i));
  const at = (v) => welded[origin[v]];
  const point = new Map();
  welded.forEach((w, i) => { if (!point.has(w)) point.set(w, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]); });

  const made = new Map();
  const withUv = (v, uv) => {
    if (sameUv(uvs[v], uv)) return v;
    const key = `${origin[v]}|${uv[0]}|${uv[1]}`;
    if (!made.has(key)) {
      made.set(key, uvs.length);
      uvs.push(uv);
      origin.push(origin[v]);
    }
    return made.get(key);
  };
  const cellOfTriangle = (t) => {
    const cells = [0, 1, 2].map((k) => cellOf(uvs[idx[t * 3 + k]]));
    return cells.find((c, k) => cells.indexOf(c) !== k) ?? cells[0];
  };

  const count = idx.length / 3;
  let mixed = 0;
  for (let t = 0; t < count; t++) {
    const cells = new Set([0, 1, 2].map((k) => cellOf(uvs[idx[t * 3 + k]])));
    if (cells.size < 2) continue;
    mixed++;
    let cell = cellOfTriangle(t);
    const colour = colours?.get(t);
    if (colour) {
      const want = lab(colour());
      const corners = [0, 1, 2].map((k) => uvs[idx[t * 3 + k]]);
      const off = (c) => {
        const got = corners.map((uv) => lab(atlasColour(into(uv, c))));
        const mean = [0, 1, 2].map((k) => got.reduce((sum, g) => sum + g[k], 0) / 3);
        return Math.hypot(...[0, 1, 2].map((k) => mean[k] - want[k]));
      };
      cell = [...cells].sort((a, b) => off(a) - off(b))[0];
    }
    for (let k = 0; k < 3; k++) idx[t * 3 + k] = withUv(idx[t * 3 + k], into(uvs[idx[t * 3 + k]], cell));
  }

  const normal = [];
  const area = [];
  for (let t = 0; t < count; t++) {
    const n = faceNormal(pos, origin[idx[t * 3]], origin[idx[t * 3 + 1]], origin[idx[t * 3 + 2]]);
    const length = Math.hypot(...n);
    area.push(length / 2);
    normal.push(length ? n.map((x) => x / length) : null);
  }
  const corner = (t, k) => at(idx[t * 3 + k]);
  const edges = new Map();
  for (let t = 0; t < count; t++) for (let k = 0; k < 3; k++) {
    const e = edgeKey(corner(t, k), corner(t, (k + 1) % 3));
    if (!edges.has(e)) edges.set(e, []);
    edges.get(e).push(t);
  }

  let evened = 0;
  let kept = 0;
  const seen = new Uint8Array(count);
  for (let s = 0; s < count; s++) {
    if (seen[s] || !normal[s]) continue;
    const region = [s];
    seen[s] = 1;
    for (let i = 0; i < region.length; i++) {
      const t = region[i];
      for (let k = 0; k < 3; k++) {
        const sharing = edges.get(edgeKey(corner(t, k), corner(t, (k + 1) % 3)));
        if (sharing.length !== 2) continue;
        for (const o of sharing) {
          if (seen[o] || !normal[o]) continue;
          if (normal[t][0] * normal[o][0] + normal[t][1] * normal[o][1] + normal[t][2] * normal[o][2] < COPLANAR) continue;
          seen[o] = 1;
          region.push(o);
        }
      }
    }
    if (region.length < 2) continue;

    const byPoint = new Map();
    for (const t of region) for (let k = 0; k < 3; k++) {
      const w = corner(t, k);
      if (!byPoint.has(w)) byPoint.set(w, []);
      byPoint.get(w).push({ t, uv: uvs[idx[t * 3 + k]] });
    }
    if (![...byPoint.values()].some((list) => list.some((c) => !sameUv(c.uv, list[0].uv)))) continue;
    if (region.some((t) => cellOfTriangle(t) === TWINE)
      || !outlineIsCorners(region, corner, (w) => point.get(w))
      || !sourceAgrees(region, colours)) { kept++; continue; }

    const weight = new Map();
    for (const t of region) weight.set(cellOfTriangle(t), (weight.get(cellOfTriangle(t)) ?? 0) + area[t]);
    const cell = [...weight].sort((a, b) => b[1] - a[1])[0][0];
    const target = new Map();
    for (const [w, list] of byPoint) {
      const own = list.filter((c) => cellOfTriangle(c.t) === cell);
      const use = own.length ? own : list;
      target.set(w, [0, 1].map((k) => Math.fround(use.reduce((sum, c) => sum + into(c.uv, cell)[k], 0) / use.length)));
    }
    for (const t of region) for (let k = 0; k < 3; k++) idx[t * 3 + k] = withUv(idx[t * 3 + k], target.get(corner(t, k)));
    evened++;
  }

  if (uvs.length > base) {
    const adder = vertexAdder(glb, prim);
    for (let v = base; v < uvs.length; v++) adder.add(origin[v], { TEXCOORD_0: uvs[v] });
    adder.commit(idx, replaced);
  }
  return { mixed, evened, kept };
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(HELP); process.exit(args.length ? 0 : 1); }
const dry = args.includes('--dry');
const files = args.filter((a) => !a.startsWith('--'));

let changed = 0;
for (const file of files) {
  const glb = readGlb(file);
  const replaced = new Map();
  const total = { mixed: 0, evened: 0, kept: 0 };
  const colours = sourceColours(glb);
  for (const prim of editablePrimitives(glb.json)) {
    const uv = glb.json.accessors[prim.attributes.TEXCOORD_0];
    if (!uv || uv.componentType !== 5126 || uv.type !== 'VEC2') continue;
    const r = evenPrimitive(glb, prim, replaced, colours?.get(prim));
    for (const k of Object.keys(total)) total[k] += r[k];
  }
  const note = colours ? '' : ', no source';
  if (!total.mixed && !total.evened) {
    if (total.kept) console.log(`${file}: ${total.kept} faces kept${note}`);
    continue;
  }
  changed++;
  console.log(`${file}: ${total.mixed} mixed triangles, ${total.evened} faces evened, ${total.kept} faces kept${note}`);
  if (dry) continue;
  repack(glb, replaced);
  fixBounds(glb);
  writeGlb(file, glb.json, glb.bin, writeFileSync);
}
console.log(`${changed} of ${files.length} files ${dry ? 'would change' : 'changed'}`);
