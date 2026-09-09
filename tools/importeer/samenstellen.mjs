#!/usr/bin/env node
// samenstellen.mjs — import several source models as one model: a chest with its lid on,
// a pot with its lid.
//
// A pack that ships a lid as its own file authors it in its own space, and aanvullen.mjs
// imports each part on its own, centred and grounded, so the pose between them is gone by
// the time the models are in a kit. This reads the parts from the source and offsets each
// one before they become a single model, so the pose comes from the source geometry rather
// than from two workfiles that no longer know about each other.
//
//   node tools/importeer/samenstellen.mjs <source pack> <model name> <source name>[@x,y,z] ...
//
// The offset is in source units, applied before the pack scale. Where a pack already
// authors the parts in place — the ClayItems crockpot and its lid — leave it off.

import { existsSync, readdirSync, statSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname, extname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGltf, leesObj } from './bron.mjs';
import { leesFbx } from '../../catalog/tools/fbx.mjs';
import { bouwGlb, schrijfModel, zetColormapKlaar, meetBelichting } from './bouw.mjs';
import { laadPalet } from './palet.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { pakUit } from '../../catalog/tools/zip.mjs';
import { readGlb } from '../../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRON_DIR = join(ROOT, 'kits', 'sources');
const UITPAK_DIR = join(BRON_DIR, '.uitgepakt');
const WERK_DIR = join(ROOT, 'kits', 'workfiles');
const AFBEELDINGEN = new Set(['.png', '.jpg', '.jpeg']);

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
    const map = dirname(pad);
    perMap.set(map, (perMap.get(map) ?? 0) + 1);
  }
  if (perMap.size === 0) return null;
  return [...perMap].sort(
    (a, b) => b[1] - a[1] || a[0].split('/').length - b[0].split('/').length || a[0].localeCompare(b[0]),
  )[0][0];
}

function pakBronUit(map) {
  const doel = join(UITPAK_DIR, map);
  const stempel = join(doel, '.klaar');
  const zips = readdirSync(join(BRON_DIR, map)).filter((n) => n.toLowerCase().endsWith('.zip')).sort();
  if (zips.length === 0) throw new Error(`${map}: geen .zip in kits/sources`);
  if (!existsSync(stempel)) {
    rmSync(doel, { recursive: true, force: true });
    for (const zip of zips) pakUit(join(BRON_DIR, map, zip), doel);
    mkdirSync(doel, { recursive: true });
    writeFileSync(stempel, zips.join('\n') + '\n');
  }
  return doel;
}

function kitInstellingen(slug) {
  const dir = join(WERK_DIR, slug);
  const bestanden = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.glb')) : [];
  if (bestanden.length === 0) throw new Error(`${slug}: kit is leeg`);
  const perSchaal = new Map();
  const perOorsprong = new Map();
  for (const bestand of bestanden) {
    const extras = readGlb(join(dir, bestand)).json.asset?.extras?.taaleiland ?? {};
    perSchaal.set(extras.schaal, (perSchaal.get(extras.schaal) ?? 0) + 1);
    const o = extras.oorsprong ?? 'gecentreerd';
    perOorsprong.set(o, (perOorsprong.get(o) ?? 0) + 1);
  }
  const meeste = (m) => [...m].sort((a, b) => b[1] - a[1])[0][0];
  return { schaal: meeste(perSchaal), oorsprong: meeste(perOorsprong) };
}

const [mapNaam, naam, ...delen] = process.argv.slice(2);
if (!mapNaam || !naam || delen.length === 0) {
  console.error('gebruik: samenstellen.mjs <source pack> <model name> <source name>[@x,y,z] ...');
  process.exit(2);
}

const bronkit = BRONKITS.find((b) => b.map === mapNaam);
if (!bronkit) throw new Error(`${mapNaam}: geen bronkit met die map`);
if (!bronkit.kit) throw new Error(`${mapNaam}: geen kit om in te vullen`);

const uitgepakt = pakBronUit(mapNaam);
const leesRuw = (pad, formaat) =>
  formaat === 'obj' ? leesObj(pad) : formaat === 'fbx' ? leesFbx(pad) : leesGltf(pad);

