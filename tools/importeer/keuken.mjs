import { mkdirSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng } from '../../catalog/tools/png.mjs';
import { writeGlb } from '../../catalog/tools/glb.mjs';
import { leesFbx } from '../../catalog/tools/fbx.mjs';
import { pakUit } from '../../catalog/tools/zip.mjs';
import { leesObj } from './bron.mjs';

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
    kit: 'charming-kitchen',
    bron: 'Charming_Kitchen_set',
    naam: 'Charming Kitchen Set',
    formaat: 'fbx',
    schaal: 0.0025,
    modellen: [
      { bestand: 'container_kitchen_A_white', naam: 'canister-a-white', kleuren: { '#f8e0cf': 'ivory' } },
      { bestand: 'container_kitchen_B_red', naam: 'canister-b-red', kleuren: { '#d24321': 'terracotta' } },
      { bestand: 'container_kitchen_B_white', naam: 'canister-b-white', kleuren: { '#f8dfcd': 'ivory' } },
      { bestand: 'cuttingboard', naam: 'cutting-board', kleuren: { '#be825b': 'camel' } },
      { bestand: 'dishrack_plates', naam: 'dishrack-plates', kleuren: { '#e3e9ed': 'ivory', '#b57753': 'camel' } },
      { bestand: 'kettle', naam: 'kettle', kleuren: { '#909cbc': 'slate', '#a9b5d0': 'slate', '#4e5458': 'basalt' } },
      { bestand: 'knife', naam: 'knife', kleuren: { '#adb1bb': 'nickel', '#c4c8cf': 'nickel', '#9598a6': 'nickel', '#d64e23': 'chestnut' } },
      { bestand: 'lid', naam: 'lid', kleuren: { '#c9cdd4': 'nickel' } },
      { bestand: 'mug_blue', naam: 'mug-taupe', kleuren: { '#5dbebd': 'taupe' } },
      { bestand: 'mug_red', naam: 'mug-terracotta', kleuren: { '#da5d25': 'terracotta' } },
      { bestand: 'mug_yellow', naam: 'mug-ivory', kleuren: { '#fecc4c': 'ivory' } },
      { bestand: 'pan', naam: 'pan', kleuren: { '#aeb2bc': 'nickel', '#c3c8cf': 'nickel' } },
      { bestand: 'plate', naam: 'plate', kleuren: { '#e3e9ed': 'ivory' } },
      { bestand: 'pot', naam: 'pot', kleuren: { '#a1a4b1': 'nickel', '#c2c7ce': 'nickel' } },
      { bestand: 'spatula', naam: 'spatula', kleuren: { '#b1b5bf': 'nickel', '#454b4f': 'chestnut' } },
      { bestand: 'spoon', naam: 'spoon', kleuren: { '#eaa070': 'camel', '#c47044': 'camel' } },
      { bestand: 'utensils_cup', naam: 'utensil-crock', kleuren: { '#9ed5ee': 'ivory', '#78b7e2': 'ivory', '#eaa070': 'camel', '#c47044': 'camel', '#b0b4be': 'nickel', '#444a4e': 'chestnut' } },
      { bestand: 'wall_shelf_kitchen', naam: 'wall-shelf', kleuren: { '#e29767': 'tan', '#d3dde3': 'basalt' } },
      { bestand: 'wall_shelf_kitchen_corner', naam: 'wall-shelf-corner', kleuren: { '#e29667': 'tan', '#d3dde3': 'basalt' } },
    ],
  },
  {
    kit: 'cooking-assets',
    bron: 'Cooking_Assets',
    naam: 'Cooking Assets',
    formaat: 'obj',
    schaal: 0.037,
    modellen: [
      { bestand: 'Chopsticks', naam: 'chopsticks', kleuren: { '#fbaa84': 'camel', '#222323': 'chestnut' } },
      { bestand: 'board_charcuterie_board', naam: 'charcuterie-board', kleuren: { '#d58d6b': 'camel' } },
      { bestand: 'board_cutting_board_001', naam: 'cutting-board-a', kleuren: { '#d58d6b': 'camel' } },
      { bestand: 'board_cutting_board_002', naam: 'cutting-board-b', kleuren: { '#d58d6b': 'camel' } },
      { bestand: 'cutensil_grind_mortar_and_pestle', naam: 'mortar-and-pestle', kleuren: { '#f5f7fa': 'taupe' } },
      { bestand: 'cutensils_asian_turner', naam: 'turner', kleuren: { '#828b98': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'cutensils_big_spoon', naam: 'cooking-spoon', kleuren: { '#828b98': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'cutensils_laddle', naam: 'ladle-a', kleuren: { '#828b98': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'cutensils_laddle_2', naam: 'ladle-b', kleuren: { '#828b98': 'nickel' } },
      { bestand: 'cutensils_spatula', naam: 'spatula', kleuren: { '#828b98': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'cutensils_tongs', naam: 'tongs-open', kleuren: { '#828b98': 'nickel', '#2d3136': 'chestnut', '#a6aeba': 'nickel' } },
      { bestand: 'cutensils_tongs_closed', naam: 'tongs', kleuren: { '#828b98': 'nickel', '#2d3136': 'chestnut', '#a6aeba': 'nickel' } },
      { bestand: 'cutensils_whisk', naam: 'whisk', kleuren: { '#828b98': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'cutensils_wooden_paddle', naam: 'wooden-paddle', kleuren: { '#d58d6b': 'camel' } },
      { bestand: 'knife_bread_knife', naam: 'bread-knife', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'knife_chef_knife', naam: 'chef-knife', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'knife_cleaver_w_hole', naam: 'cleaver', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'knife_naikiri_knife', naam: 'nakiri-knife', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'knife_paring_knife_001', naam: 'paring-knife', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'knife_santoku_knife', naam: 'santoku-knife', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'misc_cloche', naam: 'cloche', kleuren: { '#a6aeba': 'nickel' } },
      { bestand: 'misc_kettle', naam: 'kettle', kleuren: { '#a6aeba': 'nickel', '#222323': 'chestnut' } },
      { bestand: 'misc_rolling_pin', naam: 'rolling-pin', kleuren: { '#d58d6b': 'camel' } },
      { bestand: 'misc_strainer', naam: 'strainer', kleuren: { '#a6aeba': 'nickel' } },
      { bestand: 'pan_casserole_pot', naam: 'casserole-pot', kleuren: { '#828b98': 'nickel', '#f5f7fa': 'nickel', '#a6aeba': 'nickel' } },
      { bestand: 'pan_cast_iron_skillet', naam: 'skillet-cast', kleuren: { '#222323': 'slate' } },
      { bestand: 'pan_ceramic_pot_large', naam: 'crock-large', kleuren: { '#cd5e46': 'terracotta' } },
      { bestand: 'pan_dutch_oven', naam: 'dutch-oven', kleuren: { '#2f690c': 'slate' } },
      { bestand: 'pan_frying_pan', naam: 'frying-pan', kleuren: { '#828b98': 'nickel' } },
      { bestand: 'pan_paella_pan', naam: 'paella-pan', kleuren: { '#222323': 'slate', '#828b98': 'slate' } },
      { bestand: 'pan_sauce_pan_large_001', naam: 'sauce-pan-large', kleuren: { '#828b98': 'nickel', '#f5f7fa': 'nickel', '#a6aeba': 'nickel' } },
      { bestand: 'pan_sauce_pan_small_001', naam: 'sauce-pan-small', kleuren: { '#828b98': 'nickel', '#f5f7fa': 'nickel', '#a6aeba': 'nickel' } },
      { bestand: 'pan_saute_pan', naam: 'saute-pan', kleuren: { '#828b98': 'nickel', '#f5f7fa': 'nickel', '#a6aeba': 'nickel' } },
      { bestand: 'pan_skillet', naam: 'skillet', kleuren: { '#828b98': 'nickel' } },
      { bestand: 'pan_stock_pot', naam: 'stock-pot', kleuren: { '#828b98': 'nickel' } },
      { bestand: 'plate_oval', naam: 'plate-oval-small', kleuren: { '#f5f7fa': 'ivory' } },
      { bestand: 'plate_oval_001', naam: 'platter-oval', kleuren: { '#f5f7fa': 'ivory' } },
      { bestand: 'plate_rectangle', naam: 'plate-rectangle', kleuren: { '#f5f7fa': 'ivory' } },
      { bestand: 'sercups_beer_mug', naam: 'tankard', kleuren: { '#f5f7fa': 'ivory' } },
      { bestand: 'sercups_mug', naam: 'mug', kleuren: { '#bbafa4': 'taupe' } },
      { bestand: 'sercups_teacup', naam: 'teacup', kleuren: { '#f5f7fa': 'ivory' } },
      { bestand: 'serving_bowl_3', naam: 'serving-bowl', kleuren: { '#225918': 'terracotta' } },
      { bestand: 'sspoon_rice_paddle', naam: 'rice-paddle', kleuren: { '#f5f7fa': 'camel' } },
      { bestand: 'utensil_butter_knife_001', naam: 'butter-knife', kleuren: { '#cdd2da': 'nickel' } },
      { bestand: 'utensil_fork', naam: 'fork', kleuren: { '#cdd2da': 'nickel' } },
      { bestand: 'utensil_spoon', naam: 'spoon', kleuren: { '#cdd2da': 'nickel' } },
    ],
  },
];

const ontleed = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const helderheid = ([r, g, b]) => r * 0.299 + g * 0.587 + b * 0.114;
const afstand = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function bandVan(kleuren, rgb) {
  let beste = null;
  let besteAfstand = Infinity;
  for (const [hex, band] of Object.entries(kleuren)) {
    const d = afstand(ontleed(hex), rgb);
    if (d < besteAfstand) {
      besteAfstand = d;
      beste = band;
    }
  }
  if (!BANDEN[beste]) throw new Error(`unknown band: ${beste}`);
  return beste;
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

function bronBestand(kit, model) {
  const map = join(UITPAK_DIR, kit.bron);
  if (!statSync(map, { throwIfNoEntry: false })) {
    for (const zip of readdirSync(join(BRON_DIR, kit.bron)).filter((n) => n.toLowerCase().endsWith('.zip')).sort()) {
      pakUit(join(BRON_DIR, kit.bron, zip), map);
    }
  }
  const pad = zoekBestand(map, `${model.bestand}.${kit.formaat}`);
  if (!pad) throw new Error(`${kit.bron}: ${model.bestand}.${kit.formaat} not found`);
  return pad;
}

function vindTextuur(kit, gevraagd) {
  if (!gevraagd) return null;
  if (gevraagd.includes('/')) return gevraagd;
  return zoekBestand(join(UITPAK_DIR, kit.bron), gevraagd.replace(/\\+/g, '/').split('/').pop());
}

function leesTextuur(pad) {
  const png = readPng(pad);
  return (u, v) => {
    const x = Math.min(Math.max(Math.floor(u * png.width), 0), png.width - 1);
    const y = Math.min(Math.max(Math.floor(v * png.height), 0), png.height - 1);
    const i = (y * png.width + x) * 4;
    return [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2]];
  };
}

function bronKleuren(kit) {
  const texturen = new Map();
  const lees = kit.formaat === 'fbx' ? leesFbx : leesObj;
  return kit.modellen.map((model) => {
    const primitieven = lees(bronBestand(kit, model));
    const kleuren = [];
    for (const prim of primitieven) {
      const pad = vindTextuur(kit, prim.materiaal.textuur);
      if (!pad) throw new Error(`${model.bestand}: primitive without a texture`);
      if (!texturen.has(pad)) texturen.set(pad, leesTextuur(pad));
      const monster = texturen.get(pad);
      const perHoek = [];
      for (let i = 0; i < prim.uvs.length / 2; i++) {
        perHoek.push(monster(prim.uvs[i * 2], prim.uvs[i * 2 + 1]));
      }
      kleuren.push(perHoek);
    }
    return { model, primitieven, kleuren };
  });
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

  const perHoek = new Map();
  primitieven.forEach((prim, p) => {
    const opnieuw = new Int32Array(prim.posities.length / 3);
    for (let i = 0; i < prim.posities.length / 3; i++) {
      const plek3 = [0, 1, 2].map((k) => Math.fround(prim.posities[i * 3 + k] * kit.schaal + verschuif[k]));
      const norm = [0, 1, 2].map((k) => Math.fround(prim.normalen ? prim.normalen[i * 3 + k] : 0));

      const band = bandVan(model.kleuren, kleuren[p][i]);
      const [kolom, rij] = BANDEN[band];
      const deel = (bereik.licht - helderheid(kleuren[p][i])) / (bereik.licht - bereik.donker);
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
  const json = {
    asset: {
      generator: 'tools/importeer/keuken.mjs',
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
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: model.naam }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
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
  return { naam: model.naam, hoeken: telling, driehoeken: indices.length / 3 };
}

for (const kit of KITS) {
  mkdirSync(join(WERK_DIR, kit.kit, 'Textures'), { recursive: true });
  copyFileSync(COLORMAP, join(WERK_DIR, kit.kit, 'Textures', 'colormap.png'));

  const gelezen = bronKleuren(kit);
  let licht = -Infinity;
  let donker = Infinity;
  for (const { kleuren } of gelezen) {
    for (const perPrim of kleuren) {
      for (const rgb of perPrim) {
        const l = helderheid(rgb);
        if (l > licht) licht = l;
        if (l < donker) donker = l;
      }
    }
  }

  console.log(`${kit.kit}: schaal ${kit.schaal}, helderheid ${Math.round(donker)}-${Math.round(licht)}`);
  for (const model of gelezen) {
    const uit = schrijfModel(kit, model, { licht, donker });
    console.log(`  ${uit.naam} — ${uit.driehoeken} tris`);
  }
}
