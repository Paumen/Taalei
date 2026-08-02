/**
 * Toetst elk model in kits/ aan de assetstijlgids (docs/asset-stijlgids.md).
 *
 * Draai vanuit de repo-root:  node tools/controleer-assets.mjs
 *   --json           schrijf het volledige resultaat naar stdout als JSON
 *   --kit <slug>     beperk tot één kit
 *
 * Exitcode 1 zodra er een harde overtreding is, zodat dit ook als check in
 * CI kan draaien. Wat de gids "bewust afwijken voor een functionele reden"
 * noemt kan een script niet beoordelen; die gevallen komen als aandachtspunt
 * naar boven en niet als fout.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { leesGlb, primitives } from './glb-lezer.mjs';
import { bepaalGroep } from './semantiek.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS_DIR = join(ROOT, 'kits');

/* De gedeelde colormap is een raster van 16 × 4 cellen op 512 × 512 px. */
const KOLOMMEN = 16;
const RIJEN = 4;

/* Grenswaarden uit de gids, plus de marges waarmee we ze toetsen. */
const MAX_SEGMENTEN = 24;        // §2 flat pieces per hele cirkel
const RASTER = 0.5;              // §4 footprints in hele of halve units
const RASTER_MARGE = 0.02;       // ~2 cm speling op een unit van 1 m
const BASIS_MARGE = 0.005;       // §5 basis op Y = 0
const MIN_TWEEVLAKSHOEK = 20;    // §3 onder deze hoek zie je een gedeelde normaal niet
const GELIJKE_NORMAAL = 5;       // graden; dichter bij elkaar telt als "gemiddeld"

/**
 * §4 eist een rasterfootprint van modulaire onderdelen; props hoeven er
 * alleen geloofwaardig naast te staan. We hergebruiken de indeling uit
 * semantiek.mjs zodat catalogus en controle dezelfde begrippen delen.
 */
const MODULAIRE_GROEPEN = new Set(['terrein', 'grot', 'bouw', 'verbinding', 'hek']);

/* -- palet ---------------------------------------------------------------- */

/**
 * palet.json beschrijft welke cellen van de gedeelde colormap in gebruik zijn.
 * Een cel kan breder zijn dan één kolom (de rotswand beslaat er vier); die
 * kolommen horen bij dezelfde paletkleur.
 */
function leesPalet() {
  const palet = JSON.parse(readFileSync(join(KITS_DIR, 'palet.json'), 'utf8'));
  const cellen = new Map(); // "kolom,rij" → hex
  for (const cel of palet.cellen ?? []) {
    const [x, y] = cel.cel;
    for (let dx = 0; dx < (cel.breedte ?? 1); dx += 1) cellen.set(`${x + dx},${y}`, cel.kleur.toLowerCase());
  }
  return cellen;
}

const celVan = (u, v) => {
  const kolom = Math.min(KOLOMMEN - 1, Math.max(0, Math.floor(u * KOLOMMEN)));
  const rij = Math.min(RIJEN - 1, Math.max(0, Math.floor(v * RIJEN)));
  return `${kolom},${rij}`;
};

/* -- meetkunde ------------------------------------------------------------ */

const min = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
const max = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
const aftrek = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const kruis = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const lengte = (a) => Math.hypot(a[0], a[1], a[2]);
const stip = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function normaliseer(a) {
  const l = lengte(a);
  return l < 1e-12 ? null : [a[0] / l, a[1] / l, a[2] / l];
}

/** Hoek in graden tussen twee richtingen, ongeacht hun teken. */
const hoekTussen = (a, b) => (Math.acos(Math.min(1, Math.abs(stip(a, b)))) * 180) / Math.PI;

const opRaster = (waarde) => Math.abs(waarde - Math.round(waarde / RASTER) * RASTER) <= RASTER_MARGE;

/**
 * Zoekt ringen van punten die op één cirkel liggen: het spoor dat een
 * rondgedraaide vorm achterlaat. Het aantal punten in zo'n gesloten ring is
 * precies het aantal vlakke stukjes waaruit de cirkel is opgebouwd.
 */
