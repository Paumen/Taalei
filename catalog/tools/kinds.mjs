// The kind field of §7: the tree comes from Appendix B of the style guide and nothing
// else. Shared by the build, the migration and the lint.

import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUIDE = join(ROOT, 'docs/asset_style_guide.md');

// id → glossary nouns, every implied parent included (T4)
export function readKindTree(guide = readFileSync(GUIDE, 'utf8')) {
  const block = guide.split('## Appendix B')[1]?.match(/```\n([\s\S]*?)```/)?.[1];
  if (!block) throw new Error('Appendix B code block not found in the style guide');
  const nodes = new Map();
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const [id, nouns = ''] = line.split(' — ');
    nodes.set(id.trim(), nouns.trim());
  }
  for (const id of [...nodes.keys()]) {
    const parts = id.split('-');
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('-');
      if (!nodes.has(parent)) nodes.set(parent, '');
    }
  }
  return nodes;
}

export const ROOT_ORDER = ['obj', 'char', 'env', 'str', 'assy', 'scene'];
const ROOT_NAME = { obj: 'Object', env: 'Environment', str: 'Structure', char: 'Character', assy: 'Assembly', scene: 'Scene' };
const ROOT_TEXT = {
  obj: 'manufactured or portable thing', env: 'naturally occurring thing',
  str: 'constructed part of the world', char: 'living or acting entity',
  assy: 'several distinct things, one top-level', scene: 'crosses env, str and obj',
};
const SEGMENT_NAME = { pocketitem: 'Pocket item', kitchenware: 'Kitchenware', deadwood: 'Deadwood', remains: 'Remains' };

export const kindName = (id) => {
  if (ROOT_NAME[id]) return ROOT_NAME[id];
  const last = id.split('-').at(-1);
  return SEGMENT_NAME[last] ?? last[0].toUpperCase() + last.slice(1);
};
export const kindParent = (id) => (id.includes('-') ? id.slice(0, id.lastIndexOf('-')) : null);
export const kindRoot = (id) => id.split('-')[0];
export const kindDepth = (id) => id.split('-').length;
export const kindIs = (id, ancestor) => id === ancestor || Boolean(id?.startsWith(`${ancestor}-`));
export const kindAncestors = (id) => {
  const out = [];
  for (let p = kindParent(id); p; p = kindParent(p)) out.push(p);
  return out;
};
export const rootRank = (id) => ROOT_ORDER.indexOf(kindRoot(id));

// Branch colours: the old group's colour where a branch is that group, else a new one.
export const KIND_COLORS = {
  obj: '#c07c8a', char: '#8a6fb0', env: '#6cb588', str: '#877a63', assy: '#b5651d', scene: '#6f7f8f',
  'obj-container': '#dd9f79', 'obj-kitchenware': '#9c3f2e', 'obj-furniture': '#c07c8a',
  'obj-food': '#c25b4e', 'obj-weapon': '#4c5468', 'obj-equipment': '#6b5b95', 'obj-tool': '#6d738a',
  'obj-transport': '#5a7a9c', 'obj-lighting': '#f2cb45', 'obj-pocketitem': '#f1976c',
  'obj-resource': '#4f7d8c',
  'str-part': '#a8762a', 'str-building': '#7d4f3a', 'str-stands': '#d8a05a',
  'str-platform': '#877a63', 'str-barrier': '#b08968',
  'str-access': '#c98a5a', 'str-marker': '#ffb349',
  'env-flora': '#6cb588', 'env-fungi': '#e08fb0', 'env-fauna': '#3e8fd0', 'env-remains': '#cfc6ad',
  'env-rock': '#9da4c4', 'env-terrain': '#8a5d4b', 'env-water': '#4fa3c7',
};

export const kindDescription = (id, nouns) =>
  nouns || (kindDepth(id) === 1 ? `${kindName(id)}: ${ROOT_TEXT[id] ?? ''}` : `${kindName(id)} with no leaf that fits (K2).`);

