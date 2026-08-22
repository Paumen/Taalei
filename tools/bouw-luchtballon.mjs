
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(ROOT, 'kits', 'workfiles', 'taalei-kit');

const BANEN = 16;
const BANDEN = 12;
const RING_ZIJDEN = 8;

const cel = (kolom, rij) => [kolom * 32 + 16, rij * 128 + 64];
const WIT = cel(5, 2);
const TERRACOTTA = cel(5, 0);
const STAAL = cel(15, 3);
const INKT = cel(10, 0);
const AMBER = cel(6, 0);
const ZAND = cel(5, 3);
const RIET = cel(13, 0);

const VLECHT_LICHT = -14;
const VLECHT_DONKER = 16;
const BESLAG = 0;
const uv = ([x, y], dv = 0) => [(x + 0.5) / 512, (y + dv + 0.5) / 512];

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const punt = (r, y, hoek) => [r * Math.cos(hoek), y, r * Math.sin(hoek)];

function maakModel() {
  const posities = [], normalen = [], uvs = [];

  function driehoek(A, B, C, celUv) {
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const lengte = Math.hypot(...n) || 1;
    for (const p of [A, B, C]) {
      posities.push(...p);
      normalen.push(n[0] / lengte, n[1] / lengte, n[2] / lengte);
      uvs.push(...celUv);
    }
  }

  const vlak = (A, B, C, D, celUv) => { driehoek(A, B, C, celUv); driehoek(A, C, D, celUv); };

  return { driehoek, vlak, posities, normalen, uvs };
}

function blok(m, [x0, y0, z0], [x1, y1, z1], kleurCel, dv = 0, { onder = true, boven = true } = {}) {
  const c = uv(kleurCel, dv);
  m.vlak([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], c);
  m.vlak([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], c);
  m.vlak([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c);
  m.vlak([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], c);
  if (boven) m.vlak([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], c);
  if (onder) m.vlak([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], c);
}

function staaf(m, P0, P1, dikte, kleurCel, dv = 0, zijden = 3) {
  const straal = zijden % 2
    ? dikte / (1 + Math.cos(Math.PI / zijden))
    : dikte / (2 * Math.cos(Math.PI / zijden));
  const d = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]];
  const dl = Math.hypot(...d) || 1;
  const richting = d.map((c) => c / dl);
  let u = [richting[1], -richting[0], 0];
  const ul = Math.hypot(...u) || 1;
  u = u.map((c) => c / ul);
  const v = [
    richting[1] * u[2] - richting[2] * u[1],
    richting[2] * u[0] - richting[0] * u[2],
    richting[0] * u[1] - richting[1] * u[0],
  ];
  const rib = (P, a) => [
    P[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * straal,
    P[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * straal,
    P[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * straal,
  ];
  for (let z = 0; z < zijden; z++) {
    const a0 = (z / zijden) * Math.PI * 2;
    const a1 = ((z + 1) / zijden) * Math.PI * 2;
    m.vlak(rib(P0, a0), rib(P0, a1), rib(P1, a1), rib(P1, a0), uv(kleurCel, dv));
  }
}

const RMAX = 1.888;
const HOOGTE = 4.5;
const HALS = 0.3;
const KROON = 0.2;
const T_MAX = 0.624;
const P_ONDER = 0.85;

const KRUIN = [
  [0, 1], [0.269, 0.967], [0.491, 0.865], [0.690, 0.687],
  [0.853, 0.438], [0.958, 0.154], [1, 0],
];

function kruinStraal(u) {
  for (let i = 0; i < KRUIN.length - 1; i++) {
    const [u0, r0] = KRUIN[i], [u1, r1] = KRUIN[i + 1];
    if (u <= u1) return r0 + (r1 - r0) * ((u - u0) / (u1 - u0));
  }
  return 0;
}

function opCurve(t) {
  let r;
  if (t <= T_MAX) {
    const v = t / T_MAX;
    r = HALS + (RMAX - HALS) * Math.pow(Math.sin((Math.PI / 2) * v), P_ONDER);
  } else {
    const u = (t - T_MAX) / (1 - T_MAX);
    r = KROON + (RMAX - KROON) * kruinStraal(u);
  }
  return [r, t * HOOGTE];
}

function profiel() {
  const FIJN = 600;
  const punten = [];
  const lengtes = [0];
  for (let i = 0; i <= FIJN; i++) {
    const p = opCurve(i / FIJN);
    punten.push(p);
    if (i > 0) {
      const q = punten[i - 1];
      lengtes.push(lengtes[i - 1] + Math.hypot(p[0] - q[0], p[1] - q[1]));
    }
  }
  const totaal = lengtes[FIJN];

  const p = [];
  let j = 0;
  for (let i = 0; i <= BANDEN; i++) {
    const doel = (i / BANDEN) * totaal;
    while (j < FIJN && lengtes[j + 1] < doel) j++;
    const span = lengtes[j + 1] - lengtes[j] || 1;
    const f = Math.min(Math.max((doel - lengtes[j]) / span, 0), 1);
    const A = punten[j], B = punten[Math.min(j + 1, FIJN)];
    p.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f]);
  }
  p[0] = [HALS, 0];
  p[p.length - 1] = [KROON, HOOGTE];
  return p;
}
const PROFIEL = profiel();

