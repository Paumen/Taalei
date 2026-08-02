/**
 * Genereert kits/helden-kit/vuurtoren.glb — het eerste "held"-object.
 *
 * Draai vanuit de repo-root:  node tools/maak-vuurtoren.mjs
 *
 * Het model volgt asset_style_guide.md:
 * - alle kleuren zijn bestaande cellen uit de gedeelde colormap (zie KLEUR);
 *   de UV van elk vlak wijst naar het midden van zo'n cel;
 * - platte-stukken-bouw: de toren is een 12-zijdige veelhoek, de lantaarn en
 *   het dak zijn 8-zijdig (max 16 per volledige cirkel);
 * - basis op Y = 0, pivot in het midden van de voetafdruk (2 × 2 tegels,
 *   diameter 1,76 — de stoep aan de +Z-kant blijft binnen de tegelrand);
 * - vlakke shading: elk vlak heeft eigen vertices met de vlaknormaal, licht
 *   en schaduw komen uit de scène.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOEL = join(ROOT, 'kits', 'helden-kit', 'vuurtoren.glb');

/* -- kleuren ---------------------------------------------------------------
 * Celcoördinaten uit kits/palet.json (gedeeld palet). Elke cel is een blok
 * van 32 px breed en 128 px hoog in de 512×512-atlas; de representatieve
 * kleur ligt in het verticale midden, dus u = (kolom + ½)/16, v = (blok + ½)/4.
 */
const cel = (kolom, blok) => [(kolom + 0.5) / 16, (blok + 0.5) / 4];

const KLEUR = {
  steen:  cel(15, 3), // #6d738a — plint, stoep, omloop
  rood:   cel(7, 0),  // #e76047 — banden en dak
  wit:    cel(5, 2),  // #dcdce9 — banden
  hout:   cel(12, 0), // #995a41 — deur
  donker: cel(10, 0), // #3e3e44 — reling, lantaarnkooi, raamopeningen
  lamp:   cel(6, 0),  // #ffb349 — het licht zelf
};

/* -- geometrie-opbouw ------------------------------------------------------
 * Alles gaat door vlak(): één plat stuk per aanroep, met eigen vertices en
 * één normaal, zodat de shading per vlak hard blijft. Punten worden
 * tegen de klok in aangeleverd, gezien vanaf de zichtbare kant.
 */

const posities = [];
const normalen = [];
const uvs = [];
const indices = [];

function vlak(kleur, ...punten) {
  const [ax, ay, az] = punten[0];
  const [bx, by, bz] = punten[1];
  const [cx, cy, cz] = punten[2];
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = cx - ax, wy = cy - ay, wz = cz - az;
  let nx = uy * wz - uz * wy;
  let ny = uz * wx - ux * wz;
  let nz = ux * wy - uy * wx;
  const lengte = Math.hypot(nx, ny, nz);
  if (lengte < 1e-9) throw new Error('gedegenereerd vlak');
  nx /= lengte; ny /= lengte; nz /= lengte;

  const basis = posities.length / 3;
  for (const [x, y, z] of punten) {
    posities.push(x, y, z);
    normalen.push(nx, ny, nz);
    uvs.push(kleur[0], kleur[1]);
  }
  for (let i = 2; i < punten.length; i++) {
    indices.push(basis, basis + i - 1, basis + i);
  }
}

/** Punt op een veelhoekring: hoek 90° = +Z, zodat een vlak recht naar voren wijst. */
const op = (r, y, hoek) => [r * Math.cos(hoek), y, r * Math.sin(hoek)];

/** Hoeken van een n-zijdige ring, gedraaid zodat één vlak op +Z uitkomt. */
function hoeken(n) {
  const start = Math.PI / 2 - Math.PI / n; // vlakmidden tussen twee hoekpunten
  return Array.from({ length: n + 1 }, (_, i) => start + (i * 2 * Math.PI) / n);
}

/** Zijvlakken van een (taps toelopende) veelhoektrommel. */
function trommel(n, rOnder, yOnder, rBoven, yBoven, kleur) {
  const h = hoeken(n);
  for (let i = 0; i < n; i++) {
    vlak(kleur,
      op(rOnder, yOnder, h[i]), op(rOnder, yOnder, h[i + 1]),
      op(rBoven, yBoven, h[i + 1]), op(rBoven, yBoven, h[i]));
  }
}

