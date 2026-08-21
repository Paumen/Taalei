/**
 * Zet één kleur van een model om naar een andere kleur die al in de gedeelde
 * colormap staat.
 *
 * Draai vanuit de repo-root:
 *
 *     node tools/hermap-kleur.mjs <van-hex> <naar-hex> <model.glb...>
 *     node tools/hermap-kleur.mjs '#228b22' '#6d8d33' kits/modulair-terrein/hilly-prop-grass-clump-a.glb
 *
 * De atlas verandert niet en de geometrie ook niet: alleen de TEXCOORD_0 van de
 * hoekpunten die de ene baan aanwezen gaat naar de andere. Elke baan is 32 × 128
 * pixels waarin de hoogte een gebakken schaduwverloop draagt.
 *
 * Een hoekpunt houdt zijn plek in dat verloop, maar gemeten vanaf de rij die de
 * naam van de baan draagt — de rij die het dichtst bij de hex ligt waaronder de
 * cel in kits/palet.json staat.
 * Vraag je om #fbf02d → #ffb349, dan krijg je #ffb349 en niet de donkerste rij
 * van die baan, ook al stond #fbf02d toevallig onderaan de zijne. Wie schaduw
 * had houdt schaduw: een hoekpunt dat twintig rijen boven zijn naamkleur zat,
 * zit dat in de nieuwe baan weer.
 *
 * kits/palet.json wordt bijgewerkt; draai daarna tools/build-catalog.mjs.
 *
 * Nogmaals draaien met dezelfde argumenten is een lege operatie: de hoekpunten
 * wijzen dan al naar de doelbaan.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGlb, schrijfGlb } from './glb.mjs';
import { leesPng, KOLOMMEN, RIJEN, naarHex, kleurAfstand } from './kleurmap.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COLORMAP = join(ROOT, 'kits', 'colormap.png');
const PALET = join(ROOT, 'kits', 'palet.json');

const [vanHex, naarHexArg, ...modellen] = process.argv.slice(2);
if (!vanHex || !naarHexArg || modellen.length === 0) {
  console.error('gebruik: node tools/hermap-kleur.mjs <van-hex> <naar-hex> <model.glb...>');
  process.exit(1);
}

const atlas = leesPng(COLORMAP);
const CEL_BREED = atlas.breedte / KOLOMMEN;
const CEL_HOOG = atlas.hoogte / RIJEN;

/**
 * Alle kleuren in een baan, van boven naar beneden. Een baan is een verloop, dus
 * de hex waaronder een cel in kits/palet.json staat is er één uit deze reeks —
 * bij de meeste banen de middelste rij, bij een enkele de onderste. Vandaar dat
 * de controle hieronder op "komt erin voor" toetst en niet op één vaste rij.
 */
function celKleuren([kolom, rij]) {
  const x = Math.floor(kolom * CEL_BREED + CEL_BREED / 2);
  const uit = [];
  for (let i = 0; i < CEL_HOOG; i++) {
    const p = ((Math.floor(rij * CEL_HOOG) + i) * atlas.breedte + x) * 4;
    uit.push(naarHex(atlas.pixels[p], atlas.pixels[p + 1], atlas.pixels[p + 2]));
  }
  return uit;
}

/** De cel die in kits/palet.json onder deze hex staat. */
const paletJson = JSON.parse(readFileSync(PALET, 'utf8'));
const gedeeld = paletJson.paletten.find((p) => p.id === 'gedeeld');
if (!gedeeld) throw new Error('kits/palet.json heeft geen palet "gedeeld"');

function zoekCel(hex) {
  const cel = gedeeld.cellen.find((c) => c.kleur.toLowerCase() === hex.toLowerCase());
  if (!cel) {
    throw new Error(`${hex} staat niet in het gedeelde palet — kies een kleur die er al is`);
  }
  return cel;
}

const vanCel = zoekCel(vanHex);
const naarCel = zoekCel(naarHexArg);
const hexNaarRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * De rij binnen een baan die de naamkleur van die baan het dichtst benadert.
 *
 * Meestal staat die kleur er letterlijk in — dan is dit gewoon die rij. Maar
 * niet altijd: de rode baan [7,0] heet #b2413a en loopt van #c94d33 naar
 * #9b3440, waar #b2413a tussenin ligt zonder ooit precies bemonsterd te worden.
 * Vandaar dichtstbij en niet gelijk, met een grens eromheen: ligt de naamkleur
 * ver van élke rij, dan klopt het palet niet bij de atlas en is doorgaan
 * gevaarlijker dan stoppen.
 */
