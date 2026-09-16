import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGlb } from '../../catalog/tools/glb.mjs';
import { readPng } from '../../catalog/tools/png.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const BANDEN = {
  tan: [0, 0],
  camel: [1, 0],
  chestnut: [2, 0],
  umber: [3, 0],
  terracotta: [5, 0],
  amber: [6, 0],
  sienna: [8, 0],
  hunter: [1, 1],
  moss: [3, 1],
  slate: [6, 1],
  glass: [3, 2],
  azure: [4, 2],
  ivory: [5, 2],
  basalt: [13, 3],
  taupe: [14, 3],
  nickel: [15, 3],
};

const KOLOMMEN = 16;
const RIJEN = 4;
const CEL_BREEDTE = 32;
const CEL_HOOGTE = 128;
const SPREIDING = [0.12, 0.88];
const UITSLAG = 0.35;
const RAND = 0.03;
const GLAD = Math.cos((60 * Math.PI) / 180);

const plank = ['wood-planks', 'tan'];
const balk = ['wood-beam', 'chestnut'];
const hout = ['wood-worked', 'camel'];
const schors = ['wood-bark', 'chestnut'];
const staal = ['metal-iron-steel', 'nickel'];
const smeedijzer = ['metal-iron-wrought', 'basalt'];
const goud = ['metal-gold', 'amber'];
const leer = ['leather', 'umber'];
const greep = ['leather', 'taupe', 0.21];
const touw = ['rope', 'taupe'];
const been = ['bone', 'ivory'];
const steenBlauw = ['gemstone', 'azure'];
const steenRood = ['gemstone', 'sienna'];
const gietijzer = ['metal-iron-cast', 'slate'];
const aardewerk = ['ceramic', 'ivory'];
const lak = ['ceramic', 'basalt'];
const papier = ['paper', 'ivory'];
const inkt = ['paper', 'azure'];
const ruit = ['glass', 'glass'];
const doek = ['textile', 'ivory'];
const doekRood = ['textile', 'sienna'];
const blad = ['foliage', 'moss'];
const loof = ['foliage', 'hunter'];
const bouillon = ['liquid', 'sienna'];

const stam = ['wood-log', 'tan'];
const bast = ['wood-bark', 'umber'];
const koren = ['vegetation', 'tan'];
const visLijf = ['food', 'glass'];
const visRug = ['food', 'azure'];

const deeg = ['food', 'tan'];
const korst = ['food', 'camel'];
const chocola = ['food', 'chestnut'];
const gebraden = ['food', 'terracotta'];
const geel = ['food', 'amber'];
const rood = ['food', 'sienna'];
const groen = ['food', 'moss'];
const donkergroen = ['food', 'hunter'];
const room = ['food', 'ivory'];
const paars = ['food', 'slate'];
const blauw = ['food', 'azure'];
const grijsbruin = ['food', 'taupe'];

