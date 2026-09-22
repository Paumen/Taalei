import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SIZES = {
  'char': 1.7,

  'env-flora-plant-bamboo': 4,
  'env-flora-plant-bush': 1.2,
  'env-flora-plant-cactus-high': 1.5,
  'env-flora-plant-cactus-low': 0.3,
  'env-flora-plant-flower': 0.3,
  'env-flora-plant-grass': 0.4,
  'env-flora-plant-leafy': 0.6,
  'env-flora-tree': 8,
  'env-flora-tree-conifer': 10,
  'env-flora-tree-palm': 8,
  'env-flora-waterplant-cattail': 1.5,
  'env-flora-waterplant-lilypad': 0.3,
  'env-fungi': 0.1,
  'env-remains-bones-fishbone': 0.3,
  'env-remains-bones-limb': 0.3,
  'env-remains-bones-ribcage': 0.6,
  'env-remains-bones-skull': 0.2,
  'env-remains-deadwood-branch': 1,
  'env-remains-deadwood-stump': 0.8,
  'env-remains-deadwood-tree': 8,
  'env-rock-boulder': 1.5,
  'env-rock-cobble': 0.25,
  'env-rock-formation': 4,
  'env-rock-pebble': 0.15,

  'obj-art-instrument': 0.8,
  'obj-art-sculpture': 2,
  'obj-container-bag': 0.5,
  'obj-container-bag-pouch': 0.2,
  'obj-container-bag-sack': 0.7,
  'obj-container-barrel': 0.9,
  'obj-container-barrel-keg': 0.5,
  'obj-container-bottle': 0.28,
  'obj-container-bottle-vial': 0.18,
  'obj-container-bucket': 0.3,
  'obj-container-can': 0.12,
  'obj-container-chest': 0.8,
  'obj-container-coffin': 2,
  'obj-container-crate': 0.6,
  'obj-container-crate-cube': 0.6,
  'obj-container-pot': 0.4,
  'obj-container-pot-jar': 0.3,
  'obj-container-pot-vase': 0.5,
  'obj-equipment-apparel': 0.7,
  'obj-equipment-apparel-headgear': 0.3,
  'obj-equipment-apparel-quiver': 0.6,
  'obj-equipment-armor': 0.4,
  'obj-equipment-jewellery': 0.05,
  'obj-equipment-jewellery-ring': 0.02,
  'obj-equipment-pocketitem-book-closed': 0.25,
  'obj-equipment-pocketitem-book-open': 0.4,
  'obj-equipment-pocketitem-coin': 0.03,
  'obj-equipment-pocketitem-key': 0.08,
  'obj-equipment-pocketitem-scroll': 0.3,
  'obj-equipment-pocketitem-scroll-rolled': 0.3,
  'obj-equipment-shield': 0.7,
  'obj-equipment-target-bullseye': 1.2,
  'obj-equipment-target-dummy': 1.8,
  'obj-equipment-weapon-magic': 1.2,
  'obj-equipment-weapon-magic-staff': 1.8,
  'obj-equipment-weapon-melee-axe-double': 1,
  'obj-equipment-weapon-melee-axe-single': 0.7,
  'obj-equipment-weapon-melee-club': 0.8,
  'obj-equipment-weapon-melee-dagger': 0.35,
  'obj-equipment-weapon-melee-spear': 2.2,
  'obj-equipment-weapon-melee-sword': 1,
  'obj-equipment-weapon-melee-sword-broad': 1.2,
  'obj-equipment-weapon-melee-warhammer': 0.7,
  'obj-equipment-weapon-ranged-arrow': 0.75,
  'obj-equipment-weapon-ranged-bow': 1.5,
  'obj-equipment-weapon-ranged-crossbow': 0.8,
  'obj-equipment-weapon-ranged-firearm': 1.2,
  'obj-equipment-weapon-ranged-firearm-hand': 0.35,
  'obj-equipment-weapon-ranged-firearm-rifle': 1.15,
  'obj-equipment-weapon-ranged-firearm-shotgun': 1.1,
  'obj-equipment-weapon-siege-ammunition-cannonball': 0.12,
  'obj-equipment-weapon-siege-cannon': 2,
  'obj-food-baked-bread': 0.3,
  'obj-food-baked-pastry': 0.25,
  'obj-food-baked-pastry-cookie': 0.08,
  'obj-food-baked-pastry-croissant': 0.15,
  'obj-food-baked-pastry-cupcake': 0.07,
  'obj-food-baked-pastry-donut': 0.1,
  'obj-food-baked-pastry-waffle': 0.15,
  'obj-food-baked-pie': 0.25,
  'obj-food-cheese': 0.25,
  'obj-food-egg': 0.06,
  'obj-food-fish': 0.3,
  'obj-food-fruit': 0.1,
  'obj-food-fruit-apple': 0.08,
  'obj-food-fruit-banana': 0.2,
  'obj-food-fruit-coconut': 0.15,
  'obj-food-fruit-grapes': 0.15,
  'obj-food-grain': 0.2,
  'obj-food-meat': 0.3,
  'obj-food-sweet': 0.12,
  'obj-food-sweet-icecream': 0.12,
  'obj-food-vegetable': 0.15,
  'obj-food-vegetable-carrot': 0.2,
  'obj-food-vegetable-eggplant': 0.2,
  'obj-food-vegetable-leafy': 0.25,
  'obj-food-vegetable-onion': 0.08,
  'obj-food-vegetable-pepper': 0.12,
  'obj-food-vegetable-pumpkin': 0.3,
  'obj-food-vegetable-tomato': 0.08,
  'obj-furnishing-bed': 2,
  'obj-furnishing-pillow': 0.6,
  'obj-furnishing-rug': 2,
  'obj-furnishing-seating-bench': 0.45,
  'obj-furnishing-seating-bench-backrest': 0.85,
  'obj-furnishing-seating-bench-nobackrest': 0.45,
  'obj-furnishing-seating-chair': 0.9,
  'obj-furnishing-seating-stool': 0.45,
  'obj-furnishing-storage-cabinet': 1.8,
  'obj-furnishing-storage-shelf': 1.8,
  'obj-furnishing-table': 0.75,
  'obj-furnishing-table-square': 0.75,
  'obj-kitchenware-appliance': 1,
  'obj-kitchenware-cookware-board': 0.4,
  'obj-kitchenware-cookware-cookpot': 0.35,
  'obj-kitchenware-cookware-cookpot-cauldron': 0.6,
  'obj-kitchenware-cookware-kettle': 0.25,
  'obj-kitchenware-cookware-pan': 0.45,
  'obj-kitchenware-cookware-pan-frying': 0.45,
  'obj-kitchenware-cookware-utensil': 0.3,
  'obj-kitchenware-tableware-bowl': 0.2,
  'obj-kitchenware-tableware-cutlery': 0.2,
  'obj-kitchenware-tableware-drinkware': 0.12,
  'obj-kitchenware-tableware-drinkware-goblet': 0.18,
  'obj-kitchenware-tableware-drinkware-mug': 0.12,
  'obj-kitchenware-tableware-plate': 0.26,
  'obj-kitchenware-tableware-serving': 0.4,
  'obj-lighting-campfire': 1,
  'obj-lighting-candle': 0.2,
  'obj-lighting-lantern': 0.3,
  'obj-lighting-lantern-handheld': 0.3,
  'obj-lighting-lantern-onpost': 2.5,
  'obj-lighting-torch': 0.6,
  'obj-resource-metal': 0.2,
  'obj-resource-stone': 0.4,
  'obj-resource-textile': 0.5,
  'obj-resource-wood-log': 0.5,
  'obj-resource-wood-plank': 1.5,
  'obj-tool-hand': 0.3,
  'obj-tool-hand-hammer': 0.35,
  'obj-tool-hand-saw': 0.5,
  'obj-tool-station': 0.8,
  'obj-tool-twohand': 1.5,
  'obj-tool-twohand-broom': 1.3,
  'obj-tool-twohand-pickaxe': 0.9,
  'obj-tool-twohand-shovel': 1.2,
  'obj-transport-cart': 2.5,
  'obj-transport-pallet': 1.2,
  'obj-transport-watercraft-boat': 4,
  'obj-transport-watercraft-ship': 15,

  'str-access-bridge-long': 12,
  'str-access-bridge-section': 4,
  'str-access-ladder-long': 4,
  'str-access-ladder-short': 2,
  'str-access-stairs': 3,
  'str-barrier-fence-high': 2,
  'str-barrier-fence-low': 0.6,
  'str-barrier-fence-mid': 1.2,
  'str-barrier-post': 1.2,
  'str-building-agricultural': 7.5,
  'str-building-agricultural-silo': 8,
  'str-building-commercial': 6,
  'str-building-industrial-mill': 10,
  'str-building-industrial-workshop': 6,
  'str-building-military-barracks': 9,
  'str-building-military-castle': 15,
  'str-building-military-tower': 12,
  'str-building-religious-church': 12,
  'str-building-religious-crypt': 3,
  'str-building-religious-shrine': 3,
  'str-building-residential-house': 7.5,
  'str-canopy-stall': 2.5,
  'str-canopy-tent-camping': 2.5,
  'str-marker-banner': 2,
  'str-marker-flag': 1.5,
  'str-marker-flag-small': 0.75,
  'str-marker-grave': 1,
  'str-marker-sign': 2,
  'str-part-door': 2.1,
  'str-part-door-doorway': 3,
  'str-part-door-single': 2.1,
  'str-part-door-trapdoor': 1,
  'str-part-floor-double': 6,
  'str-part-floor-half': 1.5,
  'str-part-floor-unit': 3,
  'str-part-frame': 2.5,
  'str-part-frame-scaffold': 3,
  'str-part-gate-gateway': 4.5,
  'str-part-gate-single': 3,
  'str-part-pillar': 3,
  'str-part-roof-unit': 3,
  'str-part-wall': 3,
  'str-part-wall-rampart': 4,
  'str-part-wall-unit': 3,
  'str-part-window': 1,
  'str-part-window-unit': 3,
  'str-platform-dock': 6,
  'str-utility-fountain': 3,
  'str-utility-well': 2,
};

