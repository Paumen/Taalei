import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { basename, join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGlb } from '../../catalog/tools/glb.mjs';
import { pakUit } from '../../catalog/tools/zip.mjs';
import { leesGltf } from './bron.mjs';
import { scaleTarget } from './scale-factors.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRON_MAP = 'Ultimate_Fantasy_RTS';
const BRON_NAAM = 'Ultimate Fantasy RTS';
const KIT = 'quat-town';
const SCHAAL = scaleTarget(KIT);
if (SCHAAL === null) throw new Error(`${KIT}: no factor in scale-factors.mjs`);
const RAND = [0.05, 0.95];
const SPREIDING = [0.12, 0.88];

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
  azure: [4, 2],
  ivory: [5, 2],
  taupe: [14, 3],
  nickel: [15, 3],
};

const balk = ['wood-beam', 'chestnut'];
const plank = ['wood-planks', 'tan'];
const stam = ['wood-log', 'tan'];
const schors = ['wood-bark', 'umber'];
const grond = ['stone-soil', 'taupe'];
const steen = ['stone-masonry', 'nickel'];
const rots = ['stone-rock', 'nickel'];
const dakpan = ['ceramic', 'sienna'];
const gietijzer = ['metal-iron-cast', 'slate'];
const goud = ['metal-gold', 'amber'];
const doek = ['textile', 'ivory'];
const doekRood = ['textile', 'sienna'];
const vlag = ['textile', 'hunter'];
const touw = ['rope', 'taupe'];
const blad = ['foliage', 'moss'];
const boomblad = ['foliage', 'hunter'];
const water = ['liquid', 'azure'];
const eten = ['food', 'amber'];
const etenOranje = ['food', 'terracotta'];
const etenRood = ['food', 'sienna'];

