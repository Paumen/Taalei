// Zet de losse delen van de village-kit samen tot één klaar tafereeltje: een
// geplaveid pleintje met de waterput in het midden, dat naar alle vier de kanten
// uitdooft in zand. Een samenstelling voor de catalogus, geen nieuw onderdeel —
// je zet hem in zijn geheel neer.
//
//   node tools/bouw-waterputplein.mjs [--uit kits/workfiles/village-kit/well-plaza.glb]
//
// Drie bij drie tegels om de put heen. De vier rechte overgangstegels van de
// kit (a t/m d) doven alle vier in dezelfde richting uit — langs één rand, niet
// om een hoek — dus die liggen aan de vier zijden, elk precies één keer, met de
// zandrand naar buiten. De vier hoeken krijgen de hoektegels uit
// tools/bouw-hoekovergang.mjs, die in twee richtingen tegelijk uitdoven; hun
// dichte hoek wijst naar de put. Zo dooft de bestrating rondom uit en houdt het
// plein geen vierkante kasseirand over.
//
// De put houdt zijn eigen animatie, dus die kan niet meegesmolten worden zoals
// tools/samenvoegen.mjs doet — slinger en touw draaien om hun eigen knoop. De
// put blijft daarom staan zoals hij is en de tien vlakke delen komen er als één
// mesh bij: één materiaal, één tekenopdracht extra bovenop de drie die de put
// zelf al had.
//
// De putrand ligt op een eigen tegel met een gat erin (well-base-cobblestone).
// Die tegel is even dik als de vloertegels en ligt er bovenop, niet erin: het
// bovenvlak van beide ligt anders op precies dezelfde hoogte, en dan gaan ze in
// de dieptebuffer om voorrang vechten. Bovenop gelegd is er niets meer om over
// te vechten — het ondervlak van de een valt samen met het bovenvlak van de
// ander, en van zo'n paar is er altijd maar één naar de camera gekeerd — en het
// leest als een lage stoep rond de put.
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, readAccessor } from '../catalog/tools/glb.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'kits', 'workfiles', 'village-kit');

// Alles hieronder staat in de eenheden van de bronkit, niet in units: dat zijn
// de getallen die in de kit zelf staan, en de knoop van de put schaalt ze straks
// als geheel naar units. Een tegel is 2 × 2 groot, een slab 0,2 dik.
const TEGEL = 2;
const DIKTE = 0.2;

// De put staat in het midden op (0,0); de vloertegel eronder ook, en de acht
// andere tegels liggen er een tegel vandaan. Draai is in graden om de y-as, om
// het eigen midden van de tegel. Een rechte overgangstegel dooft van huis uit
// uit naar +x en een hoektegel naar +x en +z tegelijk, dus de draai zegt welke
// kant het zand op ligt.
const PLEIN = [
  { model: 'cobblestone-floor-a', op: [0, 0], draai: 0 },
  { model: 'cobblestone-dirt-transition-a', op: [TEGEL, 0], draai: 0 },
  { model: 'cobblestone-dirt-transition-b', op: [0, TEGEL], draai: 270 },
  { model: 'cobblestone-dirt-transition-c', op: [-TEGEL, 0], draai: 180 },
  { model: 'cobblestone-dirt-transition-d', op: [0, -TEGEL], draai: 90 },
  { model: 'cobblestone-dirt-transition-corner-a', op: [TEGEL, TEGEL], draai: 0 },
  { model: 'cobblestone-dirt-transition-corner-b', op: [TEGEL, -TEGEL], draai: 90 },
  { model: 'cobblestone-dirt-transition-corner-c', op: [-TEGEL, -TEGEL], draai: 180 },
  { model: 'cobblestone-dirt-transition-corner-d', op: [-TEGEL, TEGEL], draai: 270 },
];

// De stoep rond de put, en de put zelf, gaan één slabdikte omhoog: ze staan op
// de vloertegel in plaats van erin.
const STOEP = { model: 'well-base-cobblestone', op: [0, 0], draai: 0, hoogte: DIKTE };
const PUT = 'well-a';
const OPHOGING = DIKTE;

const afronden = (waarde, decimalen = 4) => Number(waarde.toFixed(decimalen));

