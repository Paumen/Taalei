import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGlb } from '../../catalog/tools/glb.mjs';
import { readPng } from '../../catalog/tools/png.mjs';
import { BANDEN, hexVan } from './leerbanden.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const KOLOMMEN = 16;
const RIJEN = 4;
const CEL_BREEDTE = 32;
const CEL_HOOGTE = 128;
const SPREIDING = [0.12, 0.88];
const UITSLAG = 0.35;
const RAND = 0.03;
const GLAD = Math.cos((60 * Math.PI) / 180);

export { BANDEN, hexVan };

export const helderheid = (hex) => {
  const kanaal = (i) => {
    const s = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanaal(0) + 0.7152 * kanaal(1) + 0.0722 * kanaal(2);
};

const kleurenkaart = readPng(join(ROOT, 'kits', 'colormap.png'));

const atlassen = new Map();
export function atlasKleur(pad, u, v) {
  if (!atlassen.has(pad)) atlassen.set(pad, readPng(pad));
  const atlas = atlassen.get(pad);
  const x = Math.min(Math.max(Math.floor(u * atlas.width), 0), atlas.width - 1);
  const y = Math.min(Math.max(Math.floor(v * atlas.height), 0), atlas.height - 1);
  const i = (y * atlas.width + x) * 4;
  return hexVan([0, 1, 2].map((k) => atlas.pixels[i + k]));
}

export function bandLicht(band, deel) {
  const [kolom, rij] = BANDEN[band];
  const breedte = kleurenkaart.width / KOLOMMEN;
  const hoogte = kleurenkaart.height / RIJEN;
  const x = Math.floor(kolom * breedte + breedte / 2);
  const y = Math.min(Math.floor((rij + deel) * hoogte), kleurenkaart.height - 1);
  const i = (y * kleurenkaart.width + x) * 4;
  return helderheid(hexVan([0, 1, 2].map((k) => kleurenkaart.pixels[i + k])));
}

export function bandPlek(band, hex, vast) {
  if (vast !== undefined) return vast;
  const gezocht = helderheid(hex);
  let beste = SPREIDING[0];
  let verschil = Infinity;
  for (let stap = 0; stap <= 100; stap++) {
    const deel = SPREIDING[0] + (stap / 100) * (SPREIDING[1] - SPREIDING[0]);
    const afstand = Math.abs(bandLicht(band, deel) - gezocht);
    if (afstand < verschil) {
      verschil = afstand;
      beste = deel;
    }
  }
  return beste;
}

export function bandPlekken(pakket) {
  const plek = new Map();
  for (const opgave of pakket.modellen) {
    for (const [hex, [, band, vast]] of Object.entries(opgave.kleuren ?? {})) {
      const sleutel = `${band}:${hex}`;
      if (!plek.has(sleutel)) plek.set(sleutel, bandPlek(band, hex, vast));
    }
  }
  return plek;
}

export const celUv = (band, fractieU, fractieV) => {
  const [kolom, rij] = BANDEN[band];
  return [
    Math.fround((kolom + 0.5 + (fractieU - 0.5) * ((CEL_BREEDTE - 1) / CEL_BREEDTE)) / KOLOMMEN),
    Math.fround((rij + 0.5 + (fractieV - 0.5) * ((CEL_HOOGTE - 1) / CEL_HOOGTE)) / RIJEN)];
};

export function celVan(primitief, driehoek, raster) {
  let u = 0;
  let v = 0;
  for (let k = 0; k < 3; k++) {
    const i = primitief.indices[driehoek * 3 + k];
    u += primitief.uvs[i * 2] / 3;
    v += primitief.uvs[i * 2 + 1] / 3;
  }
  const kolom = Math.min(Math.max(Math.floor(u * raster[0]), 0), raster[0] - 1);
  const rij = Math.min(Math.max(Math.floor(v * raster[1]), 0), raster[1] - 1);
  return `${kolom},${rij}`;
}

export function omvang(primitieven, schaal) {
  const laag = [Infinity, Infinity, Infinity];
  const hoog = [-Infinity, -Infinity, -Infinity];
  for (const primitief of primitieven) {
    for (let i = 0; i < primitief.posities.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = primitief.posities[i + k] * schaal;
        if (v < laag[k]) laag[k] = v;
        if (v > hoog[k]) hoog[k] = v;
      }
    }
  }
  return { laag, hoog };
}

