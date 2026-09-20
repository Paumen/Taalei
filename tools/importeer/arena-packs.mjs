import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { BRONKITS } from '../../catalog/tools/bronkits.mjs';
import { bronModellen } from '../../catalog/tools/bronmodellen.mjs';
import { BANDEN, ROOT, kitMap, schrijf, zetTags, richtSchillen, richtWinding } from './bouwer.mjs';
import { scaleTarget } from './scale-factors.mjs';

const RAND = [0.05, 0.95];
const LANEN = 16;

const ATLASSEN = {
  '36e533819afa2dfb.png': 'p1',
  'db6e18e2256954cd.png': 'p2',
  '98d237d6088832e4.png': 'p3',
  '376ad5009247027e.png': 'p4',
};

const balk = ['wood-beam', 'chestnut'];
const bewerkt = ['wood-worked', 'camel'];
const plank = ['wood-planks', 'tan'];
const stam = ['wood-log', 'camel'];
const schors = ['wood-bark', 'umber'];
const steen = ['stone-masonry', 'taupe'];
const steenGrijs = ['stone-masonry', 'nickel'];
const steenDonker = ['stone-masonry', 'slate'];
const rots = ['stone-rock', 'nickel'];
const dakpan = ['ceramic', 'sienna'];
const smeedijzer = ['metal-iron-wrought', 'basalt'];
const gietijzer = ['metal-iron-cast', 'slate'];
const goud = ['metal-gold', 'amber'];
const touw = ['rope', 'taupe'];
const doek = ['textile', 'ivory'];
const doekRood = ['textile', 'sienna'];
const doekGroen = ['textile', 'hunter'];
const been = ['bone', 'ivory'];
const gloed = ['emissive', 'amber'];
const bamboe = ['vegetation', 'taupe'];
const stro = ['vegetation', 'tan'];
const doorn = ['vegetation', 'tan'];
const bloemGeel = ['vegetation', 'amber'];
const bloemRoze = ['vegetation', 'ivory'];
const bloemRood = ['vegetation', 'sienna'];
const blad = ['foliage', 'moss'];
const loof = ['foliage', 'hunter'];