const argumenten = process.argv.slice(2);
let uit = join(KIT, 'well-plaza.glb');
for (let i = 0; i < argumenten.length; i++) {
  if (argumenten[i] === '--uit') uit = resolve(argumenten[++i]);
  else throw new Error(`onbekend argument ${argumenten[i]}`);
}
const naam = 'well-plaza';

const put = readGlb(join(KIT, `${PUT}.glb`));
const eigenPut = put.json.asset?.extras?.taaleiland;
const schaal = eigenPut?.schaal ?? 1;

// ── de vlakke delen tot één mesh ────────────────────────────────────────────
const posities = [], normalen = [], uvs = [], indices = [];
const gezien = new Map();
const bronmodellen = [PUT];

function leg({ model, op, draai, hoogte = 0 }) {
  const glb = readGlb(join(KIT, `${model}.glb`));
  const eigen = glb.json.asset?.extras?.taaleiland;
  if ((eigen?.schaal ?? 1) !== schaal) throw new Error(`${model}: schaal wijkt af van ${schaal}`);
  if (eigen?.bron !== eigenPut?.bron) throw new Error(`${model}: komt niet uit ${eigenPut?.bron}`);
  if (glb.json.animations?.length) throw new Error(`${model}: heeft animaties, die gaan bij samenvoegen verloren`);
  bronmodellen.push(eigen?.bronmodel ?? model);

  const hoek = (draai * Math.PI) / 180;
  const cos = Math.round(Math.cos(hoek)), sin = Math.round(Math.sin(hoek));
  const draaien = (x, z) => [x * cos + z * sin, -x * sin + z * cos];

  // Draaien gebeurt om het eigen midden van het deel, zodat een kwartslag hem
  // laat liggen waar hij ligt; de verschuiving zet dat midden daarna op zijn plek.
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const mesh of glb.json.meshes) {
    for (const prim of mesh.primitives) {
      const p = readAccessor(glb, prim.attributes.POSITION);
      for (let i = 0; i < p.data.length; i += 3) {
        x0 = Math.min(x0, p.data[i]); x1 = Math.max(x1, p.data[i]);
        z0 = Math.min(z0, p.data[i + 2]); z1 = Math.max(z1, p.data[i + 2]);
      }
    }
  }
  const midden = [(x0 + x1) / 2, (z0 + z1) / 2];
  const verschuiving = [op[0] - midden[0], op[1] - midden[1]];

  for (const mesh of glb.json.meshes) {
    for (const prim of mesh.primitives) {
      const positie = readAccessor(glb, prim.attributes.POSITION);
      const normaal = readAccessor(glb, prim.attributes.NORMAL);
      const uv = readAccessor(glb, prim.attributes.TEXCOORD_0);
      const index = readAccessor(glb, prim.indices);

      for (let d = 0; d < index.count; d++) {
        const i = index.data[d];
        const [px, pz] = draaien(positie.data[i * 3] - midden[0], positie.data[i * 3 + 2] - midden[1]);
        const [nx, nz] = draaien(normaal.data[i * 3], normaal.data[i * 3 + 2]);
        const hoekpunt = [
          afronden(px + midden[0] + verschuiving[0], 5),
          afronden(positie.data[i * 3 + 1] + hoogte, 5),
          afronden(pz + midden[1] + verschuiving[1], 5),
          afronden(nx, 4), afronden(normaal.data[i * 3 + 1], 4), afronden(nz, 4),
          afronden(uv.data[i * 2], 6), afronden(uv.data[i * 2 + 1], 6),
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

for (const deel of PLEIN) leg(deel);
leg(STOEP);

// ── de vlakke mesh achter de buffer van de put plakken ──────────────────────
const json = put.json;
const stukken = [put.bin];
let lengte = put.bin.length;
const nieuweView = (buf, target) => {
  const vul = (4 - (lengte % 4)) % 4;
  if (vul) { stukken.push(Buffer.alloc(vul, 0)); lengte += vul; }
  const v = json.bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length, target }) - 1;
  stukken.push(buf); lengte += buf.length; return v;
};
const accessorVan = (getallen, breedte, type) => {
  const kolom = (k) => Array.from({ length: getallen.length / breedte }, (_, i) => getallen[i * breedte + k]);
  return json.accessors.push({
    bufferView: nieuweView(Buffer.from(new Float32Array(getallen).buffer), 34962),
    componentType: 5126, count: getallen.length / breedte, type,
    min: Array.from({ length: breedte }, (_, k) => Math.min(...kolom(k))),
    max: Array.from({ length: breedte }, (_, k) => Math.max(...kolom(k))),
  }) - 1;
};
const kort = posities.length / 3 <= 65535;
const indexAccessor = json.accessors.push({
  bufferView: nieuweView(Buffer.from((kort ? new Uint16Array(indices) : new Uint32Array(indices)).buffer), 34963),
  componentType: kort ? 5123 : 5125, count: indices.length, type: 'SCALAR',
}) - 1;

const vlakMesh = json.meshes.push({
  name: `${naam}_bestrating`,
  primitives: [{
    attributes: {
      POSITION: accessorVan(posities, 3, 'VEC3'),
      NORMAL: accessorVan(normalen, 3, 'VEC3'),
      TEXCOORD_0: accessorVan(uvs, 2, 'VEC2'),
    },
    indices: indexAccessor,
    material: json.meshes[0].primitives[0].material,
  }],
}) - 1;

// ── de put optillen en de bestrating eronder hangen ─────────────────────────
const wortel = json.nodes.findIndex((k) => k.scale && k.children?.length);
if (wortel < 0) throw new Error(`${PUT}: geen wortelknoop met schaal gevonden`);
const putknoop = json.nodes[wortel].children[0];
json.nodes[putknoop].translation = [0, OPHOGING, 0];
const vlakKnoop = json.nodes.push({ name: `${naam}_bestrating`, mesh: vlakMesh }) - 1;
json.nodes[wortel].children = [...json.nodes[wortel].children, vlakKnoop];

// ── het geheel centreren en op de grond zetten ──────────────────────────────
// De knopen van de put dragen alleen verschuivingen, dus een bereik optellen
// langs de boom is genoeg.
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
function meet(knoop, op) {
  const k = json.nodes[knoop];
  const t = k.translation ?? [0, 0, 0];
  const hier = [op[0] + t[0], op[1] + t[1], op[2] + t[2]];
  if (k.mesh !== undefined) {
    for (const prim of json.meshes[k.mesh].primitives) {
      const p = readAccessor({ json, bin: Buffer.concat(stukken) }, prim.attributes.POSITION);
      for (let i = 0; i < p.data.length; i += 3) {
        for (let as = 0; as < 3; as++) {
          min[as] = Math.min(min[as], p.data[i + as] + hier[as]);
          max[as] = Math.max(max[as], p.data[i + as] + hier[as]);
        }
      }
    }
  }
  for (const kind of k.children ?? []) meet(kind, hier);
}
for (const kind of json.nodes[wortel].children) meet(kind, [0, 0, 0]);

json.nodes[wortel].translation = [
  afronden(-((min[0] + max[0]) / 2) * schaal),
  afronden(-min[1] * schaal),
  afronden(-((min[2] + max[2]) / 2) * schaal),
];
json.nodes[wortel].name = naam;
json.nodes[putknoop].name = naam;
for (const knoop of json.nodes) if (knoop.name?.startsWith(`${PUT}_`)) knoop.name = `${naam}_${knoop.name.slice(PUT.length + 1)}`;
for (const mesh of json.meshes) {
  if (mesh.name === PUT) mesh.name = naam;
  else if (mesh.name?.startsWith(`${PUT}_`)) mesh.name = `${naam}_${mesh.name.slice(PUT.length + 1)}`;
}
if (json.scenes) for (const scene of json.scenes) scene.name &&= naam;

json.asset = {
  ...json.asset,
  generator: 'tools/bouw-waterputplein.mjs',
  extras: { taaleiland: { ...eigenPut, bronmodel: bronmodellen.join(' + ') } },
};

const bin = Buffer.concat(stukken);
json.buffers[0].byteLength = bin.length;
writeGlb(uit, json, bin, writeFileSync);
console.log(
  `${uit}: ${PLEIN.length + 2} delen → ${indices.length / 3} driehoeken bestrating, ` +
    `${[0, 1, 2].map((as) => afronden((max[as] - min[as]) * schaal, 3)).join(' × ')}`,
);