const PAKKETTEN = [
  {
    kit: 'quat-pirate',
    bron: 'Pirate_Kit_by_Quaternius_glTF_OBJ',
    schaal: 0.35,
    atlas: true,
    modellen: [
      {
        naam: 'dock-pole', bronmodel: 'Environment_Dock_Pole', kind: 'str-barrier-post',
        tags: ['pirate', 'sailing'],
        kleuren: { '#a89a6a': touw, '#57412c': balk, '#a79163': balk },
      },
      {
        naam: 'bucket', bronmodel: 'Prop_Bucket', kind: 'obj-container-bucket',
        tags: ['ngons', 'pirate', 'sailing'],
        kleuren: { '#57412c': hout, '#857b80': smeedijzer },
      },
      {
        naam: 'bucket-fishes', bronmodel: 'Prop_Bucket_Fishes', kind: 'obj-container-bucket',
        tags: ['ngons', 'plural', 'pirate', 'sailing'],
        kleuren: {
          '#57412c': hout, '#857b80': smeedijzer,
          '#7f93af': visLijf, '#9eacbb': visLijf, '#4d8fca': visRug,
        },
      },
      {
        naam: 'chicken-leg', bronmodel: 'UI_ChickenLeg', kind: 'obj-food-meat',
        tags: ['pirate'],
        kleuren: { '#885e38': rood, '#8b1e1f': rood, '#9e957f': room },
      },
      {
        naam: 'papers', bronmodel: 'UI_Paper', kind: 'obj-pocketitem-scroll',
        tags: ['plural', 'pirate'], kleuren: { '#ce9b76': papier },
      },
      {
        naam: 'red-x', bronmodel: 'UI_Red_X', kind: 'obj',
        tags: ['pirate'], kleuren: { '#8b1e1f': steenRood },
      },
      {
        naam: 'swords', bronmodel: 'UI_Swords', kind: 'obj-weapon-melee-sword',
        tags: ['plural', 'pirate'],
        kleuren: { '#857b80': staal, '#a79da4': staal, '#e6a945': goud, '#885e38': greep },
      },
      {
        naam: 'wheat', bronmodel: 'UI_Wheat', kind: 'obj-food-grain',
        tags: ['plural'], kleuren: { '#b2a15e': koren },
      },
      {
        naam: 'logs', bronmodel: 'UI_Wood', kind: 'obj-resource-wood-log',
        tags: ['plural', 'ngons'], kleuren: { '#57412c': bast, '#907245': stam },
      },
      {
        naam: 'axe', bronmodel: 'Weapon_Axe', kind: 'obj-weapon-melee-axe',
        tags: ['pirate'],
        kleuren: { '#3a3739': staal, '#857b80': staal, '#57412c': hout, '#9e957f': greep },
      },
      {
        naam: 'axe-rifle', bronmodel: 'Weapon_AxeRifle', kind: 'obj-weapon-ranged',
        tags: ['pirate'],
        kleuren: { '#57412c': hout, '#857b80': staal, '#3a3739': staal },
      },
      {
        naam: 'cutlass', bronmodel: 'Weapon_Cutlass', kind: 'obj-weapon-melee-sword',
        tags: ['pirate'],
        kleuren: { '#885e38': greep, '#e6a945': goud, '#857b80': staal, '#a79da4': staal },
      },
      {
        naam: 'dagger', bronmodel: 'Weapon_Dagger', kind: 'obj-weapon-melee-dagger',
        tags: ['pirate'],
        kleuren: { '#3a3739': staal, '#857b80': staal, '#57412c': hout, '#9e957f': greep },
      },
      {
        naam: 'axe-double', bronmodel: 'Weapon_DoubleAxe', kind: 'obj-weapon-melee-axe',
        tags: ['pirate'],
        kleuren: { '#3a3739': staal, '#857b80': staal, '#57412c': hout, '#9e957f': greep },
      },
      {
        naam: 'shotgun-double', bronmodel: 'Weapon_DoubleShotgun', kind: 'obj-weapon-ranged',
        tags: ['pirate'],
        kleuren: {
          '#857b80': staal, '#ffffff': staal, '#e6a945': goud,
          '#57412c': hout, '#907245': hout,
        },
      },
      {
        naam: 'lute', bronmodel: 'Weapon_Lute', kind: 'obj-instrument',
        tags: ['pirate'],
        kleuren: { '#885e38': hout, '#5c4034': balk, '#3a3739': balk, '#9e957f': touw },
      },
      {
        naam: 'pistol', bronmodel: 'Weapon_Pistol', kind: 'obj-weapon-ranged',
        tags: ['pirate'],
        kleuren: { '#857b80': staal, '#e6a945': goud, '#57412c': hout },
      },
      {
        naam: 'rifle', bronmodel: 'Weapon_Rifle', kind: 'obj-weapon-ranged',
        tags: ['pirate'],
        kleuren: { '#857b80': staal, '#e6a945': goud, '#57412c': hout },
      },
      {
        naam: 'sword-1', bronmodel: 'Weapon_Sword_1', kind: 'obj-weapon-melee-sword',
        tags: ['pirate'],
        kleuren: { '#3a3739': staal, '#857b80': staal, '#57412c': hout },
      },
      {
        naam: 'sword-2', bronmodel: 'Weapon_Sword_2', kind: 'obj-weapon-melee-sword',
        tags: ['pirate'],
        kleuren: { '#3a3739': staal, '#857b80': staal, '#57412c': hout, '#e6a945': goud },
      },
    ],
  },
  {
    kit: 'quat-dun-2',
    bron: 'Updated_Modular_Dungeon_2019',
    schaal: 0.3,
    modellen: [
      {
        naam: 'skull', bronmodel: 'Skull', kind: 'env-remains-bones',
        tags: ['halloween', 'graveyard'], kleuren: { '#b9a68b': been },
      },
      {
        naam: 'coins', bronmodel: 'Coin_Pile', kind: 'obj-pocketitem-coin',
        tags: ['plural', 'ngons'], kleuren: { '#938054': goud },
      },
    ],
  },
];

const hexVan = (kleur) => '#' + kleur.map((k) => k.toString(16).padStart(2, '0')).join('');

