import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { readGlb, writeGlb } from '../../catalog/tools/glb.mjs';
import { readPng } from '../../catalog/tools/png.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen, bronId, alleBestanden } from '../../catalog/tools/bronmodellen.mjs';

const HELP = `adopt.mjs <plan.json>

Writes a workfile in kits/workfiles/<kit> for every entry of the plan, from the
model the entry names in a source pack. Geometry, normals and triangles are the
source's, except that of two coincident triangles facing opposite ways the one
facing into the model moves along its normal by 0.2% of the longest extent, so
the two no longer fight; the pack's own colours are replaced by the bands of
kits/colormap.png.

A plan is a list of entries:

  pack       folder in kits/sources, as bronkits.mjs spells it
  src        model name in that pack, as the TBD tab spells it
  kit        kit slug under kits/workfiles
  name       workfile name, without .glb
  bands      one band per source colour cluster, in cluster order; clusters
             given the same band keep their lightness relative to each other,
             and a triangle takes the band most of its corners have
  threshold  optional: how far apart two source colours are one cluster (48)
  scale      optional: overrides the kit's own scale

Run without bands to print the clusters of every entry and stop.`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORK_DIR = join(ROOT, 'kits', 'workfiles');

const BANDS = {
  tan: [0, 0], camel: [1, 0], chestnut: [2, 0], umber: [3, 0], terracotta: [5, 0],
  amber: [6, 0], sienna: [8, 0], hunter: [1, 1], moss: [3, 1], slate: [6, 1],
  azure: [4, 2], ivory: [5, 2], basalt: [13, 3], taupe: [14, 3], nickel: [15, 3],
};

const atlas = readPng(join(ROOT, 'kits', 'colormap.png'));
const CELL_WIDTH = atlas.width / 16;
const CELL_HEIGHT = atlas.height / 4;