const HIGH = new Set([
  'obj-furnishing-seating-bench',
  'obj-furnishing-seating-bench-backrest',
  'obj-furnishing-seating-bench-nobackrest',
  'obj-furnishing-table',
  'obj-furnishing-table-square',
  'str-barrier-fence-high',
  'str-barrier-fence-low',
  'str-barrier-fence-mid',
  'str-part-wall-rampart',
]);

const DROPPED_KINDS = [
  'env-fauna-fish',
  'env-flora-plant',
  'env-flora-waterplant',
  'env-remains-bones',
  'env-remains-deadwood',
  'env-terrain-ground',
  'env-terrain-mountain',
  'env-terrain-water',
  'obj-equipment-pocketitem',
  'obj-equipment-weapon',
  'obj-equipment-weapon-melee',
  'obj-equipment-weapon-ranged',
  'obj-kitchenware-cookware',
  'obj-tool-supplies',
  'obj-transport-watercraft-accessory',
  'str-access-bridge',
  'str-canopy-tent',
  'str-part-floor',
  'str-part-roof',
  'str-platform-deck',
];

const DROPPED_TAGS = ['plural', 'broken', 'comp', 'pickup', 'piece'];

const STOREYS = {
  'storeys-0-5': 0.5,
  'storeys-1': 1,
  'storeys-1-5': 1.5,
  'storeys-2': 2,
  'storeys-3': 3,
  'storeys-4': 4,
  'storeys-5': 5,
};
const STOREY_M = 3;
const ROOF_M = 1.5;
const TRIM = 0.01;