function baanKleur(band, baan) {
  if (band === 0) return STAAL;
  if (band === BANDEN - 1) return TERRACOTTA;
  const k = baan % 4;
  return k === 1 ? TERRACOTTA : k === 3 ? STAAL : WIT;
}

function envelop(m, prof, yHals) {
  for (let band = 0; band < prof.length - 1; band++) {
    const [r0, y0] = prof[band];
    const [r1, y1] = prof[band + 1];
    for (let baan = 0; baan < BANEN; baan++) {
      const a0 = (baan / BANEN) * Math.PI * 2;
      const a1 = ((baan + 1) / BANEN) * Math.PI * 2;
      const kleur = baanKleur(band, baan);
      const dv = kleur === WIT
        ? -Math.round(hash2(baan * 3 + 2, 7) * 8)
        : Math.round((hash2(baan * 3 + 2, 3) - 0.5) * 10);
      const celUv = uv(kleur, dv);
      m.driehoek(punt(r0, yHals + y0, a0), punt(r1, yHals + y1, a1), punt(r0, yHals + y0, a1), celUv);
      m.driehoek(punt(r0, yHals + y0, a0), punt(r1, yHals + y1, a0), punt(r1, yHals + y1, a1), celUv);
    }
  }

  const top = yHals + prof[prof.length - 1][1];
  for (let baan = 0; baan < BANEN; baan++) {
    const a0 = (baan / BANEN) * Math.PI * 2;
    const a1 = ((baan + 1) / BANEN) * Math.PI * 2;
    m.driehoek(punt(KROON, top, a0), punt(KROON, top + 0.06, a1), punt(KROON, top, a1), uv(TERRACOTTA, 10));
    m.driehoek(punt(KROON, top, a0), punt(KROON, top + 0.06, a0), punt(KROON, top + 0.06, a1), uv(TERRACOTTA, 10));
    m.driehoek([0, top + 0.06, 0], punt(KROON, top + 0.06, a0), punt(KROON, top + 0.06, a1), uv(TERRACOTTA, -6));
  }

  for (let baan = 0; baan < BANEN; baan++) {
    const a0 = (baan / BANEN) * Math.PI * 2;
    const a1 = ((baan + 1) / BANEN) * Math.PI * 2;
    m.driehoek(punt(HALS, yHals, a0), punt(HALS * 0.45, yHals + 0.16, a1), punt(HALS, yHals, a1), uv(STAAL, 18));
    m.driehoek(punt(HALS, yHals, a0), punt(HALS * 0.45, yHals + 0.16, a0), punt(HALS * 0.45, yHals + 0.16, a1), uv(STAAL, 18));
    m.driehoek([0, yHals + 0.16, 0], punt(HALS * 0.45, yHals + 0.16, a1), punt(HALS * 0.45, yHals + 0.16, a0), uv(STAAL, 26));
  }
}

