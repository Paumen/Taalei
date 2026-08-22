/**
 * Zet één kleur van een model om naar een andere kleur die al in de gedeelde
 * colormap staat.
 *
 * Draai vanuit de repo-root:
 *
 *     node tools/hermap-kleur.mjs <van-hex> <naar-hex> <model.glb...>
 *     node tools/hermap-kleur.mjs '#228b22' '#6d8d33' kits/modulair-terrein/hilly-prop-grass-clump-a.glb
 *
 * Beide kleuren moeten in de colormap staan waar het model naar wijst. Welke
 * sheet dat is staat in het model zelf: de meeste kits delen kits/colormap.png,
 * de grot heeft een eigen sheet.
 *
 * De atlas verandert niet en de geometrie ook niet: alleen de TEXCOORD_0 van de
 * hoekpunten die de ene baan aanwezen gaat naar de andere. Elke baan is 32 × 128
 * pixels waarin de hoogte een gebakken schaduwverloop draagt.
 *
 * Een hoekpunt houdt zijn plek in dat verloop, gemeten vanaf de rij die je
 * noemt. Vraag je om #fbf02d → #ffb349, dan krijg je #ffb349 en niet de
 * donkerste rij van die baan, ook al stond #fbf02d toevallig onderaan de zijne.
 * Wie schaduw had houdt schaduw: een hoekpunt dat twintig rijen boven de
 * genoemde kleur zat, zit dat in de nieuwe baan weer.
 *
 * Draai daarna tools/build-catalog.mjs: die leest de kleuren uit de modellen.
 *
 * Nogmaals draaien met dezelfde argumenten is een lege operatie: de hoekpunten
 * wijzen dan al naar de doelbaan.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb } from './glb.mjs';
import { leesPng, KOLOMMEN, RIJEN, zoekBaan } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const [vanHex, naarHexArg, ...modellen] = process.argv.slice(2);
if (!vanHex || !naarHexArg || modellen.length === 0) {
  console.error('gebruik: node tools/hermap-kleur.mjs <van-hex> <naar-hex> <model.glb...>');
  process.exit(1);
}

/* Welke atlas? Die waar het model zelf naar wijst. Alle opgegeven modellen
 * moeten dezelfde sheet gebruiken, anders betekent dezelfde hex twee dingen.
 *
 * Op inhoud vergelijken en niet op pad: elke kit draagt zijn eigen kopie van
 * kits/colormap.png omdat de .glb er met een relatief pad naar wijst, dus drie
 * modellen uit drie kits noemen drie bestanden en dezelfde sheet. */
const atlasPaden = modellen.map((pad) => {
  const volledig = resolve(ROOT, pad);
  const { json } = leesGlb(volledig);
  const uri = json.images?.[0]?.uri;
  if (!uri) throw new Error(`${pad} heeft geen colormap; hier valt niets te hermappen`);
  return join(dirname(volledig), uri);
});
const sheets = new Map(); // inhoud → eerste pad
for (const pad of atlasPaden) {
  const sleutel = createHash('sha256').update(readFileSync(pad)).digest('hex');
  if (!sheets.has(sleutel)) sheets.set(sleutel, pad);
}
if (sheets.size > 1) {
  throw new Error(
    `de modellen wijzen naar ${sheets.size} verschillende colormaps ` +
    `(${[...sheets.values()].map((p) => p.slice(ROOT.length + 1)).join(', ')}); ` +
    'doe ze per sheet in een eigen aanroep',
  );
}

const atlas = leesPng([...sheets.values()][0]);
const CEL_BREED = atlas.breedte / KOLOMMEN;
const CEL_HOOG = atlas.hoogte / RIJEN;

const waar = [...sheets.values()][0].slice(ROOT.length + 1);
const van = zoekBaan(atlas, vanHex, waar);
const naar = zoekBaan(atlas, naarHexArg, waar);

