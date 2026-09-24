import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { writeGlb } from '../../catalog/tools/glb.mjs';
import { readPng } from '../../catalog/tools/png.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { alleBestanden, bronModellen } from '../../catalog/tools/bronmodellen.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WERK_DIR = join(ROOT, 'kits', 'workfiles');
const COLORMAP = join(ROOT, 'kits', 'colormap.png');

const KOLOMMEN = 16;
const RIJEN = 4;
const BANDEN = JSON.parse(readFileSync(join(ROOT, 'lint', 'materials.json'), 'utf8')).bands;

const LICHT = 0.15;
const SPREIDING = 0.6;

const atlassen = new Map();
function alsPng(pad) {
  if (extname(pad).toLowerCase() === '.png') return pad;
  const uit = join(tmpdir(), `taalei-${createHash('sha1').update(pad).digest('hex').slice(0, 12)}.png`);
  if (!existsSync(uit)) execFileSync('convert', [pad, uit]);
  return uit;
}

function monster(pad, u, v) {
  if (!atlassen.has(pad)) atlassen.set(pad, readPng(alsPng(pad)));
  const png = atlassen.get(pad);
  const x = Math.min(Math.max(Math.floor(u * png.width), 0), png.width - 1);
  const y = Math.min(Math.max(Math.floor(v * png.height), 0), png.height - 1);
  const i = (y * png.width + x) * 4;
  return `${png.pixels[i]},${png.pixels[i + 1]},${png.pixels[i + 2]}`;
}

function vlakNormaal(p, a, b, c) {
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

// Vertex normals averaged over the faces meeting at a position, a face joining in
// only where its normal stays within the threshold of the face being shaded.
function gladdeNormalen(posities, driehoeken, drempel) {
  const cos = Math.cos((drempel * Math.PI) / 180);
  const sleutel = (i) => [0, 1, 2].map((k) => Math.round(posities[i * 3 + k] * 1e5)).join(',');

  const opPunt = new Map();
  for (const [f, tri] of driehoeken.entries()) {
    for (const hoek of tri.hoeken) {
      const s = sleutel(hoek);
      if (opPunt.has(s)) opPunt.get(s).push(f);
      else opPunt.set(s, [f]);
    }
  }

  const normalen = driehoeken.map((tri) => {
    const n = vlakNormaal(posities, ...tri.hoeken);
    const lengte = Math.hypot(...n) || 1;
    return { n: n.map((v) => v / lengte), oppervlak: Math.hypot(...n) / 2 };
  });

  const uit = [];
  for (const [f, tri] of driehoeken.entries()) {
    const eigen = normalen[f].n;
    for (const hoek of tri.hoeken) {
      let x = 0, y = 0, z = 0;
      for (const buur of opPunt.get(sleutel(hoek))) {
        const { n, oppervlak } = normalen[buur];
        if (n[0] * eigen[0] + n[1] * eigen[1] + n[2] * eigen[2] < cos) continue;
        x += n[0] * oppervlak;
        y += n[1] * oppervlak;
        z += n[2] * oppervlak;
      }
      const lengte = Math.hypot(x, y, z) || 1;
      uit.push([x / lengte, y / lengte, z / lengte]);
    }
  }
  return uit;
}

function bandUv(band, normaalY) {
  const cel = BANDEN[band];
  if (!cel) throw new Error(`unknown band: ${band}`);
  const [kolom, rij] = cel.split(',').map(Number);
  const donker = 1 - (normaalY + 1) / 2;
  return [(kolom + 0.5) / KOLOMMEN, (rij + LICHT + SPREIDING * donker) / RIJEN];
}

function treffers(posities, driehoeken, o, d, zelf) {
  let n = 0;
  for (const [f, tri] of driehoeken.entries()) {
    if (f === zelf) continue;
    const [a, b, c] = tri.hoeken.map((i) => [posities[i * 3], posities[i * 3 + 1], posities[i * 3 + 2]]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < 0 || u + v > 1) continue;
    if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > 1e-6) n++;
  }
  return n;
}

