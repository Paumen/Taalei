import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isMainThread, parentPort } from 'node:worker_threads';
import { readGlb, readAccessor, measureScene, thinnestPart, thickness, trianglesPerUnit, smoothShare, badNormals, toSrgb, meshParts } from './glb.mjs';
import { readPng } from './png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const COLUMNS = 16;
export const ROWS = 4;
const SMOOTH_SHARE = 0.01;

export const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;

const atlasKeys = new Map();
const atlases = new Map();

export function atlasKey(path) {
  if (!atlasKeys.has(path)) {
    atlasKeys.set(path, existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12) : null);
  }
  return atlasKeys.get(path);
}

export function readAtlas(path) {
  const key = atlasKey(path);
  if (!atlases.has(key)) atlases.set(key, { ...readPng(path), key });
  return atlases.get(key);
}

export const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

function readColors(glb, dir) {
  const { json } = glb;
  const lanes = new Set();
  const materials = new Map();
  let atlasPath = null;

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const material = json.materials?.[prim.material];
      if (!material) continue;
      const texIndex = material.pbrMetallicRoughness?.baseColorTexture?.index;

      if (texIndex === undefined) {
        const factor = material.pbrMetallicRoughness?.baseColorFactor;
        if (!factor) continue;
        materials.set(hex(...factor.slice(0, 3).map(toSrgb)), material.name ?? 'material');
        continue;
      }

      const source = json.images?.[json.textures?.[texIndex]?.source]?.uri;
      if (!source || prim.attributes?.TEXCOORD_0 === undefined) continue;
      const path = join(dir, decodeURIComponent(source));
      if (atlasPath && atlasPath !== path) throw new Error(`${dir}: more than one colormap in a single model`);
      atlasPath = path;

      const atlas = readAtlas(path);
      const cellWidth = atlas.width / COLUMNS;
      const cellHeight = atlas.height / ROWS;
      const uv = readAccessor(glb, prim.attributes.TEXCOORD_0);

      for (let i = 0; i < uv.count; i++) {
        const x = Math.min(Math.max(Math.floor(uv.data[i * 2] * atlas.width), 0), atlas.width - 1);
        const y = Math.min(Math.max(Math.floor(uv.data[i * 2 + 1] * atlas.height), 0), atlas.height - 1);
        const i4 = (y * atlas.width + x) * 4;
        if (atlas.pixels[i4] === 0 && atlas.pixels[i4 + 1] === 0 && atlas.pixels[i4 + 2] === 0) continue;
        lanes.add(`${Math.floor(x / cellWidth)},${Math.floor(y / cellHeight)}`);
      }
    }
  }

  return { atlas: atlasPath, lanes, materials };
}

function measureFile(dir, file) {
  const glb = readGlb(join(dir, file));
  const gltf = glb.json;
  const scene = measureScene(glb);
  const thinnest = thinnestPart(glb);
  const origin = gltf.asset?.extras?.taaleiland ?? {};
  const read = readColors(glb, dir);
  return {
    schaal: origin.schaal ?? 'none',
    bron: origin.bron ?? 'none',
    smooth: smoothShare(glb) >= SMOOTH_SHARE,
    atlas: read.atlas ? relative(ROOT, read.atlas).split(sep).join('/') : null,
    atlasKey: read.atlas ? atlasKey(read.atlas) : null,
    lanes: [...read.lanes],
    materials: [...read.materials],
    fields: {
      triangles: scene.triangles,
      trianglesPerUnit: trianglesPerUnit(scene.triangles, scene.wdh),
      materials: (gltf.materials ?? []).length,
      alpha: (gltf.materials ?? []).some((m) => (m.alphaMode ?? 'OPAQUE') !== 'OPAQUE'),
      pbr: (gltf.materials ?? []).some((m) =>
        (m.pbrMetallicRoughness?.roughnessFactor ?? 1) !== 1 || (m.pbrMetallicRoughness?.metallicFactor ?? 1) !== 0),
      bands: read.lanes.size,
      wdh: scene.wdh,
      calls: scene.calls,
      vertices: scene.vertices,
      isGridModular: scene.isGridModular,
      isGrounded: scene.isGrounded,
      pivotIsCenter: scene.pivotIsCenter,
      minEdgeLength: scene.minEdgeLength,
      minTube: thinnest,
      badNormals: badNormals(glb),
      thickness: thickness(glb),
      averageTriangleArea: scene.averageTriangleArea,
      strictAnglePercent: scene.strictAnglePercent,
      pieces: meshParts(glb, Infinity).length,
      ...((gltf.animations ?? []).length
        ? { animations: gltf.animations.map((a, i) => a.name ?? `animation ${i}`) }
        : {}),
    },
  };
}

if (!isMainThread) {
  parentPort.on('message', ({ dir, file }) => {
    try {
      parentPort.postMessage({ result: JSON.parse(JSON.stringify(measureFile(dir, file))) });
    } catch (e) {
      parentPort.postMessage({ error: e.message });
    }
  });
}
