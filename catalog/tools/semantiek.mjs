
export const GROEPEN = [
  { id: 'grond', naam: 'Grond & bodemvlakken', kort: 'Grond', kleur: '#8a5d4b',
    tabblad: 'nature',
    beschrijving: 'De bodem zelf: gras-, zand- en aardevlakken die je onder een scène legt, plus het landschap op grote schaal — `nature/mountain-a` is met ruim 16 × 16 units geen prop maar een stuk terrein waar je de rest op zet. Staat in het tabblad Nature bij de begroeiing en de rotsen die eruit opkomen. De vloeren waar je op bouwt staan bij de bouwwerken: die horen bij wat je zet, niet bij wat eronder ligt.' },
  { id: 'grot', naam: 'Grot & gangen', kort: 'Grot', kleur: '#5c4a52',
    beschrijving: 'Leeg: van de modular-cave-kit staan alleen de ladder en de drie vloerlagen nog in de catalogus, en die zijn bij uitzondering bij de verbindingen en de bouwwerken gezet. De groep blijft staan omdat KIT_GROEPEN ernaar wijst — komen de gangen en ruimtes terug, dan hebben ze een plek.' },
  { id: 'grotterrein', naam: 'Grotterrein & mijnwerk', kort: 'Grotterrein', kleur: '#7a6154',
    beschrijving: 'Leeg: het grotdeel van de modulair-terrein-kit staat buiten de catalogus (besluit PO, zie catalog/manifest.js) en het tabblad Grot is opgeheven. De groep blijft staan omdat de regels ernaar wijzen; komen die modellen terug, dan hebben ze een plek. Wat erin zat: vloeren, hoeken, zijkanten en heuvels waarmee je een grot uitgraaft, plus wat er aan mijnwerk in staat — rails, wissels, een lorrie, houwelen, stutten tegen wand en plafond, stalagmieten, hangende kabels en een lamp. Ook de vier ingangen die de kit `Cave_Cliff` noemt: die zetten een grot in een kliffront. Staat in het tabblad Grot naast de modular-cave-kit, maar bewust als eigen groep: deze modellen delen wél de gedeelde colormap en zijn dus met de andere kits te mengen, en ze zijn modulair op het raster in plaats van hele kamers en gangen. Op elkaar passen de twee niet.' },
  { id: 'bouwpakket', naam: 'Bouwpakket & molens', kort: 'Bouwpakket', kleur: '#a8762a',
    tabblad: 'structures',
    beschrijving: 'Wanden, daken, pilaren en molens: delen die op één raster aan elkaar klikken en alleen op elkaar passen, plus de molens die uit datzelfde bouwwerk bestaan. Het zijn er drie naast elkaar — dat van fantasy-town, dat van de village-kit en dat van de dungeon-kit — en ze passen niet op elkaar; kijk dus ook naar de kit voordat je twee stukken combineert. Eigen tabblad, want honderden varianten van dezelfde muur en hetzelfde dak verdringen in de groepsweergave alles wat er los naast staat.' },
  { id: 'bouwwerken', naam: 'Bouwwerken & platforms', kort: 'Bouwwerken', kleur: '#877a63',
    tabblad: 'structures',
    beschrijving: 'Gebouwtjes, platforms, vlonders, planken, balkons en de losse muren en daken die niet in een bouwpakket zitten. Ook de waterput met zijn onderdelen: de drie grondvlakken die eronder gaan en de schacht die erin zit, en de losse vloeren waar je op bouwt — die van de survival-kit en de mini-dungeon, met het gat van de pirate-kit erbij.' },
  { id: 'verbinding', naam: 'Trappen, bruggen & ladders', kort: 'Trappen & bruggen', kleur: '#c98a5a',
    tabblad: 'structures',
    beschrijving: 'Waarmee je een hoogte of afstand overbrugt zonder eroverheen te bouwen — bruikbaar voor "woordplakken".' },
  { id: 'hek', naam: 'Hekken, palen & poorten', kort: 'Hekken', kleur: '#b08968',
    tabblad: 'structures',
    beschrijving: 'Afbakening van paden en gebieden, en doorgangen die open of dicht kunnen.' },
  { id: 'bomen', naam: 'Bomen & palmen', kort: 'Bomen', kleur: '#3da679',
    tabblad: 'nature',
    beschrijving: 'Losse bomen en palmen voor bos, strand en dorp.' },
  { id: 'planten', naam: 'Planten, gras & bloemen', kort: 'Planten', kleur: '#6cb588',
    tabblad: 'nature',
    beschrijving: 'Kleine begroeiing en decoratie op de grond.' },
  { id: 'zeebodem', naam: 'Koraal, zeewier & schelpen', kort: 'Zeebodem', kleur: '#2fa39b',
    tabblad: 'nature',
    beschrijving: 'Begroeiing en vondsten van de zeebodem: de schelpen en zeesterren die op het strand van de modulair-terrein-kit liggen.' },
  { id: 'rotsen', naam: 'Rotsen & stenen', kort: 'Rotsen', kleur: '#9da4c4',
    tabblad: 'nature',
    beschrijving: 'Rotsblokken, keien, kiezels en losse stenen voor berg, grot en kust, plus de grote rotsformaties waarmee je een gebied afbakent. Staat met de bomen, planten, zeebodem en grond in het tabblad Nature — samen alles wat er zonder toedoen al staat. Een eigen tabblad hadden de rotsen sowieso nodig: de rocks-kit levert tien rotsen in twee tinten met kiezels en formaties erbij, en die verdringen in de objectweergave alles wat er los naast staat.' },
  { id: 'huisraad', naam: 'Huisraad & meubels', kort: 'Huisraad', kleur: '#c07c8a',
    beschrijving: 'Het meubilair: tafel, bank, kruk en vloerkleed uit de props-kit, plus de bedden, stoelen en wandschappen van de dungeon-kit. Ook de twee tenten van het Startkamp staan hier — een tent is waar je in slaapt, net als een bed. Het serviesgoed staat bij de kisten en vaten, de kaarsen bij het licht, en het eten met de gedekte tafels bij eten & koken; de kampvuren horen daar ook bij, want daar wordt op gekookt.' },
  { id: 'schepen', naam: 'Schepen & varen', kort: 'Schepen', kleur: '#474a58',
    beschrijving: 'Schepen, boten, masten, roeispanen en kanonnen voor de Zinnenzee.' },
  { id: 'eten', naam: 'Eten & koken', kort: 'Eten', kleur: '#9c3f2e',
    beschrijving: 'Wat je klaarmaakt en waar je het op zet: de kampvuren en het brandhout, de twee vissen van de survival-kit, het braadstuk, de vleesbout en de paddenstoel, de drie gedekte tafels van de dungeon-kit, en het serviesgoed dat erop hoort — zeven borden en een beker. De kale en kapotte tafels staan bij het huisraad, de kannen en de zak bij de kisten.' },
  { id: 'opslag', naam: 'Kisten & vaten', kort: 'Kisten', kleur: '#dd9f79',
    beschrijving: 'Waar je iets in doet: kisten, vaten, kratten, dozen, flessen, emmers en potten uit tien kits, plus de vier kannen en de zak van de props-kit en de drie karren waarmee je het verplaatst. Goed inzetbaar als beloning of verzamelplek. Wat erin zit staat bij de grondstoffen; de bekers en borden staan bij eten & koken.' },
  { id: 'assemblies', naam: 'Assemblies', kort: 'Assemblies', kleur: '#b5651d',
    tabblad: 'assemblies',
    beschrijving: 'Modellen die niet één ding zijn maar een tafereeltje: een gedekte tafel, een stapel kratten, een opgetast bed, een kist vol flessen, de staven en stapels van de resources-kit. Ze zijn af zoals ze staan — je zet ze neer in plaats van ze zelf uit losse delen op te bouwen — en ze zijn navenant zwaar: de meeste van de duurste modellen van de collectie staan hier. Eigen tabblad, want tussen de losse props geven ze een verkeerd beeld van wat een prop kost; de losse kist, tafel of staaf staat gewoon bij zijn eigen soort.' },
  { id: 'grondstoffen', naam: 'Grondstoffen & voorraad', kort: 'Grondstoffen', kleur: '#4f7d8c',
    beschrijving: 'De grondstoffen zelf, los van wat je ze in stopt: brokken erts (koper, goud, ijzer, zilver), stenen, hout, textiel, een pallet en onderdelen uit de resources-kit, plus de plankenstapel van de survival-kit. Bruikbaar als opbrengst, ruilmiddel of bouwvoorraad. De staven en de opgetaste stapels van diezelfde kit staan bij de assemblies.' },
  { id: 'gereedschap', naam: 'Gereedschap & wapens', kort: 'Gereedschap', kleur: '#6d738a',
    beschrijving: 'Bijl, hamer en bezem — koppelbaar aan mechanieken als "woordhakken". Zit voor achtentwintig stuks in de rpgtools-kit: aambeeld, vijl, slijpsteen, hamers, schroevendraaiers en meer smids- en timmermanswerk, plus het meet- en tekengerei van een ontdekker: kompas, tekenpasser, loep, potloden en touw.' },
  { id: 'borden', naam: 'Borden, vlaggen & doelen', kort: 'Borden', kleur: '#ffb349',
    beschrijving: 'Wegwijzers, banners en doelen. Dragers voor tekst en instructie.' },
  { id: 'items', naam: 'Verzamelobjecten & mechaniek', kort: 'Items', kleur: '#f1976c',
    beschrijving: 'Munt, sleutel, ster en hart naast hendel, veer en slot: kleine losse objecten die je oppakt of die op een actie reageren. Daar hoort de dorpsbel bij, en de munten, sleutels en sleutelbossen van de dungeon-kit — geen verzamelobjecten, maar wel klein, los en met een functie. Ook het reisgerei van de rpgtools-kit staat hier: de twee kaarten en het dagboek, open en dicht. Voorzichtig inzetten, geen punten-economie.' },
  { id: 'dieren', naam: 'Dieren', kort: 'Dieren', kleur: '#3e8fd0',
    beschrijving: 'Levende have: het zeeleven uit de onderwater-kit, van clownvis tot walvis, alles gerigd en geanimeerd. Nu leeg — die kit staat buiten de catalogus (`buitenCatalogus` in catalog/manifest.js) — maar de groep blijft staan, want de regels wijzen ernaar en zonder groep zouden die modellen bij terugkomst nergens te zien zijn. De twee vissen van de survival-kit staan bij eten & koken: die zijn als voedsel bedoeld.' },
  { id: 'licht', naam: 'Licht & lampen', kort: 'Licht', kleur: '#f2cb45',
    beschrijving: 'Alles wat licht geeft, uit vijf kits bij elkaar: de straatlantaarn en de wandlamp van village-kit, de kaarsen van props en dungeon (los, gesmolten, dun, drievoudig, brandend en gedoofd), het wandschap met kaarsen, de toortsen van dungeon en rpgtools, de lantaarn, en de vuurtoren van Taaleiland zelf. Handig als je een scène wilt uitlichten of een route in het donker wilt markeren.' },
];