export function gladdeNormalen(driehoeken) {
  const perPunt = new Map();
  driehoeken.forEach((driehoek, f) => {
    for (const punt of driehoek.punten) {
      const sleutel = punt.map((v) => Math.round(v * 1e5)).join(',');
      const lijst = perPunt.get(sleutel);
      if (lijst) lijst.push(f);
      else perPunt.set(sleutel, [f]);
    }
  });

  for (const driehoek of driehoeken) {
    driehoek.normalen = driehoek.punten.map((punt) => {
      const sleutel = punt.map((v) => Math.round(v * 1e5)).join(',');
      const som = [0, 0, 0];
      for (const f of perPunt.get(sleutel)) {
        const buur = driehoeken[f].vlak;
        const hoek = buur.reduce((t, w, k) => t + w * driehoek.vlak[k], 0);
        if (hoek < GLAD) continue;
        for (let k = 0; k < 3; k++) som[k] += buur[k] * driehoeken[f].oppervlak;
      }
      const lengte = Math.hypot(...som);
      return lengte > 1e-12 ? som.map((v) => v / lengte) : driehoek.vlak.slice();
    });
  }
}

export function bouw(primitieven, opgave, pakket, plek) {
  const { laag, hoog } = omvang(primitieven, pakket.schaal);
  const midden = [(laag[0] + hoog[0]) / 2, laag[1], (laag[2] + hoog[2]) / 2];
  const banden = new Set();
  const materialen = new Set();

  const driehoeken = [];
  for (const primitief of primitieven) {
    const vast = primitief.materiaal.kleur ? hexVan(primitief.materiaal.kleur) : null;
    for (let t = 0; t < primitief.indices.length / 3; t++) {
      const punten = [];
      const bronUv = [];
      for (let k = 0; k < 3; k++) {
        const i = primitief.indices[t * 3 + k];
        punten.push([0, 1, 2].map((a) => primitief.posities[i * 3 + a] * pakket.schaal - midden[a]));
        bronUv.push(primitief.uvs ? [primitief.uvs[i * 2], primitief.uvs[i * 2 + 1]] : [0.5, 0.5]);
      }

      const u = [0, 1, 2].map((k) => punten[1][k] - punten[0][k]);
      const v = [0, 1, 2].map((k) => punten[2][k] - punten[0][k]);
      const kruis = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]];
      const lengte = Math.hypot(...kruis);
      const vlak = lengte > 1e-12 ? kruis.map((w) => w / lengte) : [0, 1, 0];

      const hex = pakket.atlas && primitief.materiaal.textuur
        ? atlasKleur(
            primitief.materiaal.textuur,
            (bronUv[0][0] + bronUv[1][0] + bronUv[2][0]) / 3,
            (bronUv[0][1] + bronUv[1][1] + bronUv[2][1]) / 3,
          )
        : vast;

      let doel;
      let uvs;
      if (pakket.raster) {
        const cel = celVan(primitief, t, pakket.raster);
        doel = opgave.cellen[cel] ?? opgave.cellen['*'];
        if (!doel) throw new Error(`${opgave.naam}: no band for source cell ${cel}`);
        uvs = bronUv.map(([bu, bv]) =>
          celUv(
            doel[1],
            bu * pakket.raster[0] - Math.floor(bu * pakket.raster[0]),
            bv * pakket.raster[1] - Math.floor(bv * pakket.raster[1]),
          ));
      } else {
        doel = opgave.kleuren[hex] ?? opgave.kleuren['*'];
        if (!doel) throw new Error(`${opgave.naam}: no band for ${hex}`);
        uvs = null;
      }
      banden.add(doel[1]);
      materialen.add(doel[0]);

      driehoeken.push({
        punten,
        vlak,
        oppervlak: lengte / 2,
        normalen: [primitief.normalen ? null : vlak, null, null],
        bron: primitief,
        index: t,
        band: doel[1],
        hex,
        uvs,
      });
    }
  }

  if (pakket.raster) {
    for (const driehoek of driehoeken) {
      driehoek.normalen = [0, 1, 2].map((k) => {
        const i = driehoek.bron.indices[driehoek.index * 3 + k];
        if (!driehoek.bron.normalen) return driehoek.vlak.slice();
        return [0, 1, 2].map((a) => driehoek.bron.normalen[i * 3 + a]);
      });
    }
  } else {
    gladdeNormalen(driehoeken);
    for (const driehoek of driehoeken) {
      const sleutel = `${driehoek.band}:${driehoek.hex}`;
      if (!plek.has(sleutel)) plek.set(sleutel, bandPlek(driehoek.band, driehoek.hex));
      const hoogte = plek.get(sleutel);
      const uitslag = Math.min(UITSLAG, hoogte - RAND, 1 - RAND - hoogte);
      driehoek.uvs = driehoek.normalen.map((normaal) =>
        celUv(driehoek.band, 0.5, hoogte - uitslag * normaal[1]));
    }
  }

  return { ...naarMesh(driehoeken, banden), materialen };
}

