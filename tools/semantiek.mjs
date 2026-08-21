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
  { id: 'grond', naam: 'Grond & bodemvlakken', kort: 'Grond', kleur: '#8a5d4b',
    tabblad: 'nature',
    beschrijving: 'De bodem zelf: gras-, zand- en aardevlakken die je onder een scène legt, plus het landschap op grote schaal — `nature/mountain-a` is met ruim 16 × 16 units geen prop maar een stuk terrein waar je de rest op zet. Staat in het tabblad Nature bij de begroeiing en de rotsen die eruit opkomen. De vloeren waar je op bouwt staan bij de bouwwerken: die horen bij wat je zet, niet bij wat eronder ligt.' },
  { id: 'grot', naam: 'Grot & gangen', kort: 'Grot', kleur: '#5c4a52',
    beschrijving: 'De hele modular-cave-kit: gangen, ruimtes, templates en wat erbij hoort. Eigen texture-atlas en eigen kleuren, los van de andere kits. Alleen renderen ná de ingang (hoge tri-count).' },
  { id: 'grotterrein', naam: 'Grotterrein & mijnwerk', kort: 'Grotterrein', kleur: '#7a6154',
    tabblad: 'grot',
    beschrijving: 'De grotstukken van de modulair-terrein-kit: vloeren, hoeken, zijkanten en heuvels waarmee je een grot uitgraaft, plus wat er aan mijnwerk in staat — rails, wissels, een lorrie, houwelen, stutten tegen wand en plafond, stalagmieten, hangende kabels en een lamp. Ook de vier ingangen die de kit `Cave_Cliff` noemt: die zetten een grot in een kliffront. Staat in het tabblad Grot naast de modular-cave-kit, maar bewust als eigen groep: deze modellen delen wél de gedeelde colormap en zijn dus met de andere kits te mengen, en ze zijn modulair op het raster in plaats van hele kamers en gangen. Op elkaar passen de twee niet.' },
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
    beschrijving: 'Levende have: het zeeleven uit de onderwater-kit, van clownvis tot walvis, alles gerigd en geanimeerd. Nu leeg — die kit staat buiten de catalogus (`buitenCatalogus` in kits/manifest.js) — maar de groep blijft staan, want de regels wijzen ernaar en zonder groep zouden die modellen bij terugkomst nergens te zien zijn. De twee vissen van de survival-kit staan bij eten & koken: die zijn als voedsel bedoeld.' },
  { id: 'licht', naam: 'Licht & lampen', kort: 'Licht', kleur: '#f2cb45',
    beschrijving: 'Alles wat licht geeft, uit vijf kits bij elkaar: de straatlantaarn en de wandlamp van village-kit, de kaarsen van props en dungeon (los, gesmolten, dun, drievoudig, brandend en gedoofd), het wandschap met kaarsen, de toortsen van dungeon en rpgtools, de lantaarn, en de vuurtoren van Taaleiland zelf. Handig als je een scène wilt uitlichten of een route in het donker wilt markeren.' },
];

/**
 * Kits die als geheel naar één groep gaan: elk model erin krijgt dezelfde
 * groep, ongeacht wat de bestandsnaam zegt. De grot staat op zichzelf — eigen
 * texture-atlas, eigen kleuren — en `gate` en `stairs` uit die kit zijn
 * grotwerk, geen tuinhek of dorpstrap. Ze tussen de props van de andere kits
 * zetten suggereert een uitwisselbaarheid die er niet is.
 *
 * Op de ladder en de drie vloerlagen na (besluit PO): die staan hieronder bij
 * de uitzonderingen, en omdat uitzonderingen vóór deze regel gaan winnen ze
 * ervan.
 *
 * `resources` is hier niet vanwege een eigen atlas — die deelt gewoon de
 * gedeelde colormap — maar omdat elk model een grondstof is (brokken erts,
 * stenen, hout, textiel, pallet, onderdelen): precies de groep
 * "grondstoffen". De stapels en staven van diezelfde kit gaan er vóór langs,
 * naar de assemblies (zie ASSEMBLIES). Een woordregel zou
 * hier meer kwaad doen dan goed: `stone-` en `wood-` zijn ook de eerste
 * woorden van bouwpakketonderdelen in andere kits (village-kit/stone-wall-a,
 * mini-dungeon/wood-structure), en die horen niet ineens bij de grondstoffen.
 */