const MODELLEN = {
  'Archery Training Grounds.glb': {
    naam: 'archery-1-a', bron: 'Archery_FirstAge_Level1', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#886a42': balk, '#901107': doekRood, '#a58758': plank, '#b15945': doekRood, '#b9b9b9': doek },
  },
  'Archery Training Grounds-5dWpau7C3k.glb': {
    naam: 'archery-1-b', bron: 'Archery_FirstAge_Level2', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#886a42': balk, '#888880': steen, '#901107': doekRood, '#a58758': plank, '#b15945': doekRood, '#b9b9b9': doek },
  },
  'Archery Towers.glb': {
    naam: 'archery-1-c', bron: 'Archery_FirstAge_Level3', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#886a42': balk, '#888880': steen, '#901107': doekRood, '#a58758': plank, '#b15945': doekRood, '#b9b9b9': doek },
  },
  'Archery Second Age Le.glb': {
    naam: 'archery-2-a', bron: 'Archery_SecondAge_Level1', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#886a42': balk, '#888880': steen, '#901107': doekRood, '#a58758': plank, '#b15945': dakpan, '#b4b4a9': steen, '#b9b9b9': doek },
  },
  'Archery Building.glb': {
    naam: 'archery-2-b', bron: 'Archery_SecondAge_Level2', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#886a42': balk, '#888880': steen, '#901107': doekRood, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b4b4a9': steen, '#b9b9b9': doek },
  },
  'Archery Towers-IA5qOjIAiT.glb': {
    naam: 'archery-2-c', bron: 'Archery_SecondAge_Level3', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#797979': steen, '#886a42': balk, '#888880': steen, '#901107': doekRood, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b4b4a9': steen, '#b9b9b9': doek },
  },
  'Barracks.glb': {
    naam: 'barracks-1-a', bron: 'Barracks_FirstAge_Level1', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#797979': gietijzer, '#886a42': balk, '#888880': steen, '#a58758': plank, '#a78240': plank, '#b15945': vlag, '#b4b4a9': steen, '#b9b9b9': gietijzer },
  },
  'Barracks-a1C1L8gJTX.glb': {
    naam: 'barracks-1-b', bron: 'Barracks_FirstAge_Level2', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#797979': gietijzer, '#886a42': balk, '#888880': steen, '#a58758': plank, '#a78240': plank, '#b15945': vlag, '#b4b4a9': steen, '#b9b9b9': gietijzer },
  },
  'Barracks-puD1kbV4kf.glb': {
    naam: 'barracks-1-c', bron: 'Barracks_FirstAge_Level3', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#797979': gietijzer, '#886a42': balk, '#888880': steen, '#a58758': plank, '#a78240': plank, '#b15945': vlag, '#b4b4a9': steen, '#b9b9b9': gietijzer },
  },
  'Barracks-lnyADheSvA.glb': {
    naam: 'barracks-2-a', bron: 'Barracks_SecondAge_Level1', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#797979': gietijzer, '#886a42': balk, '#888880': steen, '#a58758': plank, '#a78240': plank, '#b0b1a6': gietijzer, '#b15945': dakpan, '#b4b4a9': steen, '#b9b9b9': gietijzer },
  },
  'Barracks-dvlksXgxWc.glb': {
    naam: 'barracks-2-b', bron: 'Barracks_SecondAge_Level2', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#797979': gietijzer, '#886a42': balk, '#888880': steen, '#a58758': plank, '#a78240': plank, '#b0b1a6': gietijzer, '#b15945': dakpan, '#b4b4a9': steen, '#b9b9b9': gietijzer },
  },
  'Barracks-UXCOwRBSxx.glb': {
    naam: 'barracks-2-c', bron: 'Barracks_SecondAge_Level3', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#797979': gietijzer, '#886a42': balk, '#888880': steen, '#a58758': plank, '#a78240': plank, '#b0b1a6': gietijzer, '#b15945': dakpan, '#b4b4a9': steen, '#b9b9b9': gietijzer },
  },
  'Dock-XViKoBh2UN.glb': {
    naam: 'dock-1', bron: 'Dock_FirstAge', kind: 'str-platform-dock', tags: ['ngons'],
    kleuren: { '#886a42': balk, '#a58758': plank },
  },
  'Small Farm.glb': {
    naam: 'farm-2-a', bron: 'Farm_SecondAge_Level1', kind: 'str-building', tags: [],
    kleuren: { '#574d2f': grond, '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b4b4a9': steen },
  },
  'Farm.glb': {
    naam: 'farm-2-b', bron: 'Farm_SecondAge_Level2', kind: 'str-building', tags: [],
    kleuren: { '#574d2f': grond, '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b4b4a9': steen },
  },
  'Farm-91wMLb9kKo.glb': {
    naam: 'farm-2-c', bron: 'Farm_SecondAge_Level3', kind: 'str-building', tags: [],
    kleuren: { '#574d2f': grond, '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b4b4a9': steen },
  },
  'Farm Dirt.glb': {
    naam: 'farm-field-a', bron: 'Farm_Dirt_Level1', kind: 'env-terrain-ground', tags: [],
    kleuren: { '#574d2f': grond },
  },
  'Farm-O4wpTLSfIn.glb': {
    naam: 'farm-field-b', bron: 'Farm_Dirt_Level2', kind: 'env-flora-plant', tags: ['plural'],
    kleuren: { '#56751d': blad, '#574d2f': grond },
  },
  'Crops.glb': {
    naam: 'farm-field-c', bron: 'Farm_Dirt_Level3', kind: 'env-flora-plant', tags: ['plural'],
    kleuren: { '#56751d': blad, '#574d2f': grond, '#6b7256': blad, '#728543': blad, '#901107': etenRood, '#b8612e': etenOranje },
  },
  'Hut.glb': {
    naam: 'house-1-1-a', bron: 'Houses_FirstAge_1_Level1', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen },
  },
  'Hut-4MJWbyd6vw.glb': {
    naam: 'house-1-1-b', bron: 'Houses_FirstAge_1_Level2', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen },
  },
  'House.glb': {
    naam: 'house-1-1-c', bron: 'Houses_FirstAge_1_Level3', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen },
  },
  'Shack.glb': {
    naam: 'house-1-2-a', bron: 'Houses_FirstAge_2_Level1', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen },
  },
  'Shack-HuzLJcbUd2.glb': {
    naam: 'house-1-2-b', bron: 'Houses_FirstAge_2_Level2', kind: 'str-building', tags: ['plural'],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank },
  },
  'Hut-wxi3kAu5ey.glb': {
    naam: 'house-1-2-c', bron: 'Houses_FirstAge_2_Level3', kind: 'str-building', tags: ['plural'],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank },
  },
  'Dock.glb': {
    naam: 'house-1-3-a', bron: 'Houses_FirstAge_3_Level1', kind: 'str-platform-deck', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank },
  },
  'Huts.glb': {
    naam: 'house-1-3-c', bron: 'Houses_FirstAge_3_Level3', kind: 'str-building', tags: ['plural'],
    kleuren: { '#886a42': balk, '#a58758': plank },
  },
  'House-oJJIRwv6Bo.glb': {
    naam: 'house-2-1-a', bron: 'Houses_SecondAge_1_Level1', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan },
  },
  'House-RSwoYSLblu.glb': {
    naam: 'house-2-1-b', bron: 'Houses_SecondAge_1_Level2', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan },
  },
  'House-vZ1CLbWmSx.glb': {
    naam: 'house-2-1-c', bron: 'Houses_SecondAge_1_Level3', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b4b4a9': steen },
  },
  'House-nihGGju7DW.glb': {
    naam: 'house-2-2-a', bron: 'Houses_SecondAge_2_Level1', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan },
  },
  'House-k6tP5nFUd2.glb': {
    naam: 'house-2-2-b', bron: 'Houses_SecondAge_2_Level2', kind: 'str-building', tags: ['plural'],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan },
  },
  'Houses-gEjAC1UvVU.glb': {
    naam: 'house-2-2-c', bron: 'Houses_SecondAge_2_Level3', kind: 'str-building', tags: ['plural'],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan },
  },
  'House-YlADpCJU8U.glb': {
    naam: 'house-2-3-a', bron: 'Houses_SecondAge_3_Level1', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan },
  },
  'Houses.glb': {
    naam: 'house-2-3-b', bron: 'Houses_SecondAge_3_Level2', kind: 'str-building', tags: ['plural'],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan },
  },
  'Houses-vCoDG5hFyI.glb': {
    naam: 'house-2-3-c', bron: 'Houses_SecondAge_3_Level3', kind: 'str-building', tags: ['plural'],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan },
  },
  'Logs.glb': {
    naam: 'logs', bron: 'Logs', kind: 'obj-resource-wood-log', tags: ['ngons', 'plural'],
    kleuren: { '#886a42': schors, '#a58758': stam },
  },
  'Market Stalls.glb': {
    naam: 'market-1-a', bron: 'Market_FirstAge_Level1', kind: 'str-stands', tags: ['ngons'],
    kleuren: { '#56751d': doek, '#886a42': balk, '#901107': doekRood, '#a58758': plank, '#a7a21c': eten },
  },
  'Market Stalls-PUZZ5F91OE.glb': {
    naam: 'market-1-b', bron: 'Market_FirstAge_Level2', kind: 'str-stands', tags: ['ngons'],
    kleuren: { '#56751d': doek, '#886a42': balk, '#901107': doekRood, '#a58758': plank, '#a78240': doek, '#a7a21c': eten, '#b9b9b9': doek },
  },
  'Village Market.glb': {
    naam: 'market-1-c', bron: 'Market_FirstAge_Level3', kind: 'str-stands', tags: ['ngons'],
    kleuren: { '#56751d': doek, '#886a42': balk, '#901107': doekRood, '#a58758': plank, '#a78240': doek, '#a7a21c': eten, '#b9b9b9': doek },
  },
  'Market Stalls-4ZAhRv2tLG.glb': {
    naam: 'market-2-a', bron: 'Market_SecondAge_Level1', kind: 'str-stands', tags: ['ngons'],
    kleuren: { '#56751d': doek, '#797979': steen, '#886a42': balk, '#888880': steen, '#901107': doekRood, '#a58758': plank, '#a78240': doek, '#a7a21c': eten },
  },
  'Market Stalls-OLd8vu6lPL.glb': {
    naam: 'market-2-b', bron: 'Market_SecondAge_Level2', kind: 'str-stands', tags: ['ngons'],
    kleuren: { '#56751d': doek, '#797979': steen, '#886a42': balk, '#888880': steen, '#901107': doekRood, '#a58758': plank, '#a78240': doek, '#a7a21c': eten },
  },
  'Market Stalls Compact.glb': {
    naam: 'market-2-c', bron: 'Market_SecondAge_Level3', kind: 'str-stands', tags: ['ngons'],
    kleuren: { '#56751d': doek, '#797979': steen, '#886a42': balk, '#888880': steen, '#901107': doekRood, '#a58758': plank, '#a78240': doek, '#a7a21c': eten },
  },
  'Mine.glb': {
    naam: 'mine', bron: 'Mine', kind: 'str', tags: ['ngons'],
    kleuren: { '#4e412f': schors, '#797979': gietijzer, '#886a42': balk, '#888880': steen, '#a58758': plank },
  },
  'Gold rocks.glb': {
    naam: 'ore-gold-a', bron: 'Resource_Gold_1', kind: 'env-rock', tags: ['plural'],
    kleuren: { '#888880': rots, '#a78240': goud },
  },
  'Resource Gold.glb': {
    naam: 'ore-gold-b', bron: 'Resource_Gold_2', kind: 'env-rock', tags: ['plural'],
    kleuren: { '#888880': rots, '#a78240': goud },
  },
  'Gold Rocks.glb': {
    naam: 'ore-gold-c', bron: 'Resource_Gold_3', kind: 'env-rock', tags: ['plural'],
    kleuren: { '#888880': rots, '#a78240': goud },
  },
  'Pine Trees.glb': {
    naam: 'pine-trees', bron: 'Resource_PineTree_Group', kind: 'env-flora-tree-conifer', tags: ['plural'],
    kleuren: { '#56751d': boomblad, '#886a42': schors },
  },
  'Shipping Port.glb': {
    naam: 'port-1-a', bron: 'Port_FirstAge_Level1', kind: 'str-platform-dock', tags: ['ngons'],
    kleuren: { '#797979': steen, '#886a42': balk, '#a58758': plank, '#b49655': doek },
  },
  'Port.glb': {
    naam: 'port-1-b', bron: 'Port_FirstAge_Level2', kind: 'str-platform-dock', tags: ['ngons'],
    kleuren: { '#797979': steen, '#886a42': balk, '#a58758': plank, '#b49655': doek },
  },
  'Shipping Port-rDX8W8uqip.glb': {
    naam: 'port-1-c', bron: 'Port_FirstAge_Level3', kind: 'str-platform-dock', tags: ['ngons'],
    kleuren: { '#797979': steen, '#886a42': balk, '#a58758': plank, '#b49655': doek },
  },
  'Port-4sE6lmhGPF.glb': {
    naam: 'port-2-a', bron: 'Port_SecondAge_Level1', kind: 'str-platform-dock', tags: ['ngons'],
    kleuren: { '#797979': steen, '#886a42': balk, '#a58758': plank, '#b15945': dakpan, '#b49655': doek, '#b9b9b9': touw },
  },
  'Docks.glb': {
    naam: 'port-2-b', bron: 'Port_SecondAge_Level2', kind: 'str-platform-dock', tags: ['ngons'],
    kleuren: { '#797979': steen, '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b49655': doek, '#b4b4a9': steen, '#b9b9b9': touw },
  },
  'Rock-RtLRqYjfMs.glb': {
    naam: 'rock-a', bron: 'Resource_Rock_1', kind: 'env-rock-boulder', tags: [],
    kleuren: { '#888880': rots },
  },
  'Rock-JmFMh7ztL9.glb': {
    naam: 'rock-b', bron: 'Resource_Rock_2', kind: 'env-rock-boulder', tags: [],
    kleuren: { '#888880': rots },
  },
  'Rocks.glb': {
    naam: 'rock-c', bron: 'Resource_Rock_3', kind: 'env-rock-boulder', tags: ['plural'],
    kleuren: { '#888880': rots },
  },
  'Rock.glb': {
    naam: 'rock-pebble', bron: 'Rock', kind: 'env-rock-pebble', tags: [],
    kleuren: { '#888880': rots },
  },
  'Storage Hut.glb': {
    naam: 'storage-1-a', bron: 'Storage_FirstAge_Level1', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#886a42': balk, '#a58758': plank },
  },
  'Storage Shed.glb': {
    naam: 'storage-1-b', bron: 'Storage_FirstAge_Level2', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#886a42': balk, '#a58758': plank },
  },
  'Storage shed.glb': {
    naam: 'storage-1-c', bron: 'Storage_FirstAge_Leve3', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#886a42': balk, '#a58758': plank },
  },
  'Storage shed-fkTsDdpQAA.glb': {
    naam: 'storage-2-a', bron: 'Storage_SecondAge_Level1', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#797979': steen, '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b4b4a9': steen },
  },
  'Storage House.glb': {
    naam: 'storage-2-b', bron: 'Storage_SecondAge_Level2', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#797979': steen, '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b4b4a9': steen },
  },
  'Business Building.glb': {
    naam: 'storage-2-c', bron: 'Storage_SecondAge_Level3', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#797979': steen, '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b4b4a9': steen },
  },
  'Trees cut-zhm3D5KKRh.glb': {
    naam: 'stumps', bron: 'Resource_Tree_Group_Cut', kind: 'env-flora-deadwood-stump', tags: ['plural'],
    kleuren: { '#886a42': schors, '#a58758': stam },
  },
  'Tower House.glb': {
    naam: 'tower-house-2', bron: 'TowerHouse_SecondAge', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b4b4a9': steen },
  },
  'Town Center.glb': {
    naam: 'town-center-1-a', bron: 'TownCenter_FirstAge_Level1', kind: 'str-platform-deck', tags: ['ngons'],
    kleuren: { '#886a42': balk, '#a58758': plank },
  },
  'Town Center-CoERW5nFdE.glb': {
    naam: 'town-center-1-b', bron: 'TownCenter_FirstAge_Level2', kind: 'str', tags: ['ngons'],
    kleuren: { '#56751d': blad, '#886a42': balk, '#888880': steen, '#a58758': plank },
  },
  'Town Center-76GTkSh4KM.glb': {
    naam: 'town-center-1-c', bron: 'TownCenter_FirstAge_Level3', kind: 'str', tags: ['ngons'],
    kleuren: { '#56751d': blad, '#886a42': balk, '#a58758': plank },
  },
  'Town Center-cuQuFJEIfH.glb': {
    naam: 'town-center-2-a', bron: 'TownCenter_SecondAge_Level1', kind: 'str', tags: [],
    kleuren: { '#4b7f88': water, '#888880': steen },
  },
  'Town Center Second Age.glb': {
    naam: 'town-center-2-c', bron: 'TownCenter_SecondAge_Level3', kind: 'str', tags: [],
    kleuren: { '#4b7f88': water, '#56751d': blad, '#888880': steen },
  },
  'Trees.glb': {
    naam: 'trees', bron: 'Resource_Tree_Group', kind: 'env-flora-tree', tags: ['plural'],
    kleuren: { '#56751d': boomblad, '#886a42': schors },
  },
  'Wooden Wall.glb': {
    naam: 'wall-1', bron: 'Wall_FirstAge', kind: 'str-part-wall', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank },
  },
  'Stone Wall.glb': {
    naam: 'wall-2', bron: 'Wall_SecondAge', kind: 'str-part-wall', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#b4b4a9': steen },
  },
  'Wooden Wall-L0TxLurnES.glb': {
    naam: 'wall-towers-1', bron: 'WallTowers_FirstAge', kind: 'str-part-wall', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank },
  },
  'Stone Wall Towers.glb': {
    naam: 'wall-towers-2', bron: 'WallTowers_SecondAge', kind: 'str-part-wall', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#b15945': vlag, '#b4b4a9': steen },
  },
  'Wall Towers.glb': {
    naam: 'wall-towers-door-1', bron: 'WallTowers_Door_FirstAge', kind: 'str-part-wall', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank },
  },
  'Wall Towers Door Seco.glb': {
    naam: 'wall-towers-door-2', bron: 'WallTowers_Door_SecondAge', kind: 'str-part-wall', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#b15945': vlag, '#b4b4a9': steen },
  },
  'Wooden Fortress Gate.glb': {
    naam: 'wall-towers-gate-1', bron: 'WallTowers_DoorClosed_FirstAge', kind: 'str-part-wall', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank },
  },
  'Castle Gate.glb': {
    naam: 'wall-towers-gate-2', bron: 'WallTowers_DoorClosed_SecondAge', kind: 'str-part-wall', tags: [],
    kleuren: { '#4e412f': schors, '#886a42': balk, '#888880': steen, '#b15945': vlag, '#b4b4a9': steen },
  },
  'Small Watch Tower.glb': {
    naam: 'watchtower-1-a', bron: 'WatchTower_FirstAge_Level1', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank, '#b15945': vlag },
  },
  'Watch Tower.glb': {
    naam: 'watchtower-1-b', bron: 'WatchTower_FirstAge_Level2', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank, '#b15945': vlag },
  },
  'Watch Tower-VJZZW37Vsk.glb': {
    naam: 'watchtower-1-c', bron: 'WatchTower_FirstAge_Level3', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank, '#b15945': vlag },
  },
  'Stone Tower-dJLAD6p90F.glb': {
    naam: 'watchtower-2-a', bron: 'WatchTower_SecondAge_Level1', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b15945': dakpan, '#b4b4a9': steen },
  },
  'Stone Tower.glb': {
    naam: 'watchtower-2-b', bron: 'WatchTower_SecondAge_Level2', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b15945': vlag, '#b4b4a9': steen },
  },
  'Watch Tower-cMxuj2gt7D.glb': {
    naam: 'watchtower-2-c', bron: 'WatchTower_SecondAge_Level3', kind: 'str-building', tags: [],
    kleuren: { '#56751d': blad, '#886a42': balk, '#888880': steen, '#b15945': vlag, '#b4b4a9': steen },
  },
  'Windmill-jpHoi9xDLG.glb': {
    naam: 'windmill-1', bron: 'Windmill_FirstAge', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank, '#b15945': vlag, '#b49655': doek },
  },
  'Windmill.glb': {
    naam: 'windmill-2', bron: 'Windmill_SecondAge', kind: 'str-building', tags: ['ngons'],
    kleuren: { '#886a42': balk, '#888880': steen, '#a58758': plank, '#b0b1a6': steen, '#b15945': dakpan, '#b49655': doek, '#b4b4a9': steen },
  },
  'Wooden Monument.glb': {
    naam: 'wonder-1-a', bron: 'Wonder_FirstAge_Level1', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank, '#b15945': vlag },
  },
  'Wooden Fortress.glb': {
    naam: 'wonder-1-b', bron: 'Wonder_FirstAge_Level2', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank, '#b15945': vlag },
  },
  'Wonder First Age Leve.glb': {
    naam: 'wonder-1-c', bron: 'Wonder_FirstAge_Level3', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank, '#b15945': vlag },
  },
  'Castle-y15yE6kWLY.glb': {
    naam: 'wonder-2-b', bron: 'Wonder_SecondAge_Level2', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#b15945': dakpan, '#b4b4a9': steen },
  },
  'Castle Fortress.glb': {
    naam: 'wonder-2-c', bron: 'Wonder_SecondAge_Level3', kind: 'str-building', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#b15945': dakpan, '#b4b4a9': steen },
  },
  'Wooden Encampment.glb': {
    naam: 'wonder-walls-1', bron: 'WonderWalls_FirstAge', kind: 'str-part-wall', tags: [],
    kleuren: { '#886a42': balk, '#a58758': plank, '#b15945': vlag },
  },
  'Castle.glb': {
    naam: 'wonder-walls-2', bron: 'WonderWalls_SecondAge', kind: 'str-part-wall', tags: [],
    kleuren: { '#886a42': balk, '#888880': steen, '#b4b4a9': steen },
  },
};