export function naarMesh(driehoeken, banden) {
  const perSleutel = new Map();
  const posities = [];
  const normalen = [];
  const uvs = [];
  const index = [];
  let gedraaid = 0;

  for (const driehoek of driehoeken) {
    const hoek = [0, 1, 2].map((k) => {
      const p = driehoek.punten[k].map((v) => Math.fround(v));
      const n = driehoek.normalen[k].map((v) => Math.fround(v));
      const t = driehoek.uvs[k];
      const sleutel = [...p, ...n, ...t].join(',');
      let bestaand = perSleutel.get(sleutel);
      if (bestaand === undefined) {
        bestaand = posities.length / 3;
        perSleutel.set(sleutel, bestaand);
        posities.push(...p);
        normalen.push(...n);
        uvs.push(...t);
      }
      return bestaand;
    });

    const gemiddeld = [0, 1, 2].map((k) => hoek.reduce((som, h) => som + normalen[h * 3 + k], 0));
    const richting = driehoek.vlak.reduce((som, w, k) => som + w * gemiddeld[k], 0);
    if (richting < 0) {
      gedraaid++;
      index.push(hoek[0], hoek[2], hoek[1]);
    } else {
      index.push(...hoek);
    }
  }

  return {
    posities: Float32Array.from(posities),
    normalen: Float32Array.from(normalen),
    uvs: Float32Array.from(uvs),
    driehoeken: index,
    banden,
    gedraaid,
  };
}