const PAKKETTEN = [
  {
    bron: 'Fishing_Village_Pack',
    kit: 'wizp-fish',
    modellen: {
      boat: {
        naam: 'boat-oars', kind: 'obj-transport-boat', tags: ['sailing'],
        vlakken: {
          'p3:2:1': bewerkt, 'p3:4:1': balk, 'p3:15:1': gietijzer,
          'p3:13:1': touw, 'p3:0:0': bewerkt,
        },
      },
      boat2: {
        naam: 'boat-rack', kind: 'obj-transport-boat', tags: ['sailing'],
        vlakken: {
          'p3:13:1': touw, 'p3:2:1': bewerkt, 'p3:8:1': bewerkt, 'p3:4:1': balk,
          'p3:0:1': balk, 'p3:15:1': gietijzer, 'p3:0:0': bewerkt,
        },
      },
      boat3: {
        naam: 'boat-poles', kind: 'obj-transport-boat', tags: ['sailing'],
        vlakken: {
          'p3:13:1': touw, 'p3:2:1': bewerkt, 'p3:8:1': bewerkt, 'p3:4:1': balk,
          'p3:15:1': gietijzer, 'p3:0:0': bewerkt,
        },
      },
      fence: {
        naam: 'rail-fence-a', kind: 'str-barrier-fence', tags: [],
        vlakken: { 'p3:13:1': touw, 'p3:0:1': balk },
      },
      fence2: {
        naam: 'rail-fence-b', kind: 'str-barrier-fence', tags: [],
        vlakken: { 'p3:13:1': touw, 'p3:0:1': balk },
      },
      fence_post: {
        naam: 'mooring-post', kind: 'str-barrier-post', tags: ['sailing'],
        vlakken: { 'p3:2:1': bewerkt, 'p3:0:1': balk },
      },
      fence_rope: {
        naam: 'rope-fence-short', kind: 'str-barrier-fence', tags: [],
        vlakken: { 'p3:2:1': bewerkt, 'p3:0:1': balk },
      },
      fence_rope2: {
        naam: 'rope-fence-medium', kind: 'str-barrier-fence', tags: [],
        vlakken: { 'p3:2:1': bewerkt, 'p3:0:1': balk },
      },
      fence_rope3: {
        naam: 'rope-fence-long', kind: 'str-barrier-fence', tags: [],
        vlakken: { 'p3:2:1': bewerkt, 'p3:0:1': balk },
      },
      fishing_cabin: {
        naam: 'stilt-cabin', kind: 'str-building-dwelling', tags: ['sailing'],
        vlakken: {
          'p3:0:1': balk, 'p3:2:1': bewerkt, 'p1:12:0': stam, 'p1:5:1': bamboe,
          'p3:8:1': bewerkt, 'p3:2:0': plank, 'p3:14:0': gloed,
        },
      },
      platform: {
        naam: 'jetty-a', kind: 'str-platform-dock', tags: ['sailing'],
        vlakken: { 'p3:0:1': balk, 'p1:5:1': bamboe, 'p1:12:0': stam, 'p3:2:0': plank },
      },
      platform2: {
        naam: 'jetty-b', kind: 'str-platform-dock', tags: ['sailing'],
        vlakken: { 'p3:0:1': balk, 'p1:5:1': bamboe, 'p1:12:0': stam, 'p3:2:0': plank },
      },
      platfrom3: {
        naam: 'jetty-deck', kind: 'str-platform-deck', tags: ['sailing'],
        vlakken: { 'p3:2:0': plank },
      },
    },
  },
  {
    bron: 'Medieval_Pack',
    kit: 'wizp-mediev',
    modellen: {
      barrel_1: {
        naam: 'barrel', kind: 'obj-container-barrel', tags: ['ngons'],
        vlakken: { 'p4:3:0': bewerkt, 'p4:5:0': smeedijzer },
      },
      beer_barrel: {
        naam: 'barrel-tapped', kind: 'obj-container-barrel', tags: ['ngons'],
        vlakken: { 'p4:3:0': bewerkt, 'p4:5:0': smeedijzer },
      },
      box_1: {
        naam: 'crate-a', kind: 'obj-container-crate', tags: [],
        vlakken: { 'p2:0:1': plank },
      },
      box_2: {
        naam: 'crate-b', kind: 'obj-container-crate', tags: [],
        vlakken: { 'p4:3:0': bewerkt },
      },
      dynamite_closed: {
        naam: 'dynamite-crate', kind: 'obj-container-crate', tags: [],
        vlakken: { 'p2:0:1': plank, 'p2:3:1': bewerkt },
      },
      dynamite_open: {
        naam: 'dynamite-crate-open', kind: 'obj-container-crate', tags: [],
        vlakken: { 'p2:3:1': bewerkt, 'p2:15:0': doekRood, 'p2:0:1': plank },
      },
      fence_1: {
        naam: 'picket-fence-a', kind: 'str-barrier-fence', tags: [],
        vlakken: { 'p4:5:0': gietijzer, 'p4:4:0': plank },
      },
      fence_2: {
        naam: 'picket-fence-b', kind: 'str-barrier-fence', tags: [],
        vlakken: { 'p4:4:0': plank, 'p4:5:0': gietijzer },
      },
      fence_3: {
        naam: 'picket-fence-c', kind: 'str-barrier-fence', tags: [],
        vlakken: { 'p4:4:0': plank, 'p4:5:0': gietijzer },
      },
      fence_4: {
        naam: 'picket-fence-leaning', kind: 'str-barrier-fence', tags: [],
        vlakken: { 'p4:4:0': plank, 'p4:5:0': gietijzer },
      },
      grain_storage: {
        naam: 'silo', kind: 'str-building-tower', tags: ['ngons'],
        vlakken: { 'p4:0:0': dakpan, 'p4:3:0': balk, 'p4:2:0': steenGrijs },
      },
      hay_1: {
        naam: 'haystack-forked', kind: 'obj-resource', tags: [],
        vlakken: { 'p4:12:0': stro, 'p4:3:0': balk },
      },
      hay_2: {
        naam: 'haystack', kind: 'obj-resource', tags: [],
        vlakken: { 'p4:12:0': stro },
      },
      house_1: {
        naam: 'house-a', kind: 'str-building-dwelling', tags: [],
        vlakken: {
          'p4:3:0': balk, 'p4:0:0': dakpan, 'p4:1:0': steen, 'p4:7:0': steen,
          'p4:2:0': steenDonker, 'p4:5:0': steenDonker, 'p4:6:0': gloed,
        },
      },
      house_2: {
        naam: 'house-b', kind: 'str-building-dwelling', tags: [],
        vlakken: {
          'p4:0:0': dakpan, 'p4:3:0': balk, 'p4:2:0': steenDonker, 'p4:1:0': steen,
          'p4:7:0': steen, 'p4:5:0': steenDonker, 'p4:6:0': gloed,
        },
      },
      magic_tower: {
        naam: 'wizard-tower', kind: 'str-building-tower', tags: [],
        vlakken: {
          'p4:3:0': balk, 'p4:1:0': steen, 'p4:7:0': steen,
          'p4:0:0': dakpan, 'p4:2:0': steenDonker, 'p4:6:0': gloed,
        },
      },
      mine: {
        naam: 'mine-entrance', kind: 'assy', tags: [],
        vlakken: {
          'p4:10:0': rots, 'p2:0:1': plank, 'p4:3:0': balk, 'p2:3:1': bewerkt,
          'p1:1:0': goud, 'p2:15:0': doekRood, 'p2:15:1': gietijzer,
          'p4:5:0': doek, 'p4:0:0': dakpan,
        },
      },
      minecart_empty: {
        naam: 'minecart', kind: 'obj-transport-cart', tags: [],
        vlakken: { 'p2:15:1': gietijzer },
      },
      minecart_full: {
        naam: 'minecart-ore', kind: 'obj-transport-cart', tags: [],
        vlakken: { 'p2:15:1': gietijzer, 'p1:1:0': goud },
      },
      mineral_barrel: {
        naam: 'barrel-ore', kind: 'obj-container-barrel', tags: ['ngons'],
        vlakken: { 'p1:1:0': goud, 'p4:3:0': bewerkt, 'p4:5:0': smeedijzer },
      },
      railway_1: {
        naam: 'rail-short', kind: 'str-part-floor', tags: [],
        vlakken: { 'p2:0:1': balk, 'p2:15:1': gietijzer },
      },
      railway_2: {
        naam: 'rail-straight', kind: 'str-part-floor', tags: [],
        vlakken: { 'p2:0:1': balk, 'p2:15:1': gietijzer },
      },
      railway_3: {
        naam: 'rail-long', kind: 'str-part-floor', tags: [],
        vlakken: { 'p2:0:1': balk, 'p2:15:1': gietijzer },
      },
      railway_4: {
        naam: 'rail-curve', kind: 'str-part-floor', tags: [],
        vlakken: { 'p2:0:1': balk, 'p2:15:1': gietijzer },
      },
      rock_1: { naam: 'rock-a', kind: 'env-rock-boulder', tags: [], vlakken: { 'p4:10:0': rots } },
      rock_2: { naam: 'rock-b', kind: 'env-rock-boulder', tags: [], vlakken: { 'p4:10:0': rots } },
      sawmill: {
        naam: 'sawmill', kind: 'str-building', tags: [],
        vlakken: { 'p4:3:0': balk, 'p4:5:0': steenDonker, 'p4:0:0': dakpan },
      },
      smithy: {
        naam: 'smithy', kind: 'str-building-fort', tags: [],
        vlakken: {
          'p4:5:0': steenDonker, 'p4:0:0': dakpan, 'p4:3:0': balk, 'p4:1:0': steen,
          'p4:7:0': steen, 'p4:2:0': steenDonker, 'p4:8:0': doekRood, 'p4:6:0': gloed,
        },
      },
      target: {
        naam: 'archery-target', kind: 'obj', tags: [],
        vlakken: { 'p4:7:0': doek, 'p4:3:0': balk, 'p4:8:0': doekRood },
      },
      tent_1: {
        naam: 'market-stall-red', kind: 'str-stands', tags: [],
        vlakken: { 'p4:3:0': balk, 'p4:8:0': doekRood, 'p4:7:0': doek },
      },
      tent_2: {
        naam: 'market-stall-green', kind: 'str-stands', tags: [],
        vlakken: { 'p4:3:0': balk, 'p4:9:0': doekGroen, 'p4:7:0': doek },
      },
      weapons_shop: {
        naam: 'weapon-shop', kind: 'str-building', tags: [],
        vlakken: {
          'p4:3:0': balk, 'p4:0:0': dakpan, 'p4:7:0': steen, 'p4:5:0': steenDonker,
          'p4:4:0': plank, 'p4:1:0': steen, 'p4:2:0': steenDonker, 'p4:8:0': doekRood,
          'p4:6:0': gloed, 'p4:0:1': steenDonker,
        },
      },
      windmill: {
        naam: 'windmill', kind: 'str-building-tower', tags: [],
        vlakken: {
          'p4:3:0': balk, 'p4:0:0': dakpan, 'p4:1:0': steen,
          'p4:2:0': steenDonker, 'p4:11:0': doek,
        },
      },
    },
  },
  {
    bron: 'Village_Pack',
    kit: 'wizp-village',
    modellen: {
      bridge2: {
        naam: 'bridge-arched-a', kind: 'str-access-bridge', tags: ['asia'],
        vlakken: { 'p1:2:0': balk, 'p1:10:0': bewerkt },
      },
      bridge3: {
        naam: 'bridge-arched-b', kind: 'str-access-bridge', tags: ['asia'],
        vlakken: { 'p1:2:0': balk, 'p1:10:0': bewerkt },
      },
      granary_big: {
        naam: 'granary-large', kind: 'str-building-tower', tags: ['asia'],
        vlakken: {
          'p1:2:0': balk, 'p1:10:0': goud, 'p1:5:0': dakpan,
          'p1:0:0': goud, 'p1:7:0': steen, 'p1:3:0': plank,
        },
      },
      building_1: {
        naam: 'house-a', kind: 'str-building-dwelling', tags: ['asia'],
        vlakken: {
          'p1:2:0': balk, 'p1:4:0': dakpan, 'p1:0:0': bewerkt,
          'p1:10:0': bewerkt, 'p1:3:0': plank, 'p1:6:0': steen,
        },
      },
      building_2: {
        naam: 'house-b', kind: 'str-building-dwelling', tags: ['asia'],
        vlakken: {
          'p1:2:0': balk, 'p1:4:0': dakpan, 'p1:0:0': bewerkt,
          'p1:10:0': bewerkt, 'p1:3:0': plank, 'p1:6:0': steen,
        },
      },
      building_3: {
        naam: 'house-c', kind: 'str-building-dwelling', tags: ['asia'],
        vlakken: {
          'p1:2:0': balk, 'p1:0:0': bewerkt, 'p1:4:0': dakpan,
          'p1:10:0': bewerkt, 'p1:3:0': plank, 'p1:6:0': steen,
        },
      },
    },
  },
  {
    bron: 'Cementery_Arena_Pack',
    kit: 'wizp-arena',
    modellen: {
      grass_green: {
        naam: 'grass-tuft', kind: 'env-flora-plant-grass', tags: [],
        vlakken: { 'p2:12:0': blad },
      },
      grass_green_group: {
        naam: 'grass-tufts', kind: 'env-flora-plant-grass', tags: ['plural'],
        vlakken: { 'p2:12:0': blad },
      },
    },
  },
  {
    bron: 'Trees_Pack',
    kit: 'wizp-tree',
    modellen: {
      banana2: {
        naam: 'banana-tree', kind: 'env-flora-tree', tags: [],
        vlakken: { 'p2:6:0': loof, 'p2:8:0': stam, 'p2:0:0': schors },
      },
      cactus1: {
        naam: 'cactus-flowering-round', kind: 'env-flora-plant-cactus', tags: [],
        vlakken: { 'p2:15:0': bloemRood, 'p2:12:0': blad, 'p2:8:0': doorn },
      },
      cactus2: {
        naam: 'cactus-flowering-tall', kind: 'env-flora-plant-cactus', tags: [],
        vlakken: { 'p2:15:0': bloemRood, 'p2:12:0': blad, 'p2:8:0': doorn },
      },
      cactus3: {
        naam: 'cactus-round', kind: 'env-flora-plant-cactus', tags: [],
        vlakken: { 'p2:12:0': blad, 'p2:8:0': doorn },
      },
      cactus4: {
        naam: 'cactus-tall', kind: 'env-flora-plant-cactus', tags: [],
        vlakken: { 'p2:12:0': blad, 'p2:8:0': doorn },
      },
      coconut1: {
        naam: 'palm-a', kind: 'env-flora-tree-palm', tags: [],
        vlakken: { 'p2:7:0': schors, 'p2:5:0': blad, 'p2:6:0': blad },
      },
      coconut2: {
        naam: 'palm-bent', kind: 'env-flora-tree-palm', tags: [],
        vlakken: { 'p2:7:0': schors, 'p2:5:0': blad, 'p2:6:0': blad },
      },
      coconut3: {
        naam: 'palm-b', kind: 'env-flora-tree-palm', tags: [],
        vlakken: { 'p2:7:0': schors, 'p2:5:0': blad, 'p2:6:0': blad },
      },
      creepy_tree1: {
        naam: 'dead-tree-spiked-a', kind: 'env-flora-deadwood', tags: ['halloween'],
        vlakken: { 'p2:10:1': schors, 'p2:9:1': schors },
      },
      creepy_tree2: {
        naam: 'dead-tree-spiked-b', kind: 'env-flora-deadwood', tags: ['halloween'],
        vlakken: { 'p2:10:1': schors, 'p2:9:1': schors, 'p2:4:0': been },
      },
      palm2: {
        naam: 'palm-young', kind: 'env-flora-tree-palm', tags: [],
        vlakken: { 'p2:10:0': blad, 'p2:7:0': schors, 'p2:11:0': schors, 'p2:15:1': rots },
      },
      pine4: { naam: 'dead-tree-a', kind: 'env-flora-deadwood', tags: [], vlakken: { 'p2:0:0': schors } },
      pine5: { naam: 'dead-tree-b', kind: 'env-flora-deadwood', tags: [], vlakken: { 'p2:0:0': schors } },
      pine6: { naam: 'dead-tree-c', kind: 'env-flora-deadwood', tags: [], vlakken: { 'p2:0:0': schors } },
      pine7: { naam: 'stump-a', kind: 'env-flora-deadwood-stump', tags: [], vlakken: { 'p2:0:0': schors } },
      pine8: { naam: 'stump-b', kind: 'env-flora-deadwood-stump', tags: [], vlakken: { 'p2:0:0': schors } },
      pine9: { naam: 'log-fallen', kind: 'env-flora-deadwood-branch', tags: [], vlakken: { 'p2:0:0': schors } },
      pine10: { naam: 'log-cut', kind: 'env-flora-deadwood-branch', tags: [], vlakken: { 'p2:0:0': schors } },
      plant1: {
        naam: 'leafy-plant', kind: 'env-flora-plant', tags: [],
        vlakken: { 'p2:10:0': blad },
      },
      waterlily_pink1: {
        naam: 'waterlily-white', kind: 'env-flora-plant-flower', tags: [],
        vlakken: { 'p2:13:0': bloemRoze, 'p2:9:0': blad },
      },
      waterlily_pink2: {
        naam: 'lilypad-a', kind: 'env-flora-plant', tags: [],
        vlakken: { 'p2:9:0': blad },
      },
      waterlily_pink_group: {
        naam: 'waterlilies-white', kind: 'env-flora-plant-flower', tags: ['plural'],
        vlakken: { 'p2:9:0': blad, 'p2:13:0': bloemRoze },
      },
      waterlily_yellow1: {
        naam: 'waterlily-yellow', kind: 'env-flora-plant-flower', tags: [],
        vlakken: { 'p2:14:0': bloemGeel, 'p2:9:0': blad },
      },
      waterlily_yellow2: {
        naam: 'lilypad-b', kind: 'env-flora-plant', tags: [],
        vlakken: { 'p2:9:0': blad },
      },
      waterlily_yellow_group: {
        naam: 'waterlilies-yellow', kind: 'env-flora-plant-flower', tags: ['plural'],
        vlakken: { 'p2:9:0': blad, 'p2:14:0': bloemGeel },
      },
    },
  },
];

