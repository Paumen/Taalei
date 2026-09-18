import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, writeGlb, measureScene } from '../../catalog/tools/glb.mjs';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen, meet, kebab } from '../../catalog/tools/bronmodellen.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WERK_DIR = join(ROOT, 'kits', 'workfiles');

const DOEL = {
  architecture: 4,
  'arena-pack': 0.15,
  'asia-grave': 0.15,
  'asia-pack': 0.3,
  'asia-rg': 0.46,
  'asia-rocks': 0.2,
  'clay-props': 0.65,
  'cooking-assets': 0.04,
  'desert-buildings': 0.0024,
  'fishing-village': 0.435,
  'fs-terrain': 0.5,
  'fs-town': 0.5,
  'isa-bakery': 0.32,
  'isa-food': 0.24,
  'isa-kitchen': 0.32,
  'isa-park': 0.24,
  'isa-picnic': 0.24,
  'isa-plants': 0.24,
  'isa-playground': 0.24,
  'isa-pond': 0.24,
  'jelly-forest': 0.4,
  'kay-builder': 1,
  'kay-food': 0.23,
  'kay-hallow': 0.24,
  'ken-cave': 0.187,
  'ken-pirate': 0.3,
  'ken-survival': 1.4,
  'medieval-forge': 0.006,
  'medieval-town': 1.1,
  'medieval-village': 0.47,
  'mek-tools': 0.00022,
  natuur: 0.39,
  'post-apocalypse': 0.45,
  'primitive-tools': 0.0045,
  props: 0.008,
  'quat-blood-ring': 0.15,
  'quat-dun-1': 0.25,
  'quat-dun-2': 0.4,
  'quat-fish': 0.1,
  'quat-food': 0.15,
  'quat-nature': 0.4,
  'quat-pirate': 0.385,
  'quat-props': 0.8,
  'quat-rpg': 0.22,
  'quat-ships': 1.25,
  'quat-skeleton': 0.5,
  'quat-town': 1.2,
  rocks: 0.15,
  'small-props': 0.0037,
  trees: 0.24,
  village: 0.3,
  windmill: 0.008,
};
const KEN_STANDAARD = 0.75;
const KAY_STANDAARD = 0.3;
const ONGEMOEID = new Set(['quat-ocean']);
const SPREIDING = 0.02;
const SNAP = 0.005;
const MAAT_TOLERANTIE = 0.002;
const AFRONDING = 0.0015;
const RUIS = 1e-4;

const alleenRapport = process.argv.includes('--report');

const BREEDTE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function knoopSchaal(node) {
  if (node.matrix) {
    const m = node.matrix;
    return Math.hypot(m[0], m[1], m[2]);
  }
  return (node.scale ?? [1, 1, 1])[0];
}

function knoopFactor(json) {
  const nodes = json.nodes ?? [];
  const keten = new Map();
  const loop = (index, opgebouwd) => {
    const node = nodes[index];
    if (!node) return;
    const nu = opgebouwd * knoopSchaal(node);
    keten.set(index, nu);
    for (const kind of node.children ?? []) loop(kind, nu);
  };
  for (const wortel of json.scenes?.[json.scene ?? 0]?.nodes ?? []) loop(wortel, 1);

  const gevonden = new Set();
  nodes.forEach((node, index) => {
    if (node.mesh === undefined || node.skin !== undefined || !keten.has(index)) return;
    gevonden.add(keten.get(index));
  });
  for (const skin of json.skins ?? []) {
    const wortel = skin.skeleton ?? skin.joints?.[0];
    if (wortel !== undefined && keten.has(wortel)) gevonden.add(keten.get(wortel));
  }
  const waarden = [...gevonden];
  if (waarden.length === 0) return 1;
  if (waarden.some((v) => Math.abs(v - waarden[0]) > 1e-3 * Math.abs(waarden[0]))) return null;
  return waarden[0];
}

