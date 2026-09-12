export const BRONKITS = [
  { map: 'kenney_survival-kit', naam: 'Kenney Survival Kit', kit: 'ken-survival', formaat: 'glb' },
  { map: 'kenney_pirate-kit', naam: 'Kenney Pirate Kit', kit: 'ken-pirate', formaat: 'glb' },
  { map: 'kenney_modular-cave-kit_1.0', naam: 'Kenney Modular Cave Kit', kit: 'ken-cave', formaat: 'glb' },
  { map: 'kenney_mini-forest_1.0', naam: 'Kenney Mini Forest', kit: 'ken-forest-mini', formaat: 'glb' },
  { map: 'kenney_fantasy-town-kit_2.0', naam: 'Kenney Fantasy Town Kit', kit: 'ken-town', formaat: 'glb' },
  { map: 'kenney_platformer-kit', naam: 'Kenney Platformer Kit', kit: 'ken-platformer', formaat: 'glb' },
  { map: 'kenney_prototypekit', naam: 'Kenney Prototype Kit', kit: 'ken-proto', formaat: 'glb' },
  { map: 'kenney_castlekit', naam: 'Kenney Castle Kit', kit: 'ken-castle', formaat: 'glb' },
  { map: 'kenney_graveyardkit_5.0', naam: 'Kenney Graveyard Kit', kit: 'ken-grave', formaat: 'glb' },
  { map: 'kenney_holidaykit', naam: 'Kenney Holiday Kit', kit: 'ken-holiday', formaat: 'glb' },
  { map: 'kenney_mini-dungeon', naam: 'Kenney Mini Dungeon', kit: 'ken-mini-dun', formaat: 'glb' },

  { map: 'KayKit_Dungeon_Pack_1.1_FREE', naam: 'KayKit Dungeon Asset Pack', kit: 'kay-dun-2', formaat: 'gltf' },
  { map: 'KayKit_Forest_Nature_Pack_1.0_FREE', naam: 'KayKit Forest Nature Pack', kit: 'kay-forest', formaat: 'gltf' },
  { map: 'KayKit_ResourceBits_1.0_FREE', naam: 'KayKit Resource Bits', kit: 'kay-resources', formaat: 'gltf' },
  { map: 'KayKit_RPGToolsBits_1.0_FREE', naam: 'KayKit RPG Tools Bits', kit: 'kay-tools', formaat: 'gltf' },
  // gltf holds the assembled models, obj one file per node. Reading gltf first keeps a
  // multi-part model whole; the obj pass then adds the loose parts gltf has no file for.
  { map: 'KayKit_HalloweenBits_1.0_FREE', naam: 'KayKit Halloween Bits', kit: 'kay-hallow', formaat: 'gltf', extraFormaten: ['obj'] },
  { map: 'KayKit_Restaurant_Bits_1.0_FREE', naam: 'KayKit Restaurant Bits', kit: 'kay-food', formaat: 'gltf', extraFormaten: ['obj'] },
  { map: 'KayKit_Furniture_Bits_1.0_FREE', naam: 'KayKit Furniture Bits', kit: 'kay-furniture', formaat: 'gltf' },
  { map: 'KayKit_Adventurers_2.0_FREE', naam: 'KayKit Adventurers', kit: 'kay-adventurers', formaat: 'gltf' },
  { map: 'KayKit_Skeletons_1.1_FREE', naam: 'KayKit Skeletons', kit: 'kay-skeleton', formaat: 'gltf' },

  { map: 'FantasyProps_glTF_1k', naam: 'Fantasy Props MegaKit', kit: 'fantasy-props', formaat: 'gltf' },
  { map: 'Ultimate_Nature_Pack_by_Quaternius_OBJ', naam: 'Ultimate Nature Pack', kit: 'quat-nature', formaat: 'obj' },
  { map: 'nature_kit', naam: 'Nature Kit', kit: 'natuur', formaat: 'obj' },
  { map: 'Modular Village', naam: 'Modular Village', kit: 'fs-town', formaat: 'obj' },
  { map: 'modular_terrain_collection', naam: 'Modular Terrain Collection', kit: 'fs-terrain', formaat: 'obj' },

  { map: 'PropsLite_FBX', naam: 'Medieval Props Lite', kit: 'props', formaat: 'fbx' },
  { map: 'Rocks', naam: 'Rocks', kit: 'rocks', formaat: 'fbx', splitsPerMesh: true },
  { map: 'ocean', naam: 'Ocean', kit: 'quat-ocean', formaat: 'fbx' },
  { map: 'LowPolyNaturePackLite', naam: 'Low Poly Nature Pack Lite', kit: null, formaat: 'fbx' },
  { map: 'TropicalIslandLite_FBX', naam: 'Tropical Island Lite', kit: 'tropical-island', formaat: 'fbx' },

  { map: 'KayKit_Dungeon_Pack_1.0', naam: 'KayKit Dungeon Pack 1.0', kit: 'kay-dun-1', formaat: 'glb' },
  { map: 'KayKit_Skeletons_1.0', naam: 'KayKit Skeletons 1.0', kit: 'kay-skeleton', formaat: 'glb' },
  { map: 'KayKit_FantasyWeaponsBits_1.0_FREE', naam: 'KayKit Fantasy Weapons Bits', kit: 'kay-weapons', formaat: 'gltf' },
  { map: 'Tiny_Treats_House_Plants_1.0_FREE', naam: 'Tiny Treats House Plants', kit: null, formaat: 'gltf' },
  { map: 'Tiny_Treats_Baked_Goods_1.0_FREE', naam: 'Tiny Treats Baked Goods', kit: 'isa-food', formaat: 'gltf' },
  { map: 'ClayItems_FreeTier_1.1', naam: 'Clay Items Free Tier', kit: 'clay-props', formaat: 'gltf' },
  { map: 'Updated_Modular_Dungeon_2019', naam: 'Updated Modular Dungeon', kit: 'quat-dun-2', formaat: 'obj' },
  // Same 48 models as the Updated pack, never imported: its kit holds no workfiles, so
  // build-missing lists the whole pack as still to come.
  { map: 'Modular_Dungeons_Pack_by_Quaternius_OBJ', naam: 'Modular Dungeons Pack', kit: 'quat-dun-1', formaat: 'obj' },
  { map: 'Small_Props_Pack_1', naam: 'Small Props Pack', kit: 'small-props', formaat: 'fbx' },
  { map: 'Windmill', naam: 'Windmill', kit: 'windmill', formaat: 'fbx', splitsPerMesh: true },

  { map: 'Blood_Ring_by_Quaternius', naam: 'Blood Ring', kit: 'quat-rpg', formaat: 'fbx' },
  { map: 'Skeleton_by_Quaternius', naam: 'Skeleton', kit: 'quat-rpg', formaat: 'fbx' },
  { map: 'tools_mekmeesk', naam: 'Tools (mekmeesk)', kit: null, formaat: 'fbx', splitsPerMesh: true },
  { map: 'Low_Poly_Primitive_Tools', naam: 'Low Poly Primitive Tools', kit: 'primitive-tools', formaat: 'fbx' },

  // glb, not the fbx zips: those put every model in its own folder, which build-missing's
  // one-folder rule reads as a two-model pack, and the park's fbx ships without its atlas.
  { map: 'Pretty_park_set', naam: 'Pretty Park Set', kit: 'isa-park', formaat: 'glb' },
  { map: 'Pond_pack', naam: 'Pond Pack', kit: 'isa-pond', formaat: 'glb' },
  { map: 'Medieval_Village_Pack', naam: 'Medieval Village Pack', kit: 'medieval-town', formaat: 'glb' },
];
