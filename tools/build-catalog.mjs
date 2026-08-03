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
import { GROEPEN, bepaalGroep } from './semantiek.mjs';

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
    meta.set(kit.slug, { naam: kit.name, url: kit.url });
  }
  return meta;
}

/* -- kleuren --------------------------------------------------------------
 * kits/palet.json beschrijft per palet, per cel van de bijbehorende colormap,
 * welke modellen die kleur gebruiken. We draaien dat om naar model → kleuren,
 * zodat je in de catalogus op kleur kunt filteren.
 *
 * Er zijn twee paletten, want er zijn twee atlassen: de zes kits die de
 * gedeelde kits/colormap.png gebruiken, en de grot met zijn eigen sheet. Een
 * model hoort bij precies één palet; dezelfde hex in beide paletten is dus
 * niet dezelfde filterknop.
 */
function leesPalet() {
  const bestand = JSON.parse(readFileSync(join(KITS_DIR, 'palet.json'), 'utf8'));
  const perModel = new Map(); // 'kit/model' → { palet, hexen: Set(hex) }
  const paletten = [];

  for (const palet of bestand.paletten ?? []) {
    const cellen = new Map(); // hex → { hex, naam, textuur, aantal }

    for (const cel of palet.cellen ?? []) {
      const hex = String(cel.kleur).toLowerCase();
      if (!cellen.has(hex)) {
        cellen.set(hex, { hex, naam: kleurNaam(hex), textuur: cel.textuur ?? null, aantal: 0 });
      }
      for (const bron of cel.bronnen ?? []) {
        for (const model of bron.modellen ?? []) {
          const sleutel = `${bron.kit}/${model}`;
          const bestaand = perModel.get(sleutel);
          if (!bestaand) {
            perModel.set(sleutel, { palet: palet.id, hexen: new Set([hex]) });
          } else if (bestaand.palet !== palet.id) {
            // De scheiding is het hele punt: één model mag niet uit twee
            // atlassen tegelijk komen, anders zegt het kleurfilter niets meer.
            throw new Error(
              `${sleutel} staat zowel in palet '${bestaand.palet}' als in '${palet.id}'`,
            );
          } else {
            bestaand.hexen.add(hex);
          }
        }
      }
    }

    paletten.push({ id: palet.id, naam: palet.naam, atlas: palet.atlas, cellen });
  }

  return { perModel, paletten };
}

/**
 * Cellen die aan minder dan zoveel modellen hangen, gaan op in de
 * dichtstbijzijnde kleur die wél blijft. Een staal voor één model levert een
 * filterknop op die niets filtert; de kleuren liggen bovendien zo dicht bij
 * elkaar dat het onderscheid op het scherm toch niet te zien is.
 */
const SAMENVOEG_ONDER = 4;

/**
 * ...maar alleen als de buur ook echt dichtbij ligt. In het gedeelde palet
 * gebeurt het samenvoegen over afstanden tot ~90; het grot-palet is zo klein
 * dat de dichtstbijzijnde buur van het staalblauw van `gate-metal-bars` een
 * bruine rotskleur is (afstand ~200). Zo'n staal samenvoegen liegt over wat
 * je ziet, dus die blijft staan.
 */
const SAMENVOEG_AFSTAND = 120;

const hexNaarRgb = (hex) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Afstand tussen twee kleuren volgens de "redmean"-benadering: goedkoper dan
 * een Lab-conversie en dicht genoeg bij wat het oog doet om de juiste buur te
 * kiezen.
 */
function kleurAfstand(a, b) {
  const [r1, g1, b1] = hexNaarRgb(a);
  const [r2, g2, b2] = hexNaarRgb(b);
  const rGemiddeld = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(
    (2 + rGemiddeld / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rGemiddeld) / 256) * db * db,
  );
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

/* -- afmetingen en tekenopdrachten ----------------------------------------
 * Een node draagt zijn eigen transform (los TRS of een kant-en-klare matrix)
 * en die van zijn ouders. Om te weten hoe groot een model in de scène staat
 * moeten de hoeken van elke primitive dus door de wereldmatrix heen.
 */
const EENHEIDSMATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Kolom-major, zoals glTF ze aanlevert: r = a × b. */
function maalMatrix(a, b) {
  const r = new Array(16).fill(0);
  for (let kolom = 0; kolom < 4; kolom++) {
    for (let rij = 0; rij < 4; rij++) {
      let som = 0;
      for (let k = 0; k < 4; k++) som += a[k * 4 + rij] * b[kolom * 4 + k];
      r[kolom * 4 + rij] = som;
    }
  }
  return r;
}

