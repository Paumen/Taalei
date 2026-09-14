import { mkdirSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng } from '../../catalog/tools/png.mjs';
import { writeGlb } from '../../catalog/tools/glb.mjs';
import { leesFbx } from '../../catalog/tools/fbx.mjs';
import { pakUit } from '../../catalog/tools/zip.mjs';
import { leesGltf } from './bron.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRON_DIR = join(ROOT, 'kits', 'sources');
const UITPAK_DIR = join(BRON_DIR, '.uitgepakt');
const WERK_DIR = join(ROOT, 'kits', 'workfiles');
const COLORMAP = join(ROOT, 'kits', 'colormap.png');

const KOLOMMEN = 16;
const RIJEN = 4;
const RAND = 0.05;

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
  silver: [3, 2],
  azure: [4, 2],
  ivory: [5, 2],
  basalt: [13, 3],
  taupe: [14, 3],
  nickel: [15, 3],
};

const KITS = [
  {
    kit: 'mek-tools',
    bron: 'tools_mekmeesk',
    naam: 'Tools (mekmeesk)',
    formaat: 'fbx',
    bestand: 'tools_mekmeesk.fbx',
    perMesh: true,
    schaal: 0.00022,
    modellen: [
      { bestand: 'Cylinder', naam: 'sword', banden: { wood: 'chestnut', metal: 'nickel' } },
      { bestand: 'axe', naam: 'axe', banden: { wood: 'chestnut', metal: 'nickel' } },
      { bestand: 'hammer_doubleaxe', naam: 'axe-double', banden: { wood: 'chestnut', metal: 'nickel' } },
      { bestand: 'brush', naam: 'brush', banden: { wood: 'tan', metal: 'nickel', brush: 'ivory', paint: 'sienna' } },
      { bestand: 'hammer_cool', naam: 'hammer-bar', banden: { wood: 'tan', metal: 'nickel' } },
      { bestand: 'hammer_ouch', naam: 'hammer-block', banden: { wood: 'tan', metal: 'nickel' } },
      { bestand: 'hammer_beemboom', naam: 'hammer-pein', banden: { wood: 'tan', metal: 'nickel' } },
      { bestand: 'hammer_bangpop', naam: 'hammer-square', banden: { wood: 'tan', metal: 'nickel' } },
      { bestand: 'hammer_kindathor', naam: 'hammer-stepped', banden: { wood: 'tan', metal: 'nickel' } },
      { bestand: 'hammer_rectangle', naam: 'hammer-wedge', banden: { wood: 'tan', metal: 'nickel' } },
      { bestand: 'nail_l', naam: 'nail-large', banden: { metal: 'basalt' } },
      { bestand: 'nail_s', naam: 'nail-small', banden: { metal: 'basalt' } },
      { bestand: 'saw_small_lowcount', naam: 'saw-coarse', banden: { wood: 'tan', metal: 'nickel', screw: 'basalt' } },
      { bestand: 'saw_bandsaw', naam: 'saw-crosscut', banden: { wood: 'tan', metal: 'nickel' } },
      { bestand: 'saw_small_highcount', naam: 'saw-fine', banden: { wood: 'tan', metal: 'nickel', screw: 'basalt' } },
      { bestand: 'saw_big', naam: 'saw-large', banden: { wood: 'tan', metal: 'nickel', screw: 'basalt' } },
    ],
  },
  {
    kit: 'fantasy-props',
    bron: 'FantasyProps_glTF_1k',
    naam: 'Fantasy Props MegaKit',
    formaat: 'gltf',
    schaal: 0.5,
    wikkel: 1.32,
    modellen: [
      { bestand: 'Chalice', naam: 'chalice', banden: { MI_Trim_Metal: 'nickel' } },
      {
        bestand: 'Pouch_Large',
        naam: 'pouch-large',
        banden: { MI_Trim_Props_Vertex: 'umber', MI_Trim_Metal: 'basalt' },
      },
      {
        bestand: 'Shield_Wooden',
        naam: 'shield-wooden',
        banden: { MI_Trim_Furniture: 'camel', MI_Trim_Metal_Vertex: 'nickel', MI_Trim_Props: 'umber' },
      },
      {
        bestand: 'Stall_Cart_Empty',
        naam: 'stall-cart',
        banden: { MI_Trim_Furniture: 'camel', MI_Trim_Metal: 'basalt', MI_Banner: 'ivory' },
      },
      {
        bestand: 'Stall_Empty',
        naam: 'stall',
        banden: { MI_Trim_Furniture: 'chestnut', MI_Trim_Metal: 'slate', MI_Banner: 'ivory' },
      },
      {
        bestand: 'Dummy',
        naam: 'training-dummy',
        banden: { MI_Trim_Furniture: 'chestnut', MI_Trim_Metal: 'basalt', MI_Trim_Cloth: 'ivory' },
      },
      {
        bestand: 'WeaponStand',
        naam: 'weapon-stand',
        banden: { MI_Trim_Furniture: 'chestnut', MI_Trim_Metal: 'basalt' },
      },
      {
        bestand: 'Whetstone',
        naam: 'whetstone',
        banden: { MI_Trim_Furniture: 'chestnut', MI_Trim_Metal: 'nickel', MI_Trim_Props_Vertex: 'taupe' },
      },
    ],
  },
];