const isBuilding = (kind) => kind === 'str-building' || kind.startsWith('str-building-');
const depth = (kind) => kind.split('-').length;
const round2 = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;

const wmedian = (items) => {
  const sorted = [...items].sort((a, b) => a[0] - b[0]);
  const total = sorted.reduce((sum, [, w]) => sum + w, 0);
  let acc = 0;
  for (let i = 0; i < sorted.length; i++) {
    acc += sorted[i][1];
    if (Math.abs(acc - total / 2) < 1e-9 && i + 1 < sorted.length) return (sorted[i][0] + sorted[i + 1][0]) / 2;
    if (acc > total / 2) return sorted[i][0];
  }
  return sorted.at(-1)[0];
};

const fit = (pts, weighted) => {
  const w = pts.map((p) => (weighted ? Math.sqrt(p.d) : 1));
  const slopes = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (pts[i].x === pts[j].x) continue;
      slopes.push([(pts[j].y - pts[i].y) / (pts[j].x - pts[i].x), w[i] * w[j]]);
    }
  }
  const slope = wmedian(slopes);
  const icpt = wmedian(pts.map((p, i) => [p.y - slope * p.x, w[i]]));
  const mad = wmedian(pts.map((p, i) => [Math.abs(p.y - (icpt + slope * p.x)), w[i]]));
  return { slope, icpt, mad };
};

const realOf = (model) => {
  if (isBuilding(model.kind)) {
    const tag = (model.tags ?? []).find((t) => t in STOREYS);
    if (tag) return { real: STOREYS[tag] * STOREY_M + ROOF_M, high: true };
    const flat = SIZES[model.kind];
    return flat === undefined ? null : { real: flat, high: true };
  }
  const real = SIZES[model.kind];
  if (real === undefined) return null;
  return { real, high: HIGH.has(model.kind) };
};

const counted = (model) => {
  if (DROPPED_KINDS.includes(model.kind)) return false;
  if (model.kind !== 'char' && model.kind !== 'env-fungi' && depth(model.kind) < 3) return false;
  if ((model.tags ?? []).some((t) => DROPPED_TAGS.includes(t))) return false;
  return true;
};

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];

const gather = () => {
  const catalog = JSON.parse(readFileSync(join(ROOT, 'catalog', 'build', 'catalog.json'), 'utf8'));
  const picked = [];
  for (const model of catalog.models) {
    if (!counted(model)) continue;
    const assumed = realOf(model);
    if (!assumed) continue;
    const u = assumed.high ? model.wdh[2] : Math.max(...model.wdh);
    if (!(u > 0)) continue;
    picked.push({
      kit: model.kit, name: model.name, kind: model.kind, wdh: model.wdh.join(','),
      u, real: assumed.real, high: assumed.high,
    });
  }
  const sorted = picked.map((m) => m.u).sort((a, b) => a - b);
  const lo = quantile(sorted, TRIM);
  const hi = quantile(sorted, 1 - TRIM);
  return picked.filter((m) => m.u >= lo && m.u <= hi);
};

