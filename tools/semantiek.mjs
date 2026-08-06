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
    tabblad: 'terrain',
    beschrijving: 'Vloeren, grondvlakken en ondergrond om een gebied op te bouwen, plus het landschap zelf: `nature/mountain-a` is met ruim 16 × 16 units geen prop maar een stuk terrein waar je de rest op zet. Eigen tabblad, want die twee schalen — een vloertegel van 1 × 1 en een berg van 16 × 16 — vragen ieder een andere blik dan de props ernaast.' },
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
  { id: 'zeebodem', naam: 'Koraal, zeewier & schelpen', kort: 'Zeebodem', kleur: '#2fa39b',
    beschrijving: 'Begroeiing en vondsten van de zeebodem. Zit helemaal in de onderwater-kit en dus in het tabblad Zee; het koraal is ongekleurd wit, klaar om te tinten.' },
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
    beschrijving: 'Levende have: de twee vissen van de survival-kit en het zeeleven uit de onderwater-kit, van clownvis tot walvis. Alles uit die kit is gerigd en geanimeerd.' },
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
  [/^(corridor|room|template)\b/, 'grot'],
  // Zeeleven uit de onderwater-kit. Staat boven de algemene regels omdat
  // `starfish` anders bij de rotsen zou kunnen belanden en `shell-` nergens.
  [/^(crab|dolphin|eel|lobster|octopus|orca|penguin|seal|shark|squid|starfish|stingray|turtle|whale)\b/, 'dieren'],
  [/^(coral|seaweed|shell|sand-dollar)\b/, 'zeebodem'],
  [/^campfire|^tent\b|^tent-/, 'kamp'],
  [/^(ship|boat|mast|cannon)\b|^ship-|^boat-|^mast-|^cannon-/, 'schepen'],
  [/^fish/, 'dieren'],
  [/^(tool|weapon|workbench)-|^workbench$/, 'gereedschap'],
  [/^(sign|signpost|banner|flag)\b|^sign-|^signpost-|^banner-|^flag-/, 'borden'],
  [/^(coin|key|star|heart|lever|spring|trap|lock)$/, 'items'],
  [/^(chest|barrel|crate|pot|bucket|bottle|cart|resource)\b|-bottles$/, 'opslag'],
  // De luchtballon hoort bij het overbruggen van hoogte: in docs/draft_spec.md is
  // hij de route naar het onbereikbare plateau.
  [/^(stairs|ladder|bridge|balloon)\b/, 'verbinding'],
  [/^(fence|poles|gate)\b/, 'hek'],
  // `branch` staat bij de bomen om dezelfde reden als `tree-log` van de
  // survival-kit: het is geen boom, maar het is er wel van afkomstig en je zet
  // het bij een boom neer.
  [/^(tree|palm|branch)\b/, 'bomen'],
  [/^(plant|grass|flowers|mushrooms)\b/, 'planten'],
  [/^(rock|rocks|stone|stones)\b/, 'rotsen'],
  // `mountain` en `hills` zijn landschap, geen rotsblok: ze zijn te groot om
  // ergens neer te zetten, je bouwt eróp. Vandaar terrein en niet rotsen.
  [/^(floor|patch|dirt|hole|mountain|hills)\b/, 'terrein'],
  // Wat hier nog langskomt zit niet in een bouwpakket: losse muren en daken
  // uit de andere kits, en alles wat je eromheen bouwt.
  // `pier` en `plank` staan hier en niet bij `verbinding`: een steiger loopt het
  // water in en houdt op, hij verbindt geen twee oevers. De losse plank is er
  // het bouwmateriaal van.
  [/^(wall|roof|building|structure|platform|pillar|column|balcony|overhang|planks?|pier|wood|watermill|windmill|fountain|lighthouse)\b/, 'bouwwerken'],
];

/**
 * Nederlandse zoekwoorden per Engels naamdeel. De modellen heten Engels omdat
 * dat de bestandsnamen van Kenney zijn, maar er wordt Nederlands gezocht:
 * "boom" moet `tree` vinden.
 */