function tuig(m, { ringR, ringOnder, ringBoven, yHals }) {
  const rIn = ringR * 0.72;
  const RING = [
    [ringR, ringOnder], [ringR, ringBoven], [rIn, ringBoven], [rIn, ringOnder], [ringR, ringOnder],
  ];
  for (let s = 0; s < RING.length - 1; s++) {
    const [r0, y0] = RING[s], [r1, y1] = RING[s + 1];
    for (let k = 0; k < RING_ZIJDEN; k++) {
      const a0 = ((k + 0.5) / RING_ZIJDEN) * Math.PI * 2;
      const a1 = ((k + 1.5) / RING_ZIJDEN) * Math.PI * 2;
      m.driehoek(punt(r0, y0, a0), punt(r1, y1, a1), punt(r0, y0, a1), uv(INKT));
      m.driehoek(punt(r0, y0, a0), punt(r1, y1, a0), punt(r1, y1, a1), uv(INKT));
    }
  }

  const bHalf = ringR * 0.32;
  const bOnder = ringOnder - 0.01;
  const bBoven = ringBoven + 0.05;
  blok(m, [-bHalf, bOnder, -bHalf], [bHalf, bBoven, bHalf], STAAL, 16);
  const keelR = bHalf * 0.85;
  const keelNaad = bBoven + 0.062;
  const keelTop = bBoven + 0.09;
  for (let k = 0; k < RING_ZIJDEN; k++) {
    const a0 = (k / RING_ZIJDEN) * Math.PI * 2;
    const a1 = ((k + 1) / RING_ZIJDEN) * Math.PI * 2;
    m.vlak(punt(keelR, bBoven, a0), punt(keelR, keelNaad, a0), punt(keelR, keelNaad, a1), punt(keelR, bBoven, a1), uv(STAAL, -8));
    m.vlak(punt(keelR, keelNaad, a0), punt(keelR, keelTop, a0), punt(keelR, keelTop, a1), punt(keelR, keelNaad, a1), uv(AMBER, 24));
    m.driehoek([0, keelTop, 0], punt(keelR * 0.94, keelTop, a1), punt(keelR * 0.94, keelTop, a0), uv(AMBER, -20));
  }

  const TOUW_DEEL = 3;
  const BOCHT = 0.022;
  for (let baan = 0; baan < BANEN; baan++) {
    const hoek = (baan / BANEN) * Math.PI * 2;
    const [r0, y0] = [ringR * 0.99, ringBoven - 0.015];
    const [r1, y1] = [HALS * 0.97, yHals + 0.03];
    const opTouw = (t) => punt(
      r0 + (r1 - r0) * t + BOCHT * Math.sin(Math.PI * t),
      y0 + (y1 - y0) * t,
      hoek,
    );
    for (let d = 0; d < TOUW_DEEL; d++) {
      staaf(m, opTouw(d / TOUW_DEEL), opTouw((d + 1) / TOUW_DEEL), 0.015, WIT, 10 + d * 14);
    }
  }
}

const veelhoek = (zijden, draai = 0) =>
  Array.from({ length: zijden }, (_, i) => {
    const a = ((i + draai) / zijden) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  });

function afgeknotVierkant(snee) {
  const k = 1 - snee;
  return [[1, k], [k, 1], [-k, 1], [-1, k], [-1, -k], [-k, -1], [k, -1], [1, -k]];
}

function schil(m, grond, y0, s0, y1, s1, kleur, binnen = false) {
  for (let i = 0; i < grond.length; i++) {
    const a = grond[i], b = grond[(i + 1) % grond.length];
    const A0 = [a[0] * s0, y0, a[1] * s0], B0 = [b[0] * s0, y0, b[1] * s0];
    const A1 = [a[0] * s1, y1, a[1] * s1], B1 = [b[0] * s1, y1, b[1] * s1];
    const c = typeof kleur === 'function' ? kleur(i) : kleur;
    if (binnen) m.vlak(A0, B0, B1, A1, c); else m.vlak(A0, A1, B1, B0, c);
  }
}

function krans(m, grond, y, sBuiten, sBinnen, celUv, omhoog = true) {
  for (let i = 0; i < grond.length; i++) {
    const a = grond[i], b = grond[(i + 1) % grond.length];
    const A = [a[0] * sBuiten, y, a[1] * sBuiten];
    const B = [b[0] * sBuiten, y, b[1] * sBuiten];
    const C = [b[0] * sBinnen, y, b[1] * sBinnen];
    const D = [a[0] * sBinnen, y, a[1] * sBinnen];
    if (omhoog) m.vlak(A, D, C, B, celUv); else m.vlak(A, B, C, D, celUv);
  }
}

function deksel(m, grond, y, s, celUv, omhoog = true) {
  for (let i = 0; i < grond.length; i++) {
    const a = grond[i], b = grond[(i + 1) % grond.length];
    const A = [a[0] * s, y, a[1] * s], B = [b[0] * s, y, b[1] * s];
    if (omhoog) m.driehoek([0, y, 0], B, A, celUv); else m.driehoek([0, y, 0], A, B, celUv);
  }
}

const schommel = (i, zaad, sterkte) => Math.round((hash2(i * 5 + zaad, zaad) - 0.5) * sterkte);

const MAND_LUCHT = 0.20;

function ophanging(m, { r, randHoogte, ringOnder, dikte, kleurCel, dv, zijden, voet: hoogte = -0.06 }) {
  for (let k = 0; k < 4; k++) {
    const hoek = (k / 4 + 1 / 8) * Math.PI * 2;
    const voet = punt(r, randHoogte + hoogte, hoek);
    const kop = punt(RING_R * 0.9, ringOnder + 0.02, hoek);
    staaf(m, voet, kop, dikte, kleurCel, dv, zijden);
  }
}

