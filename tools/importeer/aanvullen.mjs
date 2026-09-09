#!/usr/bin/env node
// aanvullen.mjs — import extra models from a source pack into a kit that already exists.
//
// Unlike kit.mjs this never clears the kit directory: it adds the named models only.
// The lighting gain is measured over the whole source pack, so a model added later
// lands on the same colormap bands as one imported with the pack.
//
//   node tools/importeer/aanvullen.mjs <source pack> <source name>=<model name> ...

import { existsSync, readdirSync, statSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname, extname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leesGltf, leesObj } from './bron.mjs';
import { bouwGlb, schrijfModel, zetColormapKlaar, meetBelichting } from './bouw.mjs';
import { laadPalet } from './palet.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { pakUit } from '../../catalog/tools/zip.mjs';
import { readGlb } from '../../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRON_DIR = join(ROOT, 'kits', 'sources');
const UITPAK_DIR = join(BRON_DIR, '.uitgepakt');
const WERK_DIR = join(ROOT, 'kits', 'workfiles');

// Packs whose models sit in a kit that BRONKITS does not name, because the kit was
// filled by hand rather than by an importer.
const EXTRA_KITS = { kenney_castlekit: 'castle-kit', 'kenney_graveyardkit_5.0': 'graveyard-kit' };

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
  if (perMap.size === 0) throw new Error(`${dir}: geen .${formaat}`);
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

// The kit's own import settings, read back from a model that is already in it.
function kitInstellingen(slug) {
  const dir = join(WERK_DIR, slug);
  const bestanden = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.glb')) : [];
  if (bestanden.length === 0) throw new Error(`${slug}: kit is leeg, geen instellingen af te lezen`);
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

const [mapNaam, ...paren] = process.argv.slice(2);
if (!mapNaam || paren.length === 0) {
  console.error('gebruik: aanvullen.mjs <source pack> <source name>=<model name> ...');
  process.exit(2);
}

const bronkit = BRONKITS.find((b) => b.map === mapNaam);
if (!bronkit) throw new Error(`${mapNaam}: geen bronkit met die map`);
const slug = bronkit.kit ?? EXTRA_KITS[mapNaam];
if (!slug) throw new Error(`${mapNaam}: geen kit om in te vullen`);

const uitgepakt = pakBronUit(mapNaam);
const modelmap = vindModelmap(uitgepakt, bronkit.formaat);
const lees = (pad) => (bronkit.formaat === 'obj' ? leesObj(pad) : leesGltf(pad));
const vOmlaag = bronkit.formaat !== 'obj';

const gevraagd = paren.map((paar) => {
  const [bronNaam, naam] = paar.split('=');
  if (!bronNaam || !naam) throw new Error(`${paar}: verwacht <source name>=<model name>`);
  const pad = join(modelmap, `${bronNaam}.${bronkit.formaat}`);
  if (!existsSync(pad)) throw new Error(`${bronNaam}: niet in ${modelmap}`);
  return { bronNaam, naam, pad };
});

// Gain over the whole pack, the way kit.mjs measures it over a full import.
const palet = laadPalet();
let som = 0;
let aantal = 0;
for (const bestand of readdirSync(modelmap).sort()) {
  if (extname(bestand).toLowerCase() !== `.${bronkit.formaat}`) continue;
  const meting = meetBelichting(lees(join(modelmap, bestand)), vOmlaag);
  som += meting.som;
  aantal += meting.aantal;
}
const winst = aantal ? palet.niveau / (som / aantal) : 1;

const { schaal, oorsprong } = kitInstellingen(slug);
const kitDir = join(WERK_DIR, slug);
zetColormapKlaar(kitDir);

for (const { bronNaam, naam, pad } of gevraagd) {
  const model = bouwGlb({
    primitieven: lees(pad),
    naam,
    bronNaam,
    bron: bronkit.naam,
    generator: 'tools/importeer/aanvullen.mjs',
    schaal,
    oorsprong,
    vOmlaag,
    winst,
    palet,
  });
  schrijfModel(join(kitDir, `${naam}.glb`), model);
  const v = model.verslag;
  console.log(
    `${slug}/${naam}`.padEnd(46) +
      `${String(v.driehoeken).padStart(5)} tri  ${v.maat.join(' × ')}  banen ${v.kleuren.join(' ')}` +
      `  afstand ${v.ergsteAfstand}`,
  );
}
console.log(`${slug}: ${gevraagd.length} toegevoegd, schaal ${schaal}, oorsprong ${oorsprong}, belichting ×${winst.toFixed(2)}`);
