#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, worldMatrices } from '../catalog/tools/glb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFILES = path.join(ROOT, 'kits/workfiles');
const SIDES = {
  north: { normal: [0, 0, -1], rot: 0 },
  east: { normal: [1, 0, 0], rot: -90 },
  south: { normal: [0, 0, 1], rot: 180 },
  west: { normal: [-1, 0, 0], rot: 90 },
};
const CORNERS = [['north', 'east'], ['south', 'east'], ['south', 'west'], ['north', 'west']];

const layoutPath = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(layoutPath)) {
  console.error('usage: node scenes/build.mjs <scene>/layout.json');
  process.exit(2);
}
const sceneDir = path.dirname(layoutPath);
const sceneName = path.basename(sceneDir);
const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));

const out = {
  asset: { version: '2.0', generator: 'taalei scenes/build.mjs' },
  scene: 0,
  scenes: [{ name: sceneName, nodes: [] }],
  nodes: [], meshes: [], accessors: [], bufferViews: [],
  materials: [], textures: [], images: [], samplers: [],
  buffers: [{ byteLength: 0 }],
};
const chunks = [];
let binLength = 0;
const extensions = new Set();
const keyed = { materials: new Map(), textures: new Map(), images: new Map(), samplers: new Map() };
const models = new Map();

function addBytes(bytes) {
  const pad = (4 - (binLength % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); binLength += pad; }
  const offset = binLength;
  chunks.push(bytes);
  binLength += bytes.length;
  return offset;
}

function dedupe(kind, value) {
  const key = JSON.stringify(value);
  if (!keyed[kind].has(key)) {
    keyed[kind].set(key, out[kind].length);
    out[kind].push(value);
  }
  return keyed[kind].get(key);
}

function remapMaterial(material, textureMap) {
  const copy = structuredClone(material);
  const pbr = copy.pbrMetallicRoughness ?? {};
  for (const info of [pbr.baseColorTexture, pbr.metallicRoughnessTexture, copy.normalTexture, copy.occlusionTexture, copy.emissiveTexture]) {
    if (info) info.index = textureMap[info.index];
  }
  return copy;
}

function boundsOf(json) {
  const world = worldMatrices(json);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  json.nodes.forEach((node, i) => {
    if (node.mesh === undefined) return;
    const m = world[i];
    for (const prim of json.meshes[node.mesh].primitives) {
      const a = json.accessors[prim.attributes.POSITION];
      for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) for (const z of [a.min[2], a.max[2]]) {
        const p = [
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        ];
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
      }
    }
  });
  return { min, max };
}

function loadModel(id) {
  if (models.has(id)) return models.get(id);
  const file = path.join(WORKFILES, id + '.glb');
  if (!fs.existsSync(file)) throw new Error('no workfile: ' + id);
  const glb = readGlb(file);
  const { json, bin } = glb;
  for (const k of ['animations', 'skins', 'cameras']) {
    if (json[k]?.length) throw new Error(`${id}: ${k} are not supported in a scene`);
  }
  for (const e of json.extensionsUsed ?? []) extensions.add(e);

  const viewMap = (json.bufferViews ?? []).map((view) => {
    const start = view.byteOffset ?? 0;
    const copy = { ...view, buffer: 0, byteOffset: addBytes(bin.subarray(start, start + view.byteLength)) };
    out.bufferViews.push(copy);
    return out.bufferViews.length - 1;
  });
  const accessorMap = (json.accessors ?? []).map((accessor) => {
    if (accessor.sparse) throw new Error(`${id}: sparse accessors are not supported`);
    out.accessors.push({ ...accessor, bufferView: viewMap[accessor.bufferView] });
    return out.accessors.length - 1;
  });

  const samplerMap = (json.samplers ?? []).map((s) => dedupe('samplers', s));
  const imageMap = (json.images ?? []).map((image) => {
    let bytes;
    let mimeType = image.mimeType;
    if (image.uri) {
      bytes = fs.readFileSync(path.join(path.dirname(file), decodeURIComponent(image.uri)));
      mimeType ??= image.uri.endsWith('.jpg') || image.uri.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    } else {
      const view = json.bufferViews[image.bufferView];
      const start = view.byteOffset ?? 0;
      bytes = bin.subarray(start, start + view.byteLength);
    }
    const hash = crypto.createHash('sha1').update(bytes).digest('hex');
    if (!keyed.images.has(hash)) {
      out.bufferViews.push({ buffer: 0, byteOffset: addBytes(bytes), byteLength: bytes.length });
      keyed.images.set(hash, out.images.length);
      out.images.push({ name: image.name ?? 'colormap', mimeType, bufferView: out.bufferViews.length - 1 });
    }
    return keyed.images.get(hash);
  });
  const textureMap = (json.textures ?? []).map(({ name, ...t }) => dedupe('textures', {
    ...t,
    ...(t.sampler !== undefined && { sampler: samplerMap[t.sampler] }),
    ...(t.source !== undefined && { source: imageMap[t.source] }),
  }));
  const materialMap = (json.materials ?? []).map((m) => dedupe('materials', remapMaterial(m, textureMap)));

  const meshMap = (json.meshes ?? []).map((mesh) => {
    out.meshes.push({
      ...mesh,
      primitives: mesh.primitives.map((p) => {
        const attributes = {};
        for (const [k, v] of Object.entries(p.attributes)) attributes[k] = accessorMap[v];
        for (const a of Object.values(attributes)) out.bufferViews[out.accessors[a].bufferView].target ??= 34962;
        if (p.indices !== undefined) out.bufferViews[out.accessors[accessorMap[p.indices]].bufferView].target ??= 34963;
        return {
          ...p,
          attributes,
          ...(p.indices !== undefined && { indices: accessorMap[p.indices] }),
          ...(p.material !== undefined && { material: materialMap[p.material] }),
          ...(p.targets && { targets: p.targets.map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, accessorMap[v]]))) }),
        };
      }),
    });
    return out.meshes.length - 1;
  });

  const model = { id, json, meshMap, roots: json.scenes[json.scene ?? 0].nodes, bounds: boundsOf(json) };
  models.set(id, model);
  return model;
}