function mandRond(m) {
  const grond = veelhoek(12, 0.5);
  const LAGEN = [[0.05, 0.30], [0.17, 0.325], [0.29, 0.35], [0.41, 0.365]];
  const RAND = 0.48;

  deksel(m, grond, 0, 0.30, uv(RIET, BESLAG + 10), false);
  schil(m, grond, 0, 0.30, 0.05, 0.30, uv(RIET, BESLAG));
  for (let laag = 0; laag < LAGEN.length - 1; laag++) {
    const [y0, s0] = LAGEN[laag], [y1, s1] = LAGEN[laag + 1];
    const basis = laag % 2 ? VLECHT_DONKER : VLECHT_LICHT;
    schil(m, grond, y0, s0, y1, s1, (i) => uv(ZAND, basis + schommel(i, laag + 1, 14)));
    schil(m, grond, y0, s0 - 0.045, y1, s1 - 0.045, uv(ZAND, 26), true);
  }
  deksel(m, grond, 0.05, 0.30, uv(RIET, BESLAG + 8));
  schil(m, grond, 0.41, 0.385, RAND, 0.385, uv(RIET, BESLAG));
  krans(m, grond, RAND, 0.385, 0.315, uv(RIET, BESLAG));
  schil(m, grond, 0.41, 0.315, RAND, 0.315, uv(RIET, BESLAG + 8), true);
  krans(m, grond, 0.41, 0.385, 0.365, uv(RIET, BESLAG + 12), false);
  return RAND;
}

function mandVierkantRiet(m) {
  const grond = afgeknotVierkant(0.24);
  const SLOF = 0.055;
  const LAGEN = [[SLOF, 0.33], [0.19, 0.345], [0.33, 0.355], [0.44, 0.36]];
  const RAND = 0.52;
  const isHoek = (i) => i % 2 === 0;

  deksel(m, grond, SLOF, 0.315, uv(RIET, BESLAG + 10), false);
  for (let laag = 0; laag < LAGEN.length - 1; laag++) {
    const [y0, s0] = LAGEN[laag], [y1, s1] = LAGEN[laag + 1];
    const basis = laag % 2 ? VLECHT_DONKER : VLECHT_LICHT;
    schil(m, grond, y0, s0, y1, s1, (i) => (isHoek(i)
      ? uv(RIET, BESLAG)
      : uv(ZAND, basis + schommel(i, laag + 2, 12))));
    schil(m, grond, y0, s0 - 0.04, y1, s1 - 0.04, uv(ZAND, 28), true);
  }
  deksel(m, grond, SLOF, 0.315, uv(RIET, BESLAG + 8));
  schil(m, grond, 0.44, 0.385, RAND, 0.385, uv(RIET, BESLAG));
  krans(m, grond, RAND, 0.385, 0.30, uv(RIET, BESLAG));
  schil(m, grond, 0.44, 0.30, RAND, 0.30, uv(RIET, BESLAG + 8), true);
  krans(m, grond, 0.44, 0.385, 0.35, uv(RIET, BESLAG + 12), false);
  for (const z of [-0.225, 0.225]) {
    blok(m, [-0.26, 0, z - 0.028], [0.26, SLOF, z + 0.028], RIET, BESLAG + 6, { boven: false });
  }
  return RAND;
}