export const KIT_GROEPEN = {
  'modular-cave-kit': 'grot',
  resources: 'grondstoffen',
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
  // De village-kit is bijna helemaal bouwpakket: van de 138 modellen klikken er
  // 117 op hetzelfde raster aan elkaar. De 21 die overblijven zijn de 18 die de
  // pack zelf `Prop_` noemt plus `sign-a`, `bell-a` en `lamp-wall`; die staan
  // los en gaan naar hun soortgenoten uit de andere kits.
  //
  // De wandprops heten in de pack `Wall_Prop_` maar zijn geen losse props: een
  // deur vult een deuropening van dít pakket en past nergens anders in. Vandaar
  // dat `door-*` hier valt, net als de schoorstenen op het dak en de
  // steunbalken tegen de gevel. `bell`, `lamp-wall` en `sign` blijven er buiten:
  // die zeggen op zichzelf iets — een uithangbord draagt tekst, een bel en een
  // lamp doen iets — en zijn ook zonder dit pakket bruikbaar. Ze vallen op de
  // regels hieronder, bij `borden` en `items`.
  ['village-kit', /^(canopy|chimney|cobblestone|dirt|door|roof|stone|stucco|waterwheel|windmill|wood|window)\b/],
  // Het derde, eigen bouwraster naast dat van fantasy-town en village-kit: elke
  // wand van de dungeon-kit is 4 breed × 4 hoog, en vloertegels, barrières,
  // pilaar, puin en zuil sluiten daar precies op aan (zie
  // tools/importeer-dungeon.mjs). De trappen staan óók op dat raster maar
  // gaan niet mee — die horen bij "verbinding", net als fantasy-town's eigen
  // trappen, die ook buiten zijn bouwpakket vallen.
  ['dungeon', /^(wall|floor|ceiling|pillar|rubble|column)\b/],
];

/**
 * De modulair-terrein-kit draagt zijn indeling in de naam:
 * `<landschap>-<soort>-<rest>`, bijvoorbeeld `hilly-prop-tree-cedar-a` of
 * `cliff-terrain-corner-outer-2x2-mid`. Die 305 namen op de algemene regels
 * hieronder laten vallen werkt niet: die toetsen op het eerste woord, en dat is
 * hier altijd het landschap.
 *
 * Vandaar een eigen lijst, net als bij de bouwpakketten alleen voor deze kit.
 * De regels toetsen op `-prop-` of `-terrain-` middenin de naam, want dat is
 * precies waar het onderscheid zit: de pack noemt zelf wat een los voorwerp is
 * en wat een stuk landschap. `terrain` gaat er als laatste in, zodat de vier
 * `mountain-*`-modellen — die geen soortdeel in hun naam hebben — er nog
 * onder vallen.
 *
 * Eerste match wint, dus specifieke regels staan boven algemene.
 */
const MODULAIR_TERREIN = [
  // Alles wat de pack `Cave_` noemt, inclusief de vier `Cave_Cliff_`-ingangen.
  // Dat is terrein én mijnwerk door elkaar, maar het hoort bij elkaar in het
  // tabblad Grot; zie de groepsbeschrijving.
  [/^cave-/, 'grotterrein'],
  [/-prop-(tree|branch|stump|hollow-trunk)/, 'bomen'],
  // De kokosnoot ligt in het zand bij de palmen: decoratie op de grond, geen
  // eten. Er is niets om hem mee te bereiden en niemand die hem opeet.
  [/-prop-(cattail|coconut|flower|grass-clump|mushroom)/, 'planten'],
  [/-prop-(boulder|rock|stepping-stones)/, 'rotsen'],
  [/-prop-fence-/, 'hek'],
  // Het vuur en het hout ernaast horen bij eten & koken, net als de kampvuren
  // van de survival-kit. Verder heeft de kit geen kampspullen meer: de zitstam
  // is uit de kit verwijderd, dus deze twee zijn alles wat `camp` nog dekt.
  [/-prop-camp-(campfire|wood-pile)/, 'eten'],
  [/-prop-bridge-/, 'verbinding'],
  // De steiger loopt het water in en houdt op, de ruïnepilaar staat ergens
  // los: allebei bouwsel, geen verbinding.
  [/-prop-(docks|ruins-pillar)/, 'bouwwerken'],
  [/-prop-(shell|starfish)/, 'zeebodem'],
  [/-prop-treasure-chest/, 'opslag'],
  // Wat overblijft is landschap: de vier bergen. De terreintegels zelf zijn
  // uit de kit verwijderd; de regel houdt `-terrain-` erin zodat een model dat
  // ooit terugkomt niet stilletjes ergens anders belandt.
  [/-terrain-|^mountain-/, 'grond'],
];