/** Node-transform als matrix; `matrix` wint van losse translation/rotation/scale. */
function nodeMatrix(node) {
  if (node.matrix) return node.matrix;

  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

/**
 * Afmetingen (breedte × diepte × hoogte, dus X × Z × Y) en tekenopdrachten,
 * beide zoals de scène ze oplevert. Elke primitive is één tekenopdracht: een
 * model van zes losse delen kost zes calls, ook als ze hetzelfde materiaal
 * delen. De bounding box komt uit de min/max van de POSITION-accessors — die
 * geeft de glTF-schrijver mee, dus de vertexdata zelf hoeft er niet aan te
 * pas te komen. Roteert een node, dan is de box van de acht getransformeerde
 * hoeken iets ruimer dan de echte vorm; dat is de prijs van niet inlezen.
 */
function meetScene(gltf) {
  const accessors = gltf.accessors ?? [];
  const nodes = gltf.nodes ?? [];
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const gezien = new Set();
  let calls = 0;

  const loop = (index, ouderMatrix) => {
    if (gezien.has(index)) return; // cyclus-beveiliging, net als in telDriehoeken
    gezien.add(index);
    const node = nodes[index];
    if (!node) return;
    const wereld = maalMatrix(ouderMatrix, nodeMatrix(node));

    for (const prim of gltf.meshes?.[node.mesh]?.primitives ?? []) {
      calls++;
      const positie = accessors[prim.attributes?.POSITION];
      if (!positie?.min || !positie?.max) continue;

      for (let hoek = 0; hoek < 8; hoek++) {
        const p = [
          hoek & 1 ? positie.max[0] : positie.min[0],
          hoek & 2 ? positie.max[1] : positie.min[1],
          hoek & 4 ? positie.max[2] : positie.min[2],
        ];
        for (let as = 0; as < 3; as++) {
          const waarde =
            wereld[as] * p[0] + wereld[4 + as] * p[1] + wereld[8 + as] * p[2] + wereld[12 + as];
          if (waarde < min[as]) min[as] = waarde;
          if (waarde > max[as]) max[as] = waarde;
        }
      }
    }

    for (const kind of node.children ?? []) loop(kind, wereld);
  };

  for (const index of scene?.nodes ?? []) loop(index, EENHEIDSMATRIX);

  // Op drie decimalen: de kits zijn op 0.01 units ontworpen, en zonder afronden
  // zet de float-rekenarij hier 1.0000000298023224 in de catalogus.
  const meet = (as) => (min[as] === Infinity ? 0 : Math.round((max[as] - min[as]) * 1000) / 1000);
  return { wdh: [meet(0), meet(2), meet(1)], calls };
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
    const scene = meetScene(gltf);
    const groep = bepaalGroep(slug, naam);
    if (groep === 'overig') zonderGroep.push(`${slug}/${naam}`);

    const uitPalet = palet.perModel.get(`${slug}/${naam}`);
    const kleuren = [...(uitPalet?.hexen ?? [])].sort();
    if (kleuren.length === 0) zonderKleur.push(`${slug}/${naam}`);

    modellen.push({
      id: `${slug}/${naam}`,
      naam,
      kit: slug,
      groep,
      // Het palet hoort bij de kleuren: dezelfde hex uit een ander palet is
      // een andere atlas en dus een andere filterknop.
      palet: uitPalet?.palet ?? null,
      kleuren,
      pad,
      bytes: statSync(join(dir, bestand)).size,
      driehoeken: telDriehoeken(gltf),
      materialen: (gltf.materials ?? []).length,
      // Breedte × diepte × hoogte in rastereenheden (1 = één wand-/vloersegment).
      wdh: scene.wdh,
      calls: scene.calls,
    });
  }

  kits.push({
    slug,
    naam: meta?.naam ?? slug,
    // "Fantasy Town Kit" → "Fantasy Town": in de filterbalk is dat achtervoegsel ruis.
    kort: (meta?.naam ?? slug).replace(/\s+Kit$/, ''),
    url: meta?.url ?? null,
    licentie: `kits/${slug}/LICENSE.txt`,
    aantal: bestanden.length,
    // Eén palet per kit; leesPalet() bewaakt dat een model er maar één heeft.
    // Welke atlas daarbij hoort staat in het palet zelf, niet hier: elke kit
    // heeft weliswaar een eigen Textures/colormap.png, maar bij de zes kits
    // die het gedeelde palet gebruiken is dat een kopie van dezelfde sheet.
    palet: modellen.find((m) => m.kit === slug && m.palet)?.palet ?? null,
  });
}

/* -- zeldzame kleuren samenvoegen -----------------------------------------
 * Per palet, want een kleur uit de gedeelde atlas en een kleur uit de
 * grot-atlas zijn losse stalen; die mogen nooit in elkaar opgaan.
 */

