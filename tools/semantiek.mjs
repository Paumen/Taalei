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
    beschrijving: 'De hele modular-cave-kit: gangen, ruimtes, templates en wat erbij hoort. Eigen texture-atlas en eigen kleuren, los van de andere kits. Alleen renderen ná de ingang (hoge tri-count).' },
  { id: 'bouwpakket', naam: 'Bouwpakket & molens', kort: 'Bouwpakket', kleur: '#a8762a',
    tabblad: 'bouwpakket',
    beschrijving: 'Wanden, daken, pilaren en molens: delen die op één raster aan elkaar klikken en alleen op elkaar passen, plus de molens die uit datzelfde bouwwerk bestaan. Eigen tabblad, want veertig varianten van dezelfde muur en hetzelfde dak verdringen in de groepsweergave alles wat er los naast staat.' },
  { id: 'bouwwerken', naam: 'Bouwwerken & platforms', kort: 'Bouwwerken', kleur: '#877a63',
    beschrijving: 'Gebouwtjes, platforms, vlonders, planken, balkons en de losse muren en daken die niet in een bouwpakket zitten.' },
  { id: 'verbinding', naam: 'Trappen, bruggen & ladders', kort: 'Trappen & bruggen', kleur: '#c98a5a',
    beschrijving: 'Waarmee je een hoogte of afstand overbrugt zonder eroverheen te bouwen — bruikbaar voor "woordplakken".' },
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
  { id: 'items', naam: 'Verzamelobjecten & mechaniek', kort: 'Items', kleur: '#f1976c',
    beschrijving: 'Munt, sleutel, ster en hart naast hendel, veer, slot en val: kleine losse objecten die je oppakt of die op een actie reageren. Voorzichtig inzetten, geen punten-economie.' },
  { id: 'dieren', naam: 'Dieren', kort: 'Dieren', kleur: '#3e8fd0',
    beschrijving: 'Levende have. Nu alleen vissen; uitbreidbaar met de Quaternius-fishpack.' },
];

/**
 * Kits die één ondeelbaar geheel zijn: elk model erin gaat naar dezelfde
 * groep, ongeacht wat de bestandsnaam zegt. De grot staat helemaal op zichzelf
 * — eigen texture-atlas, eigen kleuren — en `gate`, `ladder` en `stairs` uit
 * die kit zijn grotwerk, geen tuinhek of dorpstrap. Ze tussen de props van de
 * andere kits zetten suggereert een uitwisselbaarheid die er niet is.
 */
const KIT_GROEPEN = {
  'modular-cave-kit': 'grot',
};

/**
 * Het modulaire bouwpakket binnen een kit: delen die op één raster aan elkaar
 * klikken en daardoor alleen op elkaar passen, plus de molens die uit datzelfde
 * bouwwerk bestaan (`blade` is de wiek van de windmolen). Anders dan bij de grot
 * gaat het niet om een hele kit — de bomen, karren en hekken van fantasy-town
 * zijn losse props en horen gewoon bij hun soortgenoten uit de andere kits.
 *
 * De uitzonderingen gaan hier vóór, zodat een model dat toevallig met een
 * pakketwoord begint er alsnog uit gehaald kan worden.
 */
const BOUWPAKKETTEN = [
  ['fantasy-town-kit', /^(wall|roof|pillar|watermill|windmill|blade)\b/],
  ['mini-dungeon', /^column\b/],
];

/** Naam (kit/model) → groep, voor modellen die de regels verkeerd zouden indelen. */
const uitzonderingen = {
  'platformer-kit/arrow': 'borden',         // wegwijzerbord, geen projectiel
  'platformer-kit/arrows': 'borden',        // idem
  'platformer-kit/lock': 'items',           // hangslot bij een poort
  'fantasy-town-kit/wheel': 'gereedschap',  // waterrad, maar los inzetbaar als wiel
  'survival-kit/resource-stone': 'rotsen',
  'survival-kit/resource-stone-large': 'rotsen',
  'pirate-kit/hole': 'terrein',
  'pirate-kit/grass-plant': 'planten',
  'mini-forest/target': 'borden',
  'mini-dungeon/trap': 'items',
  'mini-dungeon/dirt': 'terrein',
};

/** [regex, groep] — eerste match wint. */
const regels = [
  // Eigen held-objecten (helden-kit) hebben Nederlandse namen.
  [/^vuurtoren\b/, 'bouwwerken'],
  [/^(corridor|room|template)\b/, 'grot'],
  [/^campfire|^tent\b|^tent-/, 'kamp'],
  [/^(ship|boat|mast|cannon)\b|^ship-|^boat-|^mast-|^cannon-/, 'schepen'],
  [/^fish/, 'dieren'],
  [/^(tool|weapon|workbench)-|^workbench$/, 'gereedschap'],
  [/^(sign|signpost|banner|flag)\b|^sign-|^signpost-|^banner-|^flag-/, 'borden'],
  [/^(coin|key|star|heart|lever|spring|trap|lock)$/, 'items'],
  [/^(chest|barrel|crate|pot|bucket|bottle|cart|resource)\b|-bottles$/, 'opslag'],
  [/^(stairs|ladder|bridge)\b/, 'verbinding'],
  [/^(fence|poles|gate)\b/, 'hek'],
  [/^(tree|palm)\b/, 'bomen'],
  [/^(plant|grass|flowers|mushrooms)\b/, 'planten'],
  [/^(rock|rocks|stone|stones)\b/, 'rotsen'],
  [/^(floor|patch|dirt|hole)\b/, 'terrein'],
  // Wat hier nog langskomt zit niet in een bouwpakket: losse muren en daken
  // uit de andere kits, en alles wat je eromheen bouwt.
  [/^(wall|roof|building|structure|platform|pillar|column|balcony|overhang|planks|wood|watermill|windmill|fountain)\b/, 'bouwwerken'],
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
  vuurtoren: ['vuurtoren', 'toren', 'licht', 'baken'], // helden-kit heet Nederlands
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
  if (KIT_GROEPEN[kit]) return KIT_GROEPEN[kit];
  const sleutel = `${kit}/${model}`;
  if (uitzonderingen[sleutel]) return uitzonderingen[sleutel];
  for (const [pakketKit, patroon] of BOUWPAKKETTEN) {
    if (kit === pakketKit && patroon.test(model)) return 'bouwpakket';
  }
  for (const [patroon, groep] of regels) {
    if (patroon.test(model)) return groep;
  }
  return 'overig';
}