function werkbestanden(slug) {
  const dir = join(WERK_DIR, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.glb'))
    .map((bestand) => {
      const pad = join(dir, bestand);
      const glb = readGlb(pad);
      const gemeten = measureScene(glb);
      return {
        pad,
        naam: basename(bestand, '.glb'),
        bronmodel: glb.json.asset?.extras?.taaleiland?.bronmodel ?? null,
        schaal: glb.json.asset?.extras?.taaleiland?.schaal ?? null,
        wdh: gemeten.wdhExact,
        driehoeken: gemeten.triangles,
        knoop: knoopFactor(glb.json),
      };
    });
}

function metenTegenBron(bronkit, bestanden) {
  const gemeten = new Map();
  let bron;
  try {
    bron = bronModellen(bronkit).modellen;
  } catch {
    return gemeten;
  }

  const opBronmodel = new Map();
  const opNaam = new Map();
  const opDriehoeken = new Map();
  for (const bestand of bestanden) {
    if (bestand.bronmodel) opBronmodel.set(bestand.bronmodel, bestand);
    opNaam.set(bestand.naam, bestand);
    const gelijk = opDriehoeken.get(bestand.driehoeken);
    if (gelijk) gelijk.push(bestand);
    else opDriehoeken.set(bestand.driehoeken, [bestand]);
  }

  const gemetenBron = bron.map((model) => ({ model, ...meet(model.primitieven) }));
  const bronPerDriehoek = new Map();
  for (const item of gemetenBron) {
    const gelijk = bronPerDriehoek.get(item.driehoeken);
    if (gelijk) gelijk.push(item);
    else bronPerDriehoek.set(item.driehoeken, [item]);
  }

  const zelfdeMaat = (groep) =>
    groep.every((g) => g.wdh.every((v, k) => Math.abs(v - groep[0].wdh[k]) <= SPREIDING * Math.max(v, 1e-9)));

  for (const { model, driehoeken, wdh } of gemetenBron) {
    const opMaat =
      opDriehoeken.get(driehoeken)?.length === 1 && zelfdeMaat(bronPerDriehoek.get(driehoeken))
        ? opDriehoeken.get(driehoeken)[0]
        : null;
    const bestand = opBronmodel.get(model.naam) ?? opNaam.get(kebab(model.naam)) ?? opMaat;
    if (!bestand) continue;
    const bronWdh = [wdh[0], wdh[2], wdh[1]];
    const assen = [0, 1, 2].filter((k) => bronWdh[k] > 1e-9 && bestand.wdh[k] > 1e-9);
    if (assen.length === 0) continue;
    const verhoudingen = assen.map((k) => bestand.wdh[k] / bronWdh[k]);
    if (Math.max(...verhoudingen) / Math.min(...verhoudingen) > 1 + SPREIDING) continue;
    gemeten.set(bestand.naam, {
      factor: verhoudingen.reduce((a, b) => a + b, 0) / verhoudingen.length,
      bron: bronWdh,
    });
  }
  return gemeten;
}

function groepeer(waarden) {
  const gesorteerd = [...waarden].sort((a, b) => a - b);
  const groepen = [];
  for (const waarde of gesorteerd) {
    const laatste = groepen[groepen.length - 1];
    if (laatste && waarde / laatste[0] <= 1 + SPREIDING * 2) laatste.push(waarde);
    else groepen.push([waarde]);
  }
  return groepen.map((groep) => ({
    factor: Number(groep[Math.floor(groep.length / 2)].toPrecision(4)),
    aantal: groep.length,
    laag: groep[0],
    hoog: groep[groep.length - 1],
  }));
}

function schaalAccessor(json, bin, index, factor, alleenVerplaatsing) {
  const accessor = json.accessors[index];
  if (accessor.componentType !== 5126) {
    throw new Error(`accessor ${index} is not float32`);
  }
  if (accessor.sparse) throw new Error(`accessor ${index} is sparse`);
  const breedte = BREEDTE[accessor.type];
  const view = json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stap = view.byteStride ?? breedte * 4;
  const kolommen = alleenVerplaatsing ? [12, 13, 14] : [...Array(breedte).keys()];

  for (let i = 0; i < accessor.count; i++) {
    for (const k of kolommen) {
      const plek = start + i * stap + k * 4;
      bin.writeFloatLE(Math.fround(bin.readFloatLE(plek) * factor), plek);
    }
  }
  if (accessor.min && !alleenVerplaatsing) accessor.min = accessor.min.map((v) => v * factor);
  if (accessor.max && !alleenVerplaatsing) accessor.max = accessor.max.map((v) => v * factor);
}

function ontbak(json, bin, factor) {
  const posities = new Set();
  const matrices = new Set();
  const verplaatsingen = new Set();

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.attributes.POSITION !== undefined) posities.add(prim.attributes.POSITION);
      for (const doel of prim.targets ?? []) {
        if (doel.POSITION !== undefined) posities.add(doel.POSITION);
      }
    }
  }
  for (const skin of json.skins ?? []) {
    if (skin.inverseBindMatrices !== undefined) matrices.add(skin.inverseBindMatrices);
  }
  for (const animatie of json.animations ?? []) {
    for (const kanaal of animatie.channels ?? []) {
      if (kanaal.target.path !== 'translation') continue;
      verplaatsingen.add(animatie.samplers[kanaal.sampler].output);
    }
  }

  for (const index of posities) schaalAccessor(json, bin, index, factor, false);
  for (const index of verplaatsingen) schaalAccessor(json, bin, index, factor, false);
  for (const index of matrices) schaalAccessor(json, bin, index, factor, true);

  const wortels = new Set(json.scenes?.[json.scene ?? 0]?.nodes ?? []);
  (json.nodes ?? []).forEach((node, index) => {
    if (wortels.has(index)) return;
    if (node.matrix) {
      for (const k of [12, 13, 14]) node.matrix[k] *= factor;
      return;
    }
    if (node.translation) node.translation = node.translation.map((v) => v * factor);
  });
}