const lightness = ([r, g, b]) => {
  const linear = (v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const y = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y;
};

const lanes = new Map();
function lane(name) {
  if (lanes.has(name)) return lanes.get(name);
  if (!BANDS[name]) throw new Error(`no such band: ${name}`);
  const [column, row] = BANDS[name];
  const x = Math.floor((column + 0.5) * CELL_WIDTH);
  const steps = [];
  for (let k = 0; k < CELL_HEIGHT; k++) {
    const i = ((row * CELL_HEIGHT + k) * atlas.width + x) * 4;
    steps.push(lightness([atlas.pixels[i], atlas.pixels[i + 1], atlas.pixels[i + 2]]));
  }
  const found = { row, steps, u: (column + 0.5) / 16, middle: steps[CELL_HEIGHT / 2] };
  lanes.set(name, found);
  return found;
}

function bandUv(name, target) {
  const { steps, row, u } = lane(name);
  let best = 2;
  let bestDistance = Infinity;
  for (let k = 2; k <= CELL_HEIGHT - 3; k++) {
    const distance = Math.abs(steps[k] - target);
    if (distance < bestDistance) { bestDistance = distance; best = k; }
  }
  return [u, (row * CELL_HEIGHT + best + 0.5) / atlas.height];
}

const packs = new Map();
function loadPack(map) {
  if (packs.has(map)) return packs.get(map);
  const bronkit = BRONKITS.find((k) => bronId(k) === map);
  if (!bronkit) throw new Error(`no pack ${map} in bronkits.mjs`);
  const { modellen, uitgepakt } = bronModellen(bronkit);
  const loaded = { bronkit, modellen, images: alleBestanden(uitgepakt).filter((f) => /\.(png|jpe?g)$/i.test(f)) };
  packs.set(map, loaded);
  return loaded;
}

const scales = new Map();
function kitScale(kit) {
  if (scales.has(kit)) return scales.get(kit);
  const counted = new Map();
  for (const file of readdirSync(join(WORK_DIR, kit)).filter((n) => n.endsWith('.glb'))) {
    const scale = readGlb(join(WORK_DIR, kit, file)).json.asset?.extras?.taaleiland?.schaal;
    if (scale != null) counted.set(scale, (counted.get(scale) ?? 0) + 1);
  }
  const most = [...counted].sort((a, b) => b[1] - a[1])[0];
  if (!most) throw new Error(`${kit}: no workfile carries a scale`);
  scales.set(kit, most[0]);
  return most[0];
}

const pngs = new Map();
function readImage(path) {
  if (pngs.has(path)) return pngs.get(path);
  let file = path;
  if (extname(path).toLowerCase() !== '.png') {
    file = join(tmpdir(), `taalei-adopt-${createHash('sha1').update(path).digest('hex').slice(0, 12)}.png`);
    if (!existsSync(file)) execFileSync('convert', [path, file]);
  }
  const png = readPng(file);
  pngs.set(path, png);
  return png;
}

function findTexture(wanted, images) {
  if (!wanted) return null;
  if (existsSync(wanted)) return wanted;
  const name = basename(wanted).toLowerCase();
  return images.find((f) => basename(f).toLowerCase() === name) ?? (images.length === 1 ? images[0] : null);
}

function sourceColors(primitive, images) {
  const count = primitive.posities.length / 3;
  const out = new Array(count);
  const texture = findTexture(primitive.materiaal.textuur, images);
  if (texture && primitive.uvs) {
    const png = readImage(texture);
    for (let i = 0; i < count; i++) {
      const x = Math.min(Math.max(Math.floor(primitive.uvs[i * 2] * png.width), 0), png.width - 1);
      const y = Math.min(Math.max(Math.floor(primitive.uvs[i * 2 + 1] * png.height), 0), png.height - 1);
      const at = (y * png.width + x) * 4;
      out[i] = [png.pixels[at], png.pixels[at + 1], png.pixels[at + 2]];
    }
    return out;
  }
  const flat = primitive.materiaal.kleur ?? [255, 255, 255];
  for (let i = 0; i < count; i++) out[i] = flat;
  return out;
}

const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function clusters(model, images, threshold) {
  const groups = [];
  for (const primitive of model.primitieven) {
    const counted = new Map();
    for (const color of sourceColors(primitive, images)) {
      const key = color.join(',');
      const seen = counted.get(key);
      if (seen) seen.n++;
      else counted.set(key, { color, n: 1 });
    }
    const colors = [...counted.values()].sort((a, b) => b.n - a.n);
    if (!primitive.materiaal.textuur) {
      for (const one of colors) groups.push({ colors: [one], flat: true });
      continue;
    }
    const parent = colors.map((_, i) => i);
    const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        if (apart(colors[i].color, colors[j].color) > threshold) continue;
        const [a, b] = [root(i), root(j)];
        if (a !== b) parent[a] = b;
      }
    }
    const per = new Map();
    colors.forEach((one, i) => {
      const key = root(i);
      if (per.has(key)) per.get(key).push(one);
      else per.set(key, [one]);
    });
    for (const members of per.values()) groups.push({ colors: members, flat: false });
  }

  const merged = [];
  for (const group of groups) {
    const key = group.flat ? group.colors[0].color.join(',') : null;
    const same = key === null ? null : merged.find((m) => m.flat && m.colors[0].color.join(',') === key);
    if (same) same.colors[0].n += group.colors[0].n;
    else merged.push(group);
  }
  for (const group of merged) {
    group.n = group.colors.reduce((sum, one) => sum + one.n, 0);
    const total = [0, 0, 0];
    for (const one of group.colors) for (let k = 0; k < 3; k++) total[k] += one.color[k] * one.n;
    group.mean = total.map((v) => Math.round(v / group.n));
    group.lightness = group.colors.reduce((sum, one) => sum + lightness(one.color) * one.n, 0) / group.n;
  }
  return merged.sort((a, b) => b.n - a.n);
}

function hits(positions, triangles, origin, direction, self) {
  let n = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    if (t === self) continue;
    const [a, b, c] = [0, 1, 2].map((k) => positions.slice(triangles[t + k] * 3, triangles[t + k] * 3 + 3));
    const e1 = [0, 1, 2].map((k) => b[k] - a[k]);
    const e2 = [0, 1, 2].map((k) => c[k] - a[k]);
    const p = [
      direction[1] * e2[2] - direction[2] * e2[1],
      direction[2] * e2[0] - direction[0] * e2[2],
      direction[0] * e2[1] - direction[1] * e2[0],
    ];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const s = [0, 1, 2].map((k) => origin[k] - a[k]);
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (direction[0] * q[0] + direction[1] * q[1] + direction[2] * q[2]) / det;
    if (v < 0 || u + v > 1) continue;
    if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > 1e-6) n++;
  }
  return n;
}

