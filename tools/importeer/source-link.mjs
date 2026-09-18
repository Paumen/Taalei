import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor, measureScene } from '../../catalog/tools/glb.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen, meet, kebab } from '../../catalog/tools/bronmodellen.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORK_DIR = join(ROOT, 'kits', 'workfiles');
const GRID = 1e-3;
const REACH = 2e-3;
const EXTENSION = /\.(gltf|glb|obj|fbx)$/i;

const reportOnly = process.argv.includes('--report');
const kitFilter = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function workPoints(glb) {
  const out = [];
  for (const mesh of glb.json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.attributes?.POSITION === undefined) continue;
      const { data } = readAccessor(glb, prim.attributes.POSITION);
      for (let i = 0; i < data.length; i += 3) out.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return out;
}

const sourcePoints = (model) => {
  const out = [];
  for (const prim of model.primitieven) {
    for (let i = 0; i < prim.posities.length; i += 3) {
      out.push([prim.posities[i], prim.posities[i + 1], prim.posities[i + 2]]);
    }
  }
  return out;
};

// Points put on their own bounding box, so the pack's scale factor, the pivot and
// the vertex splitting that flat shading introduces all drop out of the comparison.
function shape(points) {
  if (points.length === 0) return null;
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < low[k]) low[k] = p[k];
      if (p[k] > high[k]) high[k] = p[k];
    }
  }
  const span = Math.max(...[0, 1, 2].map((k) => high[k] - low[k]));
  if (span <= 1e-9) return null;
  const kept = new Map();
  for (const p of points) {
    const row = [0, 1, 2].map((k) => (p[k] - low[k]) / span);
    kept.set(row.map((v) => Math.round(v / GRID)).join(','), row);
  }
  return [...kept.values()];
}

// How far the work model's furthest point sits from the nearest source point.
function reach(from, to) {
  if (!from || !to) return Infinity;
  let worst = 0;
  for (const p of from) {
    let nearest = Infinity;
    for (const q of to) {
      const d = Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]));
      if (d < nearest) nearest = d;
      if (nearest <= REACH) break;
    }
    if (nearest > worst) worst = nearest;
    if (worst > REACH) return worst;
  }
  return worst;
}

const counts = { kept: 0, extension: 0, name: 0, geometry: 0, 'name+geometry': 0, ambiguous: 0, unmatched: 0 };
const open = [];

for (const bronkit of BRONKITS) {
  if (!bronkit.kit) continue;
  if (kitFilter.length && !kitFilter.includes(bronkit.kit)) continue;
  const dir = join(WORK_DIR, bronkit.kit);
  if (!existsSync(dir)) continue;

  let models;
  try {
    models = bronModellen(bronkit).modellen.map((model) => ({ model, ...meet(model.primitieven) }));
  } catch (error) {
    console.log(`${bronkit.kit.padEnd(17)} sources unreadable: ${error.message}`);
    continue;
  }
  const byName = new Map();
  for (const item of models) {
    byName.set(item.model.naam, item);
    if (!byName.has(kebab(item.model.naam))) byName.set(kebab(item.model.naam), item);
  }
  const byTriangles = new Map();
  for (const item of models) {
    const same = byTriangles.get(item.driehoeken);
    if (same) same.push(item);
    else byTriangles.set(item.driehoeken, [item]);
  }

  const kit = { kept: 0, extension: 0, name: 0, geometry: 0, 'name+geometry': 0, ambiguous: 0, unmatched: 0 };
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.glb')) continue;
    const path = join(dir, file);
    const name = basename(file, '.glb');
    const glb = readGlb(path);
    const extras = glb.json.asset?.extras?.taaleiland ?? {};

    if (extras.bronmodel && byName.has(extras.bronmodel)) {
      kit.kept++;
      continue;
    }

    let found = null;
    let how = null;
    if (extras.bronmodel) {
      const stripped = extras.bronmodel.replace(EXTENSION, '');
      if (byName.has(stripped)) {
        found = byName.get(stripped);
        how = 'extension';
      }
    }

    if (!found) {
      const measured = measureScene(glb);
      const named = byName.get(name) ?? byName.get(kebab(name)) ?? null;
      const alike = (byTriangles.get(measured.triangles) ?? [])
        .filter((item) => reach(shape(workPoints(glb)), shape(sourcePoints(item.model))) <= REACH);

      if (alike.length === 1) {
        found = alike[0];
        how = named && named.model.naam === found.model.naam ? 'name+geometry' : 'geometry';
      } else if (alike.length > 1 && named && alike.some((item) => item.model.naam === named.model.naam)) {
        found = named;
        how = 'name+geometry';
      } else if (alike.length > 1) {
        kit.ambiguous++;
        open.push(`${bronkit.kit}/${name}: ${alike.length} source models with the same shape`);
        continue;
      } else if (named) {
        found = named;
        how = 'name';
      }
    }

    if (!found) {
      kit.unmatched++;
      open.push(`${bronkit.kit}/${name}: no source model matched`);
      continue;
    }

    kit[how]++;
    glb.json.asset ??= {};
    glb.json.asset.extras ??= {};
    glb.json.asset.extras.taaleiland ??= {};
    glb.json.asset.extras.taaleiland.bronmodel = found.model.naam;
    if (!reportOnly) writeGlb(path, glb.json, glb.bin, writeFileSync);
  }

  for (const key of Object.keys(kit)) counts[key] += kit[key];
  const written = kit.extension + kit.name + kit.geometry + kit['name+geometry'];
  if (written + kit.ambiguous + kit.unmatched === 0) continue;
  console.log(
    `${bronkit.kit.padEnd(17)} ${String(written).padStart(4)} linked`
      + ` (extension ${kit.extension}, name ${kit.name}, geometry ${kit.geometry}, both ${kit['name+geometry']})`
      + `  ${kit.ambiguous} ambiguous  ${kit.unmatched} unmatched`,
  );
}

console.log(
  `\n${counts.extension + counts.name + counts.geometry + counts['name+geometry']} files `
    + `${reportOnly ? 'would get' : 'got'} a source model: ${counts.extension} by dropping a file extension, `
    + `${counts['name+geometry']} by name and shape, ${counts.geometry} by shape alone, ${counts.name} by name alone`,
);
console.log(`${counts.kept} already linked, ${counts.ambiguous} ambiguous, ${counts.unmatched} unmatched`);
if (open.length) {
  console.log('');
  for (const line of open) console.log(`  ${line}`);
}
