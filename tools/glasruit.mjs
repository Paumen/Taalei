// Zet doorzichtige ruiten vóór de driehoeken die op één colormap-cel staan: de
// gekozen driehoeken worden gekopieerd, een stukje langs hun eigen vlaknormaal naar
// buiten geschoven, en op het glasmateriaal gezet. Het origineel blijft staan.
//
//   node tools/glasruit.mjs --cel 6,0 --marge 0.06 kits/workfiles/halloween/lantern-hanging.glb
//   node tools/glasruit.mjs --cel 6,0 --marge 0.02 --staand village-kit/lamp-street.glb
//
// Waarvoor: een lantaarn heeft hier vaak wel een geel lichtlichaam binnenin, maar geen
// glas — de zijkanten van het huis staan open. Regel M17 van bijlage A vraagt om glas
// dat doorzichtig is; een ruit vóór het licht geeft dat zonder de gloed weg te nemen.
// Wie het gele licht zelf doorzichtig zou maken, haalt de lamp uit de lamp.
//
// De ruit volgt de vorm van het lichaam waar hij voor komt te staan — geen doos die op
// maat is geraden, maar dezelfde driehoeken een stukje naar buiten. --marge is die
// afstand in meters; kies hem zo dat de ruit in de opening van het frame valt en niet
// door de stijlen heen steekt, en kijk het na op een render.
//
// --staand laat alleen de opstaande vlakken meedoen: driehoeken waarvan de vlaknormaal
// meer dan --vlak (standaard 0.5) van de y-as af staat. Het dak en de bodem van een
// lantaarn zitten dicht, en een ruit daar zou alleen maar in het metaal steken.
//
// --ruiten N houdt de N grootste vlakken over. Een lichtlichaam heeft naast zijn vier
// zijden ook afgeschuinde hoeken — smalle strookjes die achter de stijlen van het frame
// zitten en geen ruit horen te krijgen. Vlakken zijn hier driehoeken die in hetzelfde
// platte vlak liggen (zelfde normaal, zelfde afstand tot de oorsprong), en de maat is
// hun oppervlak: de vier zijden van een lantaarn zijn een veelvoud van de hoekstrookjes,
// dus de grens ligt niet op een gok maar tussen twee groottes in.
//
// Draaien op een model dat het glasmateriaal al heeft doet niets.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';
import { herbouwGlb } from './glb-herbouw.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;

// Hetzelfde materiaal als glasmateriaal.mjs zet: wit met alpha 0.2, BLEND — de ene
// doorzichtige glaskleur die bijlage A toestaat.
const GLAS = {
  name: 'glas',
  pbrMetallicRoughness: {
    baseColorFactor: [1, 1, 1, 0.20000000298023224],
    metallicFactor: 0,
    roughnessFactor: 0.5,
  },
  alphaMode: 'BLEND',
  doubleSided: true,
};

const argumenten = process.argv.slice(2);
let cel = null, marge = 0.02, staand = false, vlak = 0.5, ruitenAantal = null;
const bestanden = [];
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--cel') cel = argumenten[++i];
  else if (argumenten[i] === '--marge') marge = Number(argumenten[++i]);
  else if (argumenten[i] === '--staand') staand = true;
  else if (argumenten[i] === '--vlak') vlak = Number(argumenten[++i]);
  else if (argumenten[i] === '--ruiten') ruitenAantal = Number(argumenten[++i]);
  else bestanden.push(argumenten[i]);
}
if (!cel || bestanden.length === 0 || !(marge > 0) || (ruitenAantal !== null && !(ruitenAantal > 0))) {
  console.error('gebruik: node tools/glasruit.mjs --cel k,r [--marge 0.02] [--staand [--vlak 0.5]] [--ruiten 4] <glb...>');
  process.exit(1);
}
const [celK, celR] = cel.split(',').map(Number);