const pointsOf = (models) => {
  const groups = new Map();
  for (const m of models) {
    const key = m.kind;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  const pts = [];
  for (const [kind, members] of groups) {
    const ratios = members.map((m) => Math.log2(m.u / m.real)).sort((a, b) => a - b);
    const reals = members.map((m) => m.real).sort((a, b) => a - b);
    const mid = (arr) => (arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2);
    pts.push({
      kind, n: members.length, d: new Set(members.map((m) => m.wdh)).size,
      x: round3(Math.log2(mid(reals))), y: round3(mid(ratios)), members,
    });
  }
  return pts.sort((a, b) => a.kind.localeCompare(b.kind));
};

const build = (models, weighted) => {
  const byKit = new Map();
  for (const m of models) {
    if (!byKit.has(m.kit)) byKit.set(m.kit, []);
    byKit.get(m.kit).push(m);
  }
  const kits = [];
  const all = [];
  for (const [kit, members] of byKit) {
    const pts = pointsOf(members);
    if (pts.length < 3) continue;
    const xs = pts.map((p) => p.x);
    if (Math.max(...xs) - Math.min(...xs) < 1) continue;
    const { slope, icpt, mad } = fit(pts, weighted);
    const scored = members.map((m) => ({
      name: m.name, kind: m.kind, u: m.u, real: m.real, high: m.high, kit,
      res: round3(Math.log2(m.u / m.real) - (icpt + slope * Math.log2(m.real))),
    })).sort((a, b) => b.res - a.res);
    const up = scored[0];
    const down = scored.at(-1);
    const strip = ({ kit: _kit, ...rest }) => rest;
    kits.push({
      kit, n: pts.length, slope: round3(slope), icpt: round3(icpt), mad: round3(mad),
      pts: pts.map((p) => ({
        kind: p.kind, n: p.n, d: p.d, x: p.x, y: p.y,
        res: round3(p.y - (icpt + slope * p.x)),
      })),
      up: strip(up), down: strip(down),
    });
    all.push(...scored);
  }
  kits.sort((a, b) => a.slope - b.slope);
  const refPts = pointsOf(models);
  const ref = fit(refPts, weighted);
  const top = all.sort((a, b) => Math.abs(b.res) - Math.abs(a.res)).slice(0, 20);
  return { kits, ref: { slope: round3(ref.slope), icpt: round3(ref.icpt) }, top };
};

const models = gather();
const payload = { weighted: build(models, true), plain: build(models, false) };

const sizeRows = Object.entries(SIZES)
  .filter(([k]) => !DROPPED_KINDS.includes(k))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([kind, real]) => ({ kind, real, high: HIGH.has(kind) || isBuilding(kind), storeys: isBuilding(kind) }));

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Taaleiland — Curves: kit size curves</title>
<meta name="description" content="Each kit's model sizes against a real-world size table, fitted per kit: flat keeps real proportions, falling enlarges small things.">
<meta name="catalogus-versie" content="">
<meta name="catalogus-gebouwd" content="">
<link rel="stylesheet" href="catalog.css"><link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='14' font-size='14'>🏝️</text></svg>">
<style>
:root{--toy:#b8563a; --lin:#3d6f8e; --sel:#2f2a26; --pill:#ece4d8; --rand:#e2d8c9}
@media (prefers-color-scheme:dark){:root{--toy:#d9765a; --lin:#6fa0c2; --sel:#ece3d8; --pill:#2f2b28; --rand:#3a3532}}
.curves{font:13px/1.4 system-ui,sans-serif;padding-block:6px 18px;padding-inline:16px}

.tabs{display:flex;gap:2px;border-bottom:1px solid var(--rand);margin-bottom:8px}
.tabs button{appearance:none;background:none;border:0;border-bottom:2px solid transparent;color:var(--inkt-zacht);
  font:600 12.5px/1 system-ui,sans-serif;letter-spacing:.02em;padding:7px 10px;cursor:pointer;margin-bottom:-1px}
.tabs button[aria-selected="true"]{color:var(--inkt);border-bottom-color:var(--toy)}
.tabs button:focus-visible{outline:2px solid var(--lin);outline-offset:-2px}

.top{display:flex;gap:4px 12px;flex-wrap:wrap;align-items:baseline;color:var(--inkt-zacht);font-size:12px}
.top b{color:var(--inkt);font-weight:600}
.chart{background:var(--papier-diep);border-radius:4px;margin-top:6px}
svg{display:block;width:100%;height:auto}
.gridl{stroke:var(--raster-fijn);stroke-width:1}
.axis{fill:var(--inkt-zacht);font-size:19px}
.axis.t{font-size:16px}
.kitline{fill:none;stroke-width:1.4;opacity:.5;cursor:pointer}
.kitline.dim{opacity:.08}
.kitline.sel{opacity:1;stroke-width:3;stroke:var(--sel)}
.pt{opacity:0;cursor:pointer}
.pt.sel{opacity:1}
.lbl{font-size:19px;fill:var(--inkt);pointer-events:none;paint-order:stroke;stroke:var(--papier-diep);stroke-width:5px;stroke-linejoin:round}
.ref{stroke:var(--raster-zwaar);stroke-width:1;stroke-dasharray:4 3}
.seg button{appearance:none;font:inherit;margin-left:4px;padding:1px 7px;border:1px solid var(--raster-zwaar);
  border-radius:9px;background:none;color:var(--inkt-zacht);cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--pill);border-color:var(--toy);color:var(--inkt);font-weight:600}
.seg button:focus-visible{outline:2px solid var(--lin);outline-offset:1px}
.info{min-height:2.6em;margin-top:6px;font-variant-numeric:tabular-nums;font-size:12.5px}
.info b{font-weight:600}

table{border-collapse:collapse;width:100%;margin-top:8px;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:3px 8px 3px 0;border-bottom:1px solid var(--raster-fijn);white-space:nowrap}
th{color:var(--inkt-zacht);font-weight:500;font-size:11px;letter-spacing:.03em;text-transform:uppercase;cursor:pointer}
td.n,th.n{text-align:right}
tr.row{cursor:pointer}
tr.row.sel td{background:var(--pill)}
tr.row:focus-visible{outline:2px solid var(--lin);outline-offset:-2px}
.bar{display:inline-block;height:9px;vertical-align:middle;border-radius:1px}
.wrap{overflow-x:auto}
.muted{color:var(--inkt-zacht)}
.res{font-weight:600}
.nm{display:inline-block;max-width:96px;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom}

.sizes{columns:190px;column-gap:16px;margin-top:6px;font-variant-numeric:tabular-nums;font-size:12px}
.sizes div{break-inside:avoid}
.sizes span{color:var(--inkt)}
details{margin-top:12px;font-size:12px;color:var(--inkt-zacht)}
summary{cursor:pointer}
summary:focus-visible{outline:2px solid var(--lin);outline-offset:2px}

.rules{display:grid;gap:14px;margin-top:4px;max-width:62ch}
.rule h3{margin:0 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--inkt-zacht);font-weight:600}
.rule p{margin:0 0 5px;color:var(--inkt-zacht);font-size:12.5px}
.rule ul{margin:0;padding-left:16px;font-size:12.5px}
.rule li{margin:1px 0}
.rule li code,.rule p code{font:12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--inkt)}
.kw{color:var(--toy);font-weight:600}
.kwin{color:var(--lin);font-weight:600}
</style>
</head>
<body>