function cloneNode(model, index) {
  const node = model.json.nodes[index];
  const copy = { ...node };
  if (node.mesh !== undefined) copy.mesh = model.meshMap[node.mesh];
  if (node.children) copy.children = node.children.map((c) => cloneNode(model, c));
  out.nodes.push(copy);
  return out.nodes.length - 1;
}

function addGroup(name, children = [], extras) {
  out.nodes.push({ name, children, ...(extras && { extras }) });
  return out.nodes.length - 1;
}

const yQuat = (deg) => {
  const r = (deg * Math.PI) / 360;
  return [0, Math.sin(r), 0, Math.cos(r)];
};
const round = (v) => Math.round(v * 1e5) / 1e5;

function place(id, { at = [0, 0], y = 0, rot = 0, scale = 1 }, name) {
  const model = loadModel(id);
  const children = model.roots.map((r) => cloneNode(model, r));
  const node = { name: name ?? path.basename(id), children, extras: { model: id } };
  if (at[0] || y || at[1]) node.translation = [round(at[0]), round(y), round(at[1])];
  if (rot % 360) node.rotation = yQuat(rot).map(round);
  if (scale !== 1) node.scale = [scale, scale, scale];
  out.nodes.push(node);
  const index = out.nodes.length - 1;

  const c = Math.cos((rot * Math.PI) / 180);
  const s = Math.sin((rot * Math.PI) / 180);
  const { min, max } = model.bounds;
  const xs = [];
  const zs = [];
  for (const x of [min[0], max[0]]) for (const z of [min[2], max[2]]) {
    xs.push(at[0] + scale * (c * x + s * z));
    zs.push(at[1] + scale * (-s * x + c * z));
  }
  const box = {
    min: [Math.min(...xs), y + scale * min[1], Math.min(...zs)],
    max: [Math.max(...xs), y + scale * max[1], Math.max(...zs)],
  };
  return { index, box };
}

const room = layout.room;
const { parts: floorParts, rows } = room.floor;
const floorModels = Object.values(floorParts).map(loadModel);
const tile = floorModels[0].bounds.max[0] - floorModels[0].bounds.min[0];
for (const model of floorModels) {
  const { min, max } = model.bounds;
  if (Math.abs(max[0] - min[0] - tile) > 0.01 || Math.abs(max[2] - min[2] - tile) > 0.01) {
    throw new Error(`floor part ${model.id} is not a ${tile.toFixed(3)} tile`);
  }
}
const tilesX = rows[0].length;
const tilesZ = rows.length;
if (rows.some((row) => row.length !== tilesX)) throw new Error('floor rows differ in length');
const sizeX = tilesX * tile;
const sizeZ = tilesZ * tile;
const floorTop = Math.max(...floorModels.map((m) => m.bounds.max[1]));