function schrijfGlb(naam, m) {
  const buffers = [];
  let bytes = 0;
  const bufferViews = [];
  const accessors = [];

  function accessor(data, type, componentType, { minMax = false, target } = {}) {
    const componenten = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const view = { buffer: 0, byteOffset: bytes, byteLength: buf.length };
    if (target) view.target = target;
    buffers.push(buf);
    bytes += buf.length;
    if (bytes % 4) {
      const rest = 4 - (bytes % 4);
      buffers.push(Buffer.alloc(rest));
      bytes += rest;
    }
    bufferViews.push(view);
    const acc = {
      bufferView: bufferViews.length - 1,
      componentType,
      count: data.length / componenten,
      type,
    };
    if (minMax) {
      const min = Array(componenten).fill(Infinity);
      const max = Array(componenten).fill(-Infinity);
      for (let i = 0; i < data.length; i += componenten) {
        for (let c = 0; c < componenten; c++) {
          min[c] = Math.min(min[c], data[i + c]);
          max[c] = Math.max(max[c], data[i + c]);
        }
      }
      acc.min = min;
      acc.max = max;
    }
    accessors.push(acc);
    return accessors.length - 1;
  }

  const ARRAY_BUFFER = 34962;
  const ELEMENT_ARRAY_BUFFER = 34963;
  const aantal = m.posities.length / 3;
  const primitives = [{
    attributes: {
      POSITION: accessor(Float32Array.from(m.posities), 'VEC3', 5126, { minMax: true, target: ARRAY_BUFFER }),
      NORMAL: accessor(Float32Array.from(m.normalen), 'VEC3', 5126, { target: ARRAY_BUFFER }),
      TEXCOORD_0: accessor(Float32Array.from(m.uvs), 'VEC2', 5126, { target: ARRAY_BUFFER }),
    },
    indices: accessor(Uint16Array.from({ length: aantal }, (_, i) => i), 'SCALAR', 5123, { target: ELEMENT_ARRAY_BUFFER }),
    material: 0,
  }];

  const gltf = {
    asset: {
      generator: 'taaleiland/bouw-luchtballon.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: 1, bron: 'procedureel', palet: 1 } },
    },
    scene: 0,
    scenes: [{ nodes: [0], name: naam }],
    nodes: [{ mesh: 0, name: naam }],
    meshes: [{ name: naam, primitives }],
    materials: [
      {
        name: 'colormap',
        doubleSided: true,
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
      },
    ],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    images: [{ name: 'colormap', uri: 'Textures/colormap.png' }],
    samplers: [{ magFilter: 9728, minFilter: 9728 }],
    bufferViews,
    accessors,
    buffers: [{ byteLength: bytes }],
  };

  const jsonChunk = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (jsonChunk.length % 4)) % 4;
  const binChunk = Buffer.concat(buffers);
  const totaal = 12 + 8 + jsonChunk.length + jsonPad + 8 + binChunk.length;

  const glb = Buffer.alloc(totaal);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totaal, 8);
  glb.writeUInt32LE(jsonChunk.length + jsonPad, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  glb.fill(0x20, 20 + jsonChunk.length, 20 + jsonChunk.length + jsonPad);
  let off = 20 + jsonChunk.length + jsonPad;
  glb.writeUInt32LE(binChunk.length, off);
  glb.writeUInt32LE(0x004e4942, off + 4);
  binChunk.copy(glb, off + 8);

  writeFileSync(join(KIT, `${naam}.glb`), glb);
  console.log(`${naam}: ${aantal / 3} driehoeken, ${glb.length} bytes`);
}

function controleerEnvelop(m, vanaf = 0) {
  let som = 0;
  for (let i = vanaf; i < vanaf + BANEN * BANDEN * 6; i++) {
    const [x, z] = [m.posities[i * 3], m.posities[i * 3 + 2]];
    const lengte = Math.hypot(x, z) || 1;
    som += (m.normalen[i * 3] * x + m.normalen[i * 3 + 2] * z) / lengte;
  }
  if (som <= 0) throw new Error('envelop staat binnenstebuiten');
}

const RING_R = 0.22;
const RING_H = 0.05;
const RING_ONDER = 0.01;
const TUIG = 0.36;

const VARIANTEN = [
  { naam: 'balloon' },
  { naam: 'balloon-basket-round', mand: mandRond, ophangen: { r: 0.31, dikte: 0.030, kleurCel: RIET, dv: BESLAG, zijden: 4 } },
  { naam: 'balloon-basket-square', mand: mandVierkantRiet, ophangen: { r: 0.34, dikte: 0.032, kleurCel: RIET, dv: BESLAG, zijden: 4 } },
];

for (const variant of VARIANTEN) {
  const m = maakModel();
  const randHoogte = variant.mand ? variant.mand(m) : 0;
  const ringOnder = variant.mand ? randHoogte + (variant.lucht ?? MAND_LUCHT) : RING_ONDER;
  const yHals = ringOnder + RING_H + TUIG;
  tuig(m, { ringR: RING_R, ringOnder, ringBoven: ringOnder + RING_H, yHals });
  if (variant.mand) ophanging(m, { ...variant.ophangen, randHoogte, ringOnder });
  const vanaf = m.posities.length / 3;
  envelop(m, PROFIEL, yHals);
  controleerEnvelop(m, vanaf);
  schrijfGlb(variant.naam, m);
}

console.log(
  `verhoudingen: envelop ${(RMAX * 2).toFixed(2)} breed, ` +
  `hals ${(HALS * 2).toFixed(2)} (1:${(RMAX / HALS).toFixed(1)}), ` +
  `ring ${(RING_R * 2).toFixed(2)} (1:${(RMAX / RING_R).toFixed(1)})`,
);
