// Zet de driehoeken die op één colormap-cel staan op het doorzichtige glasmateriaal,
// zodat je ziet wat er achter zit. De rest van het model blijft op de colormap.
//
//   node tools/glasmateriaal.mjs --cel 5,2 kits/workfiles/rpg-quaternius/potion-1-filled.glb ...
//   node tools/glasmateriaal.mjs --cel 5,2 --vak -0.9,0.9,-2,0.9,1.3,-1.05 <schip.glb>
//
// Het glas is hetzelfde materiaal als rpgtools/lantern en rpgtools/magnifying-glass
// gebruiken — wit met alpha 0.2, BLEND — de ene doorzichtige glaskleur die de
// stijlgids toestaat (bijlage A, regel M17). Het model wordt ter plekke herschreven en
// het primitief waar de cel in zit valt uiteen in twee: colormap en glas.
//
// --vak xmin,ymin,zmin,xmax,ymax,zmax beperkt de keuze tot driehoeken die daar
// helemaal in passen. Nodig zodra een cel meer draagt dan wat glas moet worden: op de
// schepen staan de ruiten en de zeilen allebei op gebroken wit.
//
// Draaien op een model dat het glasmateriaal al heeft doet niets: de cel zit dan in
// het glasprimitief en niet meer in het colormap-primitief.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';
import { herbouwGlb } from './glb-herbouw.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;
const EPS = 1e-5;

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
let cel = null, vak = null;
const bestanden = [];
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--cel') cel = argumenten[++i];
  else if (argumenten[i] === '--vak') vak = argumenten[++i].split(',').map(Number);
  else bestanden.push(argumenten[i]);
}
if (!cel || bestanden.length === 0) {
  console.error('gebruik: node tools/glasmateriaal.mjs --cel k,r [--vak x,y,z,x,y,z] <glb...>');
  process.exit(1);
}
const [celK, celR] = cel.split(',').map(Number);

// Eén primitief in, twee uit: de driehoeken waarvan alle drie de hoeken in de cel
// liggen gaan naar het glas, de rest blijft. Beide krijgen hun eigen hoekpunten,
// zodat de accessors los van elkaar staan zoals in de modellen die dit al hebben.
function splits(glb, prim) {
  const positie = readAccessor(glb, prim.attributes.POSITION);
  const normaal = readAccessor(glb, prim.attributes.NORMAL);
  const uv = readAccessor(glb, prim.attributes.TEXCOORD_0);
  const index = readAccessor(glb, prim.indices);

  const inCel = (i) => {
    const k = Math.min(Math.floor(uv.data[i * 2] * KOLOMMEN), KOLOMMEN - 1);
    const r = Math.min(Math.floor(uv.data[i * 2 + 1] * RIJEN), RIJEN - 1);
    if (k !== celK || r !== celR) return false;
    return !vak || [0, 1, 2].every((as) =>
      positie.data[i * 3 + as] >= vak[as] - EPS && positie.data[i * 3 + as] <= vak[as + 3] + EPS);
  };

  const delen = [[], []];
  for (let d = 0; d + 2 < index.count; d += 3) {
    const hoek = [index.data[d], index.data[d + 1], index.data[d + 2]];
    delen[hoek.every(inCel) ? 1 : 0].push(hoek);
  }
  if (delen[1].length === 0 || delen[0].length === 0) return null;

  return delen.map((driehoeken) => {
    const posities = [];
    const normalen = [];
    const uvs = [];
    const indices = [];
    const gezien = new Map();
    for (const hoek of driehoeken) {
      for (const i of hoek) {
        let n = gezien.get(i);
        if (n === undefined) {
          n = posities.length / 3;
          gezien.set(i, n);
          posities.push(positie.data[i * 3], positie.data[i * 3 + 1], positie.data[i * 3 + 2]);
          normalen.push(normaal.data[i * 3], normaal.data[i * 3 + 1], normaal.data[i * 3 + 2]);
          uvs.push(uv.data[i * 2], uv.data[i * 2 + 1]);
        }
        indices.push(n);
      }
    }
    return { posities, normalen, uvs, indices };
  });
}

for (const pad of bestanden) {
  const glb = readGlb(pad);
  const json = glb.json;
  if (json.materials?.some((m) => m.name === GLAS.name)) {
    console.log(`${pad}: heeft het glasmateriaal al`);
    continue;
  }

  // Nieuwe accessors worden er eerst leeg bij gezet; herbouwGlb vult ze en ruimt op
  // wat door de splitsing niet meer gebruikt wordt.
  const vervangen = new Map();
  const nieuweAccessor = (waarden, Type, type, componentType, breedte, grens) => {
    const index = json.accessors.push({ type, componentType, count: waarden.length / breedte,
      ...(grens ? { min: [], max: [] } : {}) }) - 1;
    vervangen.set(index, { waarden, breedte, Type });
    return index;
  };

  let glasTellen = 0, vastTellen = 0;
  for (const mesh of json.meshes) {
    const uit = [];
    for (const prim of mesh.primitives) {
      const stukken = splits(glb, prim);
      if (!stukken) { uit.push(prim); continue; }
      const [vast, glas] = stukken;
      vastTellen += vast.indices.length / 3;
      glasTellen += glas.indices.length / 3;
      for (const [n, deel] of stukken.entries()) {
        const kort = deel.posities.length / 3 <= 65535;
        uit.push({
          attributes: {
            // POSITION houdt min/max: sommige laders lezen de omsluitende doos daaruit.
            POSITION: nieuweAccessor(deel.posities, Float32Array, 'VEC3', 5126, 3, true),
            NORMAL: nieuweAccessor(deel.normalen, Float32Array, 'VEC3', 5126, 3),
            TEXCOORD_0: nieuweAccessor(deel.uvs, Float32Array, 'VEC2', 5126, 2),
          },
          indices: nieuweAccessor(deel.indices, kort ? Uint16Array : Uint32Array, 'SCALAR', kort ? 5123 : 5125, 1),
          material: n === 0 ? prim.material : json.materials.length,
        });
      }
    }
    mesh.primitives = uit;
  }
  if (!glasTellen) {
    console.log(`${pad}: geen driehoeken op ${cel}${vak ? ' in het vak' : ''}, of alleen maar`);
    continue;
  }
  json.materials.push(GLAS);

  const bin = herbouwGlb(glb, { vervangen });
  writeGlb(pad, json, bin, writeFileSync);
  console.log(`${pad}: ${glasTellen} driehoeken glas, ${vastTellen} op de colormap`);
}