const floorTiles = [];
rows.forEach((row, j) => [...row].forEach((key, i) => {
  if (!floorParts[key]) throw new Error(`floor: no part for "${key}"`);
  const at = [-sizeX / 2 + tile / 2 + i * tile, -sizeZ / 2 + tile / 2 + j * tile];
  floorTiles.push(place(floorParts[key], { at }, `floor-${i}-${j}`).index);
}));
const roomChildren = [addGroup('floor', floorTiles)];

const wall = room.walls;
const wallModel = loadModel(wall.parts.w);
const wallScale = wall.scale ?? 1;
const segment = (wallModel.bounds.max[0] - wallModel.bounds.min[0]) * wallScale;
const front = wallModel.bounds.max[2] * wallScale;
const depth = (wallModel.bounds.max[2] - wallModel.bounds.min[2]) * wallScale;
const wallGroups = {};
for (const [side, { normal, rot }] of Object.entries(SIDES)) {
  const pattern = wall[side];
  if (!pattern) continue;
  const length = normal[0] ? sizeZ : sizeX;
  if (Math.abs(pattern.length * segment - length) > 0.01) {
    throw new Error(`${side} wall: ${pattern.length} segments of ${segment.toFixed(3)} do not span ${length.toFixed(3)}`);
  }
  const half = (normal[0] ? sizeX : sizeZ) / 2 + front;
  const tangent = [-normal[2], 0, normal[0]];
  const parts = [...pattern].map((key, k) => {
    const id = wall.parts[key];
    if (!id) throw new Error(`${side} wall: no part for "${key}"`);
    const along = -length / 2 + segment / 2 + k * segment;
    const at = [normal[0] * half + tangent[0] * along, normal[2] * half + tangent[2] * along];
    return place(id, { at, rot, scale: wallScale }, `${side}-${k}`).index;
  });
  roomChildren.push(addGroup('wall-' + side, parts, { normal, distance: half - front }));
  wallGroups[side] = roomChildren[roomChildren.length - 1];
}
if (wall.corner) {
  for (const [a, b] of CORNERS) {
    if (!wall[a] || !wall[b]) continue;
    const n = [SIDES[a].normal[0] + SIDES[b].normal[0], SIDES[a].normal[2] + SIDES[b].normal[2]];
    const at = [n[0] * (sizeX / 2 + depth / 2), n[1] * (sizeZ / 2 + depth / 2)];
    const { index } = place(wall.corner, { at, scale: wallScale }, `${a}-${b}`);
    roomChildren.push(addGroup(`corner-${a}-${b}`, [index], { walls: [a, b] }));
  }
}

const boxes = [];
const zoneNodes = Object.entries(layout.zones).map(([zone, items]) => {
  const nodes = [];
  for (const item of items) {
    const placed = place(item.m, { ...item, y: floorTop + (item.y ?? 0) });
    boxes.push({ label: `${zone}: ${item.m}@${item.at}`, box: placed.box });
    if (item.wall === undefined) nodes.push(placed.index);
    else if (wallGroups[item.wall] === undefined) throw new Error(`${zone}: ${item.m} hangs on missing wall "${item.wall}"`);
    else out.nodes[wallGroups[item.wall]].children.push(placed.index);
  }
  return addGroup(zone, nodes);
});

out.scenes[0].nodes.push(addGroup(sceneName, [addGroup('room', roomChildren), addGroup('zones', zoneNodes)]));
out.buffers[0].byteLength = binLength;
if (extensions.size) out.extensionsUsed = [...extensions].sort();
for (const k of ['textures', 'images', 'samplers', 'materials']) if (!out[k].length) delete out[k];

const target = path.join(sceneDir, sceneName + '.glb');
writeGlb(target, out, Buffer.concat(chunks), fs.writeFileSync);

const gap = 0.005;
const findings = [];
for (const { label, box } of boxes) {
  if (box.min[0] < -sizeX / 2 - gap || box.max[0] > sizeX / 2 + gap || box.min[2] < -sizeZ / 2 - gap || box.max[2] > sizeZ / 2 + gap) {
    findings.push('outside room: ' + label);
  }
}
for (let i = 0; i < boxes.length; i++) {
  for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].box;
    const b = boxes[j].box;
    if ([0, 1, 2].every((k) => a.min[k] < b.max[k] - gap && b.min[k] < a.max[k] - gap)) {
      findings.push(`overlap: ${boxes[i].label} × ${boxes[j].label}`);
    }
  }
}
const bytes = fs.statSync(target).size;
console.log(`${path.relative(ROOT, target)}: ${boxes.length} items, ${models.size} models, ${out.nodes.length} nodes, ${(bytes / 1024).toFixed(0)} KB`);
for (const f of findings) console.log('  ' + f);