function verwijderKnoop(json, index) {
  const kaart = new Array(json.nodes.length).fill(null);
  let volgend = 0;
  for (let i = 0; i < json.nodes.length; i++) if (i !== index) kaart[i] = volgend++;

  json.nodes = json.nodes.filter((_, i) => i !== index);
  for (const node of json.nodes) {
    if (node.children) node.children = node.children.map((i) => kaart[i]);
  }
  for (const scene of json.scenes ?? []) {
    scene.nodes = (scene.nodes ?? []).filter((i) => i !== index).map((i) => kaart[i]);
  }
  for (const animatie of json.animations ?? []) {
    for (const kanaal of animatie.channels ?? []) kanaal.target.node = kaart[kanaal.target.node];
  }
  for (const skin of json.skins ?? []) {
    if (skin.skeleton !== undefined) skin.skeleton = kaart[skin.skeleton];
    if (skin.joints) skin.joints = skin.joints.map((i) => kaart[i]);
  }
  return kaart;
}

function naarTRS(node) {
  if (!node.matrix) return;
  const m = node.matrix;
  const schaal = [Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10])];
  if (schaal.some((v) => Math.abs(v - schaal[0]) > 1e-6 * Math.abs(schaal[0]))) {
    throw new Error(`node ${node.name ?? ''} has a non-uniform matrix`);
  }
  const r = [
    m[0] / schaal[0], m[1] / schaal[0], m[2] / schaal[0],
    m[4] / schaal[1], m[5] / schaal[1], m[6] / schaal[1],
    m[8] / schaal[2], m[9] / schaal[2], m[10] / schaal[2],
  ];
  const spoor = r[0] + r[4] + r[8];
  let q;
  if (spoor > 0) {
    const s = Math.sqrt(spoor + 1) * 2;
    q = [(r[5] - r[7]) / s, (r[6] - r[2]) / s, (r[1] - r[3]) / s, s / 4];
  } else if (r[0] > r[4] && r[0] > r[8]) {
    const s = Math.sqrt(1 + r[0] - r[4] - r[8]) * 2;
    q = [s / 4, (r[3] + r[1]) / s, (r[6] + r[2]) / s, (r[5] - r[7]) / s];
  } else if (r[4] > r[8]) {
    const s = Math.sqrt(1 + r[4] - r[0] - r[8]) * 2;
    q = [(r[3] + r[1]) / s, s / 4, (r[7] + r[5]) / s, (r[6] - r[2]) / s];
  } else {
    const s = Math.sqrt(1 + r[8] - r[0] - r[4]) * 2;
    q = [(r[6] + r[2]) / s, (r[7] + r[5]) / s, s / 4, (r[1] - r[3]) / s];
  }

  delete node.matrix;
  node.translation = [m[12], m[13], m[14]];
  node.rotation = q;
  node.scale = schaal;
  if (node.translation.every((v) => v === 0)) delete node.translation;
  if (Math.abs(q[0]) < 1e-9 && Math.abs(q[1]) < 1e-9 && Math.abs(q[2]) < 1e-9) delete node.rotation;
}