export function schrijf(pad, mesh, opgave, pakket) {
  const stukken = [];
  const accessors = [];
  const bufferViews = [];
  let lengte = 0;

  const voegToe = (data, doel, componentType, type, extra = {}) => {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const opvulling = (4 - (lengte % 4)) % 4;
    if (opvulling) { stukken.push(Buffer.alloc(opvulling)); lengte += opvulling; }
    bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length, ...(doel ? { target: doel } : {}) });
    stukken.push(buf);
    lengte += buf.length;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType,
      count: extra.count,
      type,
      ...(extra.min ? { min: extra.min, max: extra.max } : {}),
    });
    return accessors.length - 1;
  };

  const aantal = mesh.posities.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < aantal; i++) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.posities[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }

  const attributes = {
    POSITION: voegToe(mesh.posities, 34962, 5126, 'VEC3', { count: aantal, min, max }),
    NORMAL: voegToe(mesh.normalen, 34962, 5126, 'VEC3', { count: aantal }),
    TEXCOORD_0: voegToe(mesh.uvs, 34962, 5126, 'VEC2', { count: aantal }),
  };
  const smal = aantal <= 0xffff;
  const indices = voegToe(
    smal ? Uint16Array.from(mesh.driehoeken) : Uint32Array.from(mesh.driehoeken),
    34963,
    smal ? 5123 : 5125,
    'SCALAR',
    { count: mesh.driehoeken.length },
  );

  const bin = Buffer.concat(stukken);
  const json = {
    asset: {
      generator: pakket.generator ?? 'tools/importeer/bouwer.mjs',
      version: '2.0',
      extras: {
        taaleiland: {
          versie: 1,
          schaal: pakket.schaal,
          palet: 1,
          bron: pakket.naam,
          bronmodel: opgave.bronmodel,
          ...(pakket.raster ? {} : { schaduw: { modus: 'glad', drempel: 60 } }),
        },
      },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: opgave.naam }],
    meshes: [{ primitives: [{ attributes, indices, material: 0 }] }],
    materials: [{
      name: 'colormap',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
      doubleSided: true,
      alphaMode: 'OPAQUE',
    }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
    textures: [{ sampler: 0, source: 0 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  writeGlb(pad, json, bin, writeFileSync);
}

export function kitMap(kit) {
  const doelMap = join(ROOT, 'kits', 'workfiles', kit);
  mkdirSync(join(doelMap, 'Textures'), { recursive: true });
  copyFileSync(join(ROOT, 'kits', 'colormap.png'), join(doelMap, 'Textures', 'colormap.png'));
  return doelMap;
}

export function zetTags(regels) {
  const pad = join(ROOT, 'catalog', 'tags.json');
  const data = JSON.parse(readFileSync(pad, 'utf8'));
  const perId = new Map(data.tags.map((tag) => [tag.id, tag]));

  for (const [id, tags] of regels) {
    for (const tagId of tags) {
      const tag = perId.get(tagId);
      if (!tag) throw new Error(`${id}: tag ${tagId} is not in tags.json`);
      if (!tag.models) tag.models = [];
      if (!tag.models.includes(id)) tag.models.push(id);
    }
  }

  writeFileSync(pad, JSON.stringify(data, null, 1) + '\n');
}

export function zetManifest(perKit) {
  const pad = join(ROOT, 'catalog', 'manifest.js');
  let tekst = readFileSync(pad, 'utf8');

  for (const [kit, namen] of perKit) {
    const merk = `"slug": "${kit}"`;
    const begin = tekst.indexOf(merk);
    if (begin === -1) throw new Error(`${kit}: not in catalog/manifest.js`);
    const lijstBegin = tekst.indexOf('"models": [', begin);
    const lijstEind = tekst.indexOf(']', lijstBegin);
    if (lijstBegin === -1 || lijstEind === -1) throw new Error(`${kit}: no model list in manifest.js`);

    const huidig = JSON.parse(tekst.slice(tekst.indexOf('[', lijstBegin), lijstEind + 1));
    const samen = [...new Set([...huidig, ...namen])].sort();
    const blok = samen.map((naam) => `\n   ${JSON.stringify(naam)}`).join(',') + '\n  ';
    tekst = `${tekst.slice(0, tekst.indexOf('[', lijstBegin) + 1)}${blok}${tekst.slice(lijstEind)}`;
  }

  writeFileSync(pad, tekst);
}

function schillen(primitief) {
  const perPunt = new Map();
  const aantal = primitief.indices.length / 3;
  for (let t = 0; t < aantal; t++) {
    for (let k = 0; k < 3; k++) {
      const i = primitief.indices[t * 3 + k];
      const sleutel = [0, 1, 2].map((a) => Math.round(primitief.posities[i * 3 + a] * 1e4)).join(',');
      const lijst = perPunt.get(sleutel);
      if (lijst) lijst.push(t);
      else perPunt.set(sleutel, [t]);
    }
  }

  const schil = new Int32Array(aantal).fill(-1);
  const groepen = [];
  for (let start = 0; start < aantal; start++) {
    if (schil[start] !== -1) continue;
    const groep = [];
    const stapel = [start];
    schil[start] = groepen.length;
    while (stapel.length) {
      const t = stapel.pop();
      groep.push(t);
      for (let k = 0; k < 3; k++) {
        const i = primitief.indices[t * 3 + k];
        const sleutel = [0, 1, 2].map((a) => Math.round(primitief.posities[i * 3 + a] * 1e4)).join(',');
        for (const buur of perPunt.get(sleutel)) {
          if (schil[buur] !== -1) continue;
          schil[buur] = groepen.length;
          stapel.push(buur);
        }
      }
    }
    groepen.push(groep);
  }
  return groepen;
}

export function richtSchillen(model) {
  let gedraaid = 0;
  for (const primitief of model.primitieven) {
    for (const groep of schillen(primitief)) {
      const randen = new Map();
      for (const t of groep) {
        const punt = [0, 1, 2].map((k) => {
          const i = primitief.indices[t * 3 + k];
          return [0, 1, 2].map((a) => Math.round(primitief.posities[i * 3 + a] * 1e4)).join(',');
        });
        for (let k = 0; k < 3; k++) {
          const rand = [punt[k], punt[(k + 1) % 3]].sort().join('|');
          randen.set(rand, (randen.get(rand) ?? 0) + 1);
        }
      }
      if ([...randen.values()].some((n) => n !== 2)) continue;

      let inhoud = 0;
      for (const t of groep) {
        const p = [0, 1, 2].map((k) => {
          const i = primitief.indices[t * 3 + k];
          return [0, 1, 2].map((a) => primitief.posities[i * 3 + a]);
        });
        inhoud += (
          p[0][0] * (p[1][1] * p[2][2] - p[1][2] * p[2][1])
          - p[0][1] * (p[1][0] * p[2][2] - p[1][2] * p[2][0])
          + p[0][2] * (p[1][0] * p[2][1] - p[1][1] * p[2][0])
        ) / 6;
      }
      if (inhoud >= 0) continue;

      const punten = new Set();
      for (const t of groep) {
        const b = primitief.indices[t * 3 + 1];
        primitief.indices[t * 3 + 1] = primitief.indices[t * 3 + 2];
        primitief.indices[t * 3 + 2] = b;
        gedraaid++;
        for (let k = 0; k < 3; k++) punten.add(primitief.indices[t * 3 + k]);
      }
      if (!primitief.normalen) continue;
      for (const i of punten) {
        for (let a = 0; a < 3; a++) primitief.normalen[i * 3 + a] *= -1;
      }
    }
  }
  return gedraaid;
}

export function ontdubbel(model) {
  let weg = 0;
  for (const primitief of model.primitieven) {
    const aantal = primitief.indices.length / 3;
    const midden = [0, 0, 0];
    const punten = primitief.posities.length / 3;
    for (let i = 0; i < punten; i++) {
      for (let a = 0; a < 3; a++) midden[a] += primitief.posities[i * 3 + a] / punten;
    }

    const naarBuiten = (t) => {
      const p = [0, 1, 2].map((k) => {
        const i = primitief.indices[t * 3 + k];
        return [0, 1, 2].map((a) => primitief.posities[i * 3 + a]);
      });
      const u = [0, 1, 2].map((k) => p[1][k] - p[0][k]);
      const v = [0, 1, 2].map((k) => p[2][k] - p[0][k]);
      const kruis = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]];
      return kruis.reduce(
        (som, w, k) => som + w * ((p[0][k] + p[1][k] + p[2][k]) / 3 - midden[k]),
        0,
      );
    };

    const perVlak = new Map();
    for (let t = 0; t < aantal; t++) {
      const sleutel = [0, 1, 2]
        .map((k) => {
          const i = primitief.indices[t * 3 + k];
          return [0, 1, 2].map((a) => Math.round(primitief.posities[i * 3 + a] * 1e4)).join(',');
        })
        .sort()
        .join('|');
      const staat = perVlak.get(sleutel);
      if (!staat || naarBuiten(t) > staat.buiten) perVlak.set(sleutel, { t, buiten: naarBuiten(t) });
    }
    if (perVlak.size === aantal) continue;

    const houden = new Set([...perVlak.values()].map(({ t }) => t));
    const indices = new Uint32Array(houden.size * 3);
    let n = 0;
    for (let t = 0; t < aantal; t++) {
      if (!houden.has(t)) continue;
      for (let k = 0; k < 3; k++) indices[n++] = primitief.indices[t * 3 + k];
    }
    weg += aantal - houden.size;
    primitief.indices = indices;
  }
  return weg;
}

export function richtWinding(model) {
  let gedraaid = 0;
  for (const primitief of model.primitieven) {
    if (!primitief.normalen) continue;
    for (let t = 0; t < primitief.indices.length / 3; t++) {
      const i = [0, 1, 2].map((k) => primitief.indices[t * 3 + k]);
      const punt = i.map((n) => [0, 1, 2].map((a) => primitief.posities[n * 3 + a]));
      const u = [0, 1, 2].map((k) => punt[1][k] - punt[0][k]);
      const v = [0, 1, 2].map((k) => punt[2][k] - punt[0][k]);
      const kruis = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]];
      const bron = [0, 1, 2].map((a) => i.reduce((som, n) => som + primitief.normalen[n * 3 + a], 0));
      if (kruis.reduce((som, w, k) => som + w * bron[k], 0) >= 0) continue;
      primitief.indices[t * 3 + 1] = i[2];
      primitief.indices[t * 3 + 2] = i[1];
      gedraaid++;
    }
  }
  return gedraaid;
}