function ringen(posities) {
  const gevonden = [];
  for (const as of [0, 1, 2]) {
    const anders = [0, 1, 2].filter((i) => i !== as);
    const perLaag = new Map();
    for (const p of posities) {
      const sleutel = p[as].toFixed(4);
      if (!perLaag.has(sleutel)) perLaag.set(sleutel, []);
      perLaag.get(sleutel).push([p[anders[0]], p[anders[1]]]);
    }
    for (const punten of perLaag.values()) {
      const uniek = [...new Map(punten.map((p) => [`${p[0].toFixed(5)},${p[1].toFixed(5)}`, p])).values()];
      if (uniek.length < 5) continue;

      const midden = uniek.reduce((a, p) => [a[0] + p[0] / uniek.length, a[1] + p[1] / uniek.length], [0, 0]);
      const stralen = uniek.map((p) => Math.hypot(p[0] - midden[0], p[1] - midden[1]));
      const gemiddelde = stralen.reduce((a, b) => a + b, 0) / stralen.length;
      if (gemiddelde < 1e-3) continue;
      const spreiding = Math.sqrt(
        stralen.reduce((a, r) => a + (r - gemiddelde) ** 2, 0) / stralen.length,
      );
      if (spreiding / gemiddelde > 0.04) continue; // geen cirkel

      const hoeken = uniek
        .map((p) => ((Math.atan2(p[1] - midden[1], p[0] - midden[0]) * 180) / Math.PI + 360) % 360)
        .sort((a, b) => a - b)
        .filter((h, i, arr) => i === 0 || h - arr[i - 1] > 0.5);
      if (hoeken.length < 5) continue;

      const gaten = hoeken.map((h, i) => (i === hoeken.length - 1 ? hoeken[0] + 360 - h : hoeken[i + 1] - h));
      const grootste = Math.max(...gaten);
      const stap = [...gaten].sort((a, b) => a - b)[Math.floor(gaten.length / 2)];
      // Alleen gesloten ringen: bij een boog zegt het aantal punten niets
      // over hoe fijn een hele cirkel verdeeld zou zijn.
      if (grootste > stap * 1.5) continue;
      gevonden.push({ segmenten: hoeken.length, straal: gemiddelde });
    }
  }
  return gevonden;
}

/**
 * Welk deel van de scherpe randen is weggeschaduwd? Twee vlakken die een
 * duidelijke hoek maken horen elk hun eigen normaal te hebben; delen ze er
 * één, dan verdwijnt de knik in een verloop en zie je de vlakke stukjes niet
 * meer. Gewogen op randlengte — een korte gemiddelde rand valt niet op.
 */
function randScherpte(prim) {
  if (!prim.normalen) return null;
  const sleutel = (i) => prim.posities[i].map((c) => c.toFixed(5)).join(',');
  const vlakNormaal = [];
  for (const [a, b, c] of prim.driehoeken) {
    vlakNormaal.push(normaliseer(kruis(
      aftrek(prim.posities[b], prim.posities[a]),
      aftrek(prim.posities[c], prim.posities[a]),
    )));
  }

  const randen = new Map();
  prim.driehoeken.forEach((driehoek, t) => {
    if (!vlakNormaal[t]) return;
    for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) {
      const i = driehoek[x];
      const j = driehoek[y];
      const [ka, kb] = [sleutel(i), sleutel(j)].sort();
      const id = `${ka}|${kb}`;
      if (!randen.has(id)) randen.set(id, []);
      randen.get(id).push([t, i, j]);
    }
  });

  let scherp = 0;
  let zacht = 0;
  for (const [id, gebruik] of randen) {
    if (gebruik.length !== 2) continue;
    const [[t0, i0, j0], [t1, i1, j1]] = gebruik;
    if (hoekTussen(vlakNormaal[t0], vlakNormaal[t1]) < MIN_TWEEVLAKSHOEK) continue;

    const [ka, kb] = id.split('|');
    const l = lengte(aftrek(ka.split(',').map(Number), kb.split(',').map(Number)));
    const normaalBij = (a, b, k) => normaliseer(prim.normalen[sleutel(a) === k ? a : b]);
    const verschil = [ka, kb].map((k) => {
      const n0 = normaalBij(i0, j0, k);
      const n1 = normaalBij(i1, j1, k);
      return n0 && n1 ? hoekTussen(n0, n1) : 90;
    });
    if (Math.max(...verschil) < GELIJKE_NORMAAL) zacht += l;
    else scherp += l;
  }
  return { scherp, zacht };
}

/* -- controle per model --------------------------------------------------- */

