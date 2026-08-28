// Zet een geanimeerd model op de gedeelde colormap zonder het opnieuw op te bouwen.
//
//   node tools/importeer-geanimeerd.mjs <bronmap> <kitmap> <schaal> <bronNaam> <naam> [...]
//
// bouwGlb plet een model tot één statische primitief: geen skins, geen joints, geen
// animaties. Voor een model met een skelet kan dat niet. Dus blijft hier alles staan
// zoals de maker het achterliet — nodes, skin, inverse bind matrices, samplers — en
// worden alleen de driehoekskleuren omgezet naar een plek op de colormap.
//
// De oude buffer blijft heel en de nieuwe attributen komen erachteraan: de accessors
// van de animatie wijzen nog naar dezelfde bytes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAccessor } from '../catalog/tools/glb.mjs';
import { schrijfModel, zetColormapKlaar, groepeerOpKleur } from './importeer/bouw.mjs';
import { laadTextuur } from './importeer/palet.mjs';
import { plaatsInBaan } from './importeer/kleurkaart.mjs';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const RAND = 0.08;
const MONSTERS = [
  [1 - 2 * RAND, RAND, RAND, 0.5], [RAND, 1 - 2 * RAND, RAND, 0.5], [RAND, RAND, 1 - 2 * RAND, 0.5],
  [2 / 3, 1 / 6, 1 / 6, 1], [1 / 6, 2 / 3, 1 / 6, 1], [1 / 6, 1 / 6, 2 / 3, 1], [1 / 3, 1 / 3, 1 / 3, 1],
];

function leesBestand(pad) {
  const json = JSON.parse(readFileSync(pad, 'utf8'));
  const buffer = json.buffers?.[0];
  const bin = buffer.uri.startsWith('data:')
    ? Buffer.from(buffer.uri.slice(buffer.uri.indexOf(',') + 1), 'base64')
    : readFileSync(join(pad, '..', decodeURIComponent(buffer.uri)));
  return { json, bin };
}

// De atlas zit als bufferView in het bestand; laadTextuur leest van een pad.
function atlasPad(glb, materiaalIndex) {
  const pbr = glb.json.materials?.[materiaalIndex]?.pbrMetallicRoughness ?? {};
  const bron = glb.json.images?.[glb.json.textures?.[pbr.baseColorTexture?.index]?.source];
  if (!bron) return null;
  if (bron.uri && !bron.uri.startsWith('data:')) return bron.uri;
  const view = glb.json.bufferViews[bron.bufferView];
  const start = view.byteOffset ?? 0;
  const bytes = glb.bin.subarray(start, start + view.byteLength);
  const map = join(tmpdir(), 'taalei-texturen');
  mkdirSync(map, { recursive: true });
  const pad = join(map, `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.png`);
  if (!existsSync(pad)) writeFileSync(pad, bytes);
  return pad;
}

const [bronDir, kitDir, schaalArg, ...paren] = process.argv.slice(2);
const schaal = Number(schaalArg);
zetColormapKlaar(kitDir);

for (let p = 0; p < paren.length; p += 2) {
  const [bronNaam, naam] = [paren[p], paren[p + 1]];
  const glb = leesBestand(join(bronDir, `${bronNaam}.gltf`));
  const { json } = glb;
  const stukken = [glb.bin];
  let lengte = glb.bin.length;
  const nieuweView = (buf) => {
    while (lengte % 4) { stukken.push(Buffer.alloc(1)); lengte++; }
    const index = json.bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length }) - 1;
    stukken.push(buf); lengte += buf.length;
    return index;
  };
  const nieuweAccessor = (buf, componentType, type, count, extra = {}) =>
    json.accessors.push({ bufferView: nieuweView(buf), componentType, type, count, ...extra }) - 1;

  let driehoeken = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.indices === undefined || prim.attributes.TEXCOORD_0 === undefined) continue;
      const pad = atlasPad(glb, prim.material);
      if (!pad) continue;
      const bron = laadTextuur(pad, { vOmlaag: true });

      const idx = readAccessor(glb, prim.indices).data;
      const uv = readAccessor(glb, prim.attributes.TEXCOORD_0).data;
      const attrs = Object.fromEntries(Object.entries(prim.attributes)
        .map(([k, i]) => [k, readAccessor(glb, i)]));

      // kleur per driehoek uit de atlas
      const kleuren = [];
      for (let d = 0; d + 2 < idx.length; d += 3) {
        const hoek = [idx[d], idx[d + 1], idx[d + 2]];
        const som = [0, 0, 0]; let gewicht = 0;
        for (const [a, b, c, weeg] of MONSTERS) {
          const u = a * uv[hoek[0] * 2] + b * uv[hoek[1] * 2] + c * uv[hoek[2] * 2];
          const v = a * uv[hoek[0] * 2 + 1] + b * uv[hoek[1] * 2 + 1] + c * uv[hoek[2] * 2 + 1];
          const s = bron.monster(u, v);
          if (s[3] < 128) continue;
          for (let k = 0; k < 3; k++) som[k] += s[k] * weeg;
          gewicht += weeg;
        }
        kleuren.push(gewicht ? som.map((w) => Math.round(w / gewicht)) : [255, 255, 255]);
      }

      const banen = groepeerOpKleur(kleuren);
      const doelUv = kleuren.map((rgb) => plaatsInBaan(banen.get(rgb.join(',')), rgb).uv);

      // elke driehoek krijgt eigen hoekpunten, zodat de uv per vlak kan verschillen
      const n = (idx.length / 3 | 0) * 3;
      const uit = {};
      for (const naamAttr of Object.keys(attrs)) uit[naamAttr] = [];
      const nieuweUv = [];
      for (let d = 0; d + 2 < idx.length; d += 3) {
        for (let h = 0; h < 3; h++) {
          const v = idx[d + h];
          for (const [naamAttr, acc] of Object.entries(attrs)) {
            for (let k = 0; k < acc.width; k++) uit[naamAttr].push(acc.data[v * acc.width + k]);
          }
          nieuweUv.push(doelUv[d / 3][0], doelUv[d / 3][1]);
        }
      }
      driehoeken += n / 3;

      const SOORT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
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
  json.asset = { ...(json.asset ?? {}), version: '2.0', generator: 'tools/importeer-geanimeerd.mjs',
    extras: { taaleiland: { bron: 'Pirate Kit', bronNaam, schaal } } };

  schrijfModel(join(kitDir, `${naam}.glb`), { json, bin });
  console.log(`  ${naam.padEnd(22)} ${driehoeken} tri, ${json.animations.length} animaties, ${json.skins.length} skin`);
}