/* -- UV's verzetten -------------------------------------------------------- */

const { kolom: vanKolom, rij: vanRij, inBaan: vanNaamRij } = van;
const { kolom: naarKolom, rij: naarRij, inBaan: naarNaamRij } = naar;
const naarX = Math.floor(naarKolom * CEL_BREED + CEL_BREED / 2);

/** In welke cel wijst deze UV, en op welke pixelrij binnen die baan? */
function plaats(u, v) {
  const x = u * atlas.breedte - 0.5;
  const y = v * atlas.hoogte - 0.5;
  return {
    kolom: Math.floor(x / CEL_BREED),
    rij: Math.floor(y / CEL_HOOG),
    inBaan: Math.round(y) - Math.floor(y / CEL_HOOG) * CEL_HOOG,
  };
}

let hoekpunten = 0;
let verschoven = 0;

for (const pad of modellen) {
  const volledig = resolve(ROOT, pad);
  const glb = leesGlb(volledig);
  const { json, bin } = glb;
  const teVerzetten = [];

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const index = prim.attributes?.TEXCOORD_0;
      if (index === undefined) continue;

      const accessor = json.accessors[index];
      if (accessor.componentType !== 5126) {
        throw new Error(`${pad}: TEXCOORD_0 is geen float32`);
      }
      const view = json.bufferViews[accessor.bufferView];
      const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const stap = view.byteStride ?? 8;

      /* Eerst kijken welke rijen dit model raakt, dan pas schrijven: de
       * verschuiving hieronder geldt voor het model als geheel. */
      for (let i = 0; i < accessor.count; i++) {
        const p = bin.byteOffset + start + i * stap;
        const u = new Float32Array(bin.buffer, p, 2);
        const waar = plaats(u[0], u[1]);
        if (waar.kolom !== vanKolom || waar.rij !== vanRij) continue;
        teVerzetten.push({ u, doel: naarNaamRij + (waar.inBaan - vanNaamRij) });
      }
    }
  }

  if (teVerzetten.length === 0) {
    console.log(`ongewijzigd: ${pad} (geen hoekpunt op ${van.kleur})`);
    continue;
  }

  /* Het hele model in één keer opschuiven tot het in de baan past. */
  const laagste = Math.min(...teVerzetten.map((v) => v.doel));
  const hoogste = Math.max(...teVerzetten.map((v) => v.doel));
  let schuif = 0;
  if (hoogste - laagste > CEL_HOOG - 1) {
    console.warn(
      `! ${pad}: het schaduwverloop van dit model (${hoogste - laagste + 1} rijen) past niet in ` +
      'de doelbaan; de randen worden afgekapt',
    );
  } else if (laagste < 0) schuif = -laagste;
  else if (hoogste > CEL_HOOG - 1) schuif = CEL_HOOG - 1 - hoogste;
  if (schuif !== 0) verschoven++;

  for (const { u, doel } of teVerzetten) {
    const inBaan = Math.min(CEL_HOOG - 1, Math.max(0, doel + schuif));
    u[0] = (naarX + 0.5) / atlas.breedte;
    u[1] = (Math.floor(naarRij * CEL_HOOG) + inBaan + 0.5) / atlas.hoogte;
  }

  schrijfGlb(volledig, json, bin, writeFileSync);
  const verzet = teVerzetten.length;
  hoekpunten += verzet;
  console.log(
    `${pad}: ${verzet} hoekpunten ${van.kleur} → ${naar.kleur}` +
    (schuif ? ` (${schuif > 0 ? '+' : ''}${schuif} rijen opgeschoven om in de baan te passen)` : ''),
  );
}

if (hoekpunten === 0) {
  console.log('niets te doen');
  process.exit(0);
}

console.log(
  `${hoekpunten} hoekpunten verzet` +
  (verschoven ? `, ${verschoven} model(len) opgeschoven` : '') +
  '; draai nu tools/build-catalog.mjs',
);