function controleer(pad, paletCellen, colormapHash) {
  const glb = leesGlb(pad);
  const { json } = glb;
  const kort = relative(ROOT, pad);
  const kit = basename(dirname(pad));
  const groep = bepaalGroep(kit, basename(pad, '.glb'));
  const modulair = MODULAIRE_GROEPEN.has(groep);
  const fouten = [];
  const aandacht = [];

  /* §1 kleur — één gedeelde colormap, UV's binnen paletcellen */
  const afbeeldingen = json.images ?? [];
  if (afbeeldingen.length !== 1) {
    fouten.push(`§1 ${afbeeldingen.length} textuurafbeeldingen; de gids staat er één toe`);
  }
  for (const afbeelding of afbeeldingen) {
    if (!afbeelding.uri) {
      fouten.push('§1 textuur zit ingebed in de .glb; verwijs naar de gedeelde Textures/colormap.png');
      continue;
    }
    const texturePad = resolve(dirname(pad), afbeelding.uri);
    const hash = createHash('md5').update(readFileSync(texturePad)).digest('hex');
    if (hash !== colormapHash) fouten.push(`§1 ${afbeelding.uri} wijkt af van de gedeelde colormap`);
  }
  for (const materiaal of json.materials ?? []) {
    const pbr = materiaal.pbrMetallicRoughness ?? {};
    if (!pbr.baseColorTexture) {
      const kleur = (pbr.baseColorFactor ?? [1, 1, 1, 1]).slice(0, 3)
        .map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
      fouten.push(`§1 materiaal "${materiaal.name}" kleurt zonder colormap (#${kleur})`);
    } else if ((pbr.baseColorFactor ?? [1, 1, 1, 1]).slice(0, 3).some((c) => Math.abs(c - 1) > 0.01)) {
      fouten.push(`§1 materiaal "${materiaal.name}" tint de colormap met baseColorFactor`);
    }
    if ((materiaal.emissiveFactor ?? [0, 0, 0]).some((c) => c > 0.01)) {
      aandacht.push(`§3 materiaal "${materiaal.name}" is emissive; licht hoort uit de scene te komen`);
    }
  }

  /* §3 outlines — een omtrek verraadt zich als een aparte mesh of materiaal */
  for (const mesh of json.meshes ?? []) {
    if (/outline|contour|stroke|omtrek/i.test(mesh.name ?? '')) {
      fouten.push(`§3 mesh "${mesh.name}" lijkt een outline`);
    }
  }

  /* -- meetkunde in één pas over alle primitives -- */
  let laag = [Infinity, Infinity, Infinity];
  let hoog = [-Infinity, -Infinity, -Infinity];
  let driehoeken = 0;
  let buitenPalet = 0;
  const gebruikteCellen = new Set();
  let scherp = 0;
  let zacht = 0;
  let meesteSegmenten = 0;

  for (const prim of primitives(glb)) {
    driehoeken += prim.driehoeken.length;
    for (const p of prim.posities) {
      laag = min(laag, p);
      hoog = max(hoog, p);
    }
    if (prim.uvs) {
      for (const driehoek of prim.driehoeken) {
        for (const i of driehoek) {
          const cel = celVan(prim.uvs[i][0], prim.uvs[i][1]);
          gebruikteCellen.add(cel);
          if (!paletCellen.has(cel)) buitenPalet += 1;
        }
      }
    }
    const randen = randScherpte(prim);
    if (randen) {
      scherp += randen.scherp;
      zacht += randen.zacht;
    }
    for (const ring of ringen(prim.posities)) {
      meesteSegmenten = Math.max(meesteSegmenten, ring.segmenten);
    }
  }

  for (const cel of gebruikteCellen) {
    if (!paletCellen.has(cel)) fouten.push(`§1 UV's wijzen naar cel ${cel}, die niet in palet.json staat`);
  }

  /* §2 meetkunde — hoeveel vlakke stukjes per hele cirkel */
  if (meesteSegmenten > MAX_SEGMENTEN) {
    fouten.push(`§2 ronde vorm van ${meesteSegmenten} stukjes; het maximum is ${MAX_SEGMENTEN}`);
  }

  /* §3 schaduw — blijven de vlakke stukjes zichtbaar */
  const zachtDeel = scherp + zacht > 0 ? zacht / (scherp + zacht) : 0;
  if (zachtDeel > 0.3) {
    aandacht.push(
      `§3 ${Math.round(zachtDeel * 100)}% van de scherpe randen heeft gemiddelde normalen; `
      + 'de vlakke stukjes worden weggeschaduwd',
    );
  }

  /* §4 schaal — footprint op hele of halve units */
  const breedte = Math.max(Math.abs(laag[0]), Math.abs(hoog[0])) * 2;
  const diepte = Math.max(Math.abs(laag[2]), Math.abs(hoog[2])) * 2;
  const hoogte = hoog[1] - laag[1];
  if (modulair && (!opRaster(breedte) || !opRaster(diepte))) {
    aandacht.push(`§4 footprint ${breedte.toFixed(3)} × ${diepte.toFixed(3)} valt niet op het halve-unit-raster`);
  }

  /* §5 oorsprong — basis op Y = 0 */
  if (Math.abs(laag[1]) > BASIS_MARGE) {
    aandacht.push(`§5 basis staat op Y = ${laag[1].toFixed(3)} in plaats van 0`);
  }

  /* §6 bestandsformaat — één model per bestand */
  if (!pad.endsWith('.glb')) fouten.push('§6 geen .glb');
  const wortels = (json.scenes?.[json.scene ?? 0]?.nodes ?? []).length;
  if (wortels !== 1) aandacht.push(`§6 ${wortels} losse objecten in het bestand`);

  return {
    model: kort,
    groep,
    modulair,
    fouten,
    aandacht,
    driehoeken,
    segmenten: meesteSegmenten,
    zachteRanden: Number(zachtDeel.toFixed(3)),
    afmeting: [breedte, hoogte, diepte].map((v) => Number(v.toFixed(3))),
    basisY: Number(laag[1].toFixed(3)),
    buitenPalet,
  };
}