<header class="kop">
  <nav class="paginabalk" aria-label="Pages">
    <a href="../../index.html">Catalog</a>
    <a href="scale-obj-gen.html">Scale</a>
    <span aria-current="page">Curves</span>
    <a href="swipe.html">Swipe</a>
    <a href="tbd.html">TBD</a>
    <a href="reject.html">Reject</a>
    <a href="swipe.html?source=lint">Lint</a>
  </nav>
</header>

<main class="curves">
<div class="tabs" role="tablist">
  <button id="tab-curves" role="tab" aria-controls="panel-curves" aria-selected="true">Curves</button>
  <button id="tab-outliers" role="tab" aria-controls="panel-outliers" aria-selected="false">20 biggest outliers</button>
  <button id="tab-rules" role="tab" aria-controls="panel-rules" aria-selected="false">What is counted</button>
</div>

<section id="panel-curves" role="tabpanel" aria-labelledby="tab-curves">
  <div class="top">
    <span><b>Each line is one kit</b>, fitted through its own kinds against a real-world size table.</span>
    <span>Flat = keeps real proportions.</span>
    <span>Falling = small things enlarged (toy).</span>
    <span>Click a line or a row; click again to release.</span>
    <span class="seg">Each kind counts<button id="m-weighted" aria-pressed="true">by measurements</button><button id="m-plain" aria-pressed="false">equally</button></span>
  </div>
  <div class="chart"><svg id="c" viewBox="0 0 900 520" role="img" aria-label="Kit size curves"></svg></div>
  <div class="info" id="info"></div>
  <div class="wrap"><table id="t"><thead><tr>
    <th data-k="kit">kit</th><th class="n" data-k="n">k</th><th class="n" data-k="slope">slope</th><th data-k="slope"></th>
    <th class="n" data-k="icpt">u/m</th><th class="n" data-k="mad">scat</th>
    <th data-k="up">+ outlier</th><th data-k="down">&minus; outlier</th>
  </tr></thead><tbody></tbody></table></div>
</section>