/**
 * Modellen die een tafereeltje zijn in plaats van één voorwerp: een gedekte
 * tafel, een stapel kratten, een kist vol flessen, de staven en stapels van de
 * resources-kit. De naam verraadt ze niet betrouwbaar — `chest-gold` is een
 * kist vol munten, `chest-a` een lege kist, en allebei heten ze `chest` — dus
 * staan ze hier met de hand.
 *
 * Ze gaan vóór de regels én vóór de bouwpakketten: `dungeon/wall-shelves`
 * begint met `wall` en zou anders in het bouwpakket van de dungeon vallen,
 * terwijl het een wandschap vol spullen is.
 */
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

/** Naam (kit/model) → groep, voor modellen die de regels verkeerd zouden indelen. */
const uitzonderingen = {
  'platformer-kit/arrow': 'borden',         // wegwijzerbord, geen projectiel
  'platformer-kit/arrows': 'borden',        // idem
  'platformer-kit/lock': 'items',           // hangslot bij een poort
  'fantasy-town-kit/wheel': 'gereedschap',  // waterrad, maar los inzetbaar als wiel
  'survival-kit/resource-stone': 'rotsen',
  'survival-kit/resource-stone-large': 'rotsen',
  'pirate-kit/hole': 'bouwwerken',
  'mini-forest/target': 'borden',
  'mini-dungeon/trap': 'items',
  'mini-dungeon/dirt': 'grond',
  // Besluit PO: uit de grot naar de bouwwerken en de verbindingen, ondanks
  // KIT_GROEPEN. De drie vloerlagen zijn vloeren waar je op bouwt, de ladder is
  // een ladder. Het zijn de enige vier modellen die van die kit in de catalogus
  // over zijn; de rest staat buiten de catalogus (kits/manifest.js).
  'modular-cave-kit/template-floor-layer': 'bouwwerken',
  'modular-cave-kit/template-floor-layer-hole': 'bouwwerken',
  'modular-cave-kit/template-floor-layer-raised': 'bouwwerken',
  'modular-cave-kit/ladder': 'verbinding',
};

