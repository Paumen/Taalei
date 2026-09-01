// De kern van de geanimeerde import: een model met een skelet houdt alles wat de
// maker erin zette — nodes, skin, inverse bind matrices, samplers, animaties — en
// alleen de driehoekskleuren gaan naar een plek op de gedeelde colormap.
//
// bouwGlb plet een model tot één statische primitief. Voor een model met een skelet
// kan dat niet, dus gebeurt het hier andersom: de oude buffer blijft heel en de
// nieuwe attributen komen erachteraan, zodat de accessors van de animatie nog naar
// dezelfde bytes wijzen.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { readAccessor, readGlb } from '../../catalog/tools/glb.mjs';
import { groepeerOpKleur } from './bouw.mjs';
import { laadTextuur } from './palet.mjs';
import { plaatsInBaan } from './kleurkaart.mjs';

// Een materiaal zonder textuur draagt zijn kleur als factor; die staat lineair.
const vanLineair = (l) => {
  const v = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
};

const RAND = 0.08;
const MONSTERS = [
  [1 - 2 * RAND, RAND, RAND, 0.5], [RAND, 1 - 2 * RAND, RAND, 0.5], [RAND, RAND, 1 - 2 * RAND, 0.5],
  [2 / 3, 1 / 6, 1 / 6, 1], [1 / 6, 2 / 3, 1 / 6, 1], [1 / 6, 1 / 6, 2 / 3, 1], [1 / 3, 1 / 3, 1 / 3, 1],
];

// Leest .glb net zo goed als .gltf met een losse .bin ernaast.
export function leesBron(pad) {
  if (pad.endsWith('.glb')) return { ...readGlb(pad), basisDir: dirname(pad) };
  const json = JSON.parse(readFileSync(pad, 'utf8'));
  const buffer = json.buffers?.[0];
  const bin = buffer.uri.startsWith('data:')
    ? Buffer.from(buffer.uri.slice(buffer.uri.indexOf(',') + 1), 'base64')
    : readFileSync(join(dirname(pad), decodeURIComponent(buffer.uri)));
  return { json, bin, basisDir: dirname(pad) };
}

// De atlas zit als bufferView in het bestand; laadTextuur leest van een pad.
function atlasPad(glb, materiaalIndex, basisDir) {
  const pbr = glb.json.materials?.[materiaalIndex]?.pbrMetallicRoughness ?? {};
  const bron = glb.json.images?.[glb.json.textures?.[pbr.baseColorTexture?.index]?.source];
  if (!bron) return null;
  if (bron.uri && !bron.uri.startsWith('data:')) {
    const pad = decodeURIComponent(bron.uri);
    return isAbsolute(pad) || !basisDir ? pad : join(basisDir, pad);
  }
  const view = glb.json.bufferViews[bron.bufferView];
  const start = view.byteOffset ?? 0;
  const bytes = glb.bin.subarray(start, start + view.byteLength);
  const map = join(tmpdir(), 'taalei-texturen');
  mkdirSync(map, { recursive: true });
  const pad = join(map, `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.png`);
  if (!existsSync(pad)) writeFileSync(pad, bytes);
  return pad;
}

// Schrijfhulp: een nieuwe bufferView of accessor achteraan de bestaande buffer.
function achteraan(json, stukken) {
  let lengte = stukken.reduce((som, buf) => som + buf.length, 0);
  const nieuweView = (buf) => {
    while (lengte % 4) { stukken.push(Buffer.alloc(1)); lengte++; }
    const index = json.bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length }) - 1;
    stukken.push(buf); lengte += buf.length;
    return index;
  };
  const nieuweAccessor = (buf, componentType, type, count, extra = {}) =>
    json.accessors.push({ bufferView: nieuweView(buf), componentType, type, count, ...extra }) - 1;
  return { nieuweView, nieuweAccessor, lengte: () => lengte };
}

