// Voegt twee of meer modellen samen tot één model: één mesh, één knoop, één
// oorsprong. Voor onderdelen die in de bronkit los geleverd worden maar in de
// catalogus als één ding horen te staan — een krat met zijn deksel erop, een
// grafkelder met zijn dak.
//
//   node tools/samenvoegen.mjs --uit kits/workfiles/restaurant/crate-closed.glb \
//     kits/workfiles/restaurant/crate.glb kits/workfiles/restaurant/crate-lid.glb@0,0.8,0
//
// Achter een bestand mag @x,y,z staan: waar dat model heen gaat, in de eenheden
// van het bronmodel (dezelfde waarden die je in de .obj van de bronkit leest,
// dus niet in units). Zonder @ blijft het staan waar het staat. De bronkits
// zetten elk onderdeel los op de oorsprong, dus een deksel of dak dat erbovenop
// hoort verschuif je zelf: crate is 0.8 hoog, dus het deksel gaat naar y 0.8.
//
// Alle modellen moeten dezelfde schaal en dezelfde colormap hebben — het zijn
// onderdelen uit dezelfde kit. Het resultaat wordt opgebouwd zoals een import
// het zou doen: hoekpunten samengevoegd op positie, normaal en uv, en de knoop
// gecentreerd in x/z met zijn voet op y = 0.
import { writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const afronden = (waarde, decimalen = 4) => Number(waarde.toFixed(decimalen));

const argumenten = process.argv.slice(2);
let uit = null;
let naam = null;
const bronnen = [];
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--uit') uit = argumenten[++i];
  else if (argumenten[i] === '--naam') naam = argumenten[++i];
  else {
    const [pad, verschuiving] = argumenten[i].split('@');
    const op = verschuiving ? verschuiving.split(',').map(Number) : [0, 0, 0];
    if (op.length !== 3 || op.some(Number.isNaN)) {
      throw new Error(`${argumenten[i]}: @ verwacht drie getallen, x,y,z`);
    }
    bronnen.push({ pad, op });
  }
}
if (!uit || bronnen.length < 2) {
  console.error('gebruik: node tools/samenvoegen.mjs --uit doel.glb [--naam naam] <glb[@x,y,z]> <glb[@x,y,z]> ...');
  process.exit(1);
}
naam ??= basename(uit, '.glb');

const posities = [];
const normalen = [];
const uvs = [];
const indices = [];
const gezien = new Map();

let schaal = null;
let sjabloon = null;
const bronmodellen = [];

for (const { pad, op } of bronnen) {
  const glb = readGlb(pad);
  const { json } = glb;
  const eigen = json.asset?.extras?.taaleiland;

  if (schaal === null) {
    schaal = eigen?.schaal ?? 1;
    sjabloon = json;
  } else if ((eigen?.schaal ?? 1) !== schaal) {
    throw new Error(`${pad}: schaal ${eigen?.schaal} wijkt af van ${schaal}; herschaal eerst`);
  }
  if (eigen?.bron && eigen.bron !== sjabloon.asset.extras.taaleiland.bron) {
    throw new Error(`${pad}: komt uit ${eigen.bron}, niet uit ${sjabloon.asset.extras.taaleiland.bron}`);
  }
  if (json.animations?.length) throw new Error(`${pad}: heeft animaties, die gaan bij samenvoegen verloren`);
  if (json.nodes.length !== 1) throw new Error(`${pad}: verwacht één knoop, niet ${json.nodes.length}`);
  bronmodellen.push(eigen?.bronmodel ?? basename(pad, '.glb'));

  // De knoop van een bronmodel draagt alleen de schaal en de centrering die de
  // import erop gezet heeft. De mesh staat dus nog in de eenheden van de bronkit,
  // en daarin voegen we samen — de nieuwe centrering komt onderaan.
  for (const mesh of json.meshes) {
    for (const prim of mesh.primitives) {
      const positie = readAccessor(glb, prim.attributes.POSITION);
      const normaal = readAccessor(glb, prim.attributes.NORMAL);
      const uv = readAccessor(glb, prim.attributes.TEXCOORD_0);
      const index = readAccessor(glb, prim.indices);

      for (let d = 0; d < index.count; d++) {
        const i = index.data[d];
        const hoekpunt = [
          afronden(positie.data[i * 3] + op[0], 5),
          afronden(positie.data[i * 3 + 1] + op[1], 5),
          afronden(positie.data[i * 3 + 2] + op[2], 5),
          afronden(normaal.data[i * 3], 4),
          afronden(normaal.data[i * 3 + 1], 4),
          afronden(normaal.data[i * 3 + 2], 4),
          afronden(uv.data[i * 2], 6),
          afronden(uv.data[i * 2 + 1], 6),
        ];
        const sleutel = hoekpunt.join(',');
        let nummer = gezien.get(sleutel);
        if (nummer === undefined) {
          nummer = posities.length / 3;
          gezien.set(sleutel, nummer);
          posities.push(hoekpunt[0], hoekpunt[1], hoekpunt[2]);
          normalen.push(hoekpunt[3], hoekpunt[4], hoekpunt[5]);
          uvs.push(hoekpunt[6], hoekpunt[7]);
        }
        indices.push(nummer);
      }
    }
  }
}

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < posities.length; i += 3) {
  for (let as = 0; as < 3; as++) {
    min[as] = Math.min(min[as], posities[i + as]);
    max[as] = Math.max(max[as], posities[i + as]);
  }
}