function insetInnerTwins(positions, normals, triangles) {
  const key = (t) => [0, 1, 2]
    .map((k) => positions.slice(triangles[t + k] * 3, triangles[t + k] * 3 + 3).map((v) => Math.round(v * 1e5)).join(','))
    .sort()
    .join(' ');
  const byKey = new Map();
  for (let t = 0; t < triangles.length; t += 3) {
    const k = key(t);
    if (byKey.has(k)) byKey.get(k).push(t);
    else byKey.set(k, [t]);
  }
  const inner = [];
  for (const twins of byKey.values()) {
    if (twins.length < 2) continue;
    for (const t of twins) {
      const [a, b, c] = [0, 1, 2].map((k) => positions.slice(triangles[t + k] * 3, triangles[t + k] * 3 + 3));
      const e1 = [0, 1, 2].map((k) => b[k] - a[k]);
      const e2 = [0, 1, 2].map((k) => c[k] - a[k]);
      const face = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const area = Math.hypot(...face);
      if (!area) continue;
      const out = face.map((v) => v / area);
      const middle = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3);
      const ahead = hits(positions, triangles, middle, out, t) === 0;
      const behind = hits(positions, triangles, middle, out.map((v) => -v), t) === 0;
      if (behind && !ahead) inner.push(t);
    }
  }
  if (!inner.length) return;
  let longest = 0;
  for (let k = 0; k < 3; k++) {
    const axis = positions.filter((_, i) => i % 3 === k);
    longest = Math.max(longest, Math.max(...axis) - Math.min(...axis));
  }
  const step = longest * 0.002;
  const moved = new Set();
  for (const t of inner) {
    for (let k = 0; k < 3; k++) {
      const i = triangles[t + k];
      if (moved.has(i)) continue;
      moved.add(i);
      const n = normals.slice(i * 3, i * 3 + 3);
      const length = Math.hypot(...n) || 1;
      for (let j = 0; j < 3; j++) positions[i * 3 + j] = Math.fround(positions[i * 3 + j] + (n[j] / length) * step);
    }
  }
}

