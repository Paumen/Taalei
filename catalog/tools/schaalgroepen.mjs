import { categoryOfGroup } from './semantiek.mjs';

const DEAD = /(^|-)(bare|dead)(-|$)/;

// A dimension never reads as 0: a flat plank or a thin coin is still 0.1 units thick.
const round1 = (v) => Math.max(Math.round(v * 10) / 10, 0.1);

const TOP_VIEW = new Set(['shelves-cabinets', 'starfish-shells', 'planks-pallets', 'plates-bowls', 'floors']);

// Families waarvan de grootste modellen bijna een hele rij vullen: met de gewone
// rijbreedte staat er één schip per rij en wordt het blad meters lang.
const WIDE_ROW = new Set(['boats-ships']);

// Van de pirate-kit is elk schip er in drie maten, en elke maat in meer uitvoeringen:
// piraat, spook, wrak. Voor een maatvergelijking zegt één uitvoering per maat genoeg;
// de rest is dezelfde romp in een ander jasje.
const SHIP_SKINS = new Set([
  'pirate-kit/ship-pirate-small', 'pirate-kit/ship-pirate-medium', 'pirate-kit/ship-pirate-large',
  'pirate-kit/ship-ghost', 'pirate-kit/ship-wreck',
]);

const SMALL_TOOLS = new Set([
  'rpgtools/nail', 'rpgtools/screw-b', 'rpgtools/scissors', 'rpgtools/screwdriver-a-short',
  'rpgtools/file', 'rpgtools/drafting-compass', 'rpgtools/compass-base', 'rpgtools/pencil-a-long',
  'rpgtools/pencil-b-long', 'rpgtools/screwdriver-b-short',
  'rpgtools/wrench-b', 'rpgtools/magnifying-glass', 'rpgtools/knife', 'restaurant/knife',
  'rpgtools/chisel', 'rpgtools/hammer', 'rpgtools/mallet', 'rpgtools/axe', 'rpgtools/tongs',
  'rpgtools/trowel',
]);
const LARGE_TOOLS = new Set([
  'rpgtools/saw', 'graveyard-kit/shovel', 'rpgtools/shovel',
  'pirate-kit/tool-paddle',
  'rpgtools/handdrill', 'rpgtools/pickaxe',
  'rpgtools/grindstone', 'rpgtools/anvil',
]);

const isTool = (b, m) => m.group === 'tools' || SMALL_TOOLS.has(m.id) || LARGE_TOOLS.has(m.id);
const isSmall = (m) => SMALL_TOOLS.has(m.id) || (!LARGE_TOOLS.has(m.id) && m.wdh[2] < 0.2);