const helderheid = (hex) => {
  const kanaal = (i) => {
    const s = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanaal(0) + 0.7152 * kanaal(1) + 0.0722 * kanaal(2);
};

const kleurenkaart = readPng(join(ROOT, 'kits', 'colormap.png'));

const atlassen = new Map();
function atlasKleur(pad, u, v) {
  if (!atlassen.has(pad)) atlassen.set(pad, readPng(pad));
  const atlas = atlassen.get(pad);
  const x = Math.min(Math.max(Math.floor(u * atlas.width), 0), atlas.width - 1);
  const y = Math.min(Math.max(Math.floor(v * atlas.height), 0), atlas.height - 1);
  const i = (y * atlas.width + x) * 4;
  return hexVan([0, 1, 2].map((k) => atlas.pixels[i + k]));
}

function bandLicht(band, deel) {
  const [kolom, rij] = BANDEN[band];
  const breedte = kleurenkaart.width / KOLOMMEN;
  const hoogte = kleurenkaart.height / RIJEN;
  const x = Math.floor(kolom * breedte + breedte / 2);
  const y = Math.min(Math.floor((rij + deel) * hoogte), kleurenkaart.height - 1);
  const i = (y * kleurenkaart.width + x) * 4;
  return helderheid(
    '#' + [0, 1, 2].map((k) => kleurenkaart.pixels[i + k].toString(16).padStart(2, '0')).join(''),
  );
}

function bandPlekken(pakket) {
  const plek = new Map();
  for (const opgave of pakket.modellen) {
    for (const [hex, [, band, vast]] of Object.entries(opgave.kleuren ?? {})) {
      const sleutel = `${band}:${hex}`;
      if (plek.has(sleutel)) continue;
      if (vast !== undefined) { plek.set(sleutel, vast); continue; }

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
      plek.set(sleutel, beste);
    }
  }
  return plek;
}

const celUv = (band, fractieU, fractieV) => {
  const [kolom, rij] = BANDEN[band];
  return [
    Math.fround((kolom + 0.5 + (fractieU - 0.5) * ((CEL_BREEDTE - 1) / CEL_BREEDTE)) / KOLOMMEN),
    Math.fround((rij + 0.5 + (fractieV - 0.5) * ((CEL_HOOGTE - 1) / CEL_HOOGTE)) / RIJEN)];
};

function celVan(primitief, driehoek, raster) {
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

function omvang(primitieven, schaal) {
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

function gladdeNormalen(driehoeken) {
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

function bouw(primitieven, opgave, pakket, plek) {
  const { laag, hoog } = omvang(primitieven, pakket.schaal);
  const midden = [(laag[0] + hoog[0]) / 2, laag[1], (laag[2] + hoog[2]) / 2];
  const banden = new Set();

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

      const hex = pakket.atlas
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
        doel = opgave.kleuren[hex];
        if (!doel) throw new Error(`${opgave.naam}: no band for ${hex}`);
        uvs = null;
      }
      banden.add(doel[1]);

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
      const hoogte = plek.get(`${driehoek.band}:${driehoek.hex}`);
      const uitslag = Math.min(UITSLAG, hoogte - RAND, 1 - RAND - hoogte);
      driehoek.uvs = driehoek.normalen.map((normaal) =>
        celUv(driehoek.band, 0.5, hoogte - uitslag * normaal[1]));
    }
  }

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

function schrijf(pad, mesh, opgave, pakket) {
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
      generator: 'tools/importeer/aanvullen.mjs',
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

function zetTags(regels) {
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

function zetManifest(perKit) {
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

const regels = [];
const perKit = new Map();

for (const pakket of PAKKETTEN) {
  const bronkit = BRONKITS.find((b) => b.map === pakket.bron);
  if (!bronkit) throw new Error(`${pakket.bron}: not in BRONKITS`);
  pakket.naam = bronkit.naam;

  const { modellen } = bronModellen(bronkit);
  const perNaam = new Map(modellen.map((model) => [model.naam, model]));
  const plek = pakket.raster ? null : bandPlekken(pakket);

  const doelMap = join(ROOT, 'kits', 'workfiles', pakket.kit);
  mkdirSync(join(doelMap, 'Textures'), { recursive: true });
  copyFileSync(join(ROOT, 'kits', 'colormap.png'), join(doelMap, 'Textures', 'colormap.png'));

  console.log(`\n${pakket.kit}  (${bronkit.naam})`);
  for (const opgave of pakket.modellen) {
    const model = perNaam.get(opgave.bronmodel);
    if (!model) throw new Error(`${opgave.bronmodel}: not in ${pakket.bron}`);

    const mesh = bouw(model.primitieven, opgave, pakket, plek);
    schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave, pakket);

    const materialen = [...new Set(
      Object.values(opgave.cellen ?? opgave.kleuren).map(([materiaal]) => materiaal),
    )];
    regels.push([`${pakket.kit}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
    perKit.set(pakket.kit, [...(perKit.get(pakket.kit) ?? []), opgave.naam]);

    console.log(
      `  ${opgave.bronmodel.padEnd(32)} → ${opgave.naam.padEnd(30)} ` +
        `${String(mesh.driehoeken.length / 3).padStart(5)} tris, ` +
        `${materialen.length} material(s), ${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}` +
        `${mesh.gedraaid ? `, ${mesh.gedraaid} flipped` : ''}`,
    );
  }
}

zetTags(regels);
zetManifest(perKit);
console.log(`\n${regels.length} models added to kits/workfiles`);