// De KayKit-personages komen zonder animatie: die staan in losse rig-bestanden die
// hetzelfde skelet aansturen. Een clip verhuist op naam van de node, niet op index —
// alleen zo landt hij op het bot dat de maker bedoelde. Kanalen die een node noemen
// die dit model niet heeft (de mannequin-meshes van de rig) vallen weg.
export function voegAnimatiesToe(doel, bronnen, { overslaan = [] } = {}) {
  const perNaam = new Map(doel.json.nodes.map((node, i) => [node.name, i]));
  const negeer = new Set(overslaan);
  doel.json.animations ??= [];
  const stukken = [doel.bin];
  const { nieuweAccessor } = achteraan(doel.json, stukken);
  const namen = new Set(doel.json.animations.map((a) => a.name));

  // Elk kanaal van een clip draagt zijn eigen sampler, en die samplers noemen
  // allemaal dezelfde tijdstippen: 65 botten × dezelfde reeks. Eén accessor per
  // inhoud dus — dat scheelt bij 132 clips duizenden accessors en bufferViews, en
  // die staan in de JSON en tellen dubbel zo zwaar als de bytes zelf.
  const gedeeld = new Map();
  const eenmalig = (buf, componentType, type, count, extra = {}) => {
    const sleutel = `${type}:${createHash('sha256').update(buf).digest('hex')}`;
    let index = gedeeld.get(sleutel);
    if (index === undefined) {
      index = nieuweAccessor(buf, componentType, type, count, extra);
      gedeeld.set(sleutel, index);
    }
    return index;
  };

  for (const bron of bronnen) {
    for (const animatie of bron.json.animations ?? []) {
      if (negeer.has(animatie.name) || namen.has(animatie.name)) continue;

      const samplers = [];
      const perSampler = new Map();
      const channels = [];
      for (const kanaal of animatie.channels) {
        const naam = bron.json.nodes[kanaal.target.node]?.name;
        const node = perNaam.get(naam);
        if (node === undefined) continue;

        let sampler = perSampler.get(kanaal.sampler);
        if (sampler === undefined) {
          const oud = animatie.samplers[kanaal.sampler];
          const invoer = readAccessor(bron, oud.input);
          const uitvoer = readAccessor(bron, oud.output);
          const tijden = Float32Array.from(invoer.data);
          const waarden = Float32Array.from(uitvoer.data);
          const input = eenmalig(
            Buffer.from(tijden.buffer, tijden.byteOffset, tijden.byteLength),
            5126, 'SCALAR', invoer.count,
            { min: [Math.min(...tijden)], max: [Math.max(...tijden)] },
          );
          const output = eenmalig(
            Buffer.from(waarden.buffer, waarden.byteOffset, waarden.byteLength),
            5126, uitvoer.width === 4 ? 'VEC4' : 'VEC3', uitvoer.count,
          );
          sampler = samplers.push({ input, output, interpolation: oud.interpolation ?? 'LINEAR' }) - 1;
          perSampler.set(kanaal.sampler, sampler);
        }
        channels.push({ sampler, target: { node, path: kanaal.target.path } });
      }

      if (!channels.length) continue;
      doel.json.animations.push({ name: animatie.name, samplers, channels });
      namen.add(animatie.name);
    }
  }

  const bin = Buffer.concat(stukken);
  doel.json.buffers = [{ byteLength: bin.length }];
  return { ...doel, bin };
}

