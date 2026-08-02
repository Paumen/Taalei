/**
 * Semantische indeling van de 3D-modellen.
 *
 * Elk model krijgt precies één groep. De regels worden op volgorde
 * getoetst op de bestandsnaam (zonder .glb); de eerste match wint, dus
 * specifieke regels staan boven algemene.
 *
 * `uitzonderingen` gaat vóór alle regels en is bedoeld voor modellen
 * waarvan de naam iets anders suggereert dan het model daadwerkelijk is
 * (bijv. `platformer-kit/arrow` is een wegwijzer, geen projectiel).
 */

export const GROEPEN = [
  { id: 'terrein', naam: 'Grond & terrein', kort: 'Grond', kleur: '#8a5d4b',
    beschrijving: 'Vloeren, grondvlakken en ondergrond om een gebied op te bouwen.' },
  { id: 'grot', naam: 'Grot & gangen', kort: 'Grot', kleur: '#5c4a52',
    beschrijving: 'Modulaire gangen, ruimtes en cave-templates. Alleen renderen ná de ingang (hoge tri-count).' },
  { id: 'bouw', naam: 'Muren, daken & bouwwerken', kort: 'Muren & daken', kleur: '#995a41',
    beschrijving: 'Wanden, daken, gebouwdelen en molens.' },
  { id: 'verbinding', naam: 'Trappen, bruggen & platforms', kort: 'Trappen & bruggen', kleur: '#c98a5a',
    beschrijving: 'Alles waarmee je hoogteverschil of afstand overbrugt — bruikbaar voor "woordplakken".' },
  { id: 'hek', naam: 'Hekken, palen & poorten', kort: 'Hekken', kleur: '#b08968',
    beschrijving: 'Afbakening van paden en gebieden, en doorgangen die open of dicht kunnen.' },
  { id: 'bomen', naam: 'Bomen & palmen', kort: 'Bomen', kleur: '#3da679',
    beschrijving: 'Losse bomen en palmen voor bos, strand en dorp.' },
  { id: 'planten', naam: 'Planten, gras & bloemen', kort: 'Planten', kleur: '#6cb588',
    beschrijving: 'Kleine begroeiing en decoratie op de grond.' },
  { id: 'rotsen', naam: 'Rotsen & stenen', kort: 'Rotsen', kleur: '#9da4c4',
    beschrijving: 'Rotsblokken, keien en losse stenen voor berg, grot en kust.' },
  { id: 'schepen', naam: 'Schepen & varen', kort: 'Schepen', kleur: '#474a58',
    beschrijving: 'Schepen, boten, masten en kanonnen voor de Zinnenzee.' },
  { id: 'kamp', naam: 'Kamp & vuur', kort: 'Kamp', kleur: '#e76047',
    beschrijving: 'Tenten en kampvuren — de basis van het Startkamp.' },
  { id: 'opslag', naam: 'Kisten, vaten & grondstoffen', kort: 'Kisten', kleur: '#dd9f79',
    beschrijving: 'Containers en grondstoffen; goed inzetbaar als beloning of verzamelplek.' },
  { id: 'gereedschap', naam: 'Gereedschap & wapens', kort: 'Gereedschap', kleur: '#6d738a',
    beschrijving: 'Bijl, hamer, boog — koppelbaar aan mechanieken als "woordhakken".' },
  { id: 'borden', naam: 'Borden, vlaggen & doelen', kort: 'Borden', kleur: '#ffb349',
    beschrijving: 'Wegwijzers, banners en doelen. Dragers voor tekst en instructie.' },
  { id: 'items', naam: 'Verzamelobjecten', kort: 'Items', kleur: '#f1976c',
    beschrijving: 'Munt, sleutel, ster, hart — voorzichtig inzetten, geen punten-economie.' },
  { id: 'mechaniek', naam: 'Mechaniek & interactie', kort: 'Mechaniek', kleur: '#ff8744',
    beschrijving: 'Hendel, veer, slot, val: objecten die op een actie reageren.' },
  { id: 'dieren', naam: 'Dieren', kort: 'Dieren', kleur: '#3e8fd0',
    beschrijving: 'Levende have. Nu alleen vissen; uitbreidbaar met de Quaternius-fishpack.' },
];

/** Naam (kit/model) → groep, voor modellen die de regels verkeerd zouden indelen. */
const uitzonderingen = {
  'platformer-kit/arrow': 'borden',      // wegwijzerbord, geen projectiel
  'platformer-kit/arrows': 'borden',     // idem
  'platformer-kit/lock': 'mechaniek',    // hangslot bij een poort
  'modular-cave-kit/gate-rock': 'grot',  // dichtgevallen grotingang
  'modular-cave-kit/gate-overhang': 'grot',
  'fantasy-town-kit/blade': 'bouw',      // wiek van de molen
  'fantasy-town-kit/wheel': 'bouw',      // waterrad
  'survival-kit/resource-stone': 'rotsen',
  'survival-kit/resource-stone-large': 'rotsen',
  'pirate-kit/hole': 'terrein',
  'pirate-kit/grass-plant': 'planten',
  'mini-forest/target': 'borden',
  'mini-forest/building-platform': 'bouw', // vloer van het boomhuis, geen looppad
  'mini-dungeon/trap': 'mechaniek',
  'mini-dungeon/dirt': 'terrein',
};