const verplaatsing = [
  afronden(-((min[0] + max[0]) / 2) * schaal),
  afronden(-min[1] * schaal),
  afronden(-((min[2] + max[2]) / 2) * schaal),
];

const posBuf = Buffer.from(new Float32Array(posities).buffer);
const normBuf = Buffer.from(new Float32Array(normalen).buffer);
const uvBuf = Buffer.from(new Float32Array(uvs).buffer);
const kort = posities.length / 3 <= 65535;
const indexBuf = Buffer.from((kort ? new Uint16Array(indices) : new Uint32Array(indices)).buffer);
const vulling = (n) => Buffer.alloc((4 - (n % 4)) % 4);
const bin = Buffer.concat([posBuf, normBuf, uvBuf, indexBuf, vulling(indexBuf.length)]);

const knoop = { name: naam, mesh: 0 };
if (schaal !== 1) knoop.scale = [schaal, schaal, schaal];
if (verplaatsing.some((waarde) => waarde !== 0)) knoop.translation = verplaatsing;

const json = {
  ...sjabloon,
  asset: {
    ...sjabloon.asset,
    generator: 'tools/samenvoegen.mjs',
    extras: {
      taaleiland: {
        ...sjabloon.asset.extras.taaleiland,
        bronmodel: bronmodellen.join(' + '),
      },
    },
  },
  nodes: [knoop],
  scene: 0,
  scenes: [{ nodes: [0] }],
  meshes: [{
    name: naam,
    primitives: [{
      attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
      indices: 3,
      material: 0,
    }],
  }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
    { buffer: 0, byteOffset: posBuf.length, byteLength: normBuf.length, target: 34962 },
    { buffer: 0, byteOffset: posBuf.length + normBuf.length, byteLength: uvBuf.length, target: 34962 },
    {
      buffer: 0,
      byteOffset: posBuf.length + normBuf.length + uvBuf.length,
      byteLength: indexBuf.length,
      target: 34963,
    },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: posities.length / 3, type: 'VEC3', min, max },
    { bufferView: 1, componentType: 5126, count: normalen.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: 'VEC2' },
    { bufferView: 3, componentType: kort ? 5123 : 5125, count: indices.length, type: 'SCALAR' },
  ],
};

mkdirSync(dirname(uit), { recursive: true });
writeGlb(uit, json, bin, writeFileSync);
console.log(
  `${uit}: ${bronnen.length} modellen → ${indices.length / 3} driehoeken, ` +
    `${posities.length / 3} hoekpunten, ` +
    [0, 1, 2].map((as) => afronden((max[as] - min[as]) * schaal, 3)).join(' × '),
);
