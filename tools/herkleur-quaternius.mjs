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

// De elf drankjes uit de RPG-kit, leeg of gevuld, op nummer.
const drankjes = (eind, ...nummers) =>
  nummers.map((n) => `${W}/rpg-quaternius/potion-${n}-${eind}.glb`);
const ALLE_DRANKJES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const HUIZEN = [1, 2, 3].map((n) => `${W}/pirate-quaternius/house-${n}.glb`);
const STAPPEN = [
  // bot en schedels, zoals halloween/skull
  ['5,2', ['14,3'], [`${W}/food-quaternius/fish-bone.glb`, `${W}/rpg-quaternius/bone.glb`,
    `${W}/rpg-quaternius/skull.glb`, `${W}/rpg-quaternius/skull-2.glb`]],
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
  // sieraden zijn goud, als de munten hierboven: staven massief, kettingen alleen de vatting
  ['6,0', ['0,0'], [`${W}/rpg-quaternius/gold-ingots.glb`, `${W}/rpg-quaternius/necklace-1.glb`,
    `${W}/rpg-quaternius/necklace-2.glb`, `${W}/rpg-quaternius/necklace-3.glb`]],
  // bestek is staal, als dungeon/knife
  ['15,3', ['14,3'], [`${W}/food-quaternius/fork.glb`, `${W}/food-quaternius/knife.glb`,
    `${W}/food-quaternius/spoon.glb`]],
  // gebraden vlees is donkerrood; de donkerste bruine baan is voor bast en leer
  ['8,0', ['2,0'], [`${W}/food-quaternius/chicken-leg.glb`]],
  // kurk is lichtbruin, als props/bottle-cork
  ['13,0', ['1,0'], [`${W}/pirate-quaternius/bottle-1.glb`, `${W}/pirate-quaternius/bottle-2.glb`]],
  // berkenbast: de witte stam blijft 5,2, de donkere strepen horen op de bastbaan
  ['2,0', ['10,0'], [1, 2, 3, 4, 5].map((n) => `${W}/quaternius-nature/tree-birch-dead-${n}.glb`)],
  // flessen zijn groen glas, als dungeon/bottle-a-green
  ['1,1', ['10,0'], [`${W}/pirate-quaternius/bottle-1.glb`, `${W}/pirate-quaternius/bottle-2.glb`,
    `${W}/food-quaternius/bottle-2.glb`]],

  // De elf drankjes. De bron geeft elk flesje dezelfde groene Kd mee — alleen de naam
  // van het materiaal (Liquid_Red, _Yellow, _Green, _Magenta, _Cyan) legt vast welke
  // kleur de maker bedoelde, dus daar komt de indeling hieronder vandaan. Magenta en
  // cyaan staan niet in het palet; terracotta en blauw liggen er het dichtst bij.
  // De drank gaat eerst, want die zit nu op de baan waar het glas naartoe moet.
  ['8,0', ['1,1'], drankjes('filled', 1, 6)],
  ['6,0', ['1,1'], drankjes('filled', 2, 7)],
  ['5,0', ['1,1'], drankjes('filled', 4, 8)],
  ['4,2', ['1,1'], drankjes('filled', 5, 10, 11)],
  // De fles zelf blijft op 5,2 en wordt onderaan dit script doorzichtig glas: de
  // drank zit binnenin, dus door een dichte fles zie je er niets van (regel M17).

  // De drie huizen: de enige modellen in de verzameling met COLOR_0 in de bron. Die
  // kwam als NaN binnen, waardoor alle driehoeken in één kleurgroep vielen en het
  // hele huis op de lichte houtbaan belandde; zie tools/importeer/bron.mjs. Nu de
  // groepen er weer zijn liggen de wanden op zalm 13,0 — die baan is voor kurk en
  // doek, niet voor hout — en het donkere hout per huis op een andere baan. Wanden
  // mee met het timmerhout, donker hout naar de middelste houtbaan zoals sawmill,
  // en het steen van huis 3 naar dezelfde taupe als huis 1 en 2.
  ['0,0', ['13,0'], HUIZEN],
  ['1,0', ['2,0', '14,0'], HUIZEN],
  ['14,3', ['3,2'], [`${W}/pirate-quaternius/house-3.glb`]],
];

