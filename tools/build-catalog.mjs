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
import { GROEPEN, bepaalGroep, nederlandseTrefwoorden } from './semantiek.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KITS_DIR = join(ROOT, 'kits');

/* -- kit-metadata ---------------------------------------------------------
 * kits/manifest.js is een browser-script (window.KENNEY_KITS = [...]).
 * We lezen alleen de metadata eruit; de modellijst komt van schijf.
 */
function leesKitMetadata() {
  const bron = readFileSync(join(KITS_DIR, 'manifest.js'), 'utf8');
  const json = bron.slice(bron.indexOf('['), bron.lastIndexOf(']') + 1);
  const meta = new Map();
  for (const kit of JSON.parse(json)) {
    meta.set(kit.slug, { naam: kit.name, url: kit.url, zones: kit.zone });
  }
  return meta;
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

/* -- catalogus opbouwen --------------------------------------------------- */

const kitMeta = leesKitMetadata();
const kitSlugs = readdirSync(KITS_DIR)
  .filter((naam) => statSync(join(KITS_DIR, naam)).isDirectory())
  .sort();

const kits = [];
const modellen = [];
const zonderMetadata = [];
const zonderGroep = [];
const zonderTrefwoord = [];

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

    modellen.push({
      id: `${slug}/${naam}`,
      naam,
      kit: slug,
      groep,
      trefwoorden,
      pad,
      bytes: statSync(join(dir, bestand)).size,
      driehoeken: telDriehoeken(gltf),
      materialen: (gltf.materials ?? []).length,
    });
  }

  kits.push({
    slug,
    naam: meta?.naam ?? slug,
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
  modellen,
};

writeFileSync(join(ROOT, 'catalog.json'), JSON.stringify(catalogus, null, 1) + '\n');

console.log(`${modellen.length} modellen in ${kits.length} kits → catalog.json`);
for (const g of catalogus.groepen) {
  console.log(`  ${String(g.aantal).padStart(3)}  ${g.naam}`);
}
if (zonderMetadata.length) console.warn(`! geen metadata in manifest.js: ${zonderMetadata.join(', ')}`);
if (zonderGroep.length) console.warn(`! geen semantische groep: ${zonderGroep.join(', ')}`);
if (zonderTrefwoord.length) {
  console.warn(`! geen Nederlands trefwoord (vul WOORDENBOEK aan in tools/semantiek.mjs): ${zonderTrefwoord.join(', ')}`);
}