const naarSrgb = (lineair) => {
  const v = lineair <= 0.0031308 ? lineair * 12.92 : 1.055 * lineair ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(v, 0), 1) * 255);
};

const hexVan = (kleur) => '#' + kleur.map((k) => k.toString(16).padStart(2, '0')).join('');

const helderheid = (hex) => {
  const kanaal = (i) => {
    const s = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanaal(0) + 0.7152 * kanaal(1) + 0.0722 * kanaal(2);
};

function pakBronUit() {
  const map = join(ROOT, 'kits', 'sources', BRON_MAP);
  const doel = join(ROOT, 'kits', 'sources', '.uitgepakt', BRON_MAP);
  const zips = readdirSync(map).filter((n) => n.toLowerCase().endsWith('_glb.zip')).sort();
  const stempel = join(doel, '.klaar');
  if (!existsSync(stempel)) {
    rmSync(doel, { recursive: true, force: true });
    for (const zip of zips) pakUit(join(map, zip), doel);
    writeFileSync(stempel, zips.join('\n') + '\n');
  }
  return doel;
}

function bandPlekken() {
  const perBand = new Map();
  for (const opgave of Object.values(MODELLEN)) {
    for (const [hex, [, band]] of Object.entries(opgave.kleuren)) {
      if (!perBand.has(band)) perBand.set(band, new Set());
      perBand.get(band).add(hex);
    }
  }

  const plek = new Map();
  for (const [band, hexen] of perBand) {
    const waarden = [...hexen].map((hex) => ({ hex, licht: helderheid(hex) }));
    const licht = Math.max(...waarden.map((w) => w.licht));
    const donker = Math.min(...waarden.map((w) => w.licht));
    for (const { hex, licht: eigen } of waarden) {
      const deel = licht > donker ? (licht - eigen) / (licht - donker) : 0.5;
      plek.set(`${band}:${hex}`, SPREIDING[0] + deel * (SPREIDING[1] - SPREIDING[0]));
    }
  }
  return plek;
}

function bouw(primitieven, opgave, plek) {
  const laag = [Infinity, Infinity, Infinity];
  const hoog = [-Infinity, -Infinity, -Infinity];
  for (const primitief of primitieven) {
    for (let i = 0; i < primitief.posities.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = primitief.posities[i + k] * SCHAAL;
        if (v < laag[k]) laag[k] = v;
        if (v > hoog[k]) hoog[k] = v;
      }
    }
  }
  const midden = [(laag[0] + hoog[0]) / 2, laag[1], (laag[2] + hoog[2]) / 2];

  const perSleutel = new Map();
  const posities = [];
  const normalen = [];
  const uvs = [];
  const driehoeken = [];
  const banden = new Set();
  let gedraaid = 0;

  for (const primitief of primitieven) {
    const hex = hexVan(primitief.materiaal.kleur ?? [255, 255, 255]);
    const doel = opgave.kleuren[hex];
    if (!doel) throw new Error(`${opgave.naam}: no band for ${hex}`);
    const [kolom, rij] = BANDEN[doel[1]];
    banden.add(doel[1]);
    const t = [
      Math.fround((kolom + 0.5) / 16),
      Math.fround((rij + RAND[0] + plek.get(`${doel[1]}:${hex}`) * (RAND[1] - RAND[0])) / 4),
    ];

    const index = new Int32Array(primitief.posities.length / 3);
    for (let i = 0; i < index.length; i++) {
      const p = [0, 1, 2].map((k) => Math.fround(primitief.posities[i * 3 + k] * SCHAAL - midden[k]));
      const n = [0, 1, 2].map((k) => Math.fround(primitief.normalen ? primitief.normalen[i * 3 + k] : 0));
      const id = [...p, ...n, ...t].join(',');
      let bestaand = perSleutel.get(id);
      if (bestaand === undefined) {
        bestaand = posities.length / 3;
        perSleutel.set(id, bestaand);
        posities.push(...p);
        normalen.push(...n);
        uvs.push(...t);
      }
      index[i] = bestaand;
    }

    for (let i = 0; i < primitief.indices.length; i += 3) {
      const hoek = [index[primitief.indices[i]], index[primitief.indices[i + 1]], index[primitief.indices[i + 2]]];
      const punt = (h, k) => posities[h * 3 + k];
      const u = [0, 1, 2].map((k) => punt(hoek[1], k) - punt(hoek[0], k));
      const v = [0, 1, 2].map((k) => punt(hoek[2], k) - punt(hoek[0], k));
      const vlak = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const gemiddeld = [0, 1, 2].map((k) => hoek.reduce((som, h) => som + normalen[h * 3 + k], 0));
      const richting = vlak.reduce((som, w, k) => som + w * gemiddeld[k], 0);
      if (richting < 0) {
        gedraaid++;
        driehoeken.push(hoek[0], hoek[2], hoek[1]);
      } else {
        driehoeken.push(...hoek);
      }
    }
  }

  return {
    posities: Float32Array.from(posities),
    normalen: Float32Array.from(normalen),
    uvs: Float32Array.from(uvs),
    driehoeken,
    banden,
    gedraaid,
  };
}