/** Horizontale n-hoek (deksel of bodem). `omhoog` bepaalt de zichtbare kant. */
function schijf(n, r, y, kleur, omhoog = true) {
  const h = hoeken(n);
  const punten = h.slice(0, n).map((hoek) => op(r, y, hoek));
  if (omhoog) punten.reverse();
  vlak(kleur, ...punten);
}

/** Horizontale ring (bijv. de richel van de plint of de dakrand). */
function ringvlak(n, rBinnen, rBuiten, y, kleur, omhoog = true) {
  const h = hoeken(n);
  for (let i = 0; i < n; i++) {
    const p = [
      op(rBinnen, y, h[i]), op(rBinnen, y, h[i + 1]),
      op(rBuiten, y, h[i + 1]), op(rBuiten, y, h[i]),
    ];
    if (omhoog) p.reverse();
    vlak(kleur, ...p);
  }
}

/** Kegel van n driehoeken naar één punt. */
function kegel(n, r, yBasis, yTop, kleur) {
  const h = hoeken(n);
  for (let i = 0; i < n; i++) {
    vlak(kleur, op(r, yBasis, h[i]), op(r, yBasis, h[i + 1]), [0, yTop, 0]);
  }
}

/** Rechthoekig blok, assen-uitgelijnd; `zonder` slaat verborgen kanten over. */
function blok(x0, y0, z0, x1, y1, z1, kleur, zonder = []) {
  const kant = (naam, punten) => { if (!zonder.includes(naam)) vlak(kleur, ...punten); };
  kant('voor',   [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
  kant('achter', [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]);
  kant('links',  [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
  kant('rechts', [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]);
  kant('boven',  [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]);
  kant('onder',  [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
}

/** Vierkant paaltje op een ringpositie, gedraaid zodat het naar buiten kijkt. */
function paaltje(rMidden, halfBreedte, y0, y1, hoek, kleur) {
  const richting = [Math.cos(hoek), Math.sin(hoek)];          // radiaal
  const zijwaarts = [-Math.sin(hoek), Math.cos(hoek)];        // tangentieel
  const punt = (dr, dz, y) => [
    rMidden * richting[0] + dr * richting[0] + dz * zijwaarts[0],
    y,
    rMidden * richting[1] + dr * richting[1] + dz * zijwaarts[1],
  ];
  const b = halfBreedte;
  const hoekpunten = [[b, b], [b, -b], [-b, -b], [-b, b]]; // tegen de klok in van boven
  for (let i = 0; i < 4; i++) {
    const [dr1, dz1] = hoekpunten[i];
    const [dr2, dz2] = hoekpunten[(i + 1) % 4];
    vlak(kleur, punt(dr1, dz1, y0), punt(dr2, dz2, y0), punt(dr2, dz2, y1), punt(dr1, dz1, y1));
  }
  vlak(kleur, ...hoekpunten.map(([dr, dz]) => punt(dr, dz, y1)).reverse());
}

/* -- de vuurtoren ---------------------------------------------------------- */

// Plint: lage stenen voet met richel waar de schacht op staat.
const PLINT_R = 0.88, PLINT_H = 0.25, SCHACHT_R0 = 0.75;
schijf(12, PLINT_R, 0, KLEUR.steen, false);
trommel(12, PLINT_R, 0, PLINT_R, PLINT_H, KLEUR.steen);
ringvlak(12, SCHACHT_R0, PLINT_R, PLINT_H, KLEUR.steen);

// Schacht: vier banden rood/wit, taps van R 0,75 naar R 0,48.
const SCHACHT_TOP = 4.65;
const straal = (y) => SCHACHT_R0 - ((SCHACHT_R0 - 0.48) / (SCHACHT_TOP - PLINT_H)) * (y - PLINT_H);
const banden = [
  [PLINT_H, 1.35, KLEUR.rood],
  [1.35, 2.45, KLEUR.wit],
  [2.45, 3.55, KLEUR.rood],
  [3.55, SCHACHT_TOP, KLEUR.wit],
];
for (const [y0, y1, kleur] of banden) {
  trommel(12, straal(y0), y0, straal(y1), y1, kleur);
}

// Omloop: stenen vloer die uitsteekt, met reling van paaltjes en een leuning.
const OMLOOP_R = 0.70, OMLOOP_Y0 = SCHACHT_TOP, OMLOOP_Y1 = 4.77;
ringvlak(12, straal(SCHACHT_TOP), OMLOOP_R, OMLOOP_Y0, KLEUR.steen, false);
trommel(12, OMLOOP_R, OMLOOP_Y0, OMLOOP_R, OMLOOP_Y1, KLEUR.steen);
schijf(12, OMLOOP_R, OMLOOP_Y1, KLEUR.steen);

const RELING_R = 0.645, RELING_TOP = 5.08, LEUNING_H = 0.05;
for (const hoek of hoeken(12).slice(0, 12)) {
  paaltje(RELING_R, 0.028, OMLOOP_Y1, RELING_TOP, hoek, KLEUR.donker);
}
const LB = 0.030; // halve dikte van de leuning
trommel(12, RELING_R + LB, RELING_TOP, RELING_R + LB, RELING_TOP + LEUNING_H, KLEUR.donker);
trommel(12, RELING_R - LB, RELING_TOP + LEUNING_H, RELING_R - LB, RELING_TOP, KLEUR.donker);
ringvlak(12, RELING_R - LB, RELING_R + LB, RELING_TOP + LEUNING_H, KLEUR.donker);
ringvlak(12, RELING_R - LB, RELING_R + LB, RELING_TOP, KLEUR.donker, false);

// Lantaarn: open kooi van acht donkere stijlen met de gele lamp erin.
const KOOI_R = 0.345, KOOI_TOP = 5.38;
for (const hoek of hoeken(8).slice(0, 8)) {
  paaltje(KOOI_R, 0.026, OMLOOP_Y1, KOOI_TOP, hoek, KLEUR.donker);
}
const LAMP_R = 0.29;
schijf(8, LAMP_R, 4.85, KLEUR.lamp, false);
trommel(8, LAMP_R, 4.85, LAMP_R, 5.33, KLEUR.lamp);
schijf(8, LAMP_R, 5.33, KLEUR.lamp);

// Dak: rode kegel met overstek, en een donkere piek als bliksemafleider.
const DAK_R = 0.45;
ringvlak(8, KOOI_R - 0.026, DAK_R, KOOI_TOP, KLEUR.rood, false);
kegel(8, DAK_R, KOOI_TOP, 6.05, KLEUR.rood);
trommel(4, 0.028, 5.95, 0.028, 6.24, KLEUR.donker);
kegel(4, 0.028, 6.24, 6.34, KLEUR.donker);

// Deur aan de +Z-kant: houten paneel met afgeschuinde bovenhoeken, iets
// vóór de schacht. De achterkant verdwijnt in de muur en blijft dicht.
const DEUR = { y0: PLINT_H, y1: 0.95, half: 0.19, schuin: 0.10, voor: 0.78, achter: 0.63 };
{
  const { y0, y1, half, schuin, voor, achter } = DEUR;
  const profiel = [ // tegen de klok in, gezien vanaf +Z
    [-half, y0], [half, y0], [half, y1 - schuin],
    [half - schuin, y1], [-half + schuin, y1], [-half, y1 - schuin],
  ];
  vlak(KLEUR.hout, ...profiel.map(([x, y]) => [x, y, voor]));
  for (let i = 0; i < profiel.length; i++) {
    const [x1, y1a] = profiel[i];
    const [x2, y2a] = profiel[(i + 1) % profiel.length];
    vlak(KLEUR.hout, [x2, y2a, voor], [x1, y1a, voor], [x1, y1a, achter], [x2, y2a, achter]);
  }
}

// Stoep voor de deur: één stenen traptrede tot aan de tegelrand (z = 1,0).
blok(-0.30, 0, 0.84, 0.30, PLINT_H, 1.00, KLEUR.steen, ['achter', 'onder']);

// Ramen: donkere openingen op de +Z-kant, kleiner naarmate de toren smaller wordt.
const RAMEN = [
  { midden: 1.90, half: 0.085, hoogte: 0.26, voor: 0.660, achter: 0.50 },
  { midden: 3.00, half: 0.075, hoogte: 0.24, voor: 0.600, achter: 0.50 },
  { midden: 4.05, half: 0.065, hoogte: 0.22, voor: 0.545, achter: 0.44 },
];
for (const raam of RAMEN) {
  const y0 = raam.midden - raam.hoogte / 2, y1 = raam.midden + raam.hoogte / 2;
  blok(-raam.half, y0, raam.achter, raam.half, y1, raam.voor, KLEUR.donker, ['achter']);
}

/* -- controles uit de stijlgids ------------------------------------------- */

let minY = Infinity, maxAfstand = 0, maxHoogte = 0;
for (let i = 0; i < posities.length; i += 3) {
  minY = Math.min(minY, posities[i + 1]);
  maxHoogte = Math.max(maxHoogte, posities[i + 1]);
  maxAfstand = Math.max(maxAfstand, Math.abs(posities[i]), Math.abs(posities[i + 2]));
}
if (Math.abs(minY) > 1e-6) throw new Error(`basis niet op Y=0 (minY=${minY})`);
if (maxAfstand > 1.0 + 1e-6) throw new Error(`buiten voetafdruk 2×2 (max ${maxAfstand})`);

/* -- GLB schrijven ---------------------------------------------------------
 * Zelfde opzet als de kit-modellen: één mesh, één "colormap"-materiaal dat
 * naar Textures/colormap.png in de kitmap verwijst (de gedeelde atlas).
 */

const naar4 = (n) => (n + 3) & ~3;

function maakGlb() {
  const posBuf = Buffer.from(new Float32Array(posities).buffer);
  const norBuf = Buffer.from(new Float32Array(normalen).buffer);
  const uvBuf = Buffer.from(new Float32Array(uvs).buffer);
  const indexBuf = Buffer.from(new Uint16Array(indices).buffer);
  if (posities.length / 3 > 65535) throw new Error('te veel vertices voor uint16-indices');

  const delen = [posBuf, norBuf, uvBuf, indexBuf];
  const bufferViews = [];
  let offset = 0;
  for (const deel of delen) {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: deel.length });
    offset = naar4(offset + deel.length);
  }
  const bin = Buffer.alloc(offset);
  for (let i = 0; i < delen.length; i++) delen[i].copy(bin, bufferViews[i].byteOffset);

  const grens = (waarden, stap) => {
    const min = Array(stap).fill(Infinity), max = Array(stap).fill(-Infinity);
    for (let i = 0; i < waarden.length; i += stap) {
      for (let a = 0; a < stap; a++) {
        min[a] = Math.min(min[a], waarden[i + a]);
        max[a] = Math.max(max[a], waarden[i + a]);
      }
    }
    return { min, max };
  };
  const posGrens = grens(posities, 3);

  const json = {
    asset: {
      generator: 'tools/maak-vuurtoren.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: 1, schaal: 1, palet: 'gedeeld' } },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'vuurtoren' }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0,
      }],
      name: 'vuurtoren',
    }],
    materials: [{
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
      doubleSided: true,
      name: 'colormap',
    }],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: posities.length / 3, type: 'VEC3', ...posGrens },
      { bufferView: 1, componentType: 5126, count: normalen.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  let jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = naar4(jsonBuf.length);
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad - jsonBuf.length, 0x20)]);

  const totaal = 12 + 8 + jsonBuf.length + 8 + bin.length;
  const glb = Buffer.alloc(totaal);
  glb.writeUInt32LE(0x46546c67, 0); // 'glTF'
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totaal, 8);
  glb.writeUInt32LE(jsonBuf.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonBuf.copy(glb, 20);
  glb.writeUInt32LE(bin.length, 20 + jsonBuf.length);
  glb.writeUInt32LE(0x004e4942, 24 + jsonBuf.length); // 'BIN'
  bin.copy(glb, 28 + jsonBuf.length);
  return glb;
}

mkdirSync(dirname(DOEL), { recursive: true });
writeFileSync(DOEL, maakGlb());
console.log(
  `${DOEL} — ${posities.length / 3} vertices, ${indices.length / 3} driehoeken, ` +
  `hoogte ${maxHoogte.toFixed(2)}, halve voetafdruk ${maxAfstand.toFixed(2)}`,
);
