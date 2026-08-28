// Zet de handmatige kleurkeuzes voor de Quaternius-kits opnieuw. Een import bouwt
// de .glb's opnieuw op en gooit deze keuzes dus weg; draai dit script erachteraan.
//
//   node tools/herkleur-quaternius.mjs
//
// Elke regel is: model, de baan waar het nu op zit, en de baan waar het hoort. De
// doelbaan komt niet uit de lucht vallen maar uit wat de catalogus al voor dat
// materiaal gebruikt — bot en papier op 5,2, hout op 0,0, goud op 6,0, staal op
// 15,3, groen glas op 1,1.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const W = 'kits/workfiles';
const STAPPEN = [
  // bot en schedels, zoals halloween/skull
  ['5,2', ['14,3'], [`${W}/rpg-quaternius/fish-bone.glb`, `${W}/food-quaternius/fish-bone.glb`,
    `${W}/rpg-quaternius/bone.glb`, `${W}/rpg-quaternius/skull.glb`, `${W}/rpg-quaternius/skull-2.glb`]],
  ['5,2', ['0,0'], [`${W}/pirate-quaternius/skull.glb`, `${W}/pirate-quaternius/bones-large.glb`,
    `${W}/pirate-quaternius/skulls.glb`]],
  ['5,2', ['14,0'], [`${W}/dungeon-quaternius/skull.glb`]],
  // papier: de bladzijden draaien, de kaften en het houten stokje blijven
  ['5,2', ['14,3'], ['book-1-closed', 'book-1-open', 'book-2-closed', 'book-2-open', 'book-3-closed',
    'book-3-open', 'book-4-closed', 'book-4-open', 'parchment', 'scroll'].map((n) => `${W}/rpg-quaternius/${n}.glb`)],
  // hout op de baan die de rest van de catalogus voor timber gebruikt
  ['0,0', ['14,0'], [`${W}/pirate-quaternius/ship-large.glb`, `${W}/pirate-quaternius/ship-small.glb`,
    `${W}/pirate-quaternius/cannon.glb`, `${W}/pirate-quaternius/barrel.glb`,
    `${W}/ships-quaternius/boat-sail.glb`, `${W}/ships-quaternius/ship-sail.glb`]],
  ['0,0', ['1,0'], [`${W}/ships-quaternius/boat.glb`, `${W}/ships-quaternius/ship-sail.glb`,
    `${W}/pirate-quaternius/ship-small.glb`]],
  ['0,0', ['2,0'], [`${W}/dungeon-quaternius/bucket.glb`]],
  // munten, ster en ringbanden zijn goud, als elke munt in de catalogus
  ['6,0', ['0,0'], ['coin', 'coin-skull', 'coin-star', 'star', 'ring-3', 'ring-4', 'ring-5', 'ring-6']
    .map((n) => `${W}/rpg-quaternius/${n}.glb`)],
  // anker en hangslot zijn ijzer, als dungeon/key
  ['15,3', ['0,0'], [`${W}/pirate-quaternius/anchor.glb`]],
  ['15,3', ['10,0'], [`${W}/rpg-quaternius/padlock.glb`]],
  // een kist is hout met stalen banden, als dungeon/chest
  ['0,0', ['10,0'], [`${W}/pirate-quaternius/chest.glb`, `${W}/pirate-quaternius/chest-gold.glb`]],
  ['15,3', ['14,0'], [`${W}/pirate-quaternius/chest.glb`, `${W}/pirate-quaternius/chest-gold.glb`]],
  // flessen zijn groen glas, als dungeon/bottle-a-green
  ['1,1', ['10,0'], [`${W}/pirate-quaternius/bottle-1.glb`, `${W}/pirate-quaternius/bottle-2.glb`,
    `${W}/food-quaternius/bottle-2.glb`]],
];

for (const [naar, van, bestanden] of STAPPEN) {
  const bestaat = bestanden.filter((b) => existsSync(b));
  if (bestaat.length === 0) continue;
  const args = ['tools/herkleur-baan.mjs', ...van.flatMap((v) => ['--van', v]), '--naar', naar, ...bestaat];
  const uit = execFileSync('node', args, { encoding: 'utf8' });
  process.stdout.write(uit);
}
