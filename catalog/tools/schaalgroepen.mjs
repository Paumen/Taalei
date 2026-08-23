// Bouwt catalog/schaalgroepen.json: de families die de schaalpagina naast elkaar zet.
//
// De indeling zit hier als regels, niet als lijst modellen. Nieuwe assets vallen daardoor
// vanzelf in de goede familie zodra build-catalog.mjs opnieuw draait — dat is precies wat
// een pagina die "altijd" de maten laat zien nodig heeft.

const DOOD = /(^|-)(bare|dead)(-|$)/;

// Platte dingen lees je van boven, niet van opzij.
const BOVENAANZICHT = new Set(['schappen-kasten', 'zeesterren-schelpen']);

// Elk model valt in de eerste familie die het aanneemt, dus de volgorde is betekenisvol:
// 'palmen' staat vóór 'bomen', anders slokt 'bomen' de palmen op.
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
  ['sleutels-gereedschap', 'Sleutels en gereedschap', (b, m) => b.startsWith('key') || m.groep === 'gereedschap'],
  ['kaarsen', 'Kaarsen', (b) => b.startsWith('candle') || b.endsWith('-candles')],
  ['lantaarns-fakkels', 'Lantaarns en fakkels', (b) => /^(torch|lamp)(-|$)/.test(b) || b.includes('lantern')],
  ['ladders', 'Ladders', (b) => b.startsWith('ladder')],
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
  ['bedden-banken', 'Bedden en banken', (b) => /^(bed|bench|sofa|couch)(-|$)/.test(b)],
  ['krukken-stoelen', 'Krukken en stoelen', (b) => /^(stool|chair|seat)(-|$)/.test(b)],
  ['schappen-kasten', 'Schappen en kasten', (b) => /^(shelf|shelves|cabinet|cupboard|bookcase|dresser|wardrobe)(-|$)/.test(b)],
  ['boten-peddels', 'Boten en peddels', (b) => /^(boat|ship|canoe|raft)(-|$)/.test(b) || b.includes('paddle') || b.includes('oar-')],
  ['deuren', 'Deuren', (b) => b.startsWith('door') || b.includes('-door') || b.includes('doorway')],
  ['ramen', 'Ramen', (b) => b.startsWith('window') || b.includes('-window')],
  // Rotswanden zijn landschap, geen bouwstuk: die horen niet naast een muursegment van 1 unit.
  ['muren', 'Muren', (b) => (b.startsWith('wall') || b.includes('-wall')) && !b.startsWith('rock')],
  ['vloeren', 'Vloeren', (b) => /^(floor|ground|tile)(-|$)/.test(b) || b.includes('-floor')],
  ['platforms', 'Platforms', (b) => b.includes('platform')],
  ['paden-plekken', 'Paden en plekken', (b) => /^(patch|path|road|cobblestone|dirt)(-|$)/.test(b)],
];

export function bouwSchaalgroepen(modellen, kits = []) {
  const kortePerSlug = new Map(kits.map((k) => [k.slug, k.kort ?? k.naam ?? k.slug]));
  const gebruikt = new Set();
  const groepen = [];
  for (const [slug, naam, test] of FAMILIES) {
    const items = [];
    for (const m of modellen) {
      if (gebruikt.has(m.id)) continue;
      const basis = m.id.slice(m.id.indexOf('/') + 1);
      if (!test(basis, m)) continue;
      gebruikt.add(m.id);
      // kit en model apart, zodat het label ze verschillend kan zetten
      items.push({ kit: kortePerSlug.get(m.kit) ?? m.kit, model: basis, pad: m.pad, hoogte: m.wdh[2] });
    }
    if (items.length) groepen.push({ slug, naam, bovenaanzicht: BOVENAANZICHT.has(slug), items });
  }
  return groepen;
}
