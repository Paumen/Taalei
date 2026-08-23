// Bouwt uit bronprimitieven één .glb volgens de gewoonten van deze repo:
// één mesh, één materiaal, kleur uit de gedeelde kits/colormap.png.
//
// Elk hoekpunt wordt eerst losgemaakt van de driehoeken die het deelt. Anders
// zou een hoekpunt op de grens tussen twee tinten met de UV van de ene driehoek
// dwars over de kleuren tussen twee cellen heen slepen. Daarna worden identieke
// hoekpunten (zelfde plek, normaal én UV) weer samengevoegd, zodat het bestand
// niet groter wordt dan nodig. De geometrie blijft ongemoeid: er komt geen
// driehoek bij of af en er verschuift niets.

import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { schrijfGlb } from '../../catalog/tools/glb.mjs';
import { laadPalet, laadTextuur, GEDEELDE_COLORMAP, hex } from './palet.mjs';

const naarLineair = (kanaal) => {
  const v = kanaal / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const vanLineair = (lineair) => {
  const v = lineair <= 0.0031308 ? lineair * 12.92 : 1.055 * lineair ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
};

const afronden = (waarde, decimalen = 4) => Number(waarde.toFixed(decimalen));

// Zeven punten binnen de driehoek, in barycentrische coördinaten: de drie
// hoeken tellen half mee, het midden en de drie zwaartepunten vol.
const MONSTERS = [
  [1, 0, 0, 0.5], [0, 1, 0, 0.5], [0, 0, 1, 0.5],
  [2 / 3, 1 / 6, 1 / 6, 1], [1 / 6, 2 / 3, 1 / 6, 1], [1 / 6, 1 / 6, 2 / 3, 1],
  [1 / 3, 1 / 3, 1 / 3, 1],
];

// Eén kleur per driehoek, gemiddeld over zijn stukje textuur — niet één kleur
// per hoekpunt. Een pack met echte materiaaltekening (nerf in het hout, roest
// op het metaal) heeft binnen één vlak tientallen tinten; per hoekpunt kiezen
// pikt daar drie willekeurige uit en levert ruis op. Het gemiddelde houdt wat
// er wél overdraagbaar is: het verschil in licht en donker tussen de vlakken
// onderling, en dus de ingebakken schaduw. Vlak voor vlak één kleur is
// bovendien wat de stijlgids vraagt.
function kleurVanDriehoek(primitief, hoek, vOmlaag) {
  const { textuur, kleur } = primitief.materiaal;
  if (!textuur || !primitief.uvs) return kleur ?? [255, 255, 255];

  const textuurBron = laadTextuur(textuur, { vOmlaag });
  const som = [0, 0, 0];
  let gewicht = 0;

  for (const [a, b, c, weeg] of MONSTERS) {
    const u = a * primitief.uvs[hoek[0] * 2] + b * primitief.uvs[hoek[1] * 2] + c * primitief.uvs[hoek[2] * 2];
    const v =
      a * primitief.uvs[hoek[0] * 2 + 1] +
      b * primitief.uvs[hoek[1] * 2 + 1] +
      c * primitief.uvs[hoek[2] * 2 + 1];
    const monster = textuurBron.monster(u, v);
    // Middelen gebeurt in lineair licht; in sRGB middelen maakt het te donker.
    for (let k = 0; k < 3; k++) som[k] += weeg * naarLineair(monster[k]);
    gewicht += weeg;
  }

  return som.map((waarde) => vanLineair(waarde / gewicht));
}

export function bouwGlb({
  primitieven,
  naam,
  bronNaam,
  bron,
  generator,
  schaal = 1,
  oorsprong = 'gecentreerd',
  vOmlaag = true,
  palet = laadPalet(),
}) {
  const posities = [];
  const normalen = [];
  const uvs = [];
  const indices = [];
  const gezien = new Map();
  const gebruikt = new Map();
  let ergsteAfstand = 0;
  let ergsteKleur = null;

  for (const primitief of primitieven) {
    for (let d = 0; d + 2 < primitief.indices.length; d += 3) {
      const hoek = [primitief.indices[d], primitief.indices[d + 1], primitief.indices[d + 2]];
      const punten = hoek.map((i) => [
        primitief.posities[i * 3], primitief.posities[i * 3 + 1], primitief.posities[i * 3 + 2],
      ]);

      let vlak = null;
      if (!primitief.normalen) {
        const [a, b, c] = punten;
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const lengte = Math.hypot(...n) || 1;
        vlak = n.map((k) => k / lengte);
      }

      const [r, g, b] = kleurVanDriehoek(primitief, hoek, vOmlaag);
      const gevonden = palet.zoek(r, g, b);
      if (gevonden.afstand > ergsteAfstand) {
        ergsteAfstand = gevonden.afstand;
        ergsteKleur = { bron: hex(r, g, b), doel: gevonden.hex };
      }
      gebruikt.set(gevonden.hex, (gebruikt.get(gevonden.hex) ?? 0) + 1);

      hoek.forEach((i, k) => {

        const normaal = vlak ?? [
          primitief.normalen[i * 3], primitief.normalen[i * 3 + 1], primitief.normalen[i * 3 + 2],
        ];
        const hoekpunt = [
          ...punten[k].map((waarde) => afronden(waarde, 5)),
          ...normaal.map((waarde) => afronden(waarde, 4)),
          afronden(gevonden.u, 6), afronden(gevonden.v, 6),
        ];

        const sleutel = hoekpunt.join(',');
        let index = gezien.get(sleutel);
        if (index === undefined) {
          index = posities.length / 3;
          gezien.set(sleutel, index);
          posities.push(hoekpunt[0], hoekpunt[1], hoekpunt[2]);
          normalen.push(hoekpunt[3], hoekpunt[4], hoekpunt[5]);
          uvs.push(hoekpunt[6], hoekpunt[7]);
        }
        indices.push(index);
      });
    }
  }

  if (indices.length === 0) throw new Error(`${naam}: geen driehoeken`);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < posities.length; i += 3) {
    for (let as = 0; as < 3; as++) {
      min[as] = Math.min(min[as], posities[i + as]);
      max[as] = Math.max(max[as], posities[i + as]);
    }
  }

  const verplaatsing =
    oorsprong === 'ongewijzigd'
      ? null
      : [
          afronden(-((min[0] + max[0]) / 2) * schaal),
          afronden(-min[1] * schaal),
          afronden(-((min[2] + max[2]) / 2) * schaal),
        ];

  const posBuf = Buffer.from(new Float32Array(posities).buffer);
  const normBuf = Buffer.from(new Float32Array(normalen).buffer);
  const uvBuf = Buffer.from(new Float32Array(uvs).buffer);
  const kort = posities.length / 3 <= 65535;
  const indexBuf = Buffer.from(
    (kort ? new Uint16Array(indices) : new Uint32Array(indices)).buffer,
  );
  const vulling = (n) => Buffer.alloc((4 - (n % 4)) % 4);
  const bin = Buffer.concat([posBuf, normBuf, uvBuf, indexBuf, vulling(indexBuf.length)]);

  const node = { name: naam, mesh: 0 };
  if (schaal !== 1) node.scale = [schaal, schaal, schaal];
  if (verplaatsing && verplaatsing.some((waarde) => waarde !== 0)) node.translation = verplaatsing;

  const json = {
    asset: {
      generator,
      version: '2.0',
      extras: {
        taaleiland: {
          versie: 1,
          schaal,
          ...(oorsprong === 'ongewijzigd' ? { oorsprong: 'ongewijzigd' } : {}),
          palet: 1,
          bron,
          bronmodel: bronNaam,
        },
      },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [node],
    meshes: [{
      name: naam,
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
        indices: 3,
        material: 0,
      }],
    }],
    materials: [{
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
      doubleSided: true,
      alphaMode: 'OPAQUE',
      name: 'colormap',
    }],
    textures: [{ sampler: 0, source: 0, name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
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

  return {
    json,
    bin,
    verslag: {
      hoekpunten: posities.length / 3,
      driehoeken: indices.length / 3,
      maat: [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((waarde) =>
        afronden(waarde * schaal, 3),
      ),
      ergsteAfstand: afronden(ergsteAfstand, 1),
      ergsteKleur,
      kleuren: [...gebruikt.keys()].sort(),
    },
  };
}

export function schrijfModel(pad, { json, bin }) {
  mkdirSync(dirname(pad), { recursive: true });
  schrijfGlb(pad, json, bin, writeFileSync);
}

export function zetColormapKlaar(kitDir) {
  mkdirSync(join(kitDir, 'Textures'), { recursive: true });
  copyFileSync(GEDEELDE_COLORMAP, join(kitDir, 'Textures', 'colormap.png'));
}