// Fijnere stappen: hier gaat niet een hele baan mee, maar één uv-groep binnen een
// baan — herkenbaar aan zijn plek in het verloop. Ze draaien ná STAPPEN, want ze
// gaan uit van de baan waar die stappen het model op gezet hebben.
const FIJNE_STAPPEN = [
  // de kist had hout en metaal omgedraaid — de banden hout, de panelen metaal — en
  // stond bovendien op het donkere uiteinde van beide banen. Wissel de twee om en
  // zet ze op de kleur die de rest van de catalogus voor die baan laat zien. De
  // twee vensters overlappen niet, dus de tweede regel pakt het oude metaal.
  [`${W}/pirate-quaternius/chest.glb`, '0,0', '15,3', '0.7:0.9', '0.5:0.5'],
  [`${W}/pirate-quaternius/chest.glb`, '15,3', '0,0', '0.9:1', '0.5:0.5'],
  [`${W}/pirate-quaternius/chest-gold.glb`, '0,0', '15,3', '0.7:0.9', '0.5:0.5'],
  [`${W}/pirate-quaternius/chest-gold.glb`, '15,3', '0,0', '0.9:1', '0.5:0.5'],
  // het zeil is doek, geen hout: gebroken wit, als pirate-kit/flag
  [`${W}/ships-quaternius/boat-sail.glb`, '0,0', '5,2', '0:0.1', '0.5:0.5'],
  // de kaft deelde de papierbaan met zijn eigen bladzijden; donkere kaftbaan, als
  // fantasy-props/book-5
  [`${W}/rpg-quaternius/book-3-closed.glb`, '5,2', '6,1', '0.9:1', '0.97:0.97'],
  // touw naar taupe (regel M14). In alle drie de modellen ligt het touw op de lichte
  // houtbaan, maar op een eigen stand in het verloop — 0.16 op de schepen, 0.22 bij
  // het huis — en die stand is precies de kleurgroep die de maker in de atlas heeft
  // staan (#a89a6a en #a79163). 0.45 op taupe is waar rpgtools/rope-bundle ligt.
  [`${W}/pirate-quaternius/ship-small.glb`, '0,0', '14,3', '0.1:0.2', '0.45:0.45'],
  [`${W}/pirate-quaternius/ship-large.glb`, '0,0', '14,3', '0.1:0.2', '0.45:0.45'],
  [`${W}/pirate-quaternius/house-3.glb`, '0,0', '14,3', '0.2:0.25', '0.45:0.45'],
  // en de kaft van het open boek, dat dezelfde bron en dezelfde stand heeft: de plank
  // onder het blok bladzijden. De maker zet die als eigen materiaal (DarkBrown) in de
  // .obj; in het werkbestand is de stand 0.97 wat daarvan over is.
  [`${W}/rpg-quaternius/book-3-open.glb`, '5,2', '6,1', '0.9:1', '0.97:0.97'],
];

for (const [naar, van, bestanden] of STAPPEN) {
  const bestaat = bestanden.filter((b) => existsSync(b));
  if (bestaat.length === 0) continue;
  const args = ['tools/herkleur-baan.mjs', ...van.flatMap((v) => ['--van', v]), '--naar', naar, ...bestaat];
  const uit = execFileSync('node', args, { encoding: 'utf8' });
  process.stdout.write(uit);
}

for (const [bestand, van, naar, vbron, bereik] of FIJNE_STAPPEN) {
  if (!existsSync(bestand)) continue;
  const args = ['tools/herkleur-selectie.mjs', bestand, '--van', van, '--naar', naar,
    '--vbron', vbron, '--bereik', bereik];
  process.stdout.write(execFileSync('node', args, { encoding: 'utf8' }));
}

// De flessen van de drankjes worden doorzichtig glas, zodat de drank erin te zien is.
// Dit gaat ná STAPPEN: die verplaatst uv's binnen één primitief, en hierna zijn het
// er twee. Het script slaat een model over dat het glasmateriaal al heeft, dus dit
// mag ook een tweede keer draaien.
const GLAS = [...drankjes('empty', ...ALLE_DRANKJES), ...drankjes('filled', ...ALLE_DRANKJES)]
  .filter((bestand) => existsSync(bestand));
if (GLAS.length) {
  const args = ['tools/glasmateriaal.mjs', '--cel', '5,2', ...GLAS];
  process.stdout.write(execFileSync('node', args, { encoding: 'utf8' }));
}