const helderheid = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114;

const stamNaam = (naam) => String(naam ?? '').replace(/\.\d+$/, '');

function bandVanMateriaal(model, materiaal) {
  const band = model.banden[stamNaam(materiaal.naam)];
  if (!band) throw new Error(`${model.bestand}: no band for material ${materiaal.naam}`);
  if (!BANDEN[band]) throw new Error(`unknown band: ${band}`);
  return band;
}

function zoekBestand(map, naam) {
  for (const ingang of readdirSync(map, { withFileTypes: true })) {
    const pad = join(map, ingang.name);
    if (ingang.isDirectory()) {
      const gevonden = zoekBestand(pad, naam);
      if (gevonden) return gevonden;
    } else if (ingang.name === naam) return pad;
  }
  return null;
}

function uitgepakteMap(kit) {
  const map = join(UITPAK_DIR, kit.bron);
  if (!statSync(map, { throwIfNoEntry: false })) {
    for (const zip of readdirSync(join(BRON_DIR, kit.bron)).filter((n) => n.toLowerCase().endsWith('.zip')).sort()) {
      pakUit(join(BRON_DIR, kit.bron, zip), map);
    }
  }
  return map;
}

function leesBron(kit) {
  const map = uitgepakteMap(kit);
  const lees = kit.formaat === 'fbx' ? leesFbx : leesGltf;

  if (kit.perMesh) {
    const pad = zoekBestand(map, kit.bestand);
    if (!pad) throw new Error(`${kit.bron}: ${kit.bestand} not found`);
    const perMesh = new Map();
    for (const primitief of lees(pad)) {
      const naam = stamNaam(primitief.naam).replace(/_LOD0$/i, '');
      if (perMesh.has(naam)) perMesh.get(naam).push(primitief);
      else perMesh.set(naam, [primitief]);
    }
    return (model) => {
      const delen = perMesh.get(model.bestand);
      if (!delen) throw new Error(`${kit.bron}: mesh ${model.bestand} not found`);
      return delen;
    };
  }

  return (model) => {
    const pad = zoekBestand(map, `${model.bestand}.${kit.formaat}`);
    if (!pad) throw new Error(`${kit.bron}: ${model.bestand}.${kit.formaat} not found`);
    return lees(pad);
  };
}

const texturen = new Map();

function leesTextuur(pad) {
  if (!texturen.has(pad)) {
    const png = readPng(pad);
    texturen.set(pad, (u, v) => {
      const x = Math.min(Math.max(Math.floor(u * png.width), 0), png.width - 1);
      const y = Math.min(Math.max(Math.floor(v * png.height), 0), png.height - 1);
      const i = (y * png.width + x) * 4;
      return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]];
    });
  }
  return texturen.get(pad);
}

function bronKleuren(primitief) {
  const { textuur, kleur } = primitief.materiaal;
  const aantal = primitief.posities.length / 3;
  const monster = textuur && primitief.uvs ? leesTextuur(textuur) : null;
  if (!monster && !primitief.hoekkleuren) return kleur ? new Array(aantal).fill(kleur) : null;

  const uit = [];
  for (let i = 0; i < aantal; i++) {
    const basis = monster ? monster(primitief.uvs[i * 2], primitief.uvs[i * 2 + 1]) : (kleur ?? [255, 255, 255]);
    const tint = primitief.hoekkleuren;
    uit.push(tint ? basis.map((v, k) => v * tint[i * 3 + k]) : basis);
  }
  return uit;
}

