#!/usr/bin/env node
// worst-kleursprong.mjs — per model de verste kleursprong van een bronpack naar
// de gedeelde colormap, voor de LICENSE.txt van een kit.
//
// De importer meldt alleen de afstand; dit meldt ook wélke baan waarheen ging.
// Er wordt niets weggeschreven: het bouwt de modellen in het geheugen op
// dezelfde manier als aanvullen.mjs, met dezelfde belichtingswinst over de hele
// pack, zodat de getallen kloppen met wat er in kits/workfiles staat.
//
//   node tools/importeer/worst-kleursprong.mjs <bronmap> <schaal> [--limiet n]

import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGltf, leesObj } from './bron.mjs';
import { leesFbx } from '../../catalog/tools/fbx.mjs';
import { bouwGlb, meetBelichting } from './bouw.mjs';
import { laadPalet } from './palet.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UITPAK_DIR = join(ROOT, 'kits', 'sources', '.uitgepakt');

function alleBestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) alleBestanden(pad, uit);
    else uit.push(pad);
  }
  return uit;
}

function vindModelmap(dir, formaat) {
  const perMap = new Map();
  for (const pad of alleBestanden(dir)) {
    if (extname(pad).toLowerCase() !== `.${formaat}`) continue;
    perMap.set(dirname(pad), (perMap.get(dirname(pad)) ?? 0) + 1);
  }
  if (perMap.size === 0) throw new Error(`${dir}: geen .${formaat}`);
  return [...perMap].sort(
    (a, b) => b[1] - a[1] || a[0].split('/').length - b[0].split('/').length || a[0].localeCompare(b[0]),
  )[0][0];
}

// Een fbx noemt zijn textuur zonder pad; los hem op tegen de afbeeldingen in de
// uitgepakte pack, zoals aanvullen.mjs dat doet.
const AFBEELDINGEN = new Set(['.png', '.jpg', '.jpeg']);

function koppelTexturen(primitieven, uitgepakt) {
  const afbeeldingen = alleBestanden(uitgepakt).filter((p) => AFBEELDINGEN.has(extname(p).toLowerCase()));
  for (const primitief of primitieven) {
    const gevraagd = primitief.materiaal.textuur;
    if (!gevraagd || existsSync(gevraagd)) continue;
    const gezocht = basename(gevraagd).toLowerCase();
    primitief.materiaal.textuur =
      afbeeldingen.find((p) => basename(p).toLowerCase() === gezocht) ??
      (afbeeldingen.length === 1 ? afbeeldingen[0] : null);
  }
  return primitieven;
}

const argv = process.argv.slice(2);
const l = argv.indexOf('--limiet');
const limiet = l === -1 ? 8 : Number(argv[l + 1]);
const [mapNaam, schaalTekst] = l === -1 ? argv : argv.filter((_, i) => i !== l && i !== l + 1);
if (!mapNaam || !(Number(schaalTekst) > 0)) {
  console.error('gebruik: worst-kleursprong.mjs <bronmap> <schaal> [--limiet n]');
  process.exit(2);
}

const bronkit = BRONKITS.find((b) => b.map === mapNaam);
if (!bronkit) throw new Error(`${mapNaam}: geen bronkit met die map`);
const uitgepakt = join(UITPAK_DIR, mapNaam);
if (!existsSync(uitgepakt)) {
  throw new Error(`${mapNaam}: nog niet uitgepakt — draai eerst aanvullen.mjs of build-missing.mjs`);
}

const { formaat } = bronkit;
const modelmap = vindModelmap(uitgepakt, formaat);
const leesRuw = (pad) => (formaat === 'obj' ? leesObj(pad) : formaat === 'fbx' ? leesFbx(pad) : leesGltf(pad));
const lees = (pad) => koppelTexturen(leesRuw(pad), uitgepakt);
const vOmlaag = formaat !== 'obj';
const schaal = Number(schaalTekst);
const palet = laadPalet();

const gelezen = readdirSync(modelmap)
  .filter((n) => extname(n).toLowerCase() === `.${formaat}`)
  .sort()
  .map((n) => [basename(n, extname(n)), lees(join(modelmap, n))]);

let som = 0;
let aantal = 0;
for (const [, primitieven] of gelezen) {
  const meting = meetBelichting(primitieven, vOmlaag);
  som += meting.som;
  aantal += meting.aantal;
}
const winst = aantal ? palet.niveau / (som / aantal) : 1;

const regels = gelezen.map(([naam, primitieven]) => {
  const { verslag } = bouwGlb({
    primitieven, naam, bronNaam: naam, bron: bronkit.naam,
    generator: 'tools/importeer/worst-kleursprong.mjs', schaal, vOmlaag, winst, palet,
  });
  return { naam, afstand: verslag.ergsteAfstand, kleur: verslag.ergsteKleur };
});

regels.sort((a, b) => b.afstand - a.afstand);
console.log(`${mapNaam} — schaal ${schaal}, belichting ×${winst.toFixed(2)}, ${regels.length} modellen`);
for (const { naam, afstand, kleur } of regels.slice(0, limiet)) {
  console.log(`  ${naam.padEnd(26)} ${String(afstand).padStart(5)}  ${kleur.bron} → ${kleur.doel}`);
}