export const KIT_GROEPEN = {
  'modular-cave-kit': 'grot',
  resources: 'grondstoffen',
};

const BOUWPAKKETTEN = [
  ['fantasy-town-kit', /^(wall|roof|pillar|watermill|windmill|blade)\b/],
  ['mini-dungeon', /^column\b/],
  ['village-kit', /^(canopy|chimney|cobblestone|dirt|door|roof|stone|stucco|waterwheel|windmill|wood|window)\b/],
  ['dungeon', /^(wall|floor|ceiling|pillar|rubble|column)\b/],
];

const MODULAIR_TERREIN = [
  [/^cave-/, 'grotterrein'],
  [/-prop-(tree|branch|stump)/, 'bomen'],
  [/-prop-(cattail|coconut|flower|grass-clump|mushroom)/, 'planten'],
  [/-prop-(boulder|rock|stepping-stones)/, 'rotsen'],
  [/-prop-fence-/, 'hek'],
  [/-prop-camp-(campfire|wood-pile)/, 'eten'],
  [/-prop-bridge-/, 'verbinding'],
  [/-prop-(docks|ruins-pillar)/, 'bouwwerken'],
  [/-prop-(shell|starfish)/, 'zeebodem'],
  [/-prop-treasure-chest/, 'opslag'],
  [/-terrain-|^mountain-/, 'grond'],
];