export const USES = ['container', 'food', 'weapon', 'tool', 'wearable', 'decor', 'transport', 'light'];
export const USE_NAME = { container: 'Container', food: 'Food', weapon: 'Weapon', tool: 'Tool', wearable: 'Wearable', decor: 'Decor', transport: 'Transport', light: 'Light' };
export const USE_TEXT = {
  container: 'You put something in it.', food: 'You eat it.', weapon: 'You fight with it.',
  tool: 'You work with it.', wearable: 'You wear it.', decor: 'It is there to be looked at.',
  transport: 'It moves things or people.', light: 'It gives light.',
};

// §7 size, measured from the bounding box: longest axis under half a unit is small,
// under one and a half is medium, the rest large.
export const SIZES = [
  { id: 's', name: 'Small', limit: 0.5, description: 'Longest axis under half a unit.' },
  { id: 'm', name: 'Medium', limit: 1.5, description: 'Longest axis from half to one and a half units.' },
  { id: 'l', name: 'Large', limit: Infinity, description: 'Longest axis over one and a half units.' },
];
export const sizeOf = (wdh) => (SIZES.find((k) => Math.max(...wdh) < k.limit) ?? SIZES.at(-1)).id;

// Model name → kind: the glossary nouns as patterns, first hit wins. Used by the
// migration and by the missing-models page, where nothing is curated yet.
const w = (s) => new RegExp(`(^|-)(${s})(s|es)?(-|$)`);
export const NAME_KIND = [
  [w('carrot|cabbage|pumpkin|turnip|onion|potato|tomato|lettuce'), 'obj-food-vegetable'],
  [w('bread|loaf|baguette|cake|pie|donut|croissant|muffin|waffle|cookie|cinnamon|brownie|bun|cupcake'), 'obj-food-grain'],
  [w('steak|ham|sausage|drumstick|chicken|roast|burger|meat|stew'), 'obj-food-meat'],
  [w('apple|banana|cheese|egg|honey|coconut|food'), 'obj-food'],

  [w('sword|blade|rapier|scimitar|katana'), 'obj-weapon-melee-sword'],
  [w('dagger'), 'obj-weapon-melee-dagger'],
  [w('axe|hatchet|battleaxe'), 'obj-weapon-melee-axe'],
  [w('hammer|warhammer|mace|club|flail'), 'obj-weapon-melee-hammer'],
  [w('spear|pike|halberd|fistweapon|knuckle|claw'), 'obj-weapon-melee'],
  [w('crossbow'), 'obj-weapon-ranged-crossbow'],
  [w('bow|longbow'), 'obj-weapon-ranged-bow'],
  [w('arrow|bolt|quiver'), 'obj-weapon-ranged-accessory'],
  [w('sling|javelin|smokebomb'), 'obj-weapon-ranged'],
  [w('staff'), 'obj-weapon-magic-staff'],
  [w('wand|orb|spellbook'), 'obj-weapon-magic'],
  [w('shield|buckler'), 'obj-equipment-shield'],
  [w('helmet|chestplate|pauldron|greave|gauntlet|armor|armour'), 'obj-equipment-armor'],
  [w('cape|cloak|robe|hat|hood|boot|shoe|belt|glove'), 'obj-equipment-clothing'],
  [w('crown|goggle'), 'obj-equipment'],

  [w('hammer|saw|chisel|trowel|wrench|tong|brush|mallet|file|handplane|handdrill|scissor|screwdriver|magnifying-glass|compass|drafting-compass|pencil'), 'obj-tool-hand'],
  [w('shovel|spade|pickaxe|rake|hoe|pitchfork|broom|fishing-rod'), 'obj-tool-long'],
  [w('screw|nail|rope|chain|hook|wire'), 'obj-tool-supplies'],
  [w('lever|spring|gear|pulley|anvil|grindstone|workbench'), 'obj-tool'],

  [w('crockpot|cauldron|kettle|cooking-pot|rice-pot|lid'), 'obj-kitchenware-cookware-pot'],
  [w('pan|skillet|frying-pan'), 'obj-kitchenware-cookware-pan'],
  [w('grill|spit|ladle|cutting-board|campfire-stand|campfire-fishing-stand'), 'obj-kitchenware-cookware'],
  [w('fork|spoon|table-knife|knife'), 'obj-kitchenware-tableware-cutlery'],
  [w('plate|platter|dish|tray|saucer|bowl'), 'obj-kitchenware-tableware-plate'],
  [w('mug|cup|goblet|tankard|teapot|chalice'), 'obj-kitchenware-tableware'],

  [w('chest|trunk|coffer|strongbox'), 'obj-container-chest'],
  [w('barrel|cask|keg'), 'obj-container-barrel'],
  [w('bucket|pail'), 'obj-container-bucket'],
  [w('crate|box|case'), 'obj-container-crate'],
  [w('bottle|flask|vial|potion'), 'obj-container-bottle'],
  [w('bag|sack|pouch|purse|backpack|satchel|loot-sack'), 'obj-container-bag'],
  [w('pot|planter|vase|urn|amphora|jar|jug|pitcher|ewer'), 'obj-container-pot'],
  [w('basket|tub|trough|bin|can|coffin|basin|cage'), 'obj-container'],

  [w('table|desk|workbench'), 'obj-furniture-table'],
  [w('chair|stool|bench|throne|couch|armchair|sofa|seat'), 'obj-furniture-seating'],
  [w('bed|cabinet|shelf|shelves|bookcase|wardrobe|rug|carpet|dresser|cupboard'), 'obj-furniture'],

  [w('ship|galleon|longship|hull'), 'obj-transport-ship'],
  [w('boat|rowboat|canoe|raft|dinghy'), 'obj-transport-boat'],
  [w('cart|wagon|carriage|wheelbarrow|sled'), 'obj-transport-cart'],
  [w('anchor|paddle|oar|wheel|sail|rudder|mast'), 'obj-transport-accessory'],
  [w('saddle|balloon'), 'obj-transport'],

  [w('lantern|lamp'), 'obj-lighting-lantern'],
  [w('torch|brazier'), 'obj-lighting-torch'],
  [w('candle|candlestick|candelabra'), 'obj-lighting-candle'],
  [w('campfire|chandelier|streetlight|fire|fireplace'), 'obj-lighting'],

  [w('coin|gold-pile|gem'), 'obj-pocketitem-coin'],
  [w('key|keyring'), 'obj-pocketitem-key'],
  [w('book|tome|journal'), 'obj-pocketitem-book'],
  [w('scroll|letter|map|parchment|blueprint'), 'obj-pocketitem-scroll'],
  [w('ring|necklace|amulet|bracelet|earring|pendant|brooch'), 'obj-pocketitem-jewellery'],
  [w('compass|hourglass|dice|mirror|artifact|star|heart'), 'obj-pocketitem'],

  [w('ingot|nugget|ore-lump|cog|part|spare-part'), 'obj-resource-metal'],
  [w('bar'), 'obj-resource-metal'],
  [w('wood-plank|resource-plank|platform-plank|pallet'), 'obj-resource-wood'],
  [w('stone-brick'), 'obj-resource-stone'],
  [w('textile|cloth-roll'), 'obj-resource-textile'],
  [w('hide|raw-stock'), 'obj-resource'],

  [w('stand|rack|easel|statue|signboard|bell|cage|mannequin|target'), 'obj'],

  [w('frame|framework|structure|scaffold'), 'str-part-frame'],
  [w('door|gate|hatch|doorway|trapdoor'), 'str-part-door'],
  [w('floor|tile|ceiling|foundation'), 'str-part-floor'],
  [w('roof|chimney|gable'), 'str-part-roof'],
  [w('window|shutter'), 'str-part-window'],
  [w('wall|arch|corner|stucco|block|panel|bricks|rubble'), 'str-part-wall'],
  [w('pillar|column|beam|support'), 'str-part-pillar'],
  [w('room|cellar|souterrain|dungeon|balcony|overhang'), 'str-part'],

  [w('house|hut|tower|crypt|church|castle|lighthouse|inn|barracks|stable|blacksmith|mill|windmill|watermill|sawmill|gazebo|well|building|blade'), 'str-building'],

  [w('tent|stall|market-stand|awning|canopy'), 'str-stands'],

  [w('deck|boardwalk|platform'), 'str-platform-deck'],
  [w('dock|pier|jetty'), 'str-platform-dock'],

  [w('fence|railing|palisade'), 'str-barrier-fence'],
  [w('post|bollard|stake|pole'), 'str-barrier-post'],
  [w('hedge|barricade'), 'str-barrier'],

  [w('stair|step|ramp'), 'str-access-stairs'],
  [w('ladder'), 'str-access-ladder'],
  [w('bridge'), 'str-access-bridge'],

  [w('sign|signpost|notice|arrow'), 'str-marker-sign'],
  [w('flag|banner|pennant'), 'str-marker-flag'],
  [w('tombstone|gravestone|grave|gravemarker|cross|memorial|plaque'), 'str-marker-tombstone'],
  [w('milestone|waystone|totem'), 'str-marker'],

  [w('stage|altar|plinth|pedestal|shrine|fountain|gallows|waterwheel|mine|fireplace'), 'str'],

  [w('cactus|succulent'), 'env-flora-plant-cactus'],
  [w('flower|tulip|rose|sunflower|bellflower|daisy|lily|violet'), 'env-flora-plant-flower'],
  [w('grass|reed|weed'), 'env-flora-plant-grass'],
  [w('cattail|bush|shrub|fern|ivy|vine|seaweed|lilypad|lily-pad|plant|corn|wheat'), 'env-flora-plant'],
  [w('conifer|pine|spruce|fir'), 'env-flora-tree-conifer'],
  [w('palm'), 'env-flora-tree-palm'],
  [w('stump'), 'env-flora-deadwood-stump'],
  [w('branch|twig|log|driftwood|firewood|timber'), 'env-flora-deadwood-branch'],
  [w('dead|bare|root'), 'env-flora-deadwood'],
  [w('tree|oak|birch|willow'), 'env-flora-tree'],
  [w('mushroom|toadstool|fungus|lichen'), 'env-fungi'],
  [w('fish|mammal|bird|insect|starfish|octopus|crab|lobster|frog|snail|whale|dolphin|shark|manta-ray|tentacle'), 'env-fauna'],
  [w('bone|skull|skeleton|ribcage|carcass'), 'env-remains-bones'],
  [w('shell|egg|nest|feather|cobweb'), 'env-remains'],
  [w('rockform|rockwall|monolith|spire|cliff|outcrop|formation'), 'env-rock-formation'],
  [w('boulder'), 'env-rock-boulder'],
  [w('pebble|gravel|stepping-stone|debris|stones|chunk'), 'env-rock-pebble'],
  [w('crystal|ore|stalagmite'), 'env-rock'],
  [w('mountain|hill|mesa|volcano'), 'env-terrain-mountain'],
  [w('ground|path|sand|snow|dirt|patch|cobblestone|terrain'), 'env-terrain-ground'],
  [w('island|riverbed'), 'env-terrain'],
  [w('water|pond|wave|waterfall|ice|pool|lake'), 'env-water'],
  [w('cloud|lava|smoke|fog'), 'env'],
];

// Rock and stone by size: the glossary puts a large rock with the boulders and a small
// stone with the pebbles, and the name alone does not say which.
const ROCK = /(^|-)(rock|stone)(s|-|$)/;
export const rockBySize = (wdh) => (Math.max(...wdh) < 0.3 ? 'env-rock-pebble' : 'env-rock-boulder');

export function kindFromName(name, wdh = [1, 1, 1], within = null) {
  for (const [pattern, kind] of NAME_KIND) {
    if (!pattern.test(name)) continue;
    if (within && !kindIs(kind, within)) continue;
    if (kind === 'env-rock-boulder' || (within === 'env-rock' && ROCK.test(name))) return rockBySize(wdh);
    return kind;
  }
  if (within === 'env-rock' && ROCK.test(name)) return rockBySize(wdh);
  return null;
}