/** [regex, groep] — eerste match wint. */
const regels = [
  [/^(corridor|room|template)\b/, 'grot'],
  [/^campfire|^tent\b|^tent-/, 'kamp'],
  [/^(ship|boat|mast|cannon)\b|^ship-|^boat-|^mast-|^cannon-/, 'schepen'],
  [/^fish/, 'dieren'],
  [/^(tool|weapon|workbench)-|^workbench$/, 'gereedschap'],
  [/^(sign|signpost|banner|flag)\b|^sign-|^signpost-|^banner-|^flag-/, 'borden'],
  [/^(coin|key|star|heart)$/, 'items'],
  [/^(lever|spring|trap|lock)$/, 'mechaniek'],
  [/^(chest|barrel|crate|pot|bucket|bottle|cart|resource)\b|-bottles$/, 'opslag'],
  [/^(stairs|ladder|bridge)\b|platform/, 'verbinding'],
  [/^(fence|poles|gate)\b/, 'hek'],
  [/^(tree|palm)\b/, 'bomen'],
  [/^(plant|grass|flowers|mushrooms)\b/, 'planten'],
  [/^(rock|rocks|stone|stones)\b/, 'rotsen'],
  [/^(floor|patch|dirt|hole)\b/, 'terrein'],
  [/^(wall|roof|building|structure|pillar|column|balcony|overhang|planks|wood|watermill|windmill|fountain)\b/, 'bouw'],
];

/**
 * Nederlandse zoekwoorden per Engels naamdeel. De modellen heten Engels omdat
 * dat de bestandsnamen van Kenney zijn, maar er wordt Nederlands gezocht:
 * "boom" moet `tree` vinden.
 */
const WOORDENBOEK = {
  arrow: ['pijl', 'wegwijzer'], arrows: ['pijlen', 'wegwijzer'],
  axe: ['bijl'], balcony: ['balkon'], banner: ['banier', 'vaandel'],
  barrel: ['vat', 'ton'], blade: ['wiek'], boat: ['boot', 'roeiboot'],
  bottle: ['fles'], bow: ['boog'], bridge: ['brug'], bucket: ['emmer'],
  building: ['gebouw'], campfire: ['kampvuur', 'vuur'], cannon: ['kanon'],
  canvas: ['zeil', 'doek'], cart: ['kar', 'wagen'], cave: ['grot'],
  chest: ['kist', 'schatkist'], coin: ['munt', 'geld'], column: ['zuil', 'pilaar'],
  corridor: ['gang', 'tunnel', 'grot'], crate: ['krat', 'kist'],
  dirt: ['aarde', 'grond', 'modder'], door: ['deur'], doorway: ['deuropening'],
  fence: ['hek', 'omheining'], fish: ['vis'], flag: ['vlag'],
  floor: ['vloer', 'grond'], flowers: ['bloemen'], foliage: ['begroeiing'],
  fountain: ['fontein'], gate: ['poort', 'hek'], grass: ['gras'],
  hammer: ['hamer'], heart: ['hart'], hoe: ['schoffel'], hole: ['gat', 'kuil'],
  key: ['sleutel'], ladder: ['ladder'], lever: ['hendel'], lock: ['slot'],
  mast: ['mast'], mushrooms: ['paddenstoelen'], overhang: ['afdak'],
  paddle: ['peddel', 'roeispaan'], palm: ['palm', 'palmboom', 'boom'],
  patch: ['vlak', 'grondvlak'], pickaxe: ['houweel', 'pikhouweel'],
  pillar: ['pilaar', 'zuil'], pine: ['den', 'dennenboom', 'boom'],
  plant: ['plant'], planks: ['planken', 'hout'], platform: ['platform', 'vlonder'],
  poles: ['palen'], pot: ['pot', 'kruik'], resource: ['grondstof'],
  rock: ['rots', 'steen'], rocks: ['rotsen', 'stenen'], roof: ['dak'],
  room: ['kamer', 'ruimte', 'grot'], rope: ['touw'], ropes: ['touwen'],
  sand: ['zand', 'strand'], ship: ['schip', 'boot'], shovel: ['schep'],
  shutters: ['luiken'], sign: ['bord', 'wegwijzer'], signpost: ['wegwijzer', 'bord'],
  spring: ['veer', 'springveer'], stairs: ['trap'], star: ['ster'],
  stone: ['steen'], stones: ['stenen'], structure: ['bouwwerk', 'constructie'],
  target: ['doel', 'schietschijf'], template: ['sjabloon', 'grot'],
  tent: ['tent'], tool: ['gereedschap'],
  trap: ['val', 'valluik'], tree: ['boom'], wall: ['muur', 'wand'],
  watermill: ['watermolen', 'molen'], weapon: ['wapen'], wheel: ['wiel'],
  window: ['raam'], windmill: ['windmolen', 'molen'], wood: ['hout'],
  workbench: ['werkbank'], wreck: ['wrak'],
};

/**
 * @param {string} model bestandsnaam zonder extensie
 * @returns {string[]} Nederlandse zoekwoorden, zonder dubbelingen
 */
export function nederlandseTrefwoorden(model) {
  const woorden = new Set();
  for (const deel of model.split('-')) {
    for (const woord of WOORDENBOEK[deel] ?? []) woorden.add(woord);
  }
  return [...woorden];
}

/**
 * @param {string} kit  kit-slug, bijv. 'pirate-kit'
 * @param {string} model  bestandsnaam zonder extensie, bijv. 'ship-wreck'
 * @returns {string} groep-id
 */
export function bepaalGroep(kit, model) {
  const sleutel = `${kit}/${model}`;
  if (uitzonderingen[sleutel]) return uitzonderingen[sleutel];
  for (const [patroon, groep] of regels) {
    if (patroon.test(model)) return groep;
  }
  return 'overig';
}
