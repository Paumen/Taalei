// Zet de driehoeken die op één colormap-cel staan op het doorzichtige glasmateriaal,
// zodat je ziet wat er achter zit. De rest van het model blijft op de colormap.
//
//   node tools/glasmateriaal.mjs --cel 5,2 kits/workfiles/rpg-quaternius/potion-1-filled.glb ...
//
// Het glas is hetzelfde materiaal als rpgtools/lantern en rpgtools/magnifying-glass
// gebruiken — wit met alpha 0.2, BLEND — de ene doorzichtige glaskleur die de
// stijlgids toestaat (bijlage A, regel J). Het model wordt ter plekke herschreven en
// krijgt een tweede primitief met eigen accessors, net als die twee.
//
// Draaien op een model dat het glasmateriaal al heeft doet niets: de cel zit dan in
// het glasprimitief en niet meer in het colormap-primitief.
import { writeFileSync } from 'node:fs';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const KOLOMMEN = 16;
const RIJEN = 4;

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
let cel = null;
const bestanden = [];
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--cel') cel = argumenten[++i];
  else bestanden.push(argumenten[i]);
}
if (!cel || bestanden.length === 0) {
  console.error('gebruik: node tools/glasmateriaal.mjs --cel k,r <glb...>');
  process.exit(1);
}
const [celK, celR] = cel.split(',').map(Number);

// Eén primitief in, twee uit: de driehoeken waarvan alle drie de hoeken in de cel
// liggen gaan naar het glas, de rest blijft. Beide krijgen hun eigen hoekpunten,
// zodat de accessors los van elkaar staan zoals in de modellen die dit al hebben.
function splits(json, bin, prim) {
  const positie = readAccessor({ json, bin }, prim.attributes.POSITION);
  const normaal = readAccessor({ json, bin }, prim.attributes.NORMAL);
  const uv = readAccessor({ json, bin }, prim.attributes.TEXCOORD_0);
  const index = readAccessor({ json, bin }, prim.indices);

  const inCel = (i) => {
    const k = Math.min(Math.floor(uv.data[i * 2] * KOLOMMEN), KOLOMMEN - 1);
    const r = Math.min(Math.floor(uv.data[i * 2 + 1] * RIJEN), RIJEN - 1);
    return k === celK && r === celR;
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
  const { json, bin } = readGlb(pad);
  if (json.materials?.some((m) => m.name === GLAS.name)) {
    console.log(`${pad}: heeft het glasmateriaal al`);
    continue;
  }
  const prims = json.meshes.flatMap((mesh) => mesh.primitives);
  if (prims.length !== 1) throw new Error(`${pad}: verwacht één primitief, niet ${prims.length}`);

  const stukken = splits(json, bin, prims[0]);
  if (!stukken) {
    console.log(`${pad}: geen driehoeken op ${cel}, of alleen maar`);
    continue;
  }

  const buffers = [];
  const bufferViews = [];
  const accessors = [];
  const voegToe = (waarden, Type, type, componentType) => {
    const buf = Buffer.from(new Type(waarden).buffer);
    const vulling = (4 - (buf.length % 4)) % 4;
    const offset = buffers.reduce((som, b) => som + b.length, 0);
    buffers.push(buf, Buffer.alloc(vulling));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length });
    accessors.push({
      type,
      componentType,
      count: waarden.length / ({ SCALAR: 1, VEC2: 2, VEC3: 3 }[type]),
      bufferView: bufferViews.length - 1,
    });
    return accessors.length - 1;
  };

  const nieuwePrims = stukken.map(({ posities, normalen, uvs, indices }, n) => {
    const kort = posities.length / 3 <= 65535;
    return {
      attributes: {
        POSITION: voegToe(posities, Float32Array, 'VEC3', 5126),
        NORMAL: voegToe(normalen, Float32Array, 'VEC3', 5126),
        TEXCOORD_0: voegToe(uvs, Float32Array, 'VEC2', 5126),
      },
      indices: voegToe(indices, kort ? Uint16Array : Uint32Array, 'SCALAR', kort ? 5123 : 5125),
      material: n,
    };
  });

  // POSITION moet min/max houden: sommige laders lezen de omsluitende doos daaruit.
  for (const { attributes } of nieuwePrims) {
    const accessor = accessors[attributes.POSITION];
    const view = bufferViews[accessor.bufferView];
    const waarden = new Float32Array(
      Buffer.concat(buffers).buffer, view.byteOffset, view.byteLength / 4,
    );
    accessor.min = [0, 1, 2].map((as) => Math.min(...waarden.filter((_, i) => i % 3 === as)));
    accessor.max = [0, 1, 2].map((as) => Math.max(...waarden.filter((_, i) => i % 3 === as)));
  }

  const colormap = json.materials[prims[0].material];
  json.materials = [colormap, GLAS];
  json.meshes = [{ ...json.meshes[0], primitives: nieuwePrims }];
  json.accessors = accessors;
  json.bufferViews = bufferViews;
  const nieuweBin = Buffer.concat(buffers);
  json.buffers = [{ byteLength: nieuweBin.length }];

  writeGlb(pad, json, nieuweBin, writeFileSync);
  const [vast, glas] = stukken;
  console.log(`${pad}: ${glas.indices.length / 3} driehoeken glas, ${vast.indices.length / 3} op de colormap`);
}