function geschaaldeAnimaties(json) {
  const perKnoop = new Map();
  for (const animatie of json.animations ?? []) {
    for (const kanaal of animatie.channels ?? []) {
      const lijst = perKnoop.get(kanaal.target.node) ?? [];
      lijst.push({ pad: kanaal.target.path, uitvoer: animatie.samplers[kanaal.sampler].output });
      perKnoop.set(kanaal.target.node, lijst);
    }
  }
  return perKnoop;
}

function platslaan(json, bin) {
  const scene = json.scenes?.[json.scene ?? 0];
  const wortels = scene?.nodes ?? [];
  if (wortels.length !== 1) throw new Error(`${wortels.length} scene roots`);

  const nodes = json.nodes ?? [];
  for (const node of nodes) naarTRS(node);
  const boven = new Map();
  const loop = (index, opgebouwd) => {
    const node = nodes[index];
    if (!node) return;
    boven.set(index, opgebouwd);
    for (const kind of node.children ?? []) loop(kind, opgebouwd * knoopSchaal(node));
  };
  loop(wortels[0], 1);

  const totaal = knoopFactor(json);
  if (totaal === null) throw new Error('meshes at different node scales');
  const animaties = geschaaldeAnimaties(json);
  const gewrichten = new Set((json.skins ?? []).flatMap((skin) => skin.joints ?? []));

  for (const [index, erboven] of boven) {
    const node = nodes[index];
    if (index === wortels[0]) {
      node.scale = [totaal, totaal, totaal];
      continue;
    }
    if (gewrichten.has(index)) continue;
    const verandert = Math.abs(knoopSchaal(node) - 1) > 1e-6;
    if (verandert && (animaties.get(index) ?? []).some((k) => k.pad === 'scale')) {
      throw new Error(`node ${node.name ?? index} animates a scale that has to move`);
    }
    if (verandert) delete node.scale;
    const factor = erboven / totaal;
    if (Math.abs(factor - 1) < RUIS) continue;
    if (node.translation) node.translation = node.translation.map((v) => v * factor);
    for (const kanaal of animaties.get(index) ?? []) {
      if (kanaal.pad === 'translation') schaalAccessor(json, bin, kanaal.uitvoer, factor, false);
    }
  }
}

function eenKnoop(json, factor) {
  const scene = json.scenes[json.scene ?? 0];
  const wortelIndex = scene.nodes[0];
  const wortel = json.nodes[wortelIndex];

  if (wortel.name === 'rescale-wrapper' && (wortel.children ?? []).length === 1
      && !wortel.translation && !wortel.rotation) {
    const totaal = knoopSchaal(wortel);
    const kindIndex = wortel.children[0];
    const kind = json.nodes[kindIndex];
    kind.scale = [totaal, totaal, totaal];
    if (kind.translation) kind.translation = kind.translation.map((v) => v * totaal);
    const kaart = verwijderKnoop(json, wortelIndex);
    scene.nodes = [kaart[kindIndex]];
    json.nodes[kaart[kindIndex]].scale = [factor, factor, factor];
    return;
  }

  wortel.scale = [factor, factor, factor];
}

function gelijkeMaat(a, b) {
  return a.every((v, k) => Math.abs(v - b[k]) <= Math.max(MAAT_TOLERANTIE * Math.max(v, b[k]), AFRONDING));
}

let geschreven = 0;
let ontbakken = 0;
let herschaald = 0;
const mislukt = [];