const ASSEMBLIES = new Set([
  'dungeon/barrel-large-decorated', 'dungeon/barrel-small-stack', 'dungeon/bed-decorated',
  'dungeon/box-small-decorated', 'dungeon/box-stacked', 'dungeon/chest-gold',
  'dungeon/crates-stacked', 'dungeon/keg-decorated', 'dungeon/table-long-decorated-a',
  'dungeon/table-long-decorated-c', 'dungeon/table-medium-decorated-a',
  'dungeon/table-small-decorated-a', 'dungeon/table-small-decorated-b', 'dungeon/wall-shelves',
  'pirate-kit/crate-bottles',
  'resources/copper-bars', 'resources/copper-bars-stack-large',
  'resources/copper-bars-stack-medium', 'resources/copper-bars-stack-small',
  'resources/gold-bars', 'resources/gold-bars-stack-large', 'resources/gold-bars-stack-medium',
  'resources/gold-bars-stack-small', 'resources/iron-bars', 'resources/iron-bars-stack-large',
  'resources/iron-bars-stack-medium', 'resources/iron-bars-stack-small', 'resources/silver-bars',
  'resources/silver-bars-stack-large', 'resources/silver-bars-stack-medium',
  'resources/silver-bars-stack-small', 'resources/stone-bricks-stack-large',
  'resources/stone-bricks-stack-medium', 'resources/stone-bricks-stack-small',
  'resources/wood-log-stack', 'resources/wood-planks-stack-large',
  'resources/wood-planks-stack-medium', 'resources/wood-planks-stack-small',
]);