<section id="panel-outliers" role="tabpanel" aria-labelledby="tab-outliers" hidden>
  <div class="top"><span>The 20 models furthest from <b>their own kit's line</b>, in log2. <b>+</b> drawn larger than the kit's rule, <b>&minus;</b> smaller. Click a row to see that kit's curve.</span></div>
  <div class="wrap"><table id="ot"><thead><tr>
    <th class="n">#</th><th class="n">off line</th><th></th><th>model</th><th>kit</th><th>kind</th>
    <th class="n">measured</th><th class="n">assumed</th><th class="n">factor</th>
  </tr></thead><tbody></tbody></table></div>
</section>

<section id="panel-rules" role="tabpanel" aria-labelledby="tab-rules" hidden>
  <div class="rules">
    <div class="rule">
      <h3>How a curve is fitted</h3>
      <p>Per kit and kind, the median model size divided by the kind's assumed real size. A Theil&ndash;Sen line through those points, in log2 on both axes, <span id="wtext"></span>. Scatter is the median absolute residual, under the same weighting. A kit needs 3 kinds spanning at least a factor 2 in real size, or it is dropped.</p>
    </div>
    <div class="rule">
      <h3>Buildings</h3>
      <p>A building's assumed real size is its own height, read from its <code>storeys-N</code> tag: <code>storeys &times; ${STOREY_M} m + ${ROOF_M} m</code> of roof. Buildings carrying no such tag fall back to the flat height in the table below.</p>
    </div>
    <div class="rule">
      <h3><span class="kw">Excluded</span></h3>
      <ul>
        <li>all root kinds except <code>char</code> &mdash; <code>set</code> among them</li>
        <li>all root +1 except <code>env-fungi</code></li>
        <li><code>tag:plural</code></li>
        <li><code>tag:broken</code></li>
        <li><code>tag:comp</code></li>
        <li><code>tag:pickup</code></li>
        <li><code>tag:piece</code></li>
        <li>the 1% largest models</li>
        <li>the 1% smallest models</li>
      </ul>
    </div>
    <div class="rule">
      <h3><span class="kwin">Included</span></h3>
      <p>every kind from root +2 down to root +5, except the models sitting directly under:</p>
      <ul id="ex3"></ul>
    </div>
    <div class="rule">
      <h3>Measured by height, not longest side</h3>
      <p>Every building, plus:</p>
      <ul id="hi"></ul>
    </div>
  </div>
  <details id="szbox"><summary>Real-world size table &mdash; the longest real dimension assumed per kind, or the height where it says so</summary>
    <div class="sizes" id="sz"></div>
  </details>
</section>

</main>
<script>
const PAYLOAD = ${JSON.stringify(payload)};
const SIZE_ROWS = ${JSON.stringify(sizeRows)};
const DROPPED = ${JSON.stringify(DROPPED_KINDS)};
const HIGH_ROWS = ${JSON.stringify([...HIGH])};

const svg = document.getElementById('c'), NS = 'http://www.w3.org/2000/svg';
let mode = 'weighted', DATA = PAYLOAD[mode].kits, TOP = PAYLOAD[mode].top;
const W = 900, H = 520, L = 68, R = 16, T = 16, B = 62;
const X0 = Math.log2(0.055), X1 = Math.log2(24), Y0 = Math.log2(0.055), Y1 = Math.log2(5.6);
const sx = v => L + (v - X0) / (X1 - X0) * (W - L - R);
const sy = v => T + (Y1 - v) / (Y1 - Y0) * (H - T - B);
const el = (n, a, p = svg) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; };

for (const m of [0.1, 0.3, 1, 3, 10, 20]) {
  const x = sx(Math.log2(m));
  el('line', { x1: x, y1: T, x2: x, y2: H - B, class: 'gridl' });
  const t = el('text', { x, y: H - B + 28, class: 'axis', 'text-anchor': 'middle' }); t.textContent = m + ' m';
}
for (const u of [0.1, 0.3, 1, 3, 5]) {
  const y = sy(Math.log2(u));
  el('line', { x1: L, y1: y, x2: W - R, y2: y, class: 'gridl' });
  const t = el('text', { x: L - 8, y: y + 8, class: 'axis', 'text-anchor': 'end' }); t.textContent = u;
}
{ const t = el('text', { x: W - R, y: H - B + 52, class: 'axis t', 'text-anchor': 'end' }); t.textContent = 'real size of the kind'; }
{ const t = el('text', { x: W - R, y: T + 14, class: 'axis t', 'text-anchor': 'end' }); t.textContent = 'model units per real metre'; }

const gFit = el('g', {});
let ref = null;

