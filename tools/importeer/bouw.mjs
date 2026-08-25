import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeGlb } from '../../catalog/tools/glb.mjs';
import { laadPalet, laadTextuur, GEDEELDE_COLORMAP, hex } from './palet.mjs';
import { baanVanTextuur, rasterUvs, kiesBaan, plaatsInBaan } from './kleurkaart.mjs';
import { naarOklab } from './palet.mjs';

const naarLineair = (kanaal) => {
  const v = kanaal / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const vanLineair = (lineair) => {
  const v = lineair <= 0.0031308 ? lineair * 12.92 : 1.055 * lineair ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
};

const afronden = (waarde, decimalen = 4) => Number(waarde.toFixed(decimalen));

const RAND = 0.08;
const MONSTERS = [
  [1 - 2 * RAND, RAND, RAND, 0.5],
  [RAND, 1 - 2 * RAND, RAND, 0.5],
  [RAND, RAND, 1 - 2 * RAND, 0.5],
  [2 / 3, 1 / 6, 1 / 6, 1], [1 / 6, 2 / 3, 1 / 6, 1], [1 / 6, 1 / 6, 2 / 3, 1],
  [1 / 3, 1 / 3, 1 / 3, 1],
];

function gemiddeldeKleur(textuurBron, hoekUvs, hoekkleuren, winst = 1) {
  const som = [0, 0, 0];
  let gewicht = 0;
  for (const [a, b, c, weeg] of MONSTERS) {
    const u = a * hoekUvs[0][0] + b * hoekUvs[1][0] + c * hoekUvs[2][0];
    const v = a * hoekUvs[0][1] + b * hoekUvs[1][1] + c * hoekUvs[2][1];
    const monster = textuurBron.monster(u, v);
    for (let k = 0; k < 3; k++) {
      if (!hoekkleuren) {
        som[k] += weeg * naarLineair(monster[k]);
        continue;
      }

      const tint = a * hoekkleuren[0][k] + b * hoekkleuren[1][k] + c * hoekkleuren[2][k];
      som[k] += weeg * tint * naarLineair(monster[k]);
    }
    gewicht += weeg;
  }

  const schaal = hoekkleuren ? winst : 1;
  return som.map((waarde) => vanLineair((waarde / gewicht) * schaal));
}

const GROEPSTRAAL = 0.035;

function groepeerOpKleur(kleuren) {
  const groepen = [];

  for (const rgb of kleuren) {
    const lab = naarOklab(...rgb);
    let thuis = null;
    let dichtst = Infinity;
    for (const groep of groepen) {
      const d = Math.hypot(lab[1] - groep.a / groep.aantal, lab[2] - groep.b / groep.aantal);
      if (d < dichtst) {
        dichtst = d;
        thuis = groep;
      }
    }
    if (thuis && dichtst <= GROEPSTRAAL) {
      thuis.a += lab[1];
      thuis.b += lab[2];
      thuis.laag = Math.min(thuis.laag, lab[0]);
      thuis.hoog = Math.max(thuis.hoog, lab[0]);
      thuis.aantal++;
      thuis.leden.push(rgb);
    } else {
      groepen.push({ a: lab[1], b: lab[2], laag: lab[0], hoog: lab[0], aantal: 1, leden: [rgb] });
    }
  }

  const kaart = new Map();
  for (const groep of groepen) {
    const midden = groep.leden
      .reduce((som, rgb) => [som[0] + rgb[0], som[1] + rgb[1], som[2] + rgb[2]], [0, 0, 0])
      .map((waarde) => Math.round(waarde / groep.leden.length));
    const baan = kiesBaan(midden, [groep.laag, groep.hoog]);
    for (const rgb of groep.leden) kaart.set(rgb.join(','), baan);
  }
  return kaart;
}

function driehoekKleuren(primitief, vOmlaag, winst) {
  const { textuur, kleur } = primitief.materiaal;
  const uit = [];

  if (!textuur || !primitief.uvs) {
    const vast = (kleur ?? [255, 255, 255]).map(Math.round);
    for (let d = 0; d + 2 < primitief.indices.length; d += 3) uit.push(vast);
    return uit;
  }

  const bron = laadTextuur(textuur, { vOmlaag });
  for (let d = 0; d + 2 < primitief.indices.length; d += 3) {
    const hoek = [primitief.indices[d], primitief.indices[d + 1], primitief.indices[d + 2]];
    uit.push(
      gemiddeldeKleur(
        bron,
        hoek.map((i) => [primitief.uvs[i * 2], primitief.uvs[i * 2 + 1]]),
        primitief.hoekkleuren
          ? hoek.map((i) => [
              primitief.hoekkleuren[i * 3],
              primitief.hoekkleuren[i * 3 + 1],
              primitief.hoekkleuren[i * 3 + 2],
            ])
          : null,
        winst,
      ),
    );
  }
  return uit;
}

export function meetBelichting(primitieven, vOmlaag) {
  let som = 0;
  let aantal = 0;

  for (const primitief of primitieven) {
    const { textuur } = primitief.materiaal;
    if (!textuur || !primitief.uvs || !primitief.hoekkleuren) continue;
    const bron = laadTextuur(textuur, { vOmlaag });
    const hoekkleuren = primitief.hoekkleuren;

    for (let d = 0; d + 2 < primitief.indices.length; d += 3) {
      const hoek = [primitief.indices[d], primitief.indices[d + 1], primitief.indices[d + 2]];
      const rgb = gemiddeldeKleur(
        bron,
        hoek.map((i) => [primitief.uvs[i * 2], primitief.uvs[i * 2 + 1]]),
        hoekkleuren
          ? hoek.map((i) => [
              primitief.hoekkleuren[i * 3],
              primitief.hoekkleuren[i * 3 + 1],
              primitief.hoekkleuren[i * 3 + 2],
            ])
          : null,
      );
      som += (naarLineair(rgb[0]) + naarLineair(rgb[1]) + naarLineair(rgb[2])) / 3;
      aantal++;
    }
  }

  return { som, aantal };
}

function kleurVanDriehoek(primitief, hoek, vOmlaag, winst, kleurVoorDriehoek, baanVoorDriehoek, meld) {
  const { textuur, kleur } = primitief.materiaal;

  if (textuur && primitief.uvs) {
    const hoekUvs = hoek.map((i) => [primitief.uvs[i * 2], primitief.uvs[i * 2 + 1]]);
    const hoekkleuren = primitief.hoekkleuren
      ? hoek.map((i) => [
          primitief.hoekkleuren[i * 3],
          primitief.hoekkleuren[i * 3 + 1],
          primitief.hoekkleuren[i * 3 + 2],
        ])
      : null;
    const bron = baanVanTextuur(textuur);

    if (bron.soort === 'raster' && !hoekkleuren) {
      const uitkomst = rasterUvs(bron, hoekUvs);
      if (uitkomst) {
        meld(uitkomst.keuze.score, { bron: uitkomst.baan.id, doel: uitkomst.keuze.baan.id });
        return uitkomst.uvs;
      }

    }

  }

  const gevonden = plaatsInBaan(baanVoorDriehoek, kleurVoorDriehoek);
  meld(gevonden.afstand, { bron: hex(...kleurVoorDriehoek), doel: baanVoorDriehoek.id });
  return [gevonden.uv, gevonden.uv, gevonden.uv];
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
  winst = 1,
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

    const kleuren = driehoekKleuren(primitief, vOmlaag, winst);
    const banen = groepeerOpKleur(kleuren);

    for (let d = 0; d + 2 < primitief.indices.length; d += 3) {
      const kleurVanDitVlak = kleuren[d / 3];
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

      const doelUvs = kleurVanDriehoek(
        primitief,
        hoek,
        vOmlaag,
        winst,
        kleurVanDitVlak,
        banen.get(kleurVanDitVlak.join(',')),
        (afstandVanBaan, beschrijving) => {
          if (afstandVanBaan > ergsteAfstand) {
            ergsteAfstand = afstandVanBaan;
            ergsteKleur = beschrijving;
          }
          gebruikt.set(beschrijving.doel, (gebruikt.get(beschrijving.doel) ?? 0) + 1);
        },
      );

      hoek.forEach((i, k) => {

        const normaal = vlak ?? [
          primitief.normalen[i * 3], primitief.normalen[i * 3 + 1], primitief.normalen[i * 3 + 2],
        ];
        const hoekpunt = [
          ...punten[k].map((waarde) => afronden(waarde, 5)),
          ...normaal.map((waarde) => afronden(waarde, 4)),
          afronden(doelUvs[k][0], 6), afronden(doelUvs[k][1], 6),
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
  writeGlb(pad, json, bin, writeFileSync);
}

export function zetColormapKlaar(kitDir) {
  mkdirSync(join(kitDir, 'Textures'), { recursive: true });
  copyFileSync(GEDEELDE_COLORMAP, join(kitDir, 'Textures', 'colormap.png'));
}
