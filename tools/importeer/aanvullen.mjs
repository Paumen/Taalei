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

const EXTRA_KITS = { kenney_castlekit: 'castle-kit', 'kenney_graveyardkit_5.0': 'graveyard-kit' };

function alleBestanden(dir, uit = []) {
  for (const naam of readdirSync(dir)) {
    const pad = join(dir, naam);
    if (statSync(pad).isDirectory()) alleBestanden(pad, uit);
    else uit.push(pad);
  }
  return uit;
}

function vindModelmappen(dir, formaat, alleMappen) {
  const perMap = new Map();
  for (const pad of alleBestanden(dir)) {
    if (extname(pad).toLowerCase() !== `.${formaat}`) continue;
    const map = dirname(pad);
    perMap.set(map, (perMap.get(map) ?? 0) + 1);
  }
  if (perMap.size === 0) throw new Error(`${dir}: geen .${formaat}`);
  const gesorteerd = [...perMap].sort(
    (a, b) => b[1] - a[1] || a[0].split('/').length - b[0].split('/').length || a[0].localeCompare(b[0]),
  );
  return alleMappen ? gesorteerd.map(([map]) => map).sort() : [gesorteerd[0][0]];
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

function kitInstellingen(slug, gevraagdeSchaal) {
  const dir = join(WERK_DIR, slug);
  const bestanden = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.glb')) : [];
  if (bestanden.length === 0) {
    if (gevraagdeSchaal === null) {
      throw new Error(`${slug}: kit is leeg, geef --schaal voor de eerste import`);
    }
    return { schaal: gevraagdeSchaal, oorsprong: 'gecentreerd', herschaal: 1 };
  }
  const perSchaal = new Map();
  const perOorsprong = new Map();
  const perHerschaal = new Map();
  for (const bestand of bestanden) {
    const glb = readGlb(join(dir, bestand));
    const extras = glb.json.asset?.extras?.taaleiland ?? {};
    perSchaal.set(extras.schaal, (perSchaal.get(extras.schaal) ?? 0) + 1);
    const o = extras.oorsprong ?? 'gecentreerd';
    perOorsprong.set(o, (perOorsprong.get(o) ?? 0) + 1);
    const wikkel = (glb.json.nodes ?? []).find((n) => n.name === 'rescale-wrapper');
    const h = wikkel?.scale?.[0] ?? 1;
    perHerschaal.set(h, (perHerschaal.get(h) ?? 0) + 1);
  }
  const meeste = (m) => [...m].sort((a, b) => b[1] - a[1])[0][0];
  return { schaal: meeste(perSchaal), oorsprong: meeste(perOorsprong), herschaal: meeste(perHerschaal) };
}

const argv = process.argv.slice(2);
const schaalVlag = argv.indexOf('--schaal');
let gevraagdeSchaal = null;
if (schaalVlag !== -1) {
  gevraagdeSchaal = Number(argv[schaalVlag + 1]);
  if (!(gevraagdeSchaal > 0)) throw new Error('--schaal verwacht een getal groter dan 0');
  argv.splice(schaalVlag, 2);
}

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

const [mapNaam, ...paren] = argv;
if (!mapNaam || paren.length === 0) {
  console.error('gebruik: aanvullen.mjs <source pack> <source name>=<model name> ...');
  process.exit(2);
}

const bronkit = BRONKITS.find((b) => b.map === mapNaam);
if (!bronkit) throw new Error(`${mapNaam}: geen bronkit met die map`);
const slug = bronkit.kit ?? EXTRA_KITS[mapNaam];
if (!slug) throw new Error(`${mapNaam}: geen kit om in te vullen`);

const uitgepakt = pakBronUit(mapNaam);
const hoofdmappen = vindModelmappen(uitgepakt, bronkit.formaat, bronkit.alleMappen);
const leesRuw = (pad, formaat) =>
  formaat === 'obj' ? leesObj(pad) : formaat === 'fbx' ? leesFbx(pad) : leesGltf(pad);
const lees = (pad, formaat = bronkit.formaat) => koppelTexturen(leesRuw(pad, formaat), uitgepakt);
const vOmlaagVoor = (formaat) => formaat !== 'obj';
const vOmlaag = vOmlaagVoor(bronkit.formaat);

const modelmappen = hoofdmappen.map((map) => [bronkit.formaat, map]);
for (const formaat of bronkit.extraFormaten ?? []) {
  for (const map of vindModelmappen(uitgepakt, formaat, bronkit.alleMappen)) {
    modelmappen.push([formaat, map]);
  }
}

const LOD = /_LOD(\d+)$/i;
const grofsteWeg = (naam) => {
  const match = naam.match(LOD);
  if (!match) return naam;
  return Number(match[1]) === 0 ? naam.replace(LOD, '') : null;
};

function* bronBestanden() {
  for (const map of hoofdmappen) {
    for (const bestand of readdirSync(map).sort()) {
      if (extname(bestand).toLowerCase() !== `.${bronkit.formaat}`) continue;
      yield join(map, bestand);
    }
  }
}

function meshIndex() {
  const index = new Map();
  for (const pad of bronBestanden()) {
    for (const primitief of lees(pad)) {
      const naam = grofsteWeg(primitief.naam);
      if (!naam) continue;
      const treffer = index.get(naam);
      if (!treffer) index.set(naam, { pad, primitieven: [primitief] });
      else if (treffer.pad === pad) treffer.primitieven.push(primitief);
    }
  }
  return index;
}

const meshen = bronkit.splitsPerMesh ? meshIndex() : null;

const gevraagd = paren.map((paar) => {
  const [bronNaam, naam] = paar.split('=');
  if (!bronNaam || !naam) throw new Error(`${paar}: verwacht <source name>=<model name>`);
  if (meshen) {
    const treffer = meshen.get(bronNaam);
    if (!treffer) throw new Error(`${bronNaam}: geen mesh met die naam in ${hoofdmappen.join(', ')}`);
    return { bronNaam, naam, pad: treffer.pad, primitieven: treffer.primitieven };
  }
  for (const [formaat, map] of modelmappen) {
    const pad = join(map, `${bronNaam}.${formaat}`);
    if (existsSync(pad)) return { bronNaam, naam, pad, formaat };
  }
  throw new Error(`${bronNaam}: niet in ${modelmappen.map(([, map]) => map).join(', ')}`);
});

const palet = laadPalet();
let som = 0;
let aantal = 0;
for (const bestand of bronBestanden()) {
  const meting = meetBelichting(lees(bestand), vOmlaag);
  som += meting.som;
  aantal += meting.aantal;
}
const winst = aantal ? palet.niveau / (som / aantal) : 1;

const { schaal, oorsprong, herschaal } = kitInstellingen(slug, gevraagdeSchaal);
const kitDir = join(WERK_DIR, slug);
zetColormapKlaar(kitDir);

for (const { bronNaam, naam, pad, primitieven, formaat = bronkit.formaat } of gevraagd) {
  const model = bouwGlb({
    primitieven: primitieven ?? lees(pad, formaat),
    naam,
    bronNaam,
    bron: bronkit.naam,
    generator: 'tools/importeer/aanvullen.mjs',
    schaal,
    oorsprong,
    vOmlaag: vOmlaagVoor(formaat),
    winst,
    herschaal,
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
console.log(
  `${slug}: ${gevraagd.length} toegevoegd, schaal ${schaal}` +
    `${herschaal === 1 ? '' : ` ×${herschaal} (rescale-wrapper)`}` +
    `, oorsprong ${oorsprong}, belichting ×${winst.toFixed(2)}`,
);