const vlakSleutel = (primitief, u, v) => {
  const atlas = ATLASSEN[basename(primitief.materiaal.textuur ?? '')];
  if (!atlas) throw new Error(`${primitief.naam}: unknown palette ${primitief.materiaal.textuur}`);
  return `${atlas}:${Math.min(Math.floor(u * LANEN), LANEN - 1)}:${Math.min(Math.floor(v * 2), 1)}`;
};

function bereiken(gekozen) {
  const uit = new Map();
  for (const { primitieven } of gekozen) {
    for (const primitief of primitieven) {
      if (!primitief.uvs) throw new Error(`${primitief.naam}: no uvs`);
      for (let i = 0; i < primitief.uvs.length / 2; i++) {
        const u = primitief.uvs[i * 2];
        const v = primitief.uvs[i * 2 + 1];
        const sleutel = vlakSleutel(primitief, u, v);
        const bereik = uit.get(sleutel);
        if (!bereik) uit.set(sleutel, { min: v, max: v });
        else {
          if (v < bereik.min) bereik.min = v;
          if (v > bereik.max) bereik.max = v;
        }
      }
    }
  }
  return uit;
}

function bouw(model, opgave, schaal, bereik) {
  const laag = [Infinity, Infinity, Infinity];
  const hoog = [-Infinity, -Infinity, -Infinity];
  for (const primitief of model.primitieven) {
    for (let i = 0; i < primitief.posities.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = primitief.posities[i + k] * schaal;
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
  const materialen = new Set();

  for (const primitief of model.primitieven) {
    const index = new Int32Array(primitief.posities.length / 3);
    for (let i = 0; i < index.length; i++) {
      const p = [0, 1, 2].map((k) => Math.fround(primitief.posities[i * 3 + k] * schaal - midden[k]));
      const n = [0, 1, 2].map((k) => Math.fround(primitief.normalen ? primitief.normalen[i * 3 + k] : 0));

      const u = primitief.uvs[i * 2];
      const v = primitief.uvs[i * 2 + 1];
      const sleutel = vlakSleutel(primitief, u, v);
      const doel = opgave.vlakken[sleutel];
      if (!doel) throw new Error(`${model.naam}: no band for ${sleutel}`);
      const [kolom, rij] = BANDEN[doel[1]];
      banden.add(doel[1]);
      materialen.add(doel[0]);

      const { min, max } = bereik.get(sleutel);
      const deel = max > min ? (v - min) / (max - min) : 0.5;
      const t = [
        Math.fround((kolom + 0.5) / 16),
        Math.fround((rij + RAND[0] + deel * (RAND[1] - RAND[0])) / 4),
      ];

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
    for (const i of primitief.indices) driehoeken.push(index[i]);
  }

  return {
    posities: Float32Array.from(posities),
    normalen: Float32Array.from(normalen),
    uvs: Float32Array.from(uvs),
    driehoeken,
    banden,
    materialen,
  };
}

function zetManifest(pakketten, perKit) {
  const pad = join(ROOT, 'catalog', 'manifest.js');
  let tekst = readFileSync(pad, 'utf8');

  for (const pakket of pakketten) {
    const kit = {
      slug: pakket.kit,
      name: pakket.kit,
      url: null,
      note: `Bronzip zonder licentiebestand en zonder maker; zie kits/workfiles/${pakket.kit}/LICENSE.txt.`,
      models: [...perKit.get(pakket.kit)].sort(),
    };
    const blok = JSON.stringify(kit, null, 1)
      .split('\n')
      .map((regel) => ` ${regel}`)
      .join('\n');

    const merk = `\n {\n  "slug": "${pakket.kit}",`;
    const begin = tekst.indexOf(merk);
    if (begin === -1) {
      const eind = tekst.lastIndexOf('\n]');
      tekst = `${tekst.slice(0, eind)},\n${blok}${tekst.slice(eind)}`;
      continue;
    }
    const komma = tekst.indexOf('\n },\n', begin);
    const eind = (komma === -1 ? tekst.indexOf('\n }\n', begin) : komma) + 3;
    tekst = `${tekst.slice(0, begin + 1)}${blok}${tekst.slice(eind)}`;
  }

  writeFileSync(pad, tekst);
}

const regels = [];
const perKit = new Map();

for (const pakket of PAKKETTEN) {
  const bronkit = BRONKITS.find((b) => b.map === pakket.bron && !b.submap);
  if (!bronkit) throw new Error(`${pakket.bron}: not in BRONKITS`);
  pakket.naam = bronkit.naam;
  pakket.schaal = scaleTarget(pakket.kit);
  if (pakket.schaal === null) throw new Error(`${pakket.kit}: no factor in scale-factors.mjs`);
  pakket.generator = 'tools/importeer/arena-packs.mjs';

  const { modellen } = bronModellen(bronkit);
  const perNaam = new Map(modellen.map((model) => [model.naam, model]));
  const gekozen = Object.keys(pakket.modellen).map((naam) => {
    const model = perNaam.get(naam);
    if (!model) throw new Error(`${naam}: not in ${pakket.bron}`);
    return model;
  });
  const bereik = bereiken(gekozen);

  const doelMap = kitMap(pakket.kit);
  for (const bestand of readdirSync(doelMap).filter((n) => n.endsWith('.glb'))) {
    rmSync(join(doelMap, bestand));
  }

  console.log(`\n${pakket.kit}  (${pakket.naam})  schaal ${pakket.schaal}`);
  for (const model of gekozen) {
    const opgave = pakket.modellen[model.naam];
    const gekeerd = richtSchillen(model);
    const gericht = richtWinding(model);
    const mesh = bouw(model, opgave, pakket.schaal, bereik);
    schrijf(join(doelMap, `${opgave.naam}.glb`), mesh, { ...opgave, bronmodel: model.naam }, pakket);

    regels.push([`${pakket.kit}/${opgave.naam}`, [opgave.kind, ...mesh.materialen, ...opgave.tags]]);
    perKit.set(pakket.kit, [...(perKit.get(pakket.kit) ?? []), opgave.naam]);

    console.log(
      `  ${model.naam.padEnd(24)} → ${opgave.naam.padEnd(24)} `
        + `${String(mesh.driehoeken.length / 3).padStart(6)} tris, `
        + `${mesh.banden.size} band(s): ${[...mesh.banden].join(', ')}`
        + `${gekeerd ? `, ${gekeerd} turned out` : ''}`
        + `${gericht ? `, ${gericht} rewound` : ''}`,
    );
  }
}

zetTags(regels);
zetManifest(PAKKETTEN, perKit);
console.log(`\n${regels.length} models added to kits/workfiles`);
