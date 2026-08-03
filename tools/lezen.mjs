/**
 * Inlezen van .glb- en .png-bestanden, zo klein als het mag.
 *
 * De kits zijn allemaal glTF 2.0 in één binair bestand, met per model een
 * handvol meshes en losse accessors voor positie, normaal en uv. Meer dan dat
 * hoeft hier niet gelezen te worden: geen animaties, geen skinning, geen
 * gecomprimeerde buffers. Wordt dat ooit wel nodig, dan hoort daar een echte
 * loader bij en niet een uitbreiding van dit bestand.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

/* -- glb ------------------------------------------------------------------ */

const COMPONENTEN = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const LEZERS = {
  5120: ['getInt8', 1], 5121: ['getUint8', 1], 5122: ['getInt16', 2],
  5123: ['getUint16', 2], 5125: ['getUint32', 4], 5126: ['getFloat32', 4],
};

function splitsGlb(pad) {
  const buf = readFileSync(pad);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error(`geen geldige GLB: ${pad}`);
  }
  const eind = buf.readUInt32LE(8);
  let off = 12;
  let json = null;
  let bin = null;
  while (off + 8 <= eind && off + 8 <= buf.length) {
    const lengte = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + lengte);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = Buffer.from(data);
    off += 8 + lengte;
  }
  if (!json) throw new Error(`geen JSON-chunk: ${pad}`);
  return { json, bin };
}

function leesAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const componenten = COMPONENTEN[acc.type];
  const [lezer, breedte] = LEZERS[acc.componentType];
  const uit = new Float64Array(acc.count * componenten);
  if (acc.bufferView === undefined) return uit; // volledig nul, mag van de spec

  const view = json.bufferViews[acc.bufferView];
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const basis = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stap = view.byteStride ?? componenten * breedte;

  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < componenten; c++) {
      uit[i * componenten + c] = dv[lezer](basis + i * stap + c * breedte, true);
    }
  }
  return uit;
}

/* Kolom-major, zoals glTF ze aanlevert. */
const EENHEID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function maal(a, b) {
  const r = new Array(16).fill(0);
  for (let kolom = 0; kolom < 4; kolom++) {
    for (let rij = 0; rij < 4; rij++) {
      let som = 0;
      for (let k = 0; k < 4; k++) som += a[k * 4 + rij] * b[kolom * 4 + k];
      r[kolom * 4 + rij] = som;
    }
  }
  return r;
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const puntDoor = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/* Richtingen gaan zonder verschuiving door de matrix. Bij de kits is de schaal
 * uniform, dus de normaal blijft na normaliseren kloppen; een echte
 * inverse-transpose is hier niet nodig. */
const richtingDoor = (m, x, y, z) => {
  const r = [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ];
  const len = Math.hypot(r[0], r[1], r[2]) || 1;
  return [r[0] / len, r[1] / len, r[2] / len];
};

/**
 * Alle driehoeken van een model, met de node-transformaties er al in gebakken
 * en de indices weggewerkt: één losse driehoekenlijst, klaar om te verplaatsen.
 *
 * Terug komt { posities, normalen, uvs } als platte arrays van drie hoekpunten
 * per driehoek. Ontbreekt er een normaal, dan wordt de vlaknormaal gerekend —
 * dat is voor dit werk toch wat we willen.
 */
export function leesModel(pad) {
  const { json, bin } = splitsGlb(pad);
  const posities = [];
  const normalen = [];
  const uvs = [];

  const scene = json.scenes?.[json.scene ?? 0];
  const wortels = scene?.nodes ?? (json.nodes ?? []).map((_, i) => i);
  const gezien = new Set();

  const loop = (index, ouder) => {
    if (gezien.has(index)) return; // cyclusbeveiliging
    gezien.add(index);
    const node = json.nodes[index];
    if (!node) return;
    const m = maal(ouder, nodeMatrix(node));

    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives ?? []) {
        if ((prim.mode ?? 4) !== 4) continue; // alleen TRIANGLES
        const pos = leesAccessor(json, bin, prim.attributes.POSITION);
        const nor = prim.attributes.NORMAL !== undefined
          ? leesAccessor(json, bin, prim.attributes.NORMAL) : null;
        const uv = prim.attributes.TEXCOORD_0 !== undefined
          ? leesAccessor(json, bin, prim.attributes.TEXCOORD_0) : null;
        const idx = prim.indices !== undefined
          ? leesAccessor(json, bin, prim.indices)
          : Float64Array.from({ length: pos.length / 3 }, (_, i) => i);

        for (let t = 0; t + 2 < idx.length; t += 3) {
          const hoeken = [idx[t], idx[t + 1], idx[t + 2]].map((v) => v | 0);
          const wereld = hoeken.map((h) => puntDoor(m, pos[h * 3], pos[h * 3 + 1], pos[h * 3 + 2]));

          let vlak = null;
          if (!nor) {
            const [a, b, c] = wereld;
            const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
            const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
            const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
            const len = Math.hypot(n[0], n[1], n[2]) || 1;
            vlak = n.map((v) => v / len);
          }

          hoeken.forEach((h, k) => {
            posities.push(wereld[k][0], wereld[k][1], wereld[k][2]);
            const n = vlak ?? richtingDoor(m, nor[h * 3], nor[h * 3 + 1], nor[h * 3 + 2]);
            normalen.push(n[0], n[1], n[2]);
            uvs.push(uv ? uv[h * 2] : 0, uv ? uv[h * 2 + 1] : 0);
          });
        }
      }
    }

    for (const kind of node.children ?? []) loop(kind, m);
  };

  for (const wortel of wortels) loop(wortel, EENHEID);
  return { posities, normalen, uvs };
}

