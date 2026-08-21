/**
 * Toetst kits/palet.json aan de modellen zelf.
 *
 * Draai vanuit de repo-root:  node tools/toets-palet.mjs
 *
 * Het palet zegt welke modellen welke baan van de colormap gebruiken, en de
 * catalogus filtert daarop. Maar het palet is een apart bestand: een omkleuring
 * die de UV's verzet en het palet niet bijwerkt (of andersom) laat de
 * kleurfilter naar iets wijzen wat er niet meer is. Dit script leest per model
 * de TEXCOORD_0 uit, kijkt in welke cellen die wijzen, en legt dat naast wat
 * het palet beweert.
 *
 * Meldt twee soorten verschil:
 *   - ONTBREEKT: het model gebruikt een cel waar het palet hem niet noemt;
 *   - TE VEEL:   het palet noemt hem bij een cel die hij niet gebruikt.
 *
 * Sluit af met code 1 als er iets niet klopt, zodat het als controle kan dienen.
 */

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, leesAccessor } from './glb.mjs';
import { leesPng, KOLOMMEN, RIJEN } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogus = JSON.parse(readFileSync(join(ROOT, 'kits', 'catalog.json'), 'utf8'));
const palet = JSON.parse(readFileSync(join(ROOT, 'kits', 'palet.json'), 'utf8'));

/* Per palet de atlas inlezen, en per model bijhouden welke cellen het palet hem toeschrijft. */
const atlassen = new Map();
const beweerd = new Map(); // 'kit/model' → Set('kolom,rij')
for (const p of palet.paletten) {
  if (!p.atlas) continue;
  atlassen.set(p.id, leesPng(join(ROOT, p.atlas)));
  for (const cel of p.cellen) {
    for (const bron of cel.bronnen) {
      for (const naam of bron.modellen) {
        const id = `${bron.kit}/${naam}`;
        if (!beweerd.has(id)) beweerd.set(id, new Set());
        beweerd.get(id).add(cel.cel.join(','));
      }
    }
  }
}

const paletVanKit = new Map();
for (const p of palet.paletten) {
  for (const cel of p.cellen) for (const bron of cel.bronnen) paletVanKit.set(bron.kit, p.id);
}

let mis = 0;
for (const model of catalogus.modellen) {
  const paletId = paletVanKit.get(model.kit);
  const atlas = atlassen.get(paletId);
  if (!atlas) continue;

  const celBreed = atlas.breedte / KOLOMMEN;
  const celHoog = atlas.hoogte / RIJEN;
  const glb = leesGlb(join(ROOT, model.pad));
  const gebruikt = new Set();
  for (const mesh of glb.json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.attributes?.TEXCOORD_0 === undefined) continue;
      const uv = leesAccessor(glb, prim.attributes.TEXCOORD_0);
      for (let i = 0; i < uv.count; i++) {
        const x = uv.data[i * 2] * atlas.breedte - 0.5;
        const y = uv.data[i * 2 + 1] * atlas.hoogte - 0.5;
        gebruikt.add(`${Math.floor(x / celBreed)},${Math.floor(y / celHoog)}`);
      }
    }
  }

  const zegt = beweerd.get(model.id) ?? new Set();
  const ontbreekt = [...gebruikt].filter((c) => !zegt.has(c));
  const teVeel = [...zegt].filter((c) => !gebruikt.has(c));
  if (ontbreekt.length === 0 && teVeel.length === 0) continue;

  mis++;
  console.log(model.id);
  if (ontbreekt.length) console.log(`  ontbreekt in het palet: cel ${ontbreekt.join(' / ')}`);
  if (teVeel.length) console.log(`  palet noemt hem ten onrechte bij: cel ${teVeel.join(' / ')}`);
}

console.log(`\n${catalogus.modellen.length} modellen getoetst, ${mis} met een verschil`);
if (mis > 0) process.exitCode = 1;
