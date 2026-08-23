const DOOD = /(^|-)(bare|dead)(-|$)/;

const BOVENAANZICHT = new Set(['schappen-kasten', 'zeesterren-schelpen', 'planken-pallets']);

const KLEIN_GEREEDSCHAP = new Set([
  'rpgtools/nail', 'rpgtools/screw-b', 'rpgtools/scissors', 'rpgtools/screwdriver-a-short',
  'rpgtools/file', 'rpgtools/drafting-compass', 'rpgtools/compass-base', 'rpgtools/pencil-a-long',
  'rpgtools/pencil-b-long', 'rpgtools/screwdriver-b-short', 'survival-kit/tool-hammer',
  'rpgtools/wrench-b', 'rpgtools/magnifying-glass', 'rpgtools/knife', 'restaurant/knife',
  'rpgtools/chisel', 'rpgtools/hammer', 'rpgtools/mallet', 'rpgtools/axe', 'rpgtools/tongs',
  'rpgtools/trowel',
]);
const GROOT_GEREEDSCHAP = new Set([
  'rpgtools/saw', 'graveyard-kit/shovel', 'rpgtools/shovel', 'survival-kit/tool-hoe',
  'pirate-kit/tool-paddle', 'survival-kit/tool-pickaxe', 'survival-kit/tool-shovel',
  'survival-kit/tool-axe', 'rpgtools/handdrill', 'rpgtools/pickaxe', 'fantasy-props/pickaxe-bronze',
  'rpgtools/grindstone', 'rpgtools/anvil',
]);

const isGereedschap = (b, m) => m.groep === 'gereedschap' || KLEIN_GEREEDSCHAP.has(m.id) || GROOT_GEREEDSCHAP.has(m.id);
const isKlein = (m) => KLEIN_GEREEDSCHAP.has(m.id) || (!GROOT_GEREEDSCHAP.has(m.id) && m.wdh[2] < 0.2);

export const FAMILIES = [
  ['borden-kommen', 'Borden en kommen', (b) => /^(plate|bowl|dish|cup|mug|tray)(-|$)/.test(b) || b === 'table-plate'],
  ['potten-pannen', 'Potten en pannen', (b) => /^(pot|pan|cauldron|kettle)(-|$)/.test(b)],
  ['paddenstoelen', 'Paddenstoelen', (b) => b.startsWith('mushroom') || b.includes('-mushroom-')],
  ['hout', 'Hout, brandhout en timber', (b) => /(wood-pile|firewood|timber)/.test(b) || /(^|-)log(-|$)/.test(b)],
  ['takken-wortels', 'Takken en wortels', (b) => /^(branch|root)(-|$)/.test(b) || b.includes('-branch-')],
  ['kampvuur', 'Kampvuren', (b) => b.includes('campfire')],
  ['planken-pallets', 'Planken en pallets', (b) => b.includes('plank') || b.includes('pallet')],
  ['vaten-kegs', 'Vaten en kegs', (b) => /^(barrel|keg)(-|$)/.test(b)],
  ['kisten', 'Kisten', (b) => b.startsWith('chest') || b.includes('treasure-chest')],
  ['kratten-dozen', 'Kratten en dozen', (b) => /^(crate|box)(-|$)/.test(b)],
  ['flessen-drankjes', 'Flessen en drankjes', (b) => /^(bottle|potion|flask)(-|$)/.test(b)],
  ['kruiken-vazen-emmers', 'Kruiken, vazen en emmers', (b) => /^(jug|vase|bucket)(-|$)/.test(b)],
  ['boeken-rollen-kaarten', 'Boeken, rollen en kaarten', (b) => /^(book|journal|scroll|map)(-|$)/.test(b)],
  ['sleutels', 'Sleutels', (b) => /^key(ring)?(-|$)/.test(b)],
  ['gereedschap-klein', 'Klein gereedschap', (b, m) => isGereedschap(b, m) && isKlein(m)],
  ['gereedschap-groot', 'Groot gereedschap', (b, m) => isGereedschap(b, m)],
  ['kaarsen', 'Kaarsen', (b) => b.startsWith('candle') || b.endsWith('-candles')],
  ['lantaarns-fakkels', 'Lantaarns en fakkels', (b) => /^(torch|lamp)(-|$)/.test(b) || b.includes('lantern')],

  ['ladders', 'Ladders', (b, m) => b.startsWith('ladder') || m.id === 'props/stairs-a'],
  ['trappen', 'Trappen', (b) => b.startsWith('stairs') || b.includes('steps')],
  ['hekken', 'Hekken', (b) => b.includes('fence')],
  ['palmen', 'Palmen', (b) => b.includes('palm')],
  ['bomen', 'Bomen', (b) => /(^|-)tree(-|$)/.test(b) && !DOOD.test(b) && !b.includes('log') && !b.includes('stump')],
  ['bomen-kaal-dood', 'Kale en dode bomen', (b) => b.startsWith('tree') && DOOD.test(b)],
  ['boomstronken', 'Boomstronken', (b) => b.startsWith('stump') || b.includes('tree-stump') || b.endsWith('-stump')],
  ['bloemen', 'Bloemen', (b) => b.includes('flower') && !b.includes('cactus')],
  ['planten', 'Planten, mais, lisdodde en cactus', (b) => /^(plant|corn|wreath)(-|$)/.test(b) || b.includes('cattail') || b.includes('cactus')],
  ['gras', 'Gras', (b) => b.includes('grass') && b !== 'rock-flat-grass' && b !== 'well-base-grass'],
  ['zeesterren-schelpen', 'Zeesterren en schelpen', (b) => b.includes('starfish') || b.includes('shell')],
  ['tafels', 'Tafels', (b) => b.startsWith('table') && b !== 'table-plate'],
  ['bedden-banken', 'Bedden, banken, stoelen en krukken', (b) => /^(bed|bench|sofa|couch|stool|chair|seat)(-|$)/.test(b)],
  ['schappen-kasten', 'Schappen en kasten', (b) => /^(shelf|shelves|cabinet|cupboard|bookcase|dresser|wardrobe)(-|$)/.test(b)],
  ['deuren', 'Deuren', (b) => b.startsWith('door') || b.includes('-door') || b.includes('doorway')],

  ['muren', 'Muren', (b) => (b.startsWith('wall') || b.includes('-wall')) && !b.startsWith('rock')],
  ['vloeren', 'Vloeren', (b) => /^(floor|ground|tile)(-|$)/.test(b) || b.includes('-floor')],
  ['platforms', 'Platforms', (b) => b.includes('platform')],
];

export function bouwSchaalgroepen(modellen, kits = []) {
  const kortePerSlug = new Map(kits.map((k) => [k.slug, k.kort ?? k.naam ?? k.slug]));
  const gebruikt = new Set();
  const groepen = [];
  for (const [slug, naam, test] of FAMILIES) {
    const items = [];
    for (const m of modellen) {
      if (gebruikt.has(m.id)) continue;

      if (m.groep === 'assemblies') continue;
      const basis = m.id.slice(m.id.indexOf('/') + 1);
      if (!test(basis, m)) continue;
      gebruikt.add(m.id);

      items.push({
        kit: kortePerSlug.get(m.kit) ?? m.kit,
        slug: m.kit,
        model: basis,
        pad: m.pad,
        hoogte: m.wdh[2],
        tags: m.tags ?? [],
      });
    }
    if (items.length) groepen.push({ slug, naam, bovenaanzicht: BOVENAANZICHT.has(slug), items });
  }
  return groepen;
}