const mix = s => { const t = Math.max(-0.15, Math.min(1.1, -s)); return \`color-mix(in oklab, var(--lin), var(--toy) \${Math.round(Math.max(0, Math.min(1, (t + 0.15) / 1.25)) * 100)}%)\`; };
const nice = k => k.replace(/^(obj|env|str)-/, '');
const sign = r => (r > 0 ? '+' : '') + r.toFixed(2);

const lines = new Map(), dots = new Map(), rows = new Map();
let sel = null;
const info = document.getElementById('info');
let REST = '';

function show(k) {
  sel = k;
  for (const [id, l] of lines) l.setAttribute('class', 'kitline' + (k ? (id === k ? ' sel' : ' dim') : ''));
  for (const [id, g] of dots) g.setAttribute('class', 'pt' + (id === k ? ' sel' : ''));
  for (const [id, r] of rows) r.classList.toggle('sel', id === k);
  if (!k) { info.textContent = REST; return; }
  const d = DATA.find(x => x.kit === k);
  const xs = d.pts.map(p => p.x), lo = 2 ** Math.min(...xs), hi = 2 ** Math.max(...xs);
  const fmt = v => v < 1 ? v.toFixed(2) : v.toFixed(0);
  const line = (o, dir) => o ? \`<br>\${dir}: <b>\${o.name}</b> — \${nice(o.kind)}, \${o.u} u \${o.high ? 'high' : 'long'} against \${o.real} m\${o.high ? ' high' : ''}, <span class="res" style="color:\${mix(-o.res / 2)}">\${sign(o.res)}</span>\` : '';
  info.innerHTML = \`<b>\${k}</b> · slope \${d.slope.toFixed(2)} · \${(2 ** d.icpt).toFixed(2)} units per m at 1 m · \${d.n} kinds · scatter \${d.mad.toFixed(2)} · covers \${fmt(lo)} – \${fmt(hi)} m\`
    + line(d.up, 'too large') + line(d.down, 'too small');
}
function drawFit() {
  gFit.replaceChildren();
  lines.clear(); dots.clear();
  ref = PAYLOAD[mode].ref;
  el('line', { x1: sx(X0), y1: sy(ref.icpt + ref.slope * X0), x2: sx(X1), y2: sy(ref.icpt + ref.slope * X1), class: 'ref' }, gFit);
  REST = \`Dashed line: the whole catalogue's own curve — slope \${ref.slope.toFixed(2)}. Colour: red toward toy, blue toward linear.\`;
  for (const d of DATA) {
    const xs = d.pts.map(p => p.x), lo = Math.min(...xs), hi = Math.max(...xs);
    const l = el('line', { x1: sx(lo), y1: sy(d.icpt + d.slope * lo), x2: sx(hi), y2: sy(d.icpt + d.slope * hi), class: 'kitline', stroke: mix(d.slope) }, gFit);
    l.addEventListener('click', () => show(sel === d.kit ? null : d.kit));
    lines.set(d.kit, l);
  }
  for (const d of DATA) {
    const g = el('g', { class: 'pt' }, gFit);
    for (const p of d.pts) {
      const c = el('circle', { cx: sx(p.x), cy: sy(p.y), r: 5.5, fill: 'var(--inkt)', stroke: 'var(--papier-diep)', 'stroke-width': 1 }, g);
      const txt = nice(p.kind) + (p.d > 1 ? ' ×' + p.d : '') + (p.n > p.d ? ' of ' + p.n : '');
      const flip = sx(p.x) + 10 + txt.length * 9.2 > W - R;
      const t = el('text', { x: sx(p.x) + (flip ? -10 : 10), y: sy(p.y) - 9, class: 'lbl',
        'text-anchor': flip ? 'end' : 'start' }, g);
      t.textContent = txt;
      c.addEventListener('click', () => show(null));
    }
    dots.set(d.kit, g);
  }
}

const tb = document.querySelector('#t tbody');
let sortKey = 'slope', asc = true;
const keyOf = (d, k) => k === 'lo' ? Math.min(...d.pts.map(p => p.x)) : k === 'up' ? -(d.up ? d.up.res : 0) : k === 'down' ? (d.down ? d.down.res : 0) : d[k];
function render() {
  const rowsData = [...DATA].sort((a, b) => { const va = keyOf(a, sortKey), vb = keyOf(b, sortKey); return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * (asc ? 1 : -1); });
  tb.replaceChildren(); rows.clear();
  for (const d of rowsData) {
    const tr = document.createElement('tr'); tr.className = 'row'; tr.tabIndex = 0;
    const w = Math.round(Math.min(Math.abs(d.slope), 1.2) * 60);
    const cell = (o) => o ? \`<span class="nm" title="\${o.name} — \${nice(o.kind)}">\${o.name}</span> <span class="res" style="color:\${mix(-o.res / 2)}">\${sign(o.res)}</span>\` : '<span class="muted">—</span>';
    tr.innerHTML = \`<td>\${d.kit}</td><td class="n">\${d.n}</td><td class="n">\${d.slope.toFixed(2)}</td>\`
      + \`<td><span class="bar" style="width:\${w}px;background:\${mix(d.slope)}"></span></td>\`
      + \`<td class="n">\${(2 ** d.icpt).toFixed(2)}</td><td class="n">\${d.mad.toFixed(2)}</td>\`
      + \`<td>\${cell(d.up)}</td><td>\${cell(d.down)}</td>\`;
    tr.addEventListener('click', () => show(sel === d.kit ? null : d.kit));
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(sel === d.kit ? null : d.kit); } });
    rows.set(d.kit, tr); tb.appendChild(tr);
    if (sel === d.kit) tr.classList.add('sel');
  }
}
for (const th of document.querySelectorAll('#t th[data-k]')) th.addEventListener('click', () => { const k = th.dataset.k; if (sortKey === k) asc = !asc; else { sortKey = k; asc = true; } render(); });

const ob = document.querySelector('#ot tbody');
function renderTop() {
  ob.replaceChildren();
  TOP.forEach((o, i) => {
    const tr = document.createElement('tr'); tr.className = 'row'; tr.tabIndex = 0;
    const w = Math.round(Math.min(Math.abs(o.res) / 2.5, 1) * 60);
    tr.innerHTML = \`<td class="n muted">\${i + 1}</td>\`
      + \`<td class="n res" style="color:\${mix(-o.res / 2)}">\${sign(o.res)}</td>\`
      + \`<td><span class="bar" style="width:\${w}px;background:\${mix(-o.res / 2)}"></span></td>\`
      + \`<td>\${o.name}</td><td>\${o.kit}</td><td class="muted">\${nice(o.kind)}</td>\`
      + \`<td class="n">\${o.u} u\${o.high ? ' high' : ''}</td><td class="n">\${o.real} m\${o.high ? ' high' : ''}</td>\`
      + \`<td class="n">×\${(2 ** o.res).toFixed(2)}</td>\`;
    const go = () => { pick('curves'); show(o.kit); document.getElementById('panel-curves').scrollIntoView({ block: 'start' }); };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    ob.appendChild(tr);
  });
}

const MODES = ['weighted', 'plain'];
function load(m) {
  mode = m;
  DATA = PAYLOAD[m].kits; TOP = PAYLOAD[m].top;
  for (const x of MODES) document.getElementById('m-' + x).setAttribute('aria-pressed', String(x === m));
  document.getElementById('wtext').textContent = m === 'weighted'
    ? 'weighted by the square root of the number of distinct measurements behind each point, so a kind measured 30 different ways steers the line harder than one measured once. Models that share a measurement — a colour or detail variant of the same shape — count once between them, so a modular kit with sixteen wall pieces of one size carries the weight of one'
    : 'with every kind counting the same, however many measurements stand behind it';
  const keep = sel;
  drawFit(); render(); renderTop();
  show(DATA.some(d => d.kit === keep) ? keep : null);
}
for (const m of MODES) document.getElementById('m-' + m).addEventListener('click', () => load(m));

const pretty = id => id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' › ');
document.getElementById('ex3').innerHTML = DROPPED.map(k => \`<li><code>\${pretty(k)}</code></li>\`).join('');
document.getElementById('hi').innerHTML = HIGH_ROWS.map(k => {
  const row = SIZE_ROWS.find(r => r.kind === k);
  return \`<li><code>\${pretty(k).replace(/^(Obj|Env|Str) › /, '')}</code> — \${row.real} m high</li>\`;
}).join('');

const sz = document.getElementById('sz');
for (const r of SIZE_ROWS) {
  const d = document.createElement('div');
  d.innerHTML = \`<span>\${r.kind}</span> \${r.real} m\${r.high ? ' high' : ''}\${r.storeys ? ' <span class="muted">(no storeys tag)</span>' : ''}\`;
  sz.appendChild(d);
}

const TABS = ['curves', 'outliers', 'rules'];
function pick(name) {
  for (const t of TABS) {
    document.getElementById('tab-' + t).setAttribute('aria-selected', String(t === name));
    document.getElementById('panel-' + t).hidden = t !== name;
  }
}
for (const t of TABS) document.getElementById('tab-' + t).addEventListener('click', () => pick(t));

load('weighted');
</script>
</body>
</html>
`;

const out = process.argv[2] ?? join(ROOT, 'catalog', 'app', 'size-curves.html');
const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
const meta = (name) => index.match(new RegExp(`<meta name="${name}" content="([^"]*)">`))?.[1] ?? '';
const version = meta('catalogus-versie');
writeFileSync(out, page
  .replace('<meta name="catalogus-versie" content="">', `<meta name="catalogus-versie" content="${version}">`)
  .replace('<meta name="catalogus-gebouwd" content="">', `<meta name="catalogus-gebouwd" content="${meta('catalogus-gebouwd')}">`)
  .replace('href="catalog.css"', `href="catalog.css?v=${version}"`));
const w = payload.weighted;
console.log(`${models.length} models · ${w.kits.length} kits · ref slope ${w.ref.slope} → ${out}`);
