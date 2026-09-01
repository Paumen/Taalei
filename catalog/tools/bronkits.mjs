// Which source pack a kit was imported from, and where the models sit inside it.
//
// The pack itself is the .zip under kits/sources/<map>/; a pack ships the same models
// in several formats and often nested a couple of folders deep, so `format` picks the
// format to read and the folder is looked up by finding the one that holds the most
// files of that format (see vindModelmap). Packs without a `kit` were downloaded but
// never imported — everything in them counts as missing.
//
// `kleurruimte: 'srgb'` says an .fbx pack writes its material colours in display space
// rather than in linear light; see naarKanalen in fbx.mjs for how a pack is asked which
// it does.

export const BRONKITS = [
  { map: 'kenney_survival-kit', naam: 'Kenney Survival Kit', kit: 'survival-kit', formaat: 'glb' },
  { map: 'kenney_pirate-kit', naam: 'Kenney Pirate Kit', kit: 'pirate-kit', formaat: 'glb' },
  { map: 'kenney_modular-cave-kit_1.0', naam: 'Kenney Modular Cave Kit', kit: 'modular-cave-kit', formaat: 'glb' },
  { map: 'kenney_mini-forest_1.0', naam: 'Kenney Mini Forest', kit: 'mini-forest', formaat: 'glb' },
  { map: 'kenney_fantasy-town-kit_2.0', naam: 'Kenney Fantasy Town Kit', kit: 'fantasy-town-kit', formaat: 'glb' },
  { map: 'kenney_platformer-kit', naam: 'Kenney Platformer Kit', kit: 'platformer-kit', formaat: 'glb' },
  { map: 'kenney_prototypekit', naam: 'Kenney Prototype Kit', kit: 'prototype-kit', formaat: 'glb' },
  { map: 'kenney_castlekit', naam: 'Kenney Castle Kit', kit: null, formaat: 'glb' },
  { map: 'kenney_graveyardkit_5.0', naam: 'Kenney Graveyard Kit', kit: null, formaat: 'glb' },
  { map: 'kenney_holidaykit', naam: 'Kenney Holiday Kit', kit: null, formaat: 'glb' },
  { map: 'kenney_mini-dungeon', naam: 'Kenney Mini Dungeon', kit: null, formaat: 'glb' },

  { map: 'KayKit_Dungeon_Pack_1.1_FREE', naam: 'KayKit Dungeon Asset Pack', kit: 'dungeon', formaat: 'gltf' },
  { map: 'KayKit_Forest_Nature_Pack_1.0_FREE', naam: 'KayKit Forest Nature Pack', kit: 'forest', formaat: 'gltf' },
  { map: 'KayKit_ResourceBits_1.0_FREE', naam: 'KayKit Resource Bits', kit: 'resources', formaat: 'gltf' },
  { map: 'KayKit_RPGToolsBits_1.0_FREE', naam: 'KayKit RPG Tools Bits', kit: 'rpgtools', formaat: 'gltf' },
  // halloween and restaurant ship a few models as .obj that the gltf folder doesn't carry
  { map: 'KayKit_HalloweenBits_1.0_FREE', naam: 'KayKit Halloween Bits', kit: 'halloween', formaat: 'obj' },
  { map: 'KayKit_Restaurant_Bits_1.0_FREE', naam: 'KayKit Restaurant Bits', kit: 'restaurant', formaat: 'obj' },
  { map: 'KayKit_Furniture_Bits_1.0_FREE', naam: 'KayKit Furniture Bits', kit: null, formaat: 'gltf' },

  { map: 'FantasyProps_glTF_1k', naam: 'Fantasy Props MegaKit', kit: 'fantasy-props', formaat: 'gltf' },
  { map: 'Ultimate_Nature_Pack_by_Quaternius_OBJ', naam: 'Ultimate Nature Pack', kit: 'quaternius-nature', formaat: 'obj' },
  { map: 'nature_kit', naam: 'Nature Kit', kit: 'natuur', formaat: 'obj' },
  { map: 'Modular Village', naam: 'Modular Village', kit: 'village-kit', formaat: 'obj' },
  { map: 'modular_terrain_collection', naam: 'Modular Terrain Collection', kit: 'modulair-terrein', formaat: 'obj' },

  { map: 'modular_terrain_2.0', naam: 'Modular Terrain 2.0', kit: null, formaat: 'fbx', kleurruimte: 'srgb' },

  { map: 'PropsLite_FBX', naam: 'Medieval Props Lite', kit: 'props', formaat: 'fbx' },
  { map: 'Rocks', naam: 'Rocks', kit: 'rocks', formaat: 'fbx', splitsPerMesh: true },
  { map: 'ocean', naam: 'Ocean', kit: 'onderwater-kit', formaat: 'fbx' },
  { map: 'LowPolyNaturePackLite', naam: 'Low Poly Nature Pack Lite', kit: null, formaat: 'fbx' },
  { map: 'TropicalIslandLite_FBX', naam: 'Tropical Island Lite', kit: null, formaat: 'fbx' },
];