function schaalPerPunt(posities) {
  let laag = Infinity;
  let hoog = -Infinity;
  for (const v of posities) {
    if (v < laag) laag = v;
    if (v > hoog) hoog = v;
  }
  return hoog - laag;
}

function puntIds(posities) {
  const ids = new Int32Array(posities.length / 3);
  const perPunt = new Map();
  for (let i = 0; i < ids.length; i++) {
    const sleutel = [0, 1, 2].map((k) => Math.round(posities[i * 3 + k] * 1e4)).join(',');
    let id = perPunt.get(sleutel);
    if (id === undefined) {
      id = perPunt.size;
      perPunt.set(sleutel, id);
    }
    ids[i] = id;
  }
  return ids;
}

function orienteer(primitief) {
  const { posities, indices } = primitief;
  const ids = puntIds(posities);
  const aantal = indices.length / 3;

  const randen = new Map();
  for (let t = 0; t < aantal; t++) {
    for (let k = 0; k < 3; k++) {
      const a = ids[indices[t * 3 + k]];
      const b = ids[indices[t * 3 + ((k + 1) % 3)]];
      if (a === b) continue;
      const sleutel = a < b ? `${a}_${b}` : `${b}_${a}`;
      const buren = randen.get(sleutel);
      if (buren) buren.push({ t, richting: a < b ? 1 : -1 });
      else randen.set(sleutel, [{ t, richting: a < b ? 1 : -1 }]);
    }
  }

  const buurPerDriehoek = Array.from({ length: aantal }, () => []);
  for (const buren of randen.values()) {
    if (buren.length !== 2) continue;
    const [een, twee] = buren;
    buurPerDriehoek[een.t].push({ t: twee.t, gelijk: een.richting !== twee.richting });
    buurPerDriehoek[twee.t].push({ t: een.t, gelijk: een.richting !== twee.richting });
  }

  const vlag = new Int8Array(aantal);
  const groep = new Int32Array(aantal).fill(-1);
  const groepen = [];
  for (let start = 0; start < aantal; start++) {
    if (groep[start] !== -1) continue;
    const nummer = groepen.length;
    const leden = [];
    const stapel = [start];
    vlag[start] = 1;
    groep[start] = nummer;
    while (stapel.length) {
      const t = stapel.pop();
      leden.push(t);
      for (const buur of buurPerDriehoek[t]) {
        const gewenst = buur.gelijk ? vlag[t] : -vlag[t];
        if (groep[buur.t] === -1) {
          groep[buur.t] = nummer;
          vlag[buur.t] = gewenst;
          stapel.push(buur.t);
        }
      }
    }
    groepen.push(leden);
  }

  const gesloten = groepen.map((leden) => leden.every((t) => buurPerDriehoek[t].length === 3));

  const omkeren = new Uint8Array(aantal);
  groepen.forEach((leden, nummer) => {
    const hoekenVan = (t) =>
      [0, 1, 2].map((k) => {
        const i = indices[t * 3 + (vlag[t] === 1 ? k : 2 - k)];
        return [0, 1, 2].map((as) => posities[i * 3 + as]);
      });

    let maat = 0;
    if (gesloten[nummer]) {
      for (const t of leden) {
        const hoek = hoekenVan(t);
        maat +=
          (hoek[0][0] * (hoek[1][1] * hoek[2][2] - hoek[1][2] * hoek[2][1])
            + hoek[0][1] * (hoek[1][2] * hoek[2][0] - hoek[1][0] * hoek[2][2])
            + hoek[0][2] * (hoek[1][0] * hoek[2][1] - hoek[1][1] * hoek[2][0])) / 6;
      }
    } else {
      const midden = [0, 0, 0];
      for (const t of leden) {
        for (const punt of hoekenVan(t)) for (let k = 0; k < 3; k++) midden[k] += punt[k] / (leden.length * 3);
      }
      for (const t of leden) {
        const hoek = hoekenVan(t);
        const ab = [0, 1, 2].map((k) => hoek[1][k] - hoek[0][k]);
        const ac = [0, 1, 2].map((k) => hoek[2][k] - hoek[0][k]);
        const vlak = [
          ab[1] * ac[2] - ab[2] * ac[1],
          ab[2] * ac[0] - ab[0] * ac[2],
          ab[0] * ac[1] - ab[1] * ac[0],
        ];
        const naar = [0, 1, 2].map((k) => (hoek[0][k] + hoek[1][k] + hoek[2][k]) / 3 - midden[k]);
        maat += vlak.reduce((som, v, k) => som + v * naar[k], 0);
      }
    }

    const naarBuiten = maat < 0 ? -1 : 1;
    for (const t of leden) if (vlag[t] * naarBuiten === -1) omkeren[t] = 1;
  });

  if (!omkeren.some((v) => v)) return primitief;

  const nieuwePosities = new Float64Array(aantal * 9);
  const nieuweNormalen = primitief.normalen ? new Float64Array(aantal * 9) : null;
  const nieuweUvs = primitief.uvs ? new Float64Array(aantal * 6) : null;
  const nieuweHoekkleuren = primitief.hoekkleuren ? new Float64Array(aantal * 9) : null;
  const nieuweIndices = new Uint32Array(aantal * 3);

  for (let t = 0; t < aantal; t++) {
    for (let k = 0; k < 3; k++) {
      const bron = indices[t * 3 + (omkeren[t] ? 2 - k : k)];
      const doel = t * 3 + k;
      nieuweIndices[doel] = doel;
      for (let as = 0; as < 3; as++) {
        nieuwePosities[doel * 3 + as] = posities[bron * 3 + as];
        if (nieuweNormalen) {
          nieuweNormalen[doel * 3 + as] = (omkeren[t] ? -1 : 1) * primitief.normalen[bron * 3 + as];
        }
        if (nieuweHoekkleuren) nieuweHoekkleuren[doel * 3 + as] = primitief.hoekkleuren[bron * 3 + as];
      }
      if (nieuweUvs) {
        nieuweUvs[doel * 2] = primitief.uvs[bron * 2];
        nieuweUvs[doel * 2 + 1] = primitief.uvs[bron * 2 + 1];
      }
    }
  }

  return {
    ...primitief,
    posities: nieuwePosities,
    normalen: nieuweNormalen,
    uvs: nieuweUvs,
    hoekkleuren: nieuweHoekkleuren,
    indices: nieuweIndices,
  };
}