// Same texture resolution as aanvullen.mjs: by name, and otherwise the pack's only image.
const afbeeldingen = alleBestanden(uitgepakt).filter((p) => AFBEELDINGEN.has(extname(p).toLowerCase()));
function koppelTexturen(primitieven) {
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
const lees = (pad, formaat) => koppelTexturen(leesRuw(pad, formaat));

const formaten = [bronkit.formaat, ...(bronkit.extraFormaten ?? [])];
const modelmappen = [];
for (const formaat of formaten) {
  const map = vindModelmap(uitgepakt, formaat);
  if (map) modelmappen.push([formaat, map]);
}
if (modelmappen.length === 0) throw new Error(`${mapNaam}: geen .${bronkit.formaat}`);

function vindDeel(bronNaam) {
  for (const [formaat, map] of modelmappen) {
    const pad = join(map, `${bronNaam}.${formaat}`);
    if (existsSync(pad)) return { pad, formaat };
  }
  throw new Error(`${bronNaam}: niet in ${modelmappen.map(([, map]) => map).join(', ')}`);
}

// Only one v direction can hold for the whole model, so a composition mixes formats no
// further than the parts already agree on.
const gevraagd = delen.map((deel) => {
  const [bronNaam, offset] = deel.split('@');
  const verschuiving = offset ? offset.split(',').map(Number) : [0, 0, 0];
  if (verschuiving.length !== 3 || verschuiving.some((v) => !Number.isFinite(v))) {
    throw new Error(`${deel}: verwacht <source name>[@x,y,z]`);
  }
  return { bronNaam, verschuiving, ...vindDeel(bronNaam) };
});
const formaatVanModel = gevraagd[0].formaat;
if (gevraagd.some((d) => d.formaat !== formaatVanModel)) {
  throw new Error(`${naam}: de delen komen uit verschillende formaten`);
}
const vOmlaag = formaatVanModel !== 'obj';

// Gain over the whole pack, the way kit.mjs and aanvullen.mjs measure it, so a composed
// model lands on the same bands as the parts imported on their own.
const palet = laadPalet();
const [, hoofdmap] = modelmappen[0];
let som = 0;
let aantal = 0;
for (const bestand of readdirSync(hoofdmap).sort()) {
  if (extname(bestand).toLowerCase() !== `.${modelmappen[0][0]}`) continue;
  const meting = meetBelichting(lees(join(hoofdmap, bestand), modelmappen[0][0]), vOmlaag);
  som += meting.som;
  aantal += meting.aantal;
}
const winst = aantal ? palet.niveau / (som / aantal) : 1;

const primitieven = [];
for (const { bronNaam, pad, formaat, verschuiving } of gevraagd) {
  for (const primitief of lees(pad, formaat)) {
    if (verschuiving.some((v) => v !== 0)) {
      const posities = primitief.posities;
      for (let i = 0; i < posities.length; i += 3) {
        for (let as = 0; as < 3; as++) posities[i + as] += verschuiving[as];
      }
    }
    primitief.naam = `${naam}-${primitief.naam ?? bronNaam}`;
    primitieven.push(primitief);
  }
}

const { schaal, oorsprong } = kitInstellingen(bronkit.kit);
const kitDir = join(WERK_DIR, bronkit.kit);
zetColormapKlaar(kitDir);

const model = bouwGlb({
  primitieven,
  naam,
  bronNaam: gevraagd.map((d) => d.bronNaam).join('+'),
  bron: bronkit.naam,
  generator: 'tools/importeer/samenstellen.mjs',
  schaal,
  oorsprong,
  vOmlaag,
  winst,
  palet,
});
schrijfModel(join(kitDir, `${naam}.glb`), model);

const v = model.verslag;
console.log(
  `${bronkit.kit}/${naam}`.padEnd(46) +
    `${String(v.driehoeken).padStart(5)} tri  ${v.maat.join(' × ')}  banen ${v.kleuren.join(' ')}` +
    `  afstand ${v.ergsteAfstand}`,
);
