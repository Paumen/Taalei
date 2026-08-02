/**
 * Bouwt catalog.json vanuit de bestanden in kits/.
 *
 * Draai vanuit de repo-root:  node tools/build-catalog.mjs
 *
 * De catalogus wordt volledig afgeleid van wat er écht op schijf staat, zodat
 * hij niet uit de pas kan lopen met de kits. Per model worden bestandsgrootte
 * en driehoekstelling uit de .glb gelezen — de tri-count is relevant voor de
 * rendering-budgetten (zie brainstorm.md: cave-kit pas laden ná de ingang).
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { GROEPEN, bepaalGroep, nederlandseTrefwoorden } from './semantiek.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS_DIR = join(ROOT, 'kits');

/* -- kit-metadata ---------------------------------------------------------
 * kits/manifest.js is een browser-script (window.KENNEY_KITS = [...]).
 * We voeren het uit in een lege context met alleen een nep-`window`, zodat we
 * niet afhankelijk zijn van de opmaak van het bestand. De modellijst uit het
 * manifest negeren we; die komt van schijf.
 */
function leesKitMetadata() {
  const bron = readFileSync(join(KITS_DIR, 'manifest.js'), 'utf8');
  const context = { window: {} };
  runInNewContext(bron, context, { timeout: 5000, filename: 'kits/manifest.js' });

  const kits = context.window.KENNEY_KITS;
  if (!Array.isArray(kits)) {
    throw new Error('kits/manifest.js zet geen window.KENNEY_KITS-array');
  }

  const meta = new Map();
  for (const kit of kits) {
    meta.set(kit.slug, { naam: kit.name, url: kit.url, zones: kit.zone });
  }
  return meta;
}

/* -- kleuren --------------------------------------------------------------
 * kits/palet.json beschrijft per cel van de gedeelde colormap welke modellen
 * die kleur gebruiken. We draaien dat om naar model → kleuren, zodat je in de
 * catalogus op kleur kunt filteren.
 */
function leesPalet() {
  const palet = JSON.parse(readFileSync(join(KITS_DIR, 'palet.json'), 'utf8'));
  const perModel = new Map(); // 'kit/model' → Set(hex)
  const cellen = new Map(); // hex → { hex, naam, aantal }

  for (const cel of palet.cellen ?? []) {
    const hex = String(cel.kleur).toLowerCase();
    if (!cellen.has(hex)) {
      cellen.set(hex, { hex, naam: kleurNaam(hex), textuur: cel.textuur ?? null, aantal: 0 });
    }
    for (const bron of cel.bronnen ?? []) {
      for (const model of bron.modellen ?? []) {
        const sleutel = `${bron.kit}/${model}`;
        if (!perModel.has(sleutel)) perModel.set(sleutel, new Set());
        perModel.get(sleutel).add(hex);
      }
    }
  }
  return { perModel, cellen };
}

/**
 * Grove Nederlandse benaming van een hex-kleur, zodat de filterknoppen iets
 * zeggen. Bewust ruw: het gaat om herkenning, niet om precisie.
 */
function kleurNaam(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const licht = (max + min) / 2;
  const delta = max - min;
  const verzadiging = delta === 0 ? 0 : delta / (1 - Math.abs(2 * licht - 1));

  if (verzadiging < 0.18) {
    if (licht > 0.8) return 'wit';
    if (licht > 0.45) return 'lichtgrijs';
    if (licht > 0.25) return 'grijs';
    return 'donkergrijs';
  }

  let tint = 0;
  if (max === r) tint = ((g - b) / delta) % 6;
  else if (max === g) tint = (b - r) / delta + 2;
  else tint = (r - g) / delta + 4;
  tint = (tint * 60 + 360) % 360;

  const basis =
    tint < 15 || tint >= 345 ? 'rood'
    : tint < 40 ? (licht < 0.45 ? 'bruin' : 'oranje')
    : tint < 50 ? (licht < 0.5 ? 'bruin' : 'oranje')
    : tint < 70 ? 'geel'
    : tint < 165 ? 'groen'
    : tint < 200 ? 'turquoise'
    : tint < 260 ? 'blauw'
    : tint < 300 ? 'paars'
    : 'roze';

  if (licht < 0.3) return `donker${basis}`;
  if (licht > 0.75) return `licht${basis}`;
  return basis;
}