function vlaknormaal(pos, h) {
  const [a, b, c] = h.map((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
  const u = b.map((v, i) => v - a[i]);
  const w = c.map((v, i) => v - a[i]);
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const lengte = Math.hypot(...n);
  return lengte === 0 ? null : n.map((v) => v / lengte);
}

function oppervlak(pos, h) {
  const [a, b, c] = h.map((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
  const u = b.map((v, i) => v - a[i]);
  const w = c.map((v, i) => v - a[i]);
  return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
}

// De ruiten van één primitief: elke gekozen driehoek krijgt zijn eigen hoekpunten, zodat
// de verschuiving per vlak klopt ook waar twee vlakken een hoekpunt delen.
function ruiten(glb, prim) {
  const pos = readAccessor(glb, prim.attributes.POSITION).data;
  const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
  const idx = readAccessor(glb, prim.indices).data;
  const inCel = (i) => Math.min(Math.floor(uv[i * 2] * KOLOMMEN), KOLOMMEN - 1) === celK
    && Math.min(Math.floor(uv[i * 2 + 1] * RIJEN), RIJEN - 1) === celR;

  const gekozen = [];
  for (let d = 0; d + 2 < idx.length; d += 3) {
    const h = [idx[d], idx[d + 1], idx[d + 2]];
    if (!h.every(inCel)) continue;
    const n = vlaknormaal(pos, h);
    if (!n) continue;
    if (staand && Math.abs(n[1]) > vlak) continue;
    gekozen.push({ h, n, opp: oppervlak(pos, h) });
  }

  // Driehoeken in hetzelfde platte vlak horen bij dezelfde ruit; de sleutel is de
  // normaal plus de afstand van dat vlak tot de oorsprong.
  if (ruitenAantal !== null) {
    const vlakken = new Map();
    for (const t of gekozen) {
      const afstand = [0, 1, 2].reduce((s, a) => s + t.n[a] * pos[t.h[0] * 3 + a], 0);
      t.vlak = `${t.n.map((v) => v.toFixed(2)).join(',')}@${afstand.toFixed(3)}`;
      vlakken.set(t.vlak, (vlakken.get(t.vlak) ?? 0) + t.opp);
    }
    const houden = new Set([...vlakken].sort((a, b) => b[1] - a[1]).slice(0, ruitenAantal).map(([v]) => v));
    for (let i = gekozen.length - 1; i >= 0; i--) if (!houden.has(gekozen[i].vlak)) gekozen.splice(i, 1);
  }

  const posities = [], normalen = [], uvs = [], indices = [];
  for (const { h, n } of gekozen) {
    for (const i of h) {
      indices.push(posities.length / 3);
      for (let a = 0; a < 3; a++) posities.push(pos[i * 3 + a] + n[a] * marge);
      normalen.push(...n);
      // De uv's gaan mee, maar het glasmateriaal heeft geen textuur; ze staan er zodat
      // het primitief dezelfde attributen heeft als de rest van het model.
      uvs.push(uv[i * 2], uv[i * 2 + 1]);
    }
  }
  return indices.length ? { posities, normalen, uvs, indices } : null;
}

for (const pad of bestanden) {
  const glb = readGlb(pad);
  const json = glb.json;
  if (json.materials?.some((m) => m.name === GLAS.name)) {
    console.log(`${pad}: heeft het glasmateriaal al`);
    continue;
  }

  const vervangen = new Map();
  const nieuweAccessor = (waarden, Type, type, componentType, breedte, grens) => {
    const index = json.accessors.push({ type, componentType, count: waarden.length / breedte,
      ...(grens ? { min: [], max: [] } : {}) }) - 1;
    vervangen.set(index, { waarden, breedte, Type });
    return index;
  };

  let tellen = 0;
  for (const mesh of json.meshes) {
    const erbij = [];
    for (const prim of mesh.primitives) {
      const ruit = ruiten(glb, prim);
      if (!ruit) continue;
      tellen += ruit.indices.length / 3;
      const kort = ruit.posities.length / 3 <= 65535;
      erbij.push({
        attributes: {
          POSITION: nieuweAccessor(ruit.posities, Float32Array, 'VEC3', 5126, 3, true),
          NORMAL: nieuweAccessor(ruit.normalen, Float32Array, 'VEC3', 5126, 3),
          TEXCOORD_0: nieuweAccessor(ruit.uvs, Float32Array, 'VEC2', 5126, 2),
        },
        indices: nieuweAccessor(ruit.indices, kort ? Uint16Array : Uint32Array, 'SCALAR', kort ? 5123 : 5125, 1),
        material: json.materials.length,
      });
    }
    mesh.primitives.push(...erbij);
  }
  if (!tellen) {
    console.log(`${pad}: geen driehoeken op ${cel}${staand ? ' die opstaan' : ''}`);
    continue;
  }
  json.materials.push(GLAS);

  const bin = herbouwGlb(glb, { vervangen });
  writeGlb(pad, json, bin, writeFileSync);
  console.log(`${pad}: ${tellen} driehoeken glas op ${marge} m voor ${cel}`);
}