/** [regex, groep] — eerste match wint. */
const regels = [
  [/^(corridor|room|template)\b/, 'grot'],
  // Zeeleven uit de onderwater-kit. Staat boven de algemene regels omdat
  // `starfish` anders bij de rotsen zou kunnen belanden en `shell-` nergens.
  [/^(crab|dolphin|eel|lobster|octopus|orca|penguin|seal|shark|squid|starfish|stingray|turtle|whale)\b/, 'dieren'],
  [/^(coral|seaweed|shell|sand-dollar)\b/, 'zeebodem'],
  // Eten en koken: het vuur waar je op kookt en het hout ernaast, de vis en het
  // vlees, de gedekte tafels en het serviesgoed dat erop staat. Deze regel gaat
  // vóór kamp, dieren, huisraad en opslag, want daar zaten deze modellen tot nu
  // toe over verdeeld.
  //
  // Twee families verhuizen maar voor een deel mee, dus die staan exact in
  // plaats van op woord:
  //   - van de elf tafels alleen de drie gedekte lange en middelgrote. De
  //     kleine gedekte (`table-small-decorated-a` en `-b`) en de kale en
  //     kapotte tafels blijven meubels, dus `decorated` is hier geen bruikbaar
  //     woord om op te matchen.
  //   - van de zes vissen alleen de twee van de survival-kit, die als voedsel
  //     bedoeld zijn. De vier soortvissen van de onderwater-kit (`fish-brown`,
  //     `-clown`, `-dory`, `-tuna`) blijven dieren.
  [/^(campfire|fire|firewood|plate|roast|meat|mushroom|cup)\b|^(fish|fish-large|table-long-decorated-a|table-long-decorated-c|table-medium-decorated-a)$/, 'eten'],
  [/^tent\b|^tent-/, 'huisraad'],
  [/^(ship|boat|mast|cannon)\b|^ship-|^boat-|^mast-|^cannon-/, 'schepen'],
  [/^fish/, 'dieren'],
  [/^(tool|workbench)-|^workbench$|^broom$/, 'gereedschap'],
  // De hele rpgtools-kit aan smids-, timmer- en werkplaatsgereedschap: los
  // opgesomd omdat de namen van de pack zelf geen gemeenschappelijk voorvoegsel
  // hebben (in tegenstelling tot survival-kit's `tool-*`). Het kompas, de
  // tekenpasser, de loep, de potloden en het touw staan hier ook: het zijn
  // instrumenten waarmee je iets doet, niet iets waar je op leest.
  [/^(anvil|axe|chisel|compass|drafting-compass|file|grindstone|hammer|handdrill|handplane|knife|magnifying-glass|mallet|nail|pencil|pickaxe|rope|saw|scissors|screw|screwdriver|shovel|tongs|trowel|wrench)\b/, 'gereedschap'],
  // Wat je leest of beschrijft — de twee kaarten en het dagboek, open en dicht
  // — staat bij de items: klein, los, en je pakt het op.
  [/^(journal|map)\b/, 'items'],
  [/^(sign|signpost|banner|flag)\b|^sign-|^signpost-|^banner-|^flag-/, 'borden'],
  // Alles wat licht geeft, ongeacht waar het vandaan komt: de straatlantaarn en
  // wandlamp van village-kit, de kaarsen van props en dungeon, de toortsen en
  // de lantaarn, en de vuurtoren. Staat vóór items, huisraad en bouwwerken,
  // want daar zaten ze eerst in verspreid.
  //
  // `shelf-small-candles` staat er exact bij: dat wandschap draagt kaarsen en
  // hoort dus hier, maar `shelf-large`, `shelf-small` en `shelves` zijn gewoon
  // meubels en moeten bij het huisraad blijven. Een `^shelf\b` zou ze alle vier
  // meenemen.
  [/^(lamp|lantern|torch|candle|lighthouse)\b|^shelf-small-candles$/, 'licht'],
  // `bell` staat hier om dezelfde reden als `lever` en `spring`: een kleine
  // losse installatie met een functie. `coin` staat in de `\b`-groep, niet bij
  // het exacte `key`, omdat de dungeon-kit ook `coin-stack-large/medium/small`
  // meebrengt. `keyring` (een bos dungeonsleutels) hoort bij `key`, niet bij
  // het slot waar hij bij past.
  [/^(key|star|heart|lever|spring|lock)$|^(bell|coin|keyring)\b/, 'items'],
  // Huisraad is het meubilair en het vloerkleed. Het serviesgoed staat bij de
  // opslag hieronder, de kaarsen bij het licht hierboven, en het eten met de
  // gedekte tafels bij eten & koken. `table` staat hier nog wel: acht van de elf
  // tafels zijn kaal of kapot en dus gewoon meubels. `bed`, `chair` en
  // `shelf`/`shelves` komen uit de dungeon-kit.
  [/^(table|bench|stool|carpet|bed|chair|shelf|shelves)\b/, 'huisraad'],
  // Grondstoffen staat vóór de kisten: `resource-planks` van de survival-kit is
  // een stapel hout, geen container. De 56 modellen van de resources-kit zelf
  // komen via KIT_GROEPEN binnen, niet via deze regel.
  [/^resource\b/, 'grondstoffen'],
  // `crates` (meervoud) staat naast `crate`: de dungeon-kit brengt
  // `crates-stacked` mee, en het gewone `crate\b` matcht dat niet (de `s`
  // breekt de woordgrens). `keg` (vat) en `trunk` (kist) zijn ook uit de
  // dungeon-kit. De kannen en de zak horen hier ook: vaatwerk waar iets in gaat.
  // De bekers en borden staan bij eten & koken, want daar liggen ze op tafel.
  // De karren staan hier omdat je er spullen in vervoert; ze zijn geen
  // grondstof, en een eigen groep voor drie modellen is te smal.
  [/^(chest|barrel|box|crate|crates|pot|bucket|bottle|jug|bag|cart|keg|trunk)\b|-bottles$/, 'opslag'],
  // De luchtballon hoort bij het overbruggen van hoogte: in docs/draft_spec.md is
  // hij de route naar het onbereikbare plateau.
  [/^(stairs|ladder|bridge|balloon)\b/, 'verbinding'],
  [/^(fence|poles|gate)\b/, 'hek'],
  // `branch` staat bij de bomen om dezelfde reden als `tree-log` van de
  // survival-kit: het is geen boom, maar het is er wel van afkomstig en je zet
  // het bij een boom neer.
  [/^(tree|palm|branch)\b/, 'bomen'],
  [/^(plant|grass|flowers|mushrooms)\b/, 'planten'],
  [/^(rock|rocks|rockform|rockwall|stone|stones|pebbles|debris)\b/, 'rotsen'],
  // `mountain` en `hills` zijn landschap, geen rotsblok: ze zijn te groot om
  // ergens neer te zetten, je bouwt eróp. Vandaar grond en niet rotsen.
  [/^(patch|dirt|mountain|hills)\b/, 'grond'],
  // Een vloer is geen bodem maar een vlak waar je op bouwt, en het gat in de
  // vloer hoort bij de vloer. Ze staan daarom bij de bouwwerken, in hetzelfde
  // tabblad als de wanden en daken die erop komen.
  [/^(floor|hole)\b/, 'bouwwerken'],
  // Wat hier nog langskomt zit niet in een bouwpakket: losse muren en daken
  // uit de andere kits, en alles wat je eromheen bouwt.
  // `plank` staat hier en niet bij `verbinding`: een losse plank is
  // bouwmateriaal, geen oeververbinding.
  // De put staat hier om dezelfde reden als de fontein: een bouwseltje dat je
  // ergens neerzet. `well-base-*` en `well-inside` zijn zijn onderdelen — de
  // drie grondvlakken eronder en de schacht erin — en blijven bij hem staan.
  [/^(wall|roof|building|structure|platform|pillar|column|balcony|overhang|planks?|wood|watermill|windmill|fountain|well)\b/, 'bouwwerken'],
];

