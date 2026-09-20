import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANDEN } from './leerbanden.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const kits = process.argv.slice(2);
if (!kits.length) throw new Error('name the kits to prune');

const catalogus = JSON.parse(readFileSync(join(ROOT, 'catalog', 'catalog.json'), 'utf8'));
const materialen = JSON.parse(readFileSync(join(ROOT, 'lint', 'materials.json'), 'utf8'));
const pad = join(ROOT, 'catalog', 'tags.json');
const tags = JSON.parse(readFileSync(pad, 'utf8'));

const bandenVan = new Map();
const loop = (knopen) => {
  for (const knoop of knopen) {
    if (knoop.bands) bandenVan.set(knoop.id, knoop.bands);
    if (knoop.children) loop(knoop.children);
  }
};
loop(materialen.materials);

const bandVanCel = new Map(Object.entries(BANDEN).map(([naam, [k, r]]) => [`${k},${r}`, naam]));
const bandenPerModel = new Map();
for (const model of catalogus.models) {
  if (!model.spread) continue;
  bandenPerModel.set(
    `${model.kit}/${model.name}`,
    Object.keys(model.spread).map((cel) => bandVanCel.get(cel)).filter(Boolean),
  );
}

let weg = 0;
for (const tag of tags.tags) {
  if (tag.type !== 'material' || !tag.models) continue;
  const toegestaan = bandenVan.get(tag.id);
  if (!toegestaan) continue;
  if (toegestaan.includes('transparent')) continue;
  tag.models = tag.models.filter((id) => {
    if (!kits.some((kit) => id.startsWith(`${kit}/`))) return true;
    const banden = bandenPerModel.get(id);
    if (!banden) return true;
    if (banden.some((band) => toegestaan.includes(band))) return true;
    console.log(`  ${id}  drops ${tag.id} (has ${banden.join(' ')})`);
    weg++;
    return false;
  });
}

writeFileSync(pad, JSON.stringify(tags, null, 1) + '\n');
console.log(`${weg} stale material tags removed`);