const VER = 40;

function naamRij(cel) {
  const baan = celKleuren(cel.cel);
  const doel = hexNaarRgb(cel.kleur);
  let beste = 0;
  let afstand = Infinity;
  baan.forEach((hex, rij) => {
    const d = kleurAfstand(hexNaarRgb(hex), doel);
    if (d < afstand) { afstand = d; beste = rij; }
  });
  if (afstand > VER) {
    throw new Error(
      `cel [${cel.cel}] heet ${cel.kleur} in het palet, maar die baan loopt van ` +
      `${baan[0]} naar ${baan.at(-1)} — dat is te ver uit elkaar om te durven verzetten`,
    );
  }
  return beste;
}

/* -- UV's verzetten -------------------------------------------------------- */

const [vanKolom, vanRij] = vanCel.cel;
const [naarKolom, naarRij] = naarCel.cel;
const naarX = Math.floor(naarKolom * CEL_BREED + CEL_BREED / 2);

const vanNaamRij = naamRij(vanCel);
const naarNaamRij = naamRij(naarCel);

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

const geraakt = new Map(); // kit -> Set(modelnaam)
let hoekpunten = 0;

for (const pad of modellen) {
  const volledig = resolve(ROOT, pad);
  const glb = leesGlb(volledig);
  const { json, bin } = glb;
  let verzet = 0;

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

      for (let i = 0; i < accessor.count; i++) {
        const p = bin.byteOffset + start + i * stap;
        const u = bin.buffer instanceof ArrayBuffer ? new Float32Array(bin.buffer, p, 2) : null;
        if (!u) throw new Error(`${pad}: onverwachte buffer`);
        const waar = plaats(u[0], u[1]);
        if (waar.kolom !== vanKolom || waar.rij !== vanRij) continue;
        const inBaan = Math.min(CEL_HOOG - 1, Math.max(0, naarNaamRij + (waar.inBaan - vanNaamRij)));
        u[0] = (naarX + 0.5) / atlas.breedte;
        u[1] = (Math.floor(naarRij * CEL_HOOG) + inBaan + 0.5) / atlas.hoogte;
        verzet++;
      }
    }
  }

  if (verzet === 0) {
    console.log(`ongewijzigd: ${pad} (geen hoekpunt op ${vanCel.kleur})`);
    continue;
  }

  schrijfGlb(volledig, json, bin, writeFileSync);
  hoekpunten += verzet;
  const kit = basename(dirname(volledig));
  const naam = basename(volledig, '.glb');
  if (!geraakt.has(kit)) geraakt.set(kit, new Set());
  geraakt.get(kit).add(naam);
  console.log(`${pad}: ${verzet} hoekpunten ${vanCel.kleur} → ${naarCel.kleur}`);
}

if (hoekpunten === 0) {
  console.log('niets te doen');
  process.exit(0);
}

/* -- kits/palet.json bijwerken --------------------------------------------- */

for (const [kit, namen] of geraakt) {
  const vanBron = vanCel.bronnen.find((b) => b.kit === kit);
  if (vanBron) {
    vanBron.modellen = vanBron.modellen.filter((n) => !namen.has(n));
    if (vanBron.modellen.length === 0) vanCel.bronnen.splice(vanCel.bronnen.indexOf(vanBron), 1);
  }

  let naarBron = naarCel.bronnen.find((b) => b.kit === kit);
  if (!naarBron) {
    naarBron = { kit, modellen: [] };
    naarCel.bronnen.push(naarBron);
    naarCel.bronnen.sort((a, b) => a.kit.localeCompare(b.kit));
  }
  naarBron.modellen = [...new Set([...naarBron.modellen, ...namen])].sort();
}

/* Een baan die niemand meer aanwijst blijft in de atlas staan — daar is hij
 * niemand tot last — maar verdwijnt uit het palet, want de kleurbalk hoort
 * alleen kleuren te tonen die je ergens terugvindt. */
if (vanCel.bronnen.length === 0) {
  gedeeld.cellen.splice(gedeeld.cellen.indexOf(vanCel), 1);
  console.log(`${vanCel.kleur} wordt door niets meer gebruikt en is uit het palet gehaald`);
}

writeFileSync(PALET, `${JSON.stringify(paletJson, null, 1)}\n`);
console.log(`${hoekpunten} hoekpunten verzet; draai nu tools/build-catalog.mjs`);