/**
 * Nederlandse zoekwoorden per Engels naamdeel. De modellen heten Engels omdat
 * dat de bestandsnamen van Kenney zijn, maar er wordt Nederlands gezocht:
 * "boom" moet `tree` vinden.
 */
const WOORDENBOEK = {
  accent: ['sierlijst', 'accent'], angled: ['schuin', 'schuine'], anvil: ['aambeeld'],
  arch: ['boog', 'poortboog'],
  arrow: ['pijl', 'wegwijzer'], arrows: ['pijlen', 'wegwijzer'], axe: ['bijl'],
  bag: ['zak', 'buidel'], balcony: ['balkon'], balloon: ['luchtballon', 'ballon'],
  banner: ['banier', 'vaandel'],
  bare: ['kaal', 'dood'], barrel: ['vat', 'ton'],
  base: ['voet', 'sokkel', 'ondergrond'], baseboard: ['plint'], beach: ['strand', 'kust'],
  beam: ['balk', 'draagbalk'],
  bed: ['bed'],
  bell: ['bel', 'klok', 'luidklok'], bench: ['bank', 'zitbank'], big: ['groot', 'grote'],
  blade: ['wiek'],
  blades: ['wieken', 'wiek'], block: ['blok'], blue: ['blauw'], boards: ['planken', 'schotten'],
  boat: ['boot', 'roeiboot'], bottle: ['fles'], boulder: ['kei', 'zwerfkei', 'rotsblok'],
  bow: ['boog'], box: ['doos', 'kist'], brace: ['schoor', 'steun'], branch: ['tak'],
  brick: ['baksteen', 'steen'], bridge: ['brug'], broken: ['kapot', 'gebroken'],
  broom: ['bezem'], brown: ['bruin'],
  bucket: ['emmer'], building: ['gebouw'], bumpstop: ['stootblok', 'stootbok'],
  bundle: ['bundel', 'rol'], burnt: ['verbrand', 'gedoofd'],
  calf: ['kalf', 'jong'], camp: ['kamp', 'kampplaats'], campfire: ['kampvuur', 'vuur'],
  candle: ['kaars'], cannon: ['kanon'],
  canopy: ['luifel', 'afdak'], canvas: ['zeil', 'doek'],
  carpet: ['kleed', 'vloerkleed', 'tapijt'], cart: ['kar', 'wagen'],
  cattail: ['lisdodde', 'riet'], cave: ['grot'], cedar: ['ceder', 'cederboom', 'boom'],
  ceiling: ['plafond'], center: ['midden', 'middenstuk'], centered: ['gecentreerd', 'midden'],
  chair: ['stoel'], chest: ['kist', 'schatkist'], chimney: ['schoorsteen'], chisel: ['beitel'],
  chunks: ['brokken', 'klompen'],
  clam: ['schelp', 'mossel'], cliff: ['klif', 'rotswand', 'steilte'],
  closed: ['dicht', 'gesloten'], clown: ['clownvis', 'vis'], clump: ['pol', 'bosje', 'plukje'],
  cobblestone: ['kinderkopjes', 'klinkers', 'straatsteen', 'kei'],
  coconut: ['kokosnoot', 'kokos'],
  colum: ['zuil', 'pilaar'], cracked: ['gebarsten', 'gescheurd'], crossing: ['kruising'],
  coin: ['munt', 'geld'], column: ['zuil', 'pilaar'], compass: ['kompas'],
  concave: ['hol', 'holle'], connected: ['verbonden', 'aaneen'],
  convex: ['bol', 'bolle'], copper: ['koper'], coral: ['koraal'], corner: ['hoek'],
  corridor: ['gang', 'tunnel', 'grot'], crab: ['krab'], crate: ['krat', 'kist'],
  crest: ['kam', 'kruin'],
  cup: ['beker', 'kroes'], curb: ['stoeprand', 'trottoirband'], curve: ['bocht', 'gebogen'],
  curved: ['gebogen', 'bocht'], daisy: ['madeliefje', 'margriet'],
  dead: ['dood', 'dode', 'kaal'], debris: ['puin', 'gruis'], dirt: ['aarde', 'grond', 'modder'],
  docks: ['steiger', 'aanlegsteiger'],
  dollar: ['zanddollar', 'zeeklit', 'schelp'], dolphin: ['dolfijn'], door: ['deur'],
  doorway: ['deuropening'], dory: ['doktersvis', 'vis'], double: ['dubbel'],
  diagonal: ['diagonaal', 'schuin'],
  drafting: ['tekenpasser', 'passer'],
  eave: ['overstek', 'dakoverstek', 'goot'], edge: ['rand'], eel: ['paling', 'aal'],
  empty: ['leeg'], endcap: ['eindstuk'], entrance: ['ingang', 'toegang'],
  escarpment: ['steilrand', 'steilwand', 'talud'], esse: ['s-bocht', 'slinger'],
  end: ['eind', 'uiteinde'], fading: ['uitlopend', 'aflopend'], falloff: ['uitloop', 'aflopend'],
  fence: ['hek', 'omheining'],
  file: ['vijl'],
  fire: ['vuur', 'vuurschaal'], firewood: ['brandhout', 'hout'], fish: ['vis'], flag: ['vlag'],
  flat: ['vlak', 'plat'],
  floor: ['vloer', 'grond'], flower: ['bloem'], flowers: ['bloemen'],
  flume: ['goot', 'molengoot', 'waterloop'], flush: ['gelijk', 'vlak'],
  back: ['achterkant', 'achterzijde'],
  foliage: ['begroeiing'], foundation: ['fundering'],
  fountain: ['fontein'], front: ['voorkant', 'voorzijde'], full: ['vol', 'heel'],
  gate: ['poort', 'hek'], grate: ['rooster'], grates: ['roosters'],
  gathered: ['opgehoopt', 'hoop'], gentle: ['flauw', 'glooiend', 'zacht'],
  glass: ['glas', 'loep'],
  gold: ['goud'], grass: ['gras'],
  grindstone: ['slijpsteen', 'slijpmolen'],
  half: ['half', 'halve'], hammer: ['hamer'], hammerhead: ['hamerhaai', 'haai'], hard: ['hard'],
  handdrill: ['handboor', 'boor'], handplane: ['schaaf', 'schaafmachine'],
  hanging: ['hangend', 'hangende'],
  heart: ['hart'], hill: ['heuvel', 'helling'],
  hilly: ['heuvel', 'heuvelachtig', 'heuvellandschap'], hoe: ['schoffel'], hole: ['gat', 'kuil'],
  hollow: ['hol', 'holle'], incline: ['helling', 'oprit'],
  inner: ['binnen', 'binnenhoek'], inside: ['binnenkant', 'binnenin'],
  intersection: ['kruising'], iron: ['ijzer'], joined: ['verbonden', 'aaneen'],
  journal: ['dagboek', 'boek'], jug: ['kan', 'kruik'],
  keg: ['vat'], key: ['sleutel'], keyring: ['sleutelbos', 'sleutelring'],
  knife: ['mes'], labeled: ['gelabeld', 'geëtiketteerd'],
  ladder: ['ladder'], lamp: ['lamp', 'lantaarn'],
  lantern: ['lantaarn', 'lamp'], large: ['groot', 'grote'], lean: ['afdak', 'schuilplaats'],
  leg: ['poot', 'bout'], lever: ['hendel'], lighthouse: ['vuurtoren', 'toren', 'baken'],
  lily: ['lelie'],
  lobster: ['kreeft'], lock: ['slot'], log: ['boomstam', 'stam'], long: ['lang'], low: ['laag', 'lage'],
  magnifying: ['loep', 'vergrootglas'], mallet: ['houten hamer'], map: ['kaart', 'landkaart'],
  mast: ['mast'], melted: ['gesmolten'],
  meat: ['vlees'], mid: ['midden'], middle: ['midden', 'middenstuk'],
  minecart: ['mijnkar', 'lorrie', 'kar'], mounted: ['gemonteerd', 'bevestigd'],
  mountain: ['berg', 'gebergte'], mushroom: ['paddenstoel'],
  mushrooms: ['paddenstoelen'], nail: ['spijker'], narrow: ['smal', 'smalle'],
  natural: ['natuurlijk', 'natuursteen'], normal: ['gewoon', 'normaal'],
  nugget: ['klompje', 'brok'], nuggets: ['klompjes', 'brokken'],
  oars: ['roeispanen', 'riemen'],
  octopus: ['octopus', 'inktvis'], open: ['open'], opposite: ['tegenover', 'overstaand'],
  orca: ['orka', 'zwaardwalvis'],
  ornate: ['sierlijk', 'versierd'],
  outer: ['buiten', 'buitenhoek'], overhang: ['afdak'], overlap: ['overlap', 'overlappend'],
  paddle: ['peddel', 'roeispaan'],
  pallet: ['pallet', 'laadbord'],
  palm: ['palm', 'palmboom', 'boom'], parts: ['onderdelen'], patch: ['vlak', 'grondvlak'],
  path: ['pad', 'wandelpad'],
  pebbles: ['kiezels', 'keitjes', 'stenen'], penguin: ['pinguïn', 'pinguin'],
  pick: ['houweel', 'pikhouweel'],
  pickaxe: ['houweel', 'pikhouweel'],
  pile: ['stapel', 'hoop'],
  pillar: ['pilaar', 'zuil'], pine: ['den', 'dennenboom', 'boom'], pink: ['roze'],
  pipe: ['pijp', 'buis'], plain: ['vlak', 'effen'],
  plank: ['plank', 'hout'], planks: ['planken', 'hout'], plant: ['plant'],
  plate: ['bord', 'schaal'], platform: ['platform', 'vlonder'], poles: ['palen'],
  post: ['paal', 'staander'], pot: ['pot', 'kruik'], prop: ['decor', 'voorwerp'],
  railing: ['leuning', 'reling', 'balustrade'], railway: ['spoor', 'rails', 'spoorlijn'],
  raised: ['verhoogd', 'opgetild'],
  rake: ['windveer', 'dakrand'], ramp: ['helling', 'oprit'], resource: ['grondstof'],
  ridge: ['nok', 'nokrand'], roast: ['gebraad', 'braadstuk', 'kip'], rock: ['rots', 'steen'],
  rockform: ['rotsformatie', 'rots'], rocks: ['rotsen', 'stenen'], rockwall: ['rotswand', 'muur'],
  rocky: ['rotsachtig', 'rotsig'],
  rolled: ['opgerold', 'gerold'],
  roof: ['dak'], room: ['kamer', 'ruimte', 'grot'], rope: ['touw'], ropes: ['touwen'],
  rose: ['roos'], round: ['rond'],
  rounded: ['rond', 'afgerond'], rubble: ['puin'], ruins: ['ruïne', 'ruine'],
  sand: ['zand', 'strand'], saw: ['zaag'],
  scaffold: ['stellage', 'steiger'],
  scallop: ['sint-jakobsschelp', 'schelp'], scissors: ['schaar'], screw: ['schroef'],
  screwdriver: ['schroevendraaier'],
  seal: ['zeehond', 'rob'],
  seaweed: ['zeewier', 'wier'], shared: ['gedeeld', 'algemeen'], shark: ['haai'],
  sharp: ['steil', 'scherp'],
  shelf: ['schap', 'plank'], shelves: ['schappen', 'planken'],
  shift: ['verschoven', 'verspringend'],
  shell: ['schelp'],
  ship: ['schip', 'boot'], short: ['kort'], shovel: ['schep'], shutters: ['luiken'],
  side: ['zijkant', 'zijde'], sides: ['zijkanten', 'zijden'], sign: ['bord', 'wegwijzer'],
  signpost: ['wegwijzer', 'bord'], silver: ['zilver'], simple: ['eenvoudig', 'simpel'],
  single: ['enkel', 'enkele'], slope: ['helling', 'schuin'],
  sloped: ['schuin', 'hellend'],
  small: ['klein', 'kleine'], soft: ['zacht'], spikes: ['spijkers', 'punten'],
  spiral: ['spiraal', 'punt'],
  spring: ['veer', 'springveer'], squid: ['pijlinktvis', 'inktvis'], stack: ['stapel'],
  stairs: ['trap'], stalagmite: ['stalagmiet', 'druipsteen'],
  star: ['ster'], starfish: ['zeester'], stepping: ['stapstenen', 'stapsteen'],
  steps: ['trap', 'treden', 'traptreden'],
  stingray: ['rog', 'pijlstaartrog'], stone: ['steen'], stones: ['stenen'],
  stool: ['kruk', 'krukje'], straight: ['recht'], street: ['straat', 'straatlantaarn'],
  structure: ['bouwwerk', 'constructie'], stucco: ['stuc', 'pleisterwerk', 'pleister'],
  stump: ['boomstronk', 'stronk'], sunflower: ['zonnebloem'],
  support: ['steun', 'schoor', 'steunbalk'], supported: ['gesteund', 'geschoord'],
  supports: ['steunen', 'palen'], switch: ['wissel', 'spoorwissel'],
  table: ['tafel'], tall: ['hoog', 'hoge'], target: ['doel', 'schietschijf'],
  template: ['sjabloon', 'grot'], tent: ['tent'], terrain: ['terrein', 'landschap'],
  textiles: ['textiel', 'stof'],
  thin: ['dun'], tiny: ['piepklein'], tongs: ['tang'], tool: ['gereedschap'],
  top: ['bovenkant', 'bovenstuk'], torch: ['fakkel', 'toorts'], transition: ['overgang'],
  trap: ['val', 'valluik'], treasure: ['schat'], triple: ['drievoudig', 'drie'],
  tree: ['boom'], trowel: ['troffel'], trunk: ['kist'], tulip: ['tulp'], tuna: ['tonijn', 'vis'],
  turtle: ['schildpad', 'zeeschildpad'],
  upper: ['boven', 'bovenverdieping'], wall: ['muur', 'wand'], walled: ['ommuurd'],
  water: ['water'], waterfall: ['waterval'],
  watermill: ['watermolen', 'molen'],
  waterwheel: ['waterrad', 'molenrad', 'rad'], weapon: ['wapen'],
  weeds: ['onkruid'], well: ['put', 'waterput'],
  wrench: ['moersleutel', 'sleutel'], y: ['splitsing', 'y-splitsing'],
  whale: ['walvis'], wheel: ['wiel'], wide: ['breed', 'brede'], windmill: ['windmolen', 'molen'],
  window: ['raam'], wood: ['hout'], workbench: ['werkbank'], wreck: ['wrak'],
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
  // Allebei vóór KIT_GROEPEN, want allebei zijn ze bedoeld om die regel te
  // doorbreken: de helft van de resources-kit is een stapel en hoort bij de
  // assemblies, en een handvol modellen uit de grot staat bij de bouwwerken.
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