function adopt(entry) {
  const { pack, src, kit, name, bands, threshold = 48 } = entry;
  const { bronkit, modellen, images } = loadPack(pack);
  const model = modellen.find((m) => m.naam === src);
  if (!model) throw new Error(`${pack}: no model ${src}`);

  const groups = clusters(model, images, threshold);
  if (!bands) return { groups };
  if (bands.length !== groups.length) {
    throw new Error(`${kit}/${name}: ${groups.length} source colours, ${bands.length} bands given`);
  }

  const pooled = new Map();
  groups.forEach((group, i) => {
    const sum = pooled.get(bands[i]) ?? { weight: 0, n: 0 };
    sum.weight += group.lightness * group.n;
    sum.n += group.n;
    pooled.set(bands[i], sum);
  });
  const bandPerColor = new Map();
  groups.forEach((group, i) => {
    for (const one of group.colors) bandPerColor.set(one.color.join(','), bands[i]);
  });
  const middleOf = (band) => pooled.get(band).weight / pooled.get(band).n;

  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const primitive of model.primitieven) {
    for (let i = 0; i < primitive.posities.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        low[k] = Math.min(low[k], primitive.posities[i + k]);
        high[k] = Math.max(high[k], primitive.posities[i + k]);
      }
    }
  }
  const middle = [(low[0] + high[0]) / 2, low[1], (low[2] + high[2]) / 2];

  const positions = [];
  const normals = [];
  const uvs = [];
  const triangles = [];
  const known = new Map();

  for (const primitive of model.primitieven) {
    const colors = sourceColors(primitive, images);
    const vertex = (index, band) => {
      const position = [0, 1, 2].map((k) => Math.fround(primitive.posities[index * 3 + k] - middle[k]));
      const normal = primitive.normalen
        ? [0, 1, 2].map((k) => Math.fround(primitive.normalen[index * 3 + k]))
        : [0, 1, 0];
      const uv = bandUv(band, lane(band).middle + (lightness(colors[index]) - middleOf(band)));
      const key = [...position, ...normal, ...uv].join(',');
      let at = known.get(key);
      if (at === undefined) {
        at = positions.length / 3;
        known.set(key, at);
        positions.push(...position);
        normals.push(...normal);
        uvs.push(Math.fround(uv[0]), Math.fround(uv[1]));
      }
      return at;
    };

    for (let t = 0; t < primitive.indices.length; t += 3) {
      const indices = [0, 1, 2].map((k) => primitive.indices[t + k]);
      const cornerBands = indices.map((index) => bandPerColor.get(colors[index].join(',')));
      const band = cornerBands.find((one, k) => cornerBands.indexOf(one) !== k) ?? cornerBands[0];
      const corner = indices.map((index) => vertex(index, band));
      const point = corner.map((i) => positions.slice(i * 3, i * 3 + 3));
      const edge1 = [0, 1, 2].map((k) => point[1][k] - point[0][k]);
      const edge2 = [0, 1, 2].map((k) => point[2][k] - point[0][k]);
      const face = [
        edge1[1] * edge2[2] - edge1[2] * edge2[1],
        edge1[2] * edge2[0] - edge1[0] * edge2[2],
        edge1[0] * edge2[1] - edge1[1] * edge2[0],
      ];
      const faceLength = Math.hypot(...face) || 1;
      const mean = [0, 1, 2].map((k) => corner.reduce((sum, i) => sum + normals[i * 3 + k], 0) / 3);
      const meanLength = Math.hypot(...mean) || 1;
      let along = 0;
      for (let k = 0; k < 3; k++) along += (face[k] / faceLength) * (mean[k] / meanLength);
      if (along < -0.1) triangles.push(corner[0], corner[2], corner[1]);
      else triangles.push(...corner);
    }
  }

  insetInnerTwins(positions, normals, triangles);

  const count = positions.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i * 3 + k]);
      max[k] = Math.max(max[k], positions[i * 3 + k]);
    }
  }

  const parts = [];
  const accessors = [];
  const bufferViews = [];
  let length = 0;
  const add = (data, target, componentType, type, extra) => {
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const padding = (4 - (length % 4)) % 4;
    if (padding) { parts.push(Buffer.alloc(padding)); length += padding; }
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: buffer.length, target });
    parts.push(buffer);
    length += buffer.length;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType,
      count: extra.count,
      type,
      ...(extra.min ? { min: extra.min, max: extra.max } : {}),
    });
    return accessors.length - 1;
  };

  const attributes = {
    POSITION: add(Float32Array.from(positions), 34962, 5126, 'VEC3', { count, min, max }),
    NORMAL: add(Float32Array.from(normals), 34962, 5126, 'VEC3', { count }),
    TEXCOORD_0: add(Float32Array.from(uvs), 34962, 5126, 'VEC2', { count }),
  };
  const narrow = count <= 0xffff;
  const indices = add(
    narrow ? Uint16Array.from(triangles) : Uint32Array.from(triangles),
    34963,
    narrow ? 5123 : 5125,
    'SCALAR',
    { count: triangles.length },
  );

  const scale = entry.scale ?? kitScale(kit);
  const json = {
    asset: {
      generator: 'tools/import/adopt.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: 1, schaal: scale, palet: 1, bron: bronkit.naam, bronmodel: src } },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, scale: [scale, scale, scale] }],
    meshes: [{ primitives: [{ attributes, indices, material: 0 }] }],
    materials: [{
      name: 'colormap',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
      doubleSided: true,
      alphaMode: 'OPAQUE',
    }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: length }],
  };

  const dir = join(WORK_DIR, kit);
  if (!existsSync(dir)) throw new Error(`no kit folder ${kit}`);
  writeGlb(join(dir, `${name}.glb`), json, Buffer.concat(parts), writeFileSync);
  return { triangles: triangles.length / 3, wdh: max.map((v, k) => (v - min[k]) * scale) };
}

const planPath = process.argv[2];
if (!planPath) { console.log(HELP); process.exit(2); }

const hex = (color) => '#' + color.map((v) => v.toString(16).padStart(2, '0')).join('');

for (const entry of JSON.parse(readFileSync(planPath, 'utf8'))) {
  const done = adopt(entry);
  if (done.groups) {
    const total = done.groups.reduce((sum, g) => sum + g.n, 0);
    console.log(`${entry.pack}/${entry.src}`);
    done.groups.forEach((g, i) => console.log(
      `  [${i}] ${hex(g.mean)} ${(100 * g.n / total).toFixed(0)}%`,
    ));
    continue;
  }
  console.log(
    `${entry.kit}/${entry.name}`.padEnd(36)
    + `${done.triangles} tris  ${done.wdh.map((v) => v.toFixed(2)).join(' x ')}`,
  );
}
