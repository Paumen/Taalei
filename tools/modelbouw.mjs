/**
 * Gedeelde bouwstenen voor de helden-kit-generatoren (maak-*.mjs).
 *
 * Elke generator maakt met maakBouwer() een lege geometrie, vult die met
 * platte stukken via de vlak()-familie, en schrijft het resultaat met
 * schrijfGlb() als GLB in de kitmap. De opzet spiegelt de Kenney-kits:
 * één mesh, één "colormap"-materiaal dat naar Textures/colormap.png in de
 * kitmap verwijst (de gedeelde atlas), vlakke shading met eigen vertices
 * per vlak.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/* -- kleuren ---------------------------------------------------------------
 * Celcoördinaten uit kits/palet.json (gedeeld palet). Elke cel is een blok
 * van 32 px breed en 128 px hoog in de 512×512-atlas: vier gradiënttreden
 * van 32 px boven elkaar. `rij` kiest een trede (0 = lichtst, 3 = donkerst);
 * rij 1,5 is het blokmidden, de representatieve kleur uit palet.json.
 */
export const CEL = {
  steen:  [15, 3], // #6d738a
  rood:   [7, 0],  // #e76047
  wit:    [5, 2],  // #dcdce9 — ook schuim en wildwater
  hout:   [12, 0], // #995a41
  donker: [10, 0], // #3e3e44
  lamp:   [6, 0],  // #ffb349
  water:  [5, 1],  // #3da679 — turquoise
  gras:   [2, 1],  // #6cb588
};

export const uvCel = ([kolom, blok], rij = 1.5) =>
  [(kolom + 0.5) / 16, (blok * 128 + 16 + rij * 32) / 512];

/** Deterministische ruis voor tintwisseling en vormvariatie per vlakje. */
export const ruis = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/* -- geometrie-opbouw ------------------------------------------------------
 * Alles gaat door vlak(): één plat stuk per aanroep, met eigen vertices en
 * één normaal, zodat de shading per vlak hard blijft. Punten worden
 * tegen de klok in aangeleverd, gezien vanaf de zichtbare kant.
 */