/* -- uitvoeren ------------------------------------------------------------ */

function alleModellen(kitFilter) {
  const uit = [];
  for (const kit of readdirSync(KITS_DIR)) {
    const map = join(KITS_DIR, kit);
    if (!statSync(map).isDirectory()) continue;
    if (kitFilter && kit !== kitFilter) continue;
    for (const bestand of readdirSync(map)) {
      if (bestand.endsWith('.glb')) uit.push(join(map, bestand));
    }
  }
  return uit.sort();
}

const argumenten = process.argv.slice(2);
const alsJson = argumenten.includes('--json');
const kitFilter = argumenten.includes('--kit') ? argumenten[argumenten.indexOf('--kit') + 1] : null;

const paletCellen = leesPalet();
const colormapHash = createHash('md5').update(readFileSync(join(KITS_DIR, 'colormap.png'))).digest('hex');
const resultaten = alleModellen(kitFilter).map((pad) => controleer(pad, paletCellen, colormapHash));

if (alsJson) {
  process.stdout.write(`${JSON.stringify(resultaten, null, 1)}\n`);
} else {
  const metFouten = resultaten.filter((r) => r.fouten.length);
  const metAandacht = resultaten.filter((r) => !r.fouten.length && r.aandacht.length);

  console.log(`${resultaten.length} modellen gecontroleerd tegen docs/asset-stijlgids.md\n`);
  if (metFouten.length) {
    console.log(`Overtredingen (${metFouten.length}):`);
    for (const r of metFouten) for (const f of r.fouten) console.log(`  ${r.model}\n    ${f}`);
    console.log('');
  }
  console.log(`Aandachtspunten (${metAandacht.length}) — mag, mits bewust en functioneel:`);
  const perRegel = new Map();
  for (const r of [...metFouten, ...metAandacht]) {
    for (const a of r.aandacht) {
      const regel = a.slice(0, 2);
      if (!perRegel.has(regel)) perRegel.set(regel, []);
      perRegel.get(regel).push(`${r.model}: ${a.slice(3)}`);
    }
  }
  for (const regel of [...perRegel.keys()].sort()) {
    const lijst = perRegel.get(regel);
    console.log(`  ${regel} — ${lijst.length}×`);
    for (const l of lijst.slice(0, 6)) console.log(`     ${l}`);
    if (lijst.length > 6) console.log(`     … en nog ${lijst.length - 6}`);
  }
  console.log(`\nTotaal: ${resultaten.reduce((a, r) => a + r.driehoeken, 0)} driehoeken`);
  process.exitCode = metFouten.length ? 1 : 0;
}