function schrijfModel(kit, gelezen, bereik) {
  const { model, primitieven, kleuren } = gelezen;
  const posities = [];
  const normalen = [];
  const uvs = [];
  const indices = [];

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const prim of primitieven) {
    for (let i = 0; i < prim.posities.length / 3; i++) {
      for (let k = 0; k < 3; k++) {
        const v = prim.posities[i * 3 + k] * kit.schaal;
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
  }
  const verschuif = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
  const inNode = Boolean(kit.wikkel);

  const perHoek = new Map();
  primitieven.forEach((prim, p) => {
    const opnieuw = new Int32Array(prim.posities.length / 3);
    for (let i = 0; i < prim.posities.length / 3; i++) {
      const plek3 = [0, 1, 2].map((k) =>
        Math.fround(inNode ? prim.posities[i * 3 + k] : prim.posities[i * 3 + k] * kit.schaal + verschuif[k]),
      );
      const norm = [0, 1, 2].map((k) => Math.fround(prim.normalen ? prim.normalen[i * 3 + k] : 0));

      const rgb = kleuren[p]?.[i] ?? null;
      const [kolom, rij] = BANDEN[bandVanMateriaal(model, prim.materiaal)];
      const deel = rgb ? (bereik.licht - helderheid(rgb)) / (bereik.licht - bereik.donker) : 0.5;
      const plek = RAND + Math.min(Math.max(deel, 0), 1) * (1 - 2 * RAND);
      const uv = [Math.fround((kolom + 0.5) / KOLOMMEN), Math.fround((rij + plek) / RIJEN)];

      const sleutel = [...plek3, ...norm, ...uv].join(',');
      let index = perHoek.get(sleutel);
      if (index === undefined) {
        index = posities.length / 3;
        perHoek.set(sleutel, index);
        posities.push(...plek3);
        normalen.push(...norm);
        uvs.push(...uv);
      }
      opnieuw[i] = index;
    }
    for (const i of prim.indices) indices.push(opnieuw[i]);
  });

  const posBuf = Buffer.from(Float32Array.from(posities).buffer);
  const norBuf = Buffer.from(Float32Array.from(normalen).buffer);
  const uvBuf = Buffer.from(Float32Array.from(uvs).buffer);
  const idxBuf = Buffer.from(Uint32Array.from(indices).buffer);
  const bin = Buffer.concat([posBuf, norBuf, uvBuf, idxBuf]);

  const telling = posities.length / 3;
  const nodes = inNode
    ? [
        {
          name: model.naam,
          mesh: 0,
          translation: verschuif.map((v) => Math.round(v * 1e5) / 1e5),
          scale: [kit.schaal, kit.schaal, kit.schaal],
        },
        { name: 'rescale-wrapper', scale: [kit.wikkel, kit.wikkel, kit.wikkel], children: [0] },
      ]
    : [{ mesh: 0, name: model.naam }];

  const json = {
    asset: {
      generator: 'tools/importeer/gereedschap.mjs',
      version: '2.0',
      extras: {
        taaleiland: {
          versie: 1,
          schaal: kit.schaal,
          palet: 1,
          bron: kit.naam,
          bronmodel: model.bestand,
        },
      },
    },
    scene: 0,
    scenes: [{ nodes: [nodes.length - 1] }],
    nodes,
    meshes: [{ name: model.naam, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [
      {
        name: 'colormap',
        pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
        doubleSided: true,
        alphaMode: 'OPAQUE',
      },
    ],
    textures: [{ sampler: 0, source: 0 }],
    samplers: [{ minFilter: 9987 }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length, byteLength: norBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length + norBuf.length, byteLength: uvBuf.length, target: 34962 },
      { buffer: 0, byteOffset: posBuf.length + norBuf.length + uvBuf.length, byteLength: idxBuf.length, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0, componentType: 5126, count: telling, type: 'VEC3',
        min: [0, 1, 2].map((k) => Math.min(...Array.from({ length: telling }, (_, i) => posities[i * 3 + k]))),
        max: [0, 1, 2].map((k) => Math.max(...Array.from({ length: telling }, (_, i) => posities[i * 3 + k]))),
      },
      { bufferView: 1, componentType: 5126, count: telling, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: telling, type: 'VEC2' },
      { bufferView: 3, componentType: 5125, count: indices.length, type: 'SCALAR' },
    ],
  };

  const doel = join(WERK_DIR, kit.kit, `${model.naam}.glb`);
  writeGlb(doel, json, bin, writeFileSync);
  return {
    naam: model.naam,
    driehoeken: indices.length / 3,
    wdh: max.map((v, k) => Math.round((v - min[k]) * (kit.wikkel ?? 1) * 1000) / 1000),
  };
}

const gevraagd = process.argv.slice(2);
const teDoen = gevraagd.length ? KITS.filter((kit) => gevraagd.includes(kit.kit)) : KITS;
for (const naam of gevraagd) {
  if (!KITS.some((kit) => kit.kit === naam)) throw new Error(`unknown kit: ${naam}`);
}

for (const kit of teDoen) {
  mkdirSync(join(WERK_DIR, kit.kit, 'Textures'), { recursive: true });
  copyFileSync(COLORMAP, join(WERK_DIR, kit.kit, 'Textures', 'colormap.png'));

  const haal = leesBron(kit);
  const gelezen = kit.modellen.map((model) => {
    const primitieven = haal(model).map(orienteer);
    return { model, primitieven, kleuren: primitieven.map(bronKleuren) };
  });

  let licht = -Infinity;
  let donker = Infinity;
  for (const { kleuren } of gelezen) {
    for (const perPrim of kleuren) {
      for (const rgb of perPrim ?? []) {
        const l = helderheid(rgb);
        if (l > licht) licht = l;
        if (l < donker) donker = l;
      }
    }
  }

  console.log(`${kit.kit}: schaal ${kit.schaal}, helderheid ${Math.round(donker)}-${Math.round(licht)}`);
  for (const model of gelezen) {
    const uit = schrijfModel(kit, model, { licht, donker });
    console.log(`  ${uit.naam} — ${uit.driehoeken} tris, ${uit.wdh.join(' × ')}`);
  }
}