function schrijf(pad, mesh, naam, bronmodel, bronvorm) {
  const stukken = [];
  const accessors = [];
  const bufferViews = [];
  let lengte = 0;

  const voegToe = (data, doel, componentType, type, extra = {}) => {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const opvulling = (4 - (lengte % 4)) % 4;
    if (opvulling) { stukken.push(Buffer.alloc(opvulling)); lengte += opvulling; }
    bufferViews.push({ buffer: 0, byteOffset: lengte, byteLength: buf.length, ...(doel ? { target: doel } : {}) });
    stukken.push(buf);
    lengte += buf.length;
    accessors.push({
      bufferView: bufferViews.length - 1,
      componentType,
      count: extra.count,
      type,
      ...(extra.min ? { min: extra.min, max: extra.max } : {}),
    });
    return accessors.length - 1;
  };

  const aantal = mesh.posities.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < aantal; i++) {
    for (let k = 0; k < 3; k++) {
      const v = mesh.posities[i * 3 + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }

  const attributes = {
    POSITION: voegToe(mesh.posities, 34962, 5126, 'VEC3', { count: aantal, min, max }),
    NORMAL: voegToe(mesh.normalen, 34962, 5126, 'VEC3', { count: aantal }),
    TEXCOORD_0: voegToe(mesh.uvs, 34962, 5126, 'VEC2', { count: aantal }),
  };
  const smal = aantal <= 0xffff;
  const indices = voegToe(
    smal ? Uint16Array.from(mesh.driehoeken) : Uint32Array.from(mesh.driehoeken),
    34963,
    smal ? 5123 : 5125,
    'SCALAR',
    { count: mesh.driehoeken.length },
  );

  const bin = Buffer.concat(stukken);
  const json = {
    asset: {
      generator: 'tools/importeer/quat-town.mjs',
      version: '2.0',
      extras: { taaleiland: { versie: 1, schaal: SCHAAL, palet: 1, bron: BRON_NAAM, bronmodel, bronvorm } },
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: naam }],
    meshes: [{ primitives: [{ attributes, indices, material: 0 }] }],
    materials: [{
      name: 'colormap',
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 },
      doubleSided: true,
      alphaMode: 'OPAQUE',
    }],
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
    textures: [{ sampler: 0, source: 0 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };

  writeGlb(pad, json, bin, writeFileSync);
}

function zetTags(regels) {
  const pad = join(ROOT, 'catalog', 'tags.json');
  const data = JSON.parse(readFileSync(pad, 'utf8'));
  const perId = new Map(data.tags.map((tag) => [tag.id, tag]));

  const nieuw = new Map();
  for (const [id, tags] of regels) {
    for (const tagId of tags) {
      if (!perId.has(tagId)) throw new Error(`${id}: tag ${tagId} is not in tags.json`);
      nieuw.set(tagId, [...(nieuw.get(tagId) ?? []), id]);
    }
  }
  for (const tag of data.tags) {
    if (!tag.models) continue;
    tag.models = [
      ...tag.models.filter((id) => !id.startsWith(`${KIT}/`)),
      ...(nieuw.get(tag.id) ?? []).sort(),
    ];
  }
  writeFileSync(pad, JSON.stringify(data, null, 1) + '\n');
}

function zetManifest(namen) {
  const pad = join(ROOT, 'catalog', 'manifest.js');
  const tekst = readFileSync(pad, 'utf8');

  const kit = {
    slug: KIT,
    name: BRON_NAAM,
    url: null,
    note: 'Bronzips zonder licentiebestand en zonder maker.',
    models: [...namen].sort(),
  };
  const blok = JSON.stringify(kit, null, 1)
    .split('\n')
    .map((regel) => ` ${regel}`)
    .join('\n');

  const merk = `\n {\n  "slug": "${KIT}",`;
  const begin = tekst.indexOf(merk);
  if (begin === -1) {
    const eind = tekst.lastIndexOf('\n]');
    writeFileSync(pad, `${tekst.slice(0, eind)},\n${blok}${tekst.slice(eind)}`);
    return;
  }
  const komma = tekst.indexOf('\n },\n', begin);
  const eind = (komma === -1 ? tekst.indexOf('\n }\n', begin) : komma) + 3;
  writeFileSync(pad, `${tekst.slice(0, begin + 1)}${blok}${tekst.slice(eind)}`);
}

const uitgepakt = pakBronUit();
const plek = bandPlekken();
const doelMap = join(ROOT, 'kits', 'workfiles', KIT);
mkdirSync(join(doelMap, 'Textures'), { recursive: true });
copyFileSync(join(ROOT, 'kits', 'colormap.png'), join(doelMap, 'Textures', 'colormap.png'));
for (const bestand of readdirSync(doelMap).filter((n) => n.endsWith('.glb'))) rmSync(join(doelMap, bestand));

const bestanden = new Set(readdirSync(uitgepakt).filter((n) => extname(n).toLowerCase() === '.glb'));
const regels = [];
const namen = [];
for (const [bestand, opgave] of Object.entries(MODELLEN)) {
  if (!bestanden.has(bestand)) throw new Error(`${bestand}: not in ${BRON_MAP}`);
  const mesh = bouw(leesGltf(join(uitgepakt, bestand)), opgave, plek);
  schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, opgave.naam, basename(bestand, '.glb'), opgave.bron);

  const materialen = [...new Set(Object.values(opgave.kleuren).map(([materiaal]) => materiaal))];
  regels.push([`${KIT}/${opgave.naam}`, [opgave.kind, ...materialen, ...opgave.tags]]);
  namen.push(opgave.naam);
  console.log(
    `${opgave.bron.padEnd(32)} → ${opgave.naam.padEnd(18)} ${mesh.driehoeken.length / 3} tris, ` +
      `${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}` +
      `${mesh.gedraaid ? `, ${mesh.gedraaid} flipped` : ''}`,
  );
}

zetTags(regels);
zetManifest(namen);
console.log(`\n${namen.length} models → kits/workfiles/${KIT}`);