export const FAMILIES = [
  ['plates-bowls', 'Plates and bowls', (b) => /^(plate|bowl|dish|cup|mug|tray)(-|$)/.test(b) || b === 'table-plate'],
  ['pots-pans', 'Pots and pans', (b) => /^(pot|pan|cauldron|kettle)(-|$)/.test(b)],
  ['mushrooms', 'Mushrooms', (b) => b.startsWith('mushroom') || b.includes('-mushroom-')],
  ['wood', 'Wood, firewood and timber', (b) => /(wood-pile|firewood|timber)/.test(b) || /(^|-)log(-|$)/.test(b)],
  ['branches-roots', 'Branches and roots', (b) => /^(branch|root)(-|$)/.test(b) || b.includes('-branch-')],
  ['campfires', 'Campfires', (b) => b.includes('campfire')],
  ['planks-pallets', 'Planks and pallets', (b) => b.includes('plank') || b.includes('pallet')],
  ['barrels-kegs', 'Barrels and kegs', (b) => /^(barrel|keg)(-|$)/.test(b)],
  ['chests', 'Chests', (b) => b.startsWith('chest') || b.includes('treasure-chest')],
  ['crates-boxes', 'Crates and boxes', (b) => /^(crate|box)(-|$)/.test(b)],
  ['bottles-potions', 'Bottles and potions', (b) => /^(bottle|potion|flask)(-|$)/.test(b)],
  ['jugs-vases-buckets', 'Jugs, vases and buckets', (b) => /^(jug|vase|bucket)(-|$)/.test(b)],
  ['books-scrolls-maps', 'Books, scrolls and maps', (b) => /^(book|journal|scroll|map)(-|$)/.test(b)],
  ['keys', 'Keys', (b) => /^key(ring)?(-|$)/.test(b)],
  ['small-tools', 'Small tools', (b, m) => isTool(b, m) && isSmall(m)],
  ['large-tools', 'Large tools', (b, m) => isTool(b, m)],
  ['candles', 'Candles', (b) => b.startsWith('candle') || b.endsWith('-candles')],
  ['lanterns-torches', 'Lanterns and torches', (b) => /^(torch|lamp)(-|$)/.test(b) || b.includes('lantern')],
  // Roeibootjes en driemasters in één familie: juist dat verschil van een factor twintig
  // wil je op de schaalpagina naast elkaar zien.
  ['boats-ships', 'Boats and ships', (b, m) => /^(boat|ship)(-|$)/.test(b) && !SHIP_SKINS.has(m.id)],

  ['ladders', 'Ladders', (b, m) => b.startsWith('ladder') || m.id === 'props/stairs-a'],
  ['stairs', 'Stairs', (b) => b.startsWith('stairs') || b.includes('steps')],
  ['fences', 'Fences', (b) => b.includes('fence')],
  ['palms', 'Palms', (b) => b.includes('palm')],
  ['trees', 'Trees', (b) => /(^|-)tree(-|$)/.test(b) && !DEAD.test(b) && !b.includes('log') && !b.includes('stump')],
  ['bare-dead-trees', 'Bare and dead trees', (b) => b.startsWith('tree') && DEAD.test(b)],
  ['tree-stumps', 'Tree stumps', (b) => b.startsWith('stump') || b.includes('tree-stump') || b.endsWith('-stump')],
  ['flowers', 'Flowers', (b) => b.includes('flower') && !b.includes('cactus')],
  ['plants', 'Plants, corn, cattail and cactus', (b) => /^(plant|corn|wreath)(-|$)/.test(b) || b.includes('cattail') || b.includes('cactus')],
  ['grass', 'Grass', (b) => b.includes('grass') && b !== 'rock-flat-grass' && b !== 'well-base-grass'],
  ['starfish-shells', 'Starfish and shells', (b) => b.includes('starfish') || b.includes('shell')],
  ['tables', 'Tables', (b) => b.startsWith('table') && b !== 'table-plate'],
  ['beds-benches', 'Beds, benches, chairs and stools', (b) => /^(bed|bench|sofa|couch|stool|chair|seat)(-|$)/.test(b)],
  ['shelves-cabinets', 'Shelves and cabinets', (b) => /^(shelf|shelves|cabinet|cupboard|bookcase|dresser|wardrobe)(-|$)/.test(b)],
  ['doors', 'Doors', (b) => b.startsWith('door') || b.includes('-door') || b.includes('doorway')],

  ['walls', 'Walls', (b) => (b.startsWith('wall') || b.includes('-wall')) && !b.startsWith('rock')],
  ['floors', 'Floors', (b) => /^(floor|ground|tile)(-|$)/.test(b) || b.includes('-floor')],
  ['platforms', 'Platforms', (b) => b.includes('platform')],
];

// Een familie hoort bij de categorie waar de meeste van haar modellen in vallen.
// Bijna elke familie is unaniem; alleen bij een enkele gemengde familie (een houten
// plank is een object, een houtstapel in het bos natuur) geeft de meerderheid de
// doorslag, en bij gelijkspel de volgorde nature < object < structure.
function categoryOfFamily(items) {
  const tally = new Map();
  for (const m of items) {
    const c = categoryOfGroup(m.group);
    tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  return [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

export function buildScaleGroups(models) {
  const used = new Set();
  const groups = [];
  for (const [slug, name, test] of FAMILIES) {
    const items = [];
    const gekozen = [];
    for (const m of models) {
      if (used.has(m.id)) continue;

      if (m.group === 'assemblies') continue;
      const base = m.id.slice(m.id.indexOf('/') + 1);
      if (!test(base, m)) continue;
      used.add(m.id);
      gekozen.push(m);

      const tags = m.tags ?? [];
      const colors = m.colors ?? [];
      items.push({
        slug: m.kit,
        model: base,
        wdh: m.wdh.map(round1),
        tags: tags.length ? tags : undefined,
        colors: colors.length ? colors : undefined,
      });
    }
    if (items.length) {
      groups.push({
        slug,
        name,
        category: categoryOfFamily(gekozen),
        topView: TOP_VIEW.has(slug) || undefined,
        wideRow: WIDE_ROW.has(slug) || undefined,
        items,
      });
    }
  }
  return groups;
}