export function maakBouwer() {
  const posities = [];
  const normalen = [];
  const uvs = [];
  const indices = [];

  function vlak(kleur, ...punten) {
    const [ax, ay, az] = punten[0];
    const [bx, by, bz] = punten[1];
    const [cx, cy, cz] = punten[2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const lengte = Math.hypot(nx, ny, nz);
    if (lengte < 1e-9) throw new Error('gedegenereerd vlak');
    nx /= lengte; ny /= lengte; nz /= lengte;

    const basis = posities.length / 3;
    for (const [x, y, z] of punten) {
      posities.push(x, y, z);
      normalen.push(nx, ny, nz);
      uvs.push(kleur[0], kleur[1]);
    }
    for (let i = 2; i < punten.length; i++) {
      indices.push(basis, basis + i - 1, basis + i);
    }
  }

  /** Zijvlakken van een (taps toelopende) veelhoektrommel. */
  function trommel(n, rOnder, yOnder, rBoven, yBoven, kleur) {
    const h = hoeken(n);
    for (let i = 0; i < n; i++) {
      vlak(kleur,
        op(rOnder, yOnder, h[i]), op(rOnder, yOnder, h[i + 1]),
        op(rBoven, yBoven, h[i + 1]), op(rBoven, yBoven, h[i]));
    }
  }

  /** Horizontale n-hoek (deksel of bodem). `omhoog` bepaalt de zichtbare kant. */
  function schijf(n, r, y, kleur, omhoog = true) {
    const h = hoeken(n);
    const punten = h.slice(0, n).map((hoek) => op(r, y, hoek));
    if (omhoog) punten.reverse();
    vlak(kleur, ...punten);
  }

  /** Horizontale ring (bijv. een richel of dakrand). */
  function ringvlak(n, rBinnen, rBuiten, y, kleur, omhoog = true) {
    const h = hoeken(n);
    for (let i = 0; i < n; i++) {
      const p = [
        op(rBinnen, y, h[i]), op(rBinnen, y, h[i + 1]),
        op(rBuiten, y, h[i + 1]), op(rBuiten, y, h[i]),
      ];
      if (omhoog) p.reverse();
      vlak(kleur, ...p);
    }
  }

  /** Kegel van n driehoeken naar één punt. */
  function kegel(n, r, yBasis, yTop, kleur) {
    const h = hoeken(n);
    for (let i = 0; i < n; i++) {
      vlak(kleur, op(r, yBasis, h[i]), op(r, yBasis, h[i + 1]), [0, yTop, 0]);
    }
  }

  /** Rechthoekig blok, assen-uitgelijnd; `zonder` slaat verborgen kanten over. */
  function blok(x0, y0, z0, x1, y1, z1, kleur, zonder = []) {
    const kant = (naam, punten) => { if (!zonder.includes(naam)) vlak(kleur, ...punten); };
    kant('voor',   [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
    kant('achter', [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]);
    kant('links',  [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
    kant('rechts', [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]);
    kant('boven',  [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]);
    kant('onder',  [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
  }

  /** Vierkant paaltje op een ringpositie, gedraaid zodat het naar buiten kijkt. */
  function paaltje(rMidden, halfBreedte, y0, y1, hoek, kleur) {
    const richting = [Math.cos(hoek), Math.sin(hoek)];          // radiaal
    const zijwaarts = [-Math.sin(hoek), Math.cos(hoek)];        // tangentieel
    const punt = (dr, dz, y) => [
      rMidden * richting[0] + dr * richting[0] + dz * zijwaarts[0],
      y,
      rMidden * richting[1] + dr * richting[1] + dz * zijwaarts[1],
    ];
    const b = halfBreedte;
    const hoekpunten = [[b, b], [b, -b], [-b, -b], [-b, b]]; // tegen de klok in van boven
    for (let i = 0; i < 4; i++) {
      const [dr1, dz1] = hoekpunten[i];
      const [dr2, dz2] = hoekpunten[(i + 1) % 4];
      vlak(kleur, punt(dr1, dz1, y0), punt(dr2, dz2, y0), punt(dr2, dz2, y1), punt(dr1, dz1, y1));
    }
    vlak(kleur, ...hoekpunten.map(([dr, dz]) => punt(dr, dz, y1)).reverse());
  }

  return { posities, normalen, uvs, indices, vlak, trommel, schijf, ringvlak, kegel, blok, paaltje };
}

/** Punt op een veelhoekring: hoek 90° = +Z, zodat een vlak recht naar voren wijst. */
export const op = (r, y, hoek) => [r * Math.cos(hoek), y, r * Math.sin(hoek)];

/** Hoeken van een n-zijdige ring, gedraaid zodat één vlak op +Z uitkomt. */
export function hoeken(n) {
  const start = Math.PI / 2 - Math.PI / n; // vlakmidden tussen twee hoekpunten
  return Array.from({ length: n + 1 }, (_, i) => start + (i * 2 * Math.PI) / n);
}

/** Kopieert een bouwer in een andere, verschoven — voor testscènes. */
export function voegSamen(doel, bron, [dx, dy, dz] = [0, 0, 0]) {
  const basis = doel.posities.length / 3;
  for (let i = 0; i < bron.posities.length; i += 3) {
    doel.posities.push(bron.posities[i] + dx, bron.posities[i + 1] + dy, bron.posities[i + 2] + dz);
  }
  doel.normalen.push(...bron.normalen);
  doel.uvs.push(...bron.uvs);
  for (const index of bron.indices) doel.indices.push(basis + index);
}

/* -- controles uit de stijlgids ------------------------------------------- */

/**
 * Basis op Y = 0 en de voetafdruk binnen de opgegeven halve breedte
 * (0,5 = één tegel; detail mag daar per stijlgids iets overheen hangen).
 */
export function controleerStijl(bouwer, { maxHalf = 0.5 } = {}) {
  let minY = Infinity, maxAfstand = 0, maxHoogte = 0;
  const p = bouwer.posities;
  for (let i = 0; i < p.length; i += 3) {
    minY = Math.min(minY, p[i + 1]);
    maxHoogte = Math.max(maxHoogte, p[i + 1]);
    maxAfstand = Math.max(maxAfstand, Math.abs(p[i]), Math.abs(p[i + 2]));
  }
  if (Math.abs(minY) > 1e-6) throw new Error(`basis niet op Y=0 (minY=${minY})`);
  if (maxAfstand > maxHalf + 1e-6) {
    throw new Error(`buiten voetafdruk (max ${maxAfstand.toFixed(3)} > ${maxHalf})`);
  }
  return { maxHoogte, maxAfstand };
}

/* -- GLB schrijven --------------------------------------------------------- */

const naar4 = (n) => (n + 3) & ~3;

export function schrijfGlb(bouwer, doel, naam, { generator } = {}) {
  const { posities, normalen, uvs, indices } = bouwer;
  const posBuf = Buffer.from(new Float32Array(posities).buffer);
  const norBuf = Buffer.from(new Float32Array(normalen).buffer);
  const uvBuf = Buffer.from(new Float32Array(uvs).buffer);
  const indexBuf = Buffer.from(new Uint16Array(indices).buffer);
  if (posities.length / 3 > 65535) throw new Error('te veel vertices voor uint16-indices');

  const delen = [posBuf, norBuf, uvBuf, indexBuf];
  const bufferViews = [];
  let offset = 0;
  for (const deel of delen) {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: deel.length });
    offset = naar4(offset + deel.length);
  }
  const bin = Buffer.alloc(offset);
  for (let i = 0; i < delen.length; i++) delen[i].copy(bin, bufferViews[i].byteOffset);

  const grens = (waarden, stap) => {
    const min = Array(stap).fill(Infinity), max = Array(stap).fill(-Infinity);
    for (let i = 0; i < waarden.length; i += stap) {
      for (let a = 0; a < stap; a++) {
        min[a] = Math.min(min[a], waarden[i + a]);
        max[a] = Math.max(max[a], waarden[i + a]);
      }
    }
    return { min, max };
  };
  const posGrens = grens(posities, 3);

  const json = {
    asset: {
      generator: generator ?? 'tools/modelbouw.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: 1, schaal: 1, palet: 'gedeeld' } },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: naam }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0,
      }],
      name: naam,
    }],
    materials: [{
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 },
      doubleSided: true,
      name: 'colormap',
    }],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: posities.length / 3, type: 'VEC3', ...posGrens },
      { bufferView: 1, componentType: 5126, count: normalen.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: uvs.length / 2, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  let jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = naar4(jsonBuf.length);
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad - jsonBuf.length, 0x20)]);

  const totaal = 12 + 8 + jsonBuf.length + 8 + bin.length;
  const glb = Buffer.alloc(totaal);
  glb.writeUInt32LE(0x46546c67, 0); // 'glTF'
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totaal, 8);
  glb.writeUInt32LE(jsonBuf.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonBuf.copy(glb, 20);
  glb.writeUInt32LE(bin.length, 20 + jsonBuf.length);
  glb.writeUInt32LE(0x004e4942, 24 + jsonBuf.length); // 'BIN'
  bin.copy(glb, 28 + jsonBuf.length);

  mkdirSync(dirname(doel), { recursive: true });
  writeFileSync(doel, glb);
  return {
    vertices: posities.length / 3,
    driehoeken: indices.length / 3,
  };
}
