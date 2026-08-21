/**
 * Bakt een "open"-animatie in de modellen met een scharnierend onderdeel.
 *
 * Draai vanuit de repo-root:  node tools/voeg-scharnieranimatie.mjs
 *
 * De packs leveren geen animaties, maar zetten deksels en deuren wél als
 * eigen node in het model, met de oorsprong precies op de scharnierlijn —
 * zo kan een spel ze openzwaaien. In de catalogus was daar niets van te
 * zien: chest en chest-gold ogen identiek terwijl de gouden kist vol
 * muntstapels zit, verborgen achter het dichte deksel.
 *
 * Dit script voegt per model één glTF-animatieclip "open" toe die het
 * scharnierdeel opendraait, even open houdt en weer sluit — een nette lus
 * voor de viewer (catalog.js speelt clips automatisch af en toont ze in de
 * Animatie-keuzelijst; tools/build-catalog.mjs neemt de namen op in
 * catalog.json, dus draai die hierna). Een spel kan dezelfde clip half
 * afspelen om te openen of te sluiten.
 *
 * De geometrie en de UV's blijven ongemoeid; er komt alleen een animatie,
 * en de node van het scharnierdeel ruilt zijn `matrix` (zuivere translatie)
 * in voor een gelijke `translation` — de glTF-spec staat geen `matrix` toe
 * op een geanimeerde node. Een model dat al een "open"-clip heeft wordt
 * overgeslagen, dus nogmaals draaien is veilig; een hoek wijzigen kan door
 * eerst de kit-bestanden terug te zetten (git checkout) en opnieuw te
 * draaien.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Welk onderdeel scharniert, om welke as (in de ruimte van de node) en hoe
 * ver open, in graden. De draairichting volgt uit het teken; de hoeken zijn
 * op het oog gekozen in de model-viewer van de catalogus.
 */
const SCHARNIEREN = {
  'dungeon/chest': { node: 'chest_lid', as: 'x', graden: -110 },
  'dungeon/chest-gold': { node: 'chest_gold_lid', as: 'x', graden: -110 },
  'dungeon/wall-doorway': { node: 'wall_doorway_door', as: 'y', graden: -100 },
  'dungeon/wall-doorway-scaffold': { node: 'wall_doorway_scaffold_door', as: 'y', graden: -100 },
  'rpgtools/compass-base': { node: 'compass_lid', as: 'x', graden: 150 },
};

/* Tijdstippen en stand (0 = dicht, 1 = open): opendraaien, even open laten,
 * sluiten, even dicht laten — dan is het als lus prettig om naar te kijken. */
const CYCLUS = [[0, 0], [1.2, 1], [2.0, 1], [3.2, 0], [4.0, 0]];

/* -- GLB lezen en schrijven ------------------------------------------------ */

function leesGlb(pad) {
  const buf = readFileSync(pad);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`geen GLB: ${pad}`);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`eerste chunk is geen JSON: ${pad}`);
  const jsonLengte = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLengte).toString('utf8'));
  let bin = null;
  let offset = 20 + jsonLengte;
  while (offset + 8 <= buf.length) {
    const lengte = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === 0x004e4942) bin = buf.subarray(offset + 8, offset + 8 + lengte);
    offset += 8 + lengte;
  }
  return { json, bin };
}

function schrijfGlb(pad, json, bin) {
  const vulling = (n, m) => (m - (n % m)) % m;
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(vulling(jsonBuf.length, 4), 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc(vulling(bin.length, 4), 0)]);
  const kop = Buffer.alloc(12);
  kop.writeUInt32LE(0x46546c67, 0);
  kop.writeUInt32LE(2, 4);
  kop.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const jsonKop = Buffer.alloc(8);
  jsonKop.writeUInt32LE(jsonChunk.length, 0);
  jsonKop.writeUInt32LE(0x4e4f534a, 4);
  const binKop = Buffer.alloc(8);
  binKop.writeUInt32LE(binChunk.length, 0);
  binKop.writeUInt32LE(0x004e4942, 4);
  writeFileSync(pad, Buffer.concat([kop, jsonKop, jsonChunk, binKop, binChunk]));
}