const tel = () => {
  for (const p of palet.paletten) for (const cel of p.cellen.values()) cel.aantal = 0;
  for (const model of modellen) {
    if (model.kleuren.length === 0) continue;
    const cellen = palet.paletten.find((p) => p.id === model.palet)?.cellen;
    // Kleuren zonder palet kunnen niet bestaan — ze komen uit hetzelfde
    // palet.json-record — maar als dat ooit scheefloopt is een duidelijke
    // fout beter dan een TypeError diep in de telling.
    if (!cellen) throw new Error(`${model.id} heeft kleuren maar geen bekend palet (${model.palet})`);
    for (const hex of model.kleuren) cellen.get(hex).aantal++;
  }
};

tel();

const samenvoegingen = []; // [paletId, oude hex, nieuwe hex]

for (const p of palet.paletten) {
  const blijft = [...p.cellen.values()].filter((c) => c.aantal >= SAMENVOEG_ONDER);
  const perPalet = new Map();

  for (const cel of p.cellen.values()) {
    if (cel.aantal === 0 || cel.aantal >= SAMENVOEG_ONDER || blijft.length === 0) continue;
    const doel = blijft.reduce((beste, kandidaat) =>
      kleurAfstand(cel.hex, kandidaat.hex) < kleurAfstand(cel.hex, beste.hex) ? kandidaat : beste,
    );
    if (kleurAfstand(cel.hex, doel.hex) > SAMENVOEG_AFSTAND) continue;
    perPalet.set(cel.hex, doel.hex);
    samenvoegingen.push([p.id, cel.hex, doel.hex]);
  }

  if (perPalet.size > 0) {
    for (const model of modellen) {
      if (model.palet !== p.id) continue;
      model.kleuren = [...new Set(model.kleuren.map((hex) => perPalet.get(hex) ?? hex))].sort();
    }
  }
}

if (samenvoegingen.length > 0) tel();

const catalogus = {
  gegenereerd: 'node tools/build-catalog.mjs',
  totaal: modellen.length,
  kits,
  groepen: GROEPEN.map(({ beschrijving, ...g }) => ({
    ...g,
    aantal: modellen.filter((m) => m.groep === g.id).length,
  })),
  // Alleen cellen die daadwerkelijk aan een bestaand model hangen; op donkerste
  // eerst, zodat de filterbalk een herkenbare volgorde houdt.
  paletten: palet.paletten.map((p) => ({
    id: p.id,
    naam: p.naam,
    atlas: p.atlas,
    kleuren: [...p.cellen.values()]
      .filter((k) => k.aantal > 0)
      .sort((a, b) => b.aantal - a.aantal || a.hex.localeCompare(b.hex)),
  })),
  modellen,
};

writeFileSync(join(ROOT, 'catalog.json'), JSON.stringify(catalogus, null, 1) + '\n');
schrijfVersie();

console.log(`${modellen.length} modellen in ${kits.length} kits → catalog.json`);
for (const g of catalogus.groepen) {
  console.log(`  ${String(g.aantal).padStart(3)}  ${g.naam}`);
}
for (const [paletId, oud, nieuw] of samenvoegingen) {
  const doel = palet.paletten.find((p) => p.id === paletId).cellen.get(nieuw);
  console.log(`samengevoegd in ${paletId}: ${oud} → ${nieuw} (${doel.naam})`);
}
for (const p of catalogus.paletten) {
  console.log(`palet ${p.id} — ${p.kleuren.length} kleuren uit ${p.atlas}:`);
  for (const k of p.kleuren) {
    console.log(`  ${String(k.aantal).padStart(3)}  ${k.hex}  ${k.naam}`);
  }
}

/* Elke kit hoort in precies één palet; anders is de atlasscheiding lek. */
const paletPerKit = new Map();
for (const model of modellen) {
  if (!paletPerKit.has(model.kit)) paletPerKit.set(model.kit, new Set());
  if (model.palet) paletPerKit.get(model.kit).add(model.palet);
}
for (const [kit, gebruikt] of paletPerKit) {
  if (gebruikt.size > 1) console.warn(`! ${kit} put uit meer dan één palet: ${[...gebruikt].join(', ')}`);
}
if (zonderMetadata.length) console.warn(`! geen metadata in manifest.js: ${zonderMetadata.join(', ')}`);
if (zonderGroep.length) console.warn(`! geen semantische groep: ${zonderGroep.join(', ')}`);
if (zonderKleur.length) {
  console.warn(`! ${zonderKleur.length} modellen zonder kleur in palet.json (kleurfilter slaat ze over)`);
}