/* -- .glb uitlezen --------------------------------------------------------
 * GLB-container: 12-byte header, daarna chunks van [lengte, type, data].
 * De eerste chunk is de glTF-JSON; die is genoeg voor tellingen.
 */
function leesGlbJson(pad) {
  const buf = readFileSync(pad);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`geen geldige GLB: ${pad}`);
  }
  const chunkLengte = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  if (chunkType !== 0x4e4f534a) throw new Error(`eerste chunk is geen JSON: ${pad}`);
  return JSON.parse(buf.subarray(20, 20 + chunkLengte).toString('utf8'));
}

/** Driehoeken per mesh, los van hoe vaak die mesh in de scene staat. */
function driehoekenPerMesh(gltf) {
  const accessors = gltf.accessors ?? [];
  return (gltf.meshes ?? []).map((mesh) =>
    (mesh.primitives ?? []).reduce((totaal, prim) => {
      const modus = prim.mode ?? 4; // 4 = TRIANGLES
      if (modus !== 4) return totaal;
      const acc = prim.indices !== undefined
        ? accessors[prim.indices]
        : accessors[prim.attributes?.POSITION];
      return totaal + Math.floor((acc?.count ?? 0) / 3);
    }, 0),
  );
}

/**
 * Telt driehoeken zoals ze in de scene voorkomen: een mesh die door drie nodes
 * wordt hergebruikt telt drie keer, want dat is wat de GPU tekent.
 */
function telDriehoeken(gltf) {
  const perMesh = driehoekenPerMesh(gltf);
  const nodes = gltf.nodes ?? [];
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const gezien = new Set();
  let totaal = 0;

  const loop = (index) => {
    if (gezien.has(index)) return; // cyclus-beveiliging
    gezien.add(index);
    const node = nodes[index];
    if (!node) return;
    if (node.mesh !== undefined) totaal += perMesh[node.mesh] ?? 0;
    for (const kind of node.children ?? []) loop(kind);
  };

  if (scene?.nodes) {
    for (const index of scene.nodes) loop(index);
  } else {
    // Geen scene gedefinieerd: val terug op alle meshes één keer.
    totaal = perMesh.reduce((a, b) => a + b, 0);
  }
  return totaal;
}

/* -- versiestempel --------------------------------------------------------
 * GitHub Pages serveert met `cache-control: max-age=600`. Zonder versie in de
 * URL kijk je na een deploy dus tot tien minuten naar oude CSS of JS, of erger:
 * naar nieuwe HTML met oude JS. De hash hangt aan de inhoud, dus hij verandert
 * precies wanneer er iets verandert.
 */
function schrijfVersie() {
  const inhoud = ['catalog.json', 'catalog.css', 'catalog.js']
    .map((naam) => readFileSync(join(ROOT, naam)))
    .join('');
  const versie = createHash('sha256').update(inhoud).digest('hex').slice(0, 10);

  const pad = join(ROOT, 'index.html');
  const html = readFileSync(pad, 'utf8')
    .replace(/href="catalog\.css(?:\?v=[a-f0-9]+)?"/, `href="catalog.css?v=${versie}"`)
    .replace(/src="catalog\.js(?:\?v=[a-f0-9]+)?"/, `src="catalog.js?v=${versie}"`)
    .replace(/<meta name="catalogus-versie" content="[^"]*">/, `<meta name="catalogus-versie" content="${versie}">`);

  writeFileSync(pad, html);
  console.log(`versie ${versie} → index.html`);
}

/* -- catalogus opbouwen --------------------------------------------------- */

const kitMeta = leesKitMetadata();
const palet = leesPalet();
const kitSlugs = readdirSync(KITS_DIR)
  .filter((naam) => statSync(join(KITS_DIR, naam)).isDirectory())
  .sort();