const WOORDENBOEK = {
  arrow: ['pijl', 'wegwijzer'], arrows: ['pijlen', 'wegwijzer'],
  axe: ['bijl'], balcony: ['balkon'], balloon: ['luchtballon', 'ballon'],
  banner: ['banier', 'vaandel'],
  barrel: ['vat', 'ton'], blade: ['wiek'], boat: ['boot', 'roeiboot'],
  bottle: ['fles'], bow: ['boog'], branch: ['tak'], bridge: ['brug'],
  brown: ['bruin'],
  bucket: ['emmer'],
  building: ['gebouw'], calf: ['kalf', 'jong'],
  campfire: ['kampvuur', 'vuur'], cannon: ['kanon'],
  canvas: ['zeil', 'doek'], cart: ['kar', 'wagen'], cave: ['grot'],
  chest: ['kist', 'schatkist'], clam: ['schelp', 'mossel'],
  clown: ['clownvis', 'vis'], coin: ['munt', 'geld'],
  column: ['zuil', 'pilaar'], coral: ['koraal'],
  corridor: ['gang', 'tunnel', 'grot'], crab: ['krab'], crate: ['krat', 'kist'],
  dead: ['dood', 'dode', 'kaal'],
  dirt: ['aarde', 'grond', 'modder'], dollar: ['zanddollar', 'zeeklit', 'schelp'],
  dolphin: ['dolfijn'], door: ['deur'], doorway: ['deuropening'],
  dory: ['doktersvis', 'vis'], eel: ['paling', 'aal'],
  fence: ['hek', 'omheining'], fish: ['vis'], flag: ['vlag'],
  floor: ['vloer', 'grond'], flowers: ['bloemen'], foliage: ['begroeiing'],
  fountain: ['fontein'], gate: ['poort', 'hek'], grass: ['gras'],
  hammer: ['hamer'], hammerhead: ['hamerhaai', 'haai'], heart: ['hart'],
  hoe: ['schoffel'], hole: ['gat', 'kuil'],
  key: ['sleutel'], ladder: ['ladder'], lever: ['hendel'],
  lighthouse: ['vuurtoren', 'toren', 'baken'], lobster: ['kreeft'], lock: ['slot'],
  mast: ['mast'], mountain: ['berg', 'gebergte'],
  mushrooms: ['paddenstoelen'], octopus: ['octopus', 'inktvis'],
  overhang: ['afdak'],
  orca: ['orka', 'zwaardwalvis', 'walvis'],
  paddle: ['peddel', 'roeispaan'], palm: ['palm', 'palmboom', 'boom'],
  patch: ['vlak', 'grondvlak'], penguin: ['pinguïn', 'pinguin'],
  pickaxe: ['houweel', 'pikhouweel'],
  pier: ['steiger', 'aanlegsteiger'],
  pillar: ['pilaar', 'zuil'], pine: ['den', 'dennenboom', 'boom'],
  plank: ['plank', 'hout'], plant: ['plant'], planks: ['planken', 'hout'],
  platform: ['platform', 'vlonder'],
  poles: ['palen'], pot: ['pot', 'kruik'], resource: ['grondstof'],
  rock: ['rots', 'steen'], rocks: ['rotsen', 'stenen'], roof: ['dak'],
  room: ['kamer', 'ruimte', 'grot'], rope: ['touw'], ropes: ['touwen'],
  sand: ['zand', 'strand'], scallop: ['sint-jakobsschelp', 'schelp'],
  seal: ['zeehond', 'rob'], seaweed: ['zeewier', 'wier'],
  shark: ['haai'], shell: ['schelp'], ship: ['schip', 'boot'], shovel: ['schep'],
  shutters: ['luiken'], sign: ['bord', 'wegwijzer'], signpost: ['wegwijzer', 'bord'],
  spiral: ['spiraal', 'punt'], spring: ['veer', 'springveer'],
  squid: ['pijlinktvis', 'inktvis'], stairs: ['trap'], star: ['ster'],
  starfish: ['zeester'], stingray: ['rog', 'pijlstaartrog'],
  stone: ['steen'], stones: ['stenen'], structure: ['bouwwerk', 'constructie'],
  target: ['doel', 'schietschijf'], template: ['sjabloon', 'grot'],
  tent: ['tent'], tool: ['gereedschap'],
  trap: ['val', 'valluik'], tree: ['boom'], tuna: ['tonijn', 'vis'],
  turtle: ['schildpad', 'zeeschildpad'], wall: ['muur', 'wand'],
  watermill: ['watermolen', 'molen'], weapon: ['wapen'], whale: ['walvis'],
  wheel: ['wiel'],
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