for (const bronkit of BRONKITS) {
  if (!bronkit.kit || ONGEMOEID.has(bronkit.kit)) continue;
  const bestanden = werkbestanden(bronkit.kit);
  if (bestanden.length === 0) continue;

  const gemeten = metenTegenBron(bronkit, bestanden);
  const groepen = groepeer([...gemeten.values()].map((g) => g.factor));
  if (groepen.length === 0) {
    console.log(`${bronkit.kit.padEnd(17)} no source model matched — left alone`);
    continue;
  }
  const hoofdgroep = groepen.reduce((a, b) => (b.aantal > a.aantal ? b : a));
  const bakken = new Map();
  for (const bestand of bestanden) {
    const waarde = gemeten.get(bestand.naam)?.factor;
    if (waarde === undefined || !bestand.knoop) continue;
    const bak = Number((waarde / bestand.knoop).toPrecision(4));
    bakken.set(bak, (bakken.get(bak) ?? 0) + 1);
  }
  const hoofdBak = [...bakken.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const factorVan = (bestand) => {
    const waarde = gemeten.get(bestand.naam)?.factor;
    const geschat =
      waarde !== undefined ? waarde
      : hoofdBak !== null && bestand.knoop ? bestand.knoop * hoofdBak
      : hoofdgroep.factor;
    const groep = groepen.find((g) => geschat >= g.laag && geschat <= g.hoog);
    const factor = groep ? groep.factor : geschat;
    if (bestand.schaal !== null && Math.abs(bestand.schaal / factor - 1) <= SNAP) {
      return bestand.schaal;
    }
    return Number(factor.toPrecision(3));
  };

  const doel =
    DOEL[bronkit.kit]
    ?? (bronkit.kit.startsWith('ken-') ? KEN_STANDAARD
      : bronkit.kit.startsWith('kay-') ? KAY_STANDAARD
      : null);
  const uit = new Map();

  for (const bestand of bestanden) {
    const huidig = factorVan(bestand);
    const nieuw = doel ?? huidig;
    uit.set(nieuw, (uit.get(nieuw) ?? 0) + 1);

    const glb = readGlb(bestand.pad);
    const knoop = knoopFactor(glb.json);
    if (knoop === null) {
      mislukt.push(`${bestand.pad}: meshes at different node scales`);
      continue;
    }
    const gebakken = huidig / knoop;
    const voor = JSON.stringify(glb.json);
    let raaktGeometrie = false;

    try {
      platslaan(glb.json, glb.bin);
      if (Math.abs(gebakken - 1) > 1e-6) {
        ontbak(glb.json, glb.bin, 1 / gebakken);
        raaktGeometrie = true;
        ontbakken++;
      }
      eenKnoop(glb.json, nieuw);
    } catch (fout) {
      mislukt.push(`${bestand.pad}: ${fout.message}`);
      continue;
    }
    if (!raaktGeometrie && JSON.stringify(glb.json) === voor) continue;

    const na = measureScene(glb).wdhExact;
    const bron = gemeten.get(bestand.naam)?.bron;
    const verwacht = bron ? bron.map((v) => v * nieuw) : bestand.wdh.map((v) => (v / huidig) * nieuw);
    if (!gelijkeMaat(na, verwacht)) {
      mislukt.push(
        `${bestand.pad}: size became ${na.map((v) => v.toFixed(4))} instead of ${verwacht.map((v) => v.toFixed(4))}`,
      );
      continue;
    }
    if (Math.abs(nieuw - huidig) > 1e-9) herschaald++;

    glb.json.asset ??= {};
    glb.json.asset.extras ??= {};
    glb.json.asset.extras.taaleiland ??= {};
    glb.json.asset.extras.taaleiland.schaal = nieuw;
    if (!alleenRapport) writeGlb(bestand.pad, glb.json, glb.bin, writeFileSync);
    geschreven++;
  }

  const wordt = [...uit.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}×${n}`).join(' ');
  console.log(`${bronkit.kit.padEnd(17)} ${String(bestanden.length).padStart(4)} files → ${wordt}`);
}

console.log(
  `\n${geschreven} files ${alleenRapport ? 'would be rewritten' : 'rewritten'}, `
    + `${ontbakken} unbaked to source units, ${herschaald} resized`,
);
if (mislukt.length) {
  console.log(`\n${mislukt.length} left untouched:`);
  for (const regel of mislukt) console.log(`  ${regel}`);
}