const kits = [];
const modellen = [];
const zonderMetadata = [];
const zonderGroep = [];
const zonderTrefwoord = [];
const zonderKleur = [];

for (const slug of kitSlugs) {
  const dir = join(KITS_DIR, slug);
  const bestanden = readdirSync(dir).filter((n) => n.endsWith('.glb')).sort();
  if (bestanden.length === 0) continue;

  const meta = kitMeta.get(slug);
  if (!meta) zonderMetadata.push(slug);

  for (const bestand of bestanden) {
    const naam = bestand.replace(/\.glb$/, '');
    const pad = `kits/${slug}/${bestand}`;
    const gltf = leesGlbJson(join(dir, bestand));
    const groep = bepaalGroep(slug, naam);
    if (groep === 'overig') zonderGroep.push(`${slug}/${naam}`);
    const trefwoorden = nederlandseTrefwoorden(naam);
    if (trefwoorden.length === 0) zonderTrefwoord.push(`${slug}/${naam}`);

    const kleuren = [...(palet.perModel.get(`${slug}/${naam}`) ?? [])].sort();
    if (kleuren.length === 0) zonderKleur.push(`${slug}/${naam}`);
    for (const hex of kleuren) palet.cellen.get(hex).aantal++;

    modellen.push({
      id: `${slug}/${naam}`,
      naam,
      kit: slug,
      groep,
      trefwoorden,
      kleuren,
      pad,
      bytes: statSync(join(dir, bestand)).size,
      driehoeken: telDriehoeken(gltf),
      materialen: (gltf.materials ?? []).length,
    });
  }

  kits.push({
    slug,
    naam: meta?.naam ?? slug,
    // "Fantasy Town Kit" → "Fantasy Town": in de filterbalk is dat achtervoegsel ruis.
    kort: (meta?.naam ?? slug).replace(/\s+Kit$/, ''),
    url: meta?.url ?? null,
    zones: meta?.zones ? meta.zones.split(',').map((z) => z.trim()) : [],
    licentie: `kits/${slug}/LICENSE.txt`,
    aantal: bestanden.length,
  });
}

const catalogus = {
  gegenereerd: 'node tools/build-catalog.mjs',
  totaal: modellen.length,
  kits,
  groepen: GROEPEN.map((g) => ({
    ...g,
    aantal: modellen.filter((m) => m.groep === g.id).length,
  })),
  // Alleen cellen die daadwerkelijk aan een bestaand model hangen; op donkerste
  // eerst, zodat de filterbalk een herkenbare volgorde houdt.
  kleuren: [...palet.cellen.values()]
    .filter((k) => k.aantal > 0)
    .sort((a, b) => b.aantal - a.aantal || a.hex.localeCompare(b.hex)),
  modellen,
};

writeFileSync(join(ROOT, 'catalog.json'), JSON.stringify(catalogus, null, 1) + '\n');
schrijfVersie();

console.log(`${modellen.length} modellen in ${kits.length} kits → catalog.json`);
for (const g of catalogus.groepen) {
  console.log(`  ${String(g.aantal).padStart(3)}  ${g.naam}`);
}
console.log(`${catalogus.kleuren.length} kleuren uit palet.json:`);
for (const k of catalogus.kleuren) {
  console.log(`  ${String(k.aantal).padStart(3)}  ${k.hex}  ${k.naam}`);
}
if (zonderMetadata.length) console.warn(`! geen metadata in manifest.js: ${zonderMetadata.join(', ')}`);
if (zonderGroep.length) console.warn(`! geen semantische groep: ${zonderGroep.join(', ')}`);
if (zonderKleur.length) {
  console.warn(`! ${zonderKleur.length} modellen zonder kleur in palet.json (kleurfilter slaat ze over)`);
}
if (zonderTrefwoord.length) {
  console.warn(`! geen Nederlands trefwoord (vul WOORDENBOEK aan in tools/semantiek.mjs): ${zonderTrefwoord.join(', ')}`);
}