// Zet de driehoekskleuren van een geanimeerd model op de gedeelde colormap. Het
// model zelf — skin, skelet, animaties — blijft staan zoals het was.
export function herkleurGeanimeerd(glb, { naam, schaal, bron, bronNaam, generator, basisDir }) {
  const { json } = glb;
  const stukken = [glb.bin];
  const { nieuweAccessor } = achteraan(json, stukken);

  let driehoeken = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.indices === undefined) continue;
      const pad = atlasPad(glb, prim.material, basisDir ?? glb.basisDir);
      const uv = prim.attributes.TEXCOORD_0 !== undefined
        ? readAccessor(glb, prim.attributes.TEXCOORD_0).data : null;
      const idx = readAccessor(glb, prim.indices).data;
      const attrs = Object.fromEntries(Object.entries(prim.attributes)
        .map(([k, i]) => [k, readAccessor(glb, i)]));

      // Kleur per driehoek. Met een atlas komt die uit de textuur, anders is het de
      // vlakke kleur van het materiaal — dan heeft elk vlak van de primitief dezelfde.
      const kleuren = [];
      if (pad && uv) {
        const bronTextuur = laadTextuur(pad, { vOmlaag: true });
        for (let d = 0; d + 2 < idx.length; d += 3) {
          const hoek = [idx[d], idx[d + 1], idx[d + 2]];
          const som = [0, 0, 0]; let gewicht = 0;
          for (const [a, b, c, weeg] of MONSTERS) {
            const u = a * uv[hoek[0] * 2] + b * uv[hoek[1] * 2] + c * uv[hoek[2] * 2];
            const v = a * uv[hoek[0] * 2 + 1] + b * uv[hoek[1] * 2 + 1] + c * uv[hoek[2] * 2 + 1];
            const s = bronTextuur.monster(u, v);
            if (s[3] < 128) continue;
            for (let k = 0; k < 3; k++) som[k] += s[k] * weeg;
            gewicht += weeg;
          }
          kleuren.push(gewicht ? som.map((w) => Math.round(w / gewicht)) : [255, 255, 255]);
        }
      } else {
        const factor = json.materials?.[prim.material]?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
        const vast = factor.slice(0, 3).map(vanLineair);
        for (let d = 0; d + 2 < idx.length; d += 3) kleuren.push(vast);
      }

      const banen = groepeerOpKleur(kleuren);
      const doelUv = kleuren.map((rgb) => plaatsInBaan(banen.get(rgb.join(',')), rgb).uv);

      // elke driehoek krijgt eigen hoekpunten, zodat de uv per vlak kan verschillen
      const n = (idx.length / 3 | 0) * 3;
      const uit = {};
      for (const naamAttr of Object.keys(attrs)) uit[naamAttr] = [];
      delete uit.TEXCOORD_0;
      const nieuweUv = [];
      for (let d = 0; d + 2 < idx.length; d += 3) {
        for (let h = 0; h < 3; h++) {
          const v = idx[d + h];
          for (const [naamAttr, acc] of Object.entries(attrs)) {
            if (naamAttr === 'TEXCOORD_0') continue;
            for (let k = 0; k < acc.width; k++) uit[naamAttr].push(acc.data[v * acc.width + k]);
          }
          nieuweUv.push(doelUv[d / 3][0], doelUv[d / 3][1]);
        }
      }
      driehoeken += n / 3;

      for (const [naamAttr, acc] of Object.entries(attrs)) {
        if (naamAttr === 'TEXCOORD_0') continue;
        const oud = json.accessors[prim.attributes[naamAttr]];
        const type = oud.type, ct = oud.componentType;
        const Soort = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[ct];
        const arr = Soort.from(uit[naamAttr]);
        const extra = {};
        if (naamAttr === 'POSITION') {
          const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
          for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], arr[i + k]); hi[k] = Math.max(hi[k], arr[i + k]); }
          extra.min = lo; extra.max = hi;
        }
        if (oud.normalized) extra.normalized = true;
        prim.attributes[naamAttr] = nieuweAccessor(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), ct, type, n, extra);
      }
      const uvArr = Float32Array.from(nieuweUv);
      prim.attributes.TEXCOORD_0 = nieuweAccessor(Buffer.from(uvArr.buffer, uvArr.byteOffset, uvArr.byteLength), 5126, 'VEC2', n);
      const idxArr = Uint32Array.from({ length: n }, (_, i) => i);
      prim.indices = nieuweAccessor(Buffer.from(idxArr.buffer, idxArr.byteOffset, idxArr.byteLength), 5125, 'SCALAR', n);
      prim.material = 0;
    }
  }

  // één materiaal, de gedeelde colormap
  json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true, alphaMode: 'OPAQUE', name: 'colormap' }];
  json.textures = [{ sampler: 0, source: 0, name: 'colormap' }];
  json.samplers = [{ minFilter: 9987 }];
  json.images = [{ uri: 'Textures/colormap.png', name: 'colormap' }];

  // schaal op een nieuwe wortel: bij een skin telt de node van de mesh zelf niet mee
  const scene = json.scenes[json.scene ?? 0];
  const wortel = json.nodes.push({ name: naam, children: [...scene.nodes], scale: [schaal, schaal, schaal] }) - 1;
  scene.nodes = [wortel];

  const bin = Buffer.concat(stukken);
  json.buffers = [{ byteLength: bin.length }];
  json.asset = {
    ...(json.asset ?? {}), version: '2.0', generator,
    extras: { taaleiland: { bron, bronNaam, schaal } },
  };

  return { json, bin, driehoeken };
}
