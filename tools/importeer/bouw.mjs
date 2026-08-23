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
import { baanVanTextuur, rasterUvs } from './kleurkaart.mjs';

const naarLineair = (kanaal) => {
  const v = kanaal / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const vanLineair = (lineair) => {
  const v = lineair <= 0.0031308 ? lineair * 12.92 : 1.055 * lineair ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
};

const afronden = (waarde, decimalen = 4) => Number(waarde.toFixed(decimalen));

// Zeven punten binnen de driehoek, in barycentrische coördinaten. Geen van de
// zeven ligt op een hoekpunt: ze zijn allemaal een stukje naar het midden
// getrokken. Precies op de hoek bemonsteren gaat mis bij een textuur waar maar
// een klein eilandje van in gebruik is — de bloemen van Natuur staan op een vel
// dat verder zwart is, en een monster dat net naast het eilandje valt mengt dat
// zwart mee. Dan wordt een witte madelief grijs.
const RAND = 0.08;
const MONSTERS = [
  [1 - 2 * RAND, RAND, RAND, 0.5],
  [RAND, 1 - 2 * RAND, RAND, 0.5],
  [RAND, RAND, 1 - 2 * RAND, 0.5],
  [2 / 3, 1 / 6, 1 / 6, 1], [1 / 6, 2 / 3, 1 / 6, 1], [1 / 6, 1 / 6, 2 / 3, 1],
  [1 / 3, 1 / 3, 1 / 3, 1],
];

// Voor een geschilderde textuur: één gemiddelde kleur per driehoek. Per
// hoekpunt kiezen zou binnen één plankje drie tinten uit de nerf pikken en dus
// ruis opleveren; het gemiddelde houdt het verschil tussen de vlakken.
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
      // De hoekpuntkleur staat al in lineair licht en vermenigvuldigt de
      // textuur, zoals glTF voorschrijft.
      const tint = a * hoekkleuren[0][k] + b * hoekkleuren[1][k] + c * hoekkleuren[2][k];
      som[k] += weeg * tint * naarLineair(monster[k]);
    }
    gewicht += weeg;
  }
  // De winst geldt alleen waar de kleur uit hoekpuntkleuren komt: daar is het
  // niveau van de textuur willekeurig. Een textuur die de kleur zelf draagt
  // staat al goed en wordt niet aangeraakt.
  const schaal = hoekkleuren ? winst : 1;
  return som.map((waarde) => vanLineair((waarde / gewicht) * schaal));
}

// Hoe licht een pack gemiddeld is. Een pack die zijn kleur uit hoekpuntkleuren
// haalt en de textuur alleen als tekening gebruikt, staat vaak veel donkerder
// dan de gedeelde sheet: die trimsheets zijn middengrijs geschilderd en worden
// pas onder de belichting van de maker het bedoelde hout. Wordt dat niet
// rechtgetrokken, dan landt een eiken vat op de donkerste baan die er is en
// blijft er van het verschil tussen de vaten niets over.
//
// Eén winst voor de hele pack, net zoals er één schaal voor de hele pack is:
// de onderlinge verhoudingen van de pack blijven, alleen het niveau schuift.
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

// De drie doel-UV's van één driehoek. Welke weg dat gaat, hangt af van wat de
// pack levert: een kleurenvel met banen, een geschilderde textuur, of alleen
// een vlakke materiaalkleur.
function kleurVanDriehoek(primitief, hoek, vOmlaag, palet, winst, meld) {
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

    // Een baan overnemen kan alleen als de textuur de kleur bepaalt. Kleurt de
    // pack per hoekpunt bij, dan zegt de plek in de bronbaan niets meer over de
    // kleur die er uitkomt, en telt alleen het resultaat.
    if (bron.soort === 'raster' && !hoekkleuren) {
      const uitkomst = rasterUvs(bron, hoekUvs);
      if (uitkomst) {
        meld(uitkomst.keuze.score, { bron: uitkomst.baan.id, doel: uitkomst.keuze.baan.id });
        return uitkomst.uvs;
      }
      // Valt de driehoek op een lege cel van het bronvel, dan is er geen baan
      // om over te nemen; dan telt alleen zijn gemiddelde kleur.
    }

    // Een geschilderde textuur heeft geen banen om over te nemen: daar telt de
    // gemiddelde kleur van de driehoek en de kleur van de sheet die daar het
    // dichtst bij ligt. Middelen is hier wél nodig — per hoekpunt kiezen pikt
    // drie tinten uit de nerf van hetzelfde plankje en levert ruis op.
    const gemiddeld = gemiddeldeKleur(laadTextuur(textuur, { vOmlaag }), hoekUvs, hoekkleuren, winst);
    const gevonden = palet.zoek(...gemiddeld);
    meld(gevonden.afstand, { bron: hex(...gemiddeld), doel: gevonden.hex });
    return [[gevonden.u, gevonden.v], [gevonden.u, gevonden.v], [gevonden.u, gevonden.v]];
  }

  // Een vlakke materiaalkleur is één kleur zonder verloop: er valt niets uit
  // elkaar te trekken, dus de dichtstbijzijnde kleur van de sheet volstaat.
  const vast = kleur ?? [255, 255, 255];
  const gevonden = palet.zoek(...vast);
  meld(gevonden.afstand, { bron: hex(...vast), doel: gevonden.hex });
  return [[gevonden.u, gevonden.v], [gevonden.u, gevonden.v], [gevonden.u, gevonden.v]];
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

      const doelUvs = kleurVanDriehoek(primitief, hoek, vOmlaag, palet, winst, (afstandVanBaan, beschrijving) => {
        if (afstandVanBaan > ergsteAfstand) {
          ergsteAfstand = afstandVanBaan;
          ergsteKleur = beschrijving;
        }
        gebruikt.set(beschrijving.doel, (gebruikt.get(beschrijving.doel) ?? 0) + 1);
      });

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
  schrijfGlb(pad, json, bin, writeFileSync);
}

export function zetColormapKlaar(kitDir) {
  mkdirSync(join(kitDir, 'Textures'), { recursive: true });
  copyFileSync(GEDEELDE_COLORMAP, join(kitDir, 'Textures', 'colormap.png'));
}