function keerBinnenstebuiten(posities, driehoeken) {
  for (const [f, tri] of driehoeken.entries()) {
    const n = vlakNormaal(posities, ...tri.hoeken);
    const lengte = Math.hypot(...n);
    if (!lengte) continue;
    const d = n.map((v) => v / lengte);
    const o = [0, 1, 2].map((k) => tri.hoeken.reduce((som, i) => som + posities[i * 3 + k], 0) / 3);
    if (treffers(posities, driehoeken, o, d.map((v) => -v), f) > 0) continue;
    if (treffers(posities, driehoeken, o, d, f) > 0) tri.hoeken.reverse();
  }
}

function bronVanModel(bronkit, uitgepakt, model, texturen = {}) {
  const opNaam = new Map(alleBestanden(uitgepakt).map((pad) => [basename(pad).toLowerCase(), pad]));
  const gevraagd = (pad) => texturen[basename(pad)] ?? basename(pad);
  const driehoeken = [];
  const posities = [];
  const index = new Map();

  const punt = (p, i) => {
    const sleutel = [0, 1, 2].map((k) => p.posities[i * 3 + k]).join(',');
    if (index.has(sleutel)) return index.get(sleutel);
    const n = posities.length / 3;
    posities.push(p.posities[i * 3], p.posities[i * 3 + 1], p.posities[i * 3 + 2]);
    index.set(sleutel, n);
    return n;
  };

  for (const p of model.primitieven) {
    const textuur = p.materiaal.textuur
      ? opNaam.get(gevraagd(p.materiaal.textuur).toLowerCase()) ?? p.materiaal.textuur
      : null;
    for (let t = 0; t < p.indices.length; t += 3) {
      const hoeken = [0, 1, 2].map((k) => punt(p, p.indices[t + k]));
      if (p.normalen) {
        const vlak = vlakNormaal(posities, ...hoeken);
        let langs = 0;
        for (let k = 0; k < 3; k++) {
          for (let a = 0; a < 3; a++) langs += vlak[a] * p.normalen[p.indices[t + k] * 3 + a];
        }
        if (langs < 0) hoeken.reverse();
      }
      let kleur;
      if (textuur && p.uvs) {
        let u = 0, v = 0;
        for (let k = 0; k < 3; k++) {
          u += p.uvs[p.indices[t + k] * 2] / 3;
          v += p.uvs[p.indices[t + k] * 2 + 1] / 3;
        }
        kleur = monster(textuur, u, v);
      } else kleur = (p.materiaal.kleur ?? [255, 255, 255]).join(',');
      driehoeken.push({ hoeken, kleur });
    }
  }
  keerBinnenstebuiten(posities, driehoeken);
  return { posities, driehoeken };
}