const uitzonderingen = {
  'platformer-kit/arrow': 'borden',
  'platformer-kit/arrows': 'borden',
  'platformer-kit/lock': 'items',
  'fantasy-town-kit/wheel': 'gereedschap',
  'survival-kit/resource-stone': 'rotsen',
  'survival-kit/resource-stone-large': 'rotsen',
  'pirate-kit/hole': 'bouwwerken',
  'mini-forest/target': 'borden',
  'mini-dungeon/trap': 'items',
  'mini-dungeon/dirt': 'grond',
  'modular-cave-kit/template-floor-layer': 'bouwwerken',
  'modular-cave-kit/template-floor-layer-hole': 'bouwwerken',
  'modular-cave-kit/template-floor-layer-raised': 'bouwwerken',
  'modular-cave-kit/ladder': 'verbinding',
};

const regels = [
  [/^(corridor|room|template)\b/, 'grot'],
  [/^(crab|dolphin|eel|lobster|octopus|orca|penguin|seal|shark|squid|starfish|stingray|turtle|whale)\b/, 'dieren'],
  [/^(coral|seaweed|shell|sand-dollar)\b/, 'zeebodem'],
  [/^(campfire|fire|firewood|plate|roast|meat|mushroom|cup)\b|^(fish|fish-large|table-long-decorated-a|table-long-decorated-c|table-medium-decorated-a)$/, 'eten'],
  [/^tent\b|^tent-/, 'huisraad'],
  [/^(ship|boat|mast|cannon)\b|^ship-|^boat-|^mast-|^cannon-/, 'schepen'],
  [/^fish/, 'dieren'],
  [/^(tool|workbench)-|^workbench$|^broom$/, 'gereedschap'],
  [/^(anvil|axe|chisel|compass|drafting-compass|file|grindstone|hammer|handdrill|handplane|knife|magnifying-glass|mallet|nail|pencil|pickaxe|rope|saw|scissors|screw|screwdriver|shovel|tongs|trowel|wrench)\b/, 'gereedschap'],
  [/^(journal|map)\b/, 'items'],
  [/^(sign|signpost|banner|flag)\b|^sign-|^signpost-|^banner-|^flag-/, 'borden'],
  [/^(lamp|lantern|torch|candle|lighthouse)\b|^shelf-small-candles$/, 'licht'],
  [/^(key|star|heart|lever|spring|lock)$|^(bell|coin|keyring)\b/, 'items'],
  [/^(table|bench|stool|carpet|bed|chair|shelf|shelves)\b/, 'huisraad'],
  [/^resource\b/, 'grondstoffen'],
  [/^(chest|barrel|box|crate|crates|pot|bucket|bottle|jug|bag|cart|keg|trunk)\b|-bottles$/, 'opslag'],
  [/^(stairs|ladder|bridge|balloon)\b/, 'verbinding'],
  [/^(fence|poles|gate)\b/, 'hek'],
  [/^(tree|palm|branch)\b/, 'bomen'],
  [/^(plant|grass|flowers|mushrooms)\b/, 'planten'],
  [/^(rock|rocks|rockform|rockwall|stone|stones|pebbles|debris)\b/, 'rotsen'],
  [/^(patch|dirt|mountain|hills)\b/, 'grond'],
  [/^(floor|hole)\b/, 'bouwwerken'],
  [/^(wall|roof|building|structure|platform|pillar|column|balcony|overhang|planks?|wood|watermill|windmill|fountain|well)\b/, 'bouwwerken'],
];

export function bepaalGroep(kit, model) {
  const sleutel = `${kit}/${model}`;
  if (ASSEMBLIES.has(sleutel)) return 'assemblies';
  if (uitzonderingen[sleutel]) return uitzonderingen[sleutel];
  if (KIT_GROEPEN[kit]) return KIT_GROEPEN[kit];
  for (const [pakketKit, patroon] of BOUWPAKKETTEN) {
    if (kit === pakketKit && patroon.test(model)) return 'bouwpakket';
  }
  if (kit === 'modulair-terrein') {
    for (const [patroon, groep] of MODULAIR_TERREIN) {
      if (patroon.test(model)) return groep;
    }
  }
  for (const [patroon, groep] of regels) {
    if (patroon.test(model)) return groep;
  }
  return 'overig';
}