/* -- png ------------------------------------------------------------------
 * Alleen wat de colormaps van de kits zijn: 8 bit per kanaal, niet interlaced.
 * Genoeg om een uv op een kleur uit te laten komen.
 */
export function leesPng(pad) {
  const buf = readFileSync(pad);
  let off = 8;
  let breedte = 0;
  let hoogte = 0;
  let kleurtype = 0;
  let diepte = 8;
  const brokken = [];

  while (off + 8 <= buf.length) {
    const lengte = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('ascii');
    const data = buf.subarray(off + 8, off + 8 + lengte);
    if (type === 'IHDR') {
      breedte = data.readUInt32BE(0);
      hoogte = data.readUInt32BE(4);
      diepte = data[8];
      kleurtype = data[9];
      if (data[12] !== 0) throw new Error(`interlaced png wordt niet gelezen: ${pad}`);
    } else if (type === 'IDAT') {
      brokken.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + lengte;
  }
  if (diepte !== 8) throw new Error(`png is niet 8 bit: ${pad}`);

  const kanalen = { 0: 1, 2: 3, 4: 2, 6: 4 }[kleurtype];
  if (!kanalen) throw new Error(`onbekend png-kleurtype ${kleurtype}: ${pad}`);

  const rauw = inflateSync(Buffer.concat(brokken));
  const stap = breedte * kanalen;
  const uit = Buffer.alloc(hoogte * stap);

  /* Elke rij begint met een filterbyte; de filters kijken naar de buur links,
   * boven en linksboven, in bytes en niet in pixels. */
  for (let y = 0; y < hoogte; y++) {
    const filter = rauw[y * (stap + 1)];
    for (let i = 0; i < stap; i++) {
      const ruw = rauw[y * (stap + 1) + 1 + i];
      const links = i >= kanalen ? uit[y * stap + i - kanalen] : 0;
      const boven = y > 0 ? uit[(y - 1) * stap + i] : 0;
      const hoek = i >= kanalen && y > 0 ? uit[(y - 1) * stap + i - kanalen] : 0;
      let waarde;
      switch (filter) {
        case 0: waarde = ruw; break;
        case 1: waarde = ruw + links; break;
        case 2: waarde = ruw + boven; break;
        case 3: waarde = ruw + ((links + boven) >> 1); break;
        case 4: {
          const p = links + boven - hoek;
          const pa = Math.abs(p - links);
          const pb = Math.abs(p - boven);
          const pc = Math.abs(p - hoek);
          waarde = ruw + (pa <= pb && pa <= pc ? links : pb <= pc ? boven : hoek);
          break;
        }
        default: throw new Error(`onbekend png-filter ${filter}: ${pad}`);
      }
      uit[y * stap + i] = waarde & 255;
    }
  }

  return {
    breedte,
    hoogte,
    kanalen,
    data: uit,
    /** Kleur op een uv, met v van boven naar beneden zoals glTF hem bedoelt. */
    kleurOp(u, v) {
      const px = Math.min(breedte - 1, Math.max(0, Math.floor(u * breedte)));
      const py = Math.min(hoogte - 1, Math.max(0, Math.floor(v * hoogte)));
      const i = (py * stap) + px * kanalen;
      return kanalen < 3
        ? [uit[i], uit[i], uit[i]]
        : [uit[i], uit[i + 1], uit[i + 2]];
    },
  };
}

/**
 * Png wegschrijven, 8 bit, zonder filters. `kanalen` is 3 voor rgb en 4 voor
 * rgba; lees je een bestand in en schrijf je het terug, gebruik dan hetzelfde
 * aantal als `leesPng` teruggaf, anders verdwijnt het alfakanaal.
 */
const CRC = (() => {
  const tabel = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabel[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = tabel[(c ^ buf[i]) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

export function schrijfPng(pad, breedte, hoogte, data, kanalen = 3) {
  const stap = breedte * kanalen;
  const rauw = Buffer.alloc((stap + 1) * hoogte);
  for (let y = 0; y < hoogte; y++) {
    rauw[y * (stap + 1)] = 0; // filter: geen
    data.copy(rauw, y * (stap + 1) + 1, y * stap, (y + 1) * stap);
  }
  const brok = (type, inhoud) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(inhoud.length, 0);
    const romp = Buffer.concat([Buffer.from(type, 'ascii'), inhoud]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(CRC(romp), 0);
    return Buffer.concat([len, romp, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breedte, 0);
  ihdr.writeUInt32BE(hoogte, 4);
  ihdr[8] = 8;
  ihdr[9] = kanalen === 4 ? 6 : 2;
  writeFileSync(pad, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    brok('IHDR', ihdr),
    brok('IDAT', deflateSync(rauw, { level: 9 })),
    brok('IEND', Buffer.alloc(0)),
  ]));
}