function bouwGlb(naam, bron, banden, schaal, drempel, bronkitNaam, bronbestand) {
  const { posities, driehoeken } = bron;
  const normalen = gladdeNormalen(posities, driehoeken, drempel);

  const uitPositie = [];
  const uitNormaal = [];
  const uitUv = [];
  const uitIndex = [];
  const gezien = new Map();

  for (const [f, tri] of driehoeken.entries()) {
    const band = banden[tri.kleur];
    if (!band) throw new Error(`${naam}: no band for source colour ${tri.kleur}`);
    for (const [k, hoek] of tri.hoeken.entries()) {
      const n = normalen[f * 3 + k];
      const uv = bandUv(band, n[1]);
      const p = [posities[hoek * 3], posities[hoek * 3 + 1], posities[hoek * 3 + 2]];
      const sleutel = [...p, ...n.map((v) => v.toFixed(4)), ...uv.map((v) => v.toFixed(5))].join(',');
      let i = gezien.get(sleutel);
      if (i === undefined) {
        i = uitPositie.length / 3;
        gezien.set(sleutel, i);
        uitPositie.push(...p);
        uitNormaal.push(...n);
        uitUv.push(...uv);
      }
      uitIndex.push(i);
    }
  }

  const laag = [Infinity, Infinity, Infinity];
  const hoog = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < uitPositie.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      if (uitPositie[i + k] < laag[k]) laag[k] = uitPositie[i + k];
      if (uitPositie[i + k] > hoog[k]) hoog[k] = uitPositie[i + k];
    }
  }

  const positieBuf = Buffer.from(new Float32Array(uitPositie).buffer);
  const normaalBuf = Buffer.from(new Float32Array(uitNormaal).buffer);
  const uvBuf = Buffer.from(new Float32Array(uitUv).buffer);
  const groot = uitPositie.length / 3 > 65535;
  const indexBuf = Buffer.from((groot ? new Uint32Array(uitIndex) : new Uint16Array(uitIndex)).buffer);
  const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, 0)]);
  const delen = [positieBuf, normaalBuf, uvBuf, pad4(indexBuf)];

  let offset = 0;
  const bufferViews = delen.map((deel, i) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: deel.length, target: i === 3 ? 34963 : 34962 };
    offset += deel.length;
    return view;
  });

  const json = {
    asset: {
      generator: 'tools/importeer/importeer.mjs',
      version: '2.0',
      extras: {
        taaleiland: {
          versie: 1,
          schaal,
          palet: 1,
          bron: bronkitNaam,
          bronmodel: bronbestand,
          schaduw: { modus: 'glad', drempel },
        },
      },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        name: naam,
        mesh: 0,
        scale: [schaal, schaal, schaal],
        translation: [
          -((laag[0] + hoog[0]) / 2) * schaal,
          -laag[1] * schaal,
          -((laag[2] + hoog[2]) / 2) * schaal,
        ],
      },
    ],
    meshes: [
      {
        name: naam,
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }],
      },
    ],
    materials: [
      {
        name: 'colormap',
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
        doubleSided: true,
        alphaMode: 'OPAQUE',
      },
    ],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: uitPositie.length / 3, type: 'VEC3', min: laag, max: hoog },
      { bufferView: 1, componentType: 5126, count: uitNormaal.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: uitUv.length / 2, type: 'VEC2' },
      { bufferView: 3, componentType: groot ? 5125 : 5123, count: uitIndex.length, type: 'SCALAR' },
    ],
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  return { json, bin: Buffer.concat(delen) };
}

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const bronkit = BRONKITS.find((b) => b.map === config.map);
if (!bronkit) throw new Error(`${config.map}: no row in BRONKITS`);

const { uitgepakt, modellen } = bronModellen(bronkit);
const opBronnaam = new Map(modellen.map((m) => [m.naam, m]));

const doel = join(WERK_DIR, config.kit);
mkdirSync(join(doel, 'Textures'), { recursive: true });
copyFileSync(COLORMAP, join(doel, 'Textures', 'colormap.png'));
if (config.licentie && existsSync(join(ROOT, config.licentie))) {
  copyFileSync(join(ROOT, config.licentie), join(doel, 'LICENSE.txt'));
}

for (const rij of config.modellen) {
  const model = opBronnaam.get(rij.bron);
  if (!model) throw new Error(`${config.map}: no source model named ${rij.bron}`);
  const bron = bronVanModel(bronkit, uitgepakt, model, config.texturen);
  const banden = { ...(config.banden ?? {}), ...(rij.banden ?? {}) };
  const { json, bin } = bouwGlb(
    rij.naam,
    bron,
    banden,
    config.schaal,
    config.drempel,
    config.bron,
    model.bestand,
  );
  writeGlb(join(doel, `${rij.naam}.glb`), json, bin, writeFileSync);
  console.log(`${config.kit}/${rij.naam}  ${bron.driehoeken.length} tris`);
}