/* -- de clip zelf ----------------------------------------------------------- */

for (const [pad, scharnier] of Object.entries(SCHARNIEREN)) {
  const bestand = join(ROOT, 'kits', `${pad}.glb`);
  const { json, bin } = leesGlb(bestand);

  if ((json.animations ?? []).some((a) => a.name === 'open')) {
    console.log(`${pad}: heeft al een "open"-clip — overgeslagen`);
    continue;
  }

  const nodeIndex = json.nodes.findIndex((n) => n.name === scharnier.node);
  if (nodeIndex === -1) throw new Error(`${pad}: node ${scharnier.node} niet gevonden`);
  const node = json.nodes[nodeIndex];

  // Een geanimeerde node mag geen `matrix` dragen; de scharniernodes hebben
  // een zuivere translatie, dus die kan één-op-één over.
  if (node.matrix) {
    const m = node.matrix;
    const rotatieDeel = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
    const identiteit = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (!rotatieDeel.every((v, i) => Math.abs(v - identiteit[i]) < 1e-6)) {
      throw new Error(`${pad}: ${scharnier.node} heeft een matrix met rotatie/schaal, dat kan hier niet`);
    }
    node.translation = [m[12], m[13], m[14]];
    delete node.matrix;
  }

  /* Kwaternionen voor de stand op elk tijdstip. */
  const hoek = (scharnier.graden * Math.PI) / 180;
  const kwaternion = (t) => {
    const halve = (hoek * t) / 2;
    const s = Math.sin(halve);
    return scharnier.as === 'x'
      ? [s, 0, 0, Math.cos(halve)]
      : [0, s, 0, Math.cos(halve)];
  };

  const tijden = Float32Array.from(CYCLUS.map(([t]) => t));
  const rotaties = new Float32Array(CYCLUS.length * 4);
  CYCLUS.forEach(([, stand], i) => rotaties.set(kwaternion(stand), i * 4));

  /* Data achteraan de binaire buffer, accessors en bufferViews erbij. */
  const vulling = (4 - (bin.length % 4)) % 4;
  const nieuwBin = Buffer.concat([bin, Buffer.alloc(vulling), Buffer.from(tijden.buffer), Buffer.from(rotaties.buffer)]);
  json.bufferViews = json.bufferViews ?? [];
  json.accessors = json.accessors ?? [];
  const bvTijd = json.bufferViews.push({ buffer: 0, byteOffset: bin.length + vulling, byteLength: tijden.byteLength }) - 1;
  const bvRot = json.bufferViews.push({ buffer: 0, byteOffset: bin.length + vulling + tijden.byteLength, byteLength: rotaties.byteLength }) - 1;
  const accTijd = json.accessors.push({
    bufferView: bvTijd,
    componentType: 5126,
    count: CYCLUS.length,
    type: 'SCALAR',
    min: [CYCLUS[0][0]],
    max: [CYCLUS[CYCLUS.length - 1][0]],
  }) - 1;
  const accRot = json.accessors.push({
    bufferView: bvRot,
    componentType: 5126,
    count: CYCLUS.length,
    type: 'VEC4',
  }) - 1;
  json.buffers[0].byteLength = nieuwBin.length;

  json.animations = json.animations ?? [];
  json.animations.push({
    name: 'open',
    samplers: [{ input: accTijd, output: accRot, interpolation: 'LINEAR' }],
    channels: [{ sampler: 0, target: { node: nodeIndex, path: 'rotation' } }],
  });

  schrijfGlb(bestand, json, nieuwBin);
  console.log(`${pad}: "open"-clip toegevoegd (${scharnier.node}, ${scharnier.graden}° om ${scharnier.as})`);
}
console.log('klaar; draai nu tools/build-catalog.mjs');
