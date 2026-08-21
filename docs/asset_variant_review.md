# Asset-variantoverzicht

Welke modellen in de collectie zijn varianten van elkaar — hetzelfde model,
met alleen een andere kleur, een andere maat, of een klein verschil in
samenstelling of detail? Gemeten over alle 764 modellen uit
`kits/catalog.json` met `node tools/vind-varianten.mjs`. Wat buiten de catalogus
staat doet niet mee: de onderwater-kit en het grotdeel van de collectie staan wel
in de repo maar niet in `catalog.json`. De uitkomst staat in
`docs/asset_variants.json`; per groep staat een plaat met de leden op ware
grootte naast elkaar in `docs/asset_variant_review/`, genoemd naar de soort en
de kaart van de groep, te regenereren met

    NODE_PATH=$(npm root -g) node tools/vergelijk-groottes/render.mjs \
      docs/asset_variants.groepen.json docs/asset_variant_review

## 0. Hoe er gemeten is

Niet op naam — namen liegen (`stucco-support-pillar-a` en
`waterwheel-flume-pillar` heten niets hetzelfde en zijn dezelfde paal) — maar
op geometrie. Van elk model wordt de scène in wereldruimte uitgelezen
(inclusief skinning) en daarvan worden drie handtekeningen gemaakt:

1. **De hoekpunten zelf**, gesorteerd en gehasht. Gelijke hash = letterlijk
   dezelfde mesh; wat dan nog verschilt is kleur.
2. **Dezelfde hoekpunten, gecentreerd en op maat 1 geschaald.** Gelijke hash =
   dezelfde mesh op een ander formaat.
3. **Twee 16³ bezettingsrasters** van de driehoeken. Het *vaste* raster
   schaalt gelijkmatig en houdt de verhoudingen vast (een blok is geen tegel);
   het *gerekte* raster schaalt per as, waardoor een dunne tegel het raster in
   de hoogte vult en het reliëf op zijn oppervlak meetelt. De Jaccard-overlap
   van beide rasters moet boven de drempel liggen, in de beste van vier
   yaw-standen.

De twee rasters zijn nodig omdat ze elkaars blinde vlek dekken. Alleen het
vaste raster ziet elke platte tegel als elke andere platte tegel: dat leverde
één groep van tientallen modellen op waarin dorpsmuren, kisten en vloerplanken
door elkaar liepen. Alleen het gerekte raster ziet een kist als een tegel. Verder
geldt een driehoekendrempel: detail dat kleiner is dan een rastercel — de
groeven in een tegel, de planken op een kist — zie je niet in het raster maar
wel in het driehoekental, en modellen die daarin een factor twee schelen zijn
geen variant van elkaar.

Groepen ontstaan met volledige koppeling: élk paar in een groep haalt de
drempel. Met alleen kettingkoppeling rijgt de ene buur de andere aan zich en
eindigt de halve collectie in één groep.

Drempels: 0,90 voor een variant, 0,78 voor "verwant" (§4). Alles hieronder
komt uit die meting; §3 zegt welke groepen bij naslag geen echte variant zijn.

## 1. Wat er ligt

**74 groepen, samen 215 modellen — 28% van de catalogus.** Twee groepen lopen
over kitgrenzen heen, de rest zit binnen één kit.

| soort | groepen | wat het betekent |
|---|---|---|
| kleurvariant | 14 | dezelfde mesh, alleen een ander palet |
| maatvariant | 1 | dezelfde mesh, alleen een ander formaat |
| detailvariant | 59 | zelfde silhouet, verschil in samenstelling of detail |

Per kit (een groep telt bij elke kit waar leden uit komen):
dungeon 18, village-kit 14, resources 11, forest 10, fantasy-town-kit 6,
pirate-kit 5, modulair-terrein 5, survival-kit 2, en één elk voor platformer-kit,
props, rocks, rpgtools en taalei-kit.

Dertig groepen staan er op gezag en niet op meting — natuur (rotsen,
kiezels, bomen), de vloertegels van de grot, de aan/uit-paren en nog wat losse
(zie §5). Ze staan in `HANDMATIG` in het script.

## 2. De duidelijke gevallen

### 2.1 Kleurvarianten — dezelfde mesh, ander palet

De hele **resources**-kit is één kleurenfamilie: negen groepen van vier, waarin
koper, goud, ijzer en zilver telkens exact dezelfde mesh delen (identiek
driehoekental, identieke bounding box, identieke hoekpunten) en alleen in
palet verschillen — `*-bar`, `*-bars`, `*-bars-stack-small/medium/large`,
`*-nugget-small/medium/large` en `*-nuggets` — de platen `kleurvariant-resources-iron-*`.
Dat is 36 van de 215 modellen in dit overzicht; in de catalogus staat het ijzer
van elke groep op de kaart en de andere drie erachter. Ze zijn bedoeld als kleurenset en horen zo bij
elkaar; wie er één gebruikt, weet dat de andere drie gratis meekomen.

Daarnaast `dungeon/bottle-a-brown` ↔ `dungeon/bottle-a-labeled-brown`:
dezelfde fles van 144 driehoeken, de tweede met een etiketkleur extra
(`kleurvariant-dungeon-bottle-a-labeled-brown`). De fles mét etiket staat op de
kaart: die leest als het voorwerp waar je naar zoekt, de kale fles als de
uitzondering erop. Dat is een uitspraak, geen meting — hij staat bij naam in
`VOORKEUR` in het script, net als de standaard van de twee schelpen
(`modulair-terrein/beach-prop-shell-b`).

De overige vier kleurgroepen zijn `dungeon/floor-wood-large` ↔ `-large-dark`,
`dungeon/floor-wood-small` ↔ `-small-dark`, `rpgtools/torch` ↔ `torch-burnt` en
`survival-kit/fish` ↔ `fish-large` — de laatste is er een met twee
verschillen tegelijk: dezelfde 233 driehoeken, anderhalf keer zo groot én in
een ander palet.

### 2.2 Maatvariant

`dungeon/box-large` ↔ `dungeon/box-small`: dezelfde 188 driehoeken, dezelfde
kleuren, 0,525 tegen 0,35 units (`maatvariant-dungeon-box-large`).

### 2.3 Detailvarianten binnen één kit

De grootste en meest bruikbare families:

De grootste en meest bruikbare families (de plaat heet naar de soort en de kaart
van de groep, dus `detailvariant-pirate-kit-ship-ghost.png`):

| groep | leden | wat er verschilt | plaat |
|---|---|---|---|
| pirate-kit schepen, middel | `ship-medium`, `ship-pirate-medium`, `ship-ghost` | zelfde romp en tuigage; zeilkleur en vlaggen | `…-pirate-kit-ship-ghost` |
| pirate-kit schepen, groot | `ship-large`, `ship-pirate-large` | idem | `…-pirate-kit-ship-large` |
| pirate-kit schepen, klein | `ship-small`, `ship-pirate-small` | idem | `…-pirate-kit-ship-pirate-small` |
| village stone-wall a–e | 5 | zelfde muurpaneel 0,034 × 0,6 × 0,6, ander metselpatroon (98–152 driehoeken) | `…-village-kit-stone-wall-a` |
| village cobblestone-dirt-transition a–d | 4 | zelfde overgangstegel, andere keienverdeling | `…-cobblestone-dirt-transition-a` |
| village wood-floor-straight a–d | 4 | zelfde plankenvloer, andere nerf | `…-wood-floor-straight-a` |
| village stucco-support-pillar a–c + `waterwheel-flume-pillar` | 4 | dezelfde paal 0,12 × 0,12 × 0,6, 12–20 driehoeken | `…-stucco-support-pillar-a` |
| village stucco-support-beam a–c + `roof-accent-ridge` | 4 | dezelfde balk, de ridge een kwartslag gedraaid | `…-roof-accent-ridge` |
| village doorways/vensters | 5 groepen | `stone` tegen `stone-stucco`, `rounded` tegen `single` — zelfde opening, andere omlijsting | `…-stone-doorway-*`, `…-stucco-window-*` |
| dungeon wall-window open/closed (± scaffold) | 2 × 2 | zelfde muur, luik open of dicht | `…-dungeon-wall-window-closed(-scaffold)` |
| taalei-kit `balloon-basket-round` ↔ `-square` | 2 | zelfde ballon, ronde of vierkante mand | `…-balloon-basket-round` |
| resources `wood-plank-a`, `-b`, `-c` | 3 | dezelfde plank in 28, 52 en 76 driehoeken; `c` staat er met de hand bij (§5) | `…-resources-wood-plank-a` |
| resources `wood-log-a` ↔ `-b` | 2 | hetzelfde blok hout, `b` dunner; staat er met de hand bij (§5) | `…-resources-wood-log-a` |
| forest rotsen | 10 groepen, 43 modellen | strooirotsen per maatfamilie; met de hand samengevoegd (§5.1) | `…-forest-rock-*` |
| dungeon vloertegels 1 × 1 | 3 × 2–3 | dezelfde tegel, ander reliëf: `floor-dirt-small a–c`, `floor-tile-small-broken a/b`, `floor-tile-small-weeds a/b`; met de hand (§5) | `…-dungeon-floor-dirt-small-a`, `…-floor-tile-small-broken-a`, `…-floor-tile-small-weeds-a` |
| dungeon aan/uit | 3 × 2 | `torch` ↔ `torch-lit` en `candle(-thin)` ↔ `-lit`: de vlam is de enige extra geometrie; met de hand | `…-dungeon-torch`, `…-dungeon-candle(-thin)` |
| fantasy-town-kit `roof-corner` ↔ `-round` | 2 | dezelfde dakhoek in dezelfde bounding box, verstek tegen boog (36 tegen 44 driehoeken); met de hand | `…-fantasy-town-kit-roof-corner` |
| modulair-terrein `beach-prop-shell-a` ↔ `-b` | 2 | dezelfde schelp van 42 driehoeken, `b` iets groter en anders gekleurd; `b` staat op de kaart | `…-beach-prop-shell-b` |
| modulair-terrein `beach-prop-starfish-a` ↔ `-b` | 2 | dezelfde zeester van 28 driehoeken, `b` een vijfde groter | `…-beach-prop-starfish-a` |
| dungeon `stairs-wall-left` ↔ `-right` | 2 | elkaars spiegelbeeld, 574 driehoeken elk; met de hand (§5) | `…-dungeon-stairs-wall-left` |
| dungeon `wall-archedwindow-open` ↔ `wall-broken` | 2 | hetzelfde muurpaneel, boogopening tegen bresgat; met de hand (§5) | `…-dungeon-wall-archedwindow-open` |
| fantasy-town-kit `wall-wood-detail-*` | 3 | hetzelfde houten paneel, beschot als kruis, schuine balk of dwarsbalken; met de hand (§5) | `…-wall-wood-detail-cross` |
| fantasy-town-kit `wall-wood-window-*` | 3 | hetzelfde paneel, raam met glas, rond of met luiken; met de hand (§5) | `…-wall-wood-window-glass` |
| modulair-terrein `hilly-prop-tree-pine a–c` | 3 | dezelfde spar, een kegel meer of minder in de kruin; met de hand (§5.1) | `…-hilly-prop-tree-pine-a` |
| modulair-terrein `hilly-prop-tree-cedar-a` ↔ `-b` | 2 | dezelfde ceder in dezelfde bounding box, ander kruinprofiel; met de hand (§5.1) | `…-hilly-prop-tree-cedar-a` |
| pirate-kit `rocks a–c` en `rocks-sand a–c` | 2 × 3 | dezelfde brokken in een andere opstelling; de zandversie staat apart, want de zandsokkel is het hele verschil (§5.1) | `…-pirate-kit-rocks-a`, `…-rocks-sand-a` |
| rocks `pebbles-dirt a–d` | 4 | plukjes kiezels van 1 × 0,9 × 0,1, elk anders verdeeld (§5.1) | `…-rocks-pebbles-dirt-a` |

### 2.4 Over kitgrenzen heen

Twee groepen mengen kits, en allebei zijn ze kubus:

- `dungeon/floor-foundation-allsides`, `-corner`, `-front-and-back` — één
  fundering, verschil zit in welke zijden een stenen rand krijgen. `props/box-a`
  staat er ten onrechte bij (`detailvariant-dungeon-floor-foundation-allsides`,
  zie §3).
- `dungeon/floor-foundation-front` ↔ `fantasy-town-kit/wall-wood-block`
  (`detailvariant-dungeon-floor-foundation-front`) — kubussen die alleen hun
  silhouet delen; zie §3.

## 3. Wat de meting niet ziet

Allebei de groepen van §2.4 zijn silhouetmatches, geen varianten. Ze staan
bewust in `asset_variants.json` — de meting kan ze niet van echte varianten
onderscheiden — maar bij naslag op de platen houden ze geen stand:

1. **`props/box-a` in de fundering-groep.** Een houten krat van 334 driehoeken
   naast drie stenen funderingsblokken van 202–360. Even groot driehoekental,
   dezelfde kubusvorm, verder niets gemeen.
2. **`dungeon/floor-foundation-front` ↔ `fantasy-town-kit/wall-wood-block`.**
   Kale kubussen uit verschillende kits.

Het patroon is steeds hetzelfde: hoe eenvoudiger de vorm, hoe minder het raster
te zeggen heeft. Bij een kubus blijft alleen "het is een kubus" over, en dat
delen ze dan ook echt.

Omgekeerd mist de meting varianten die alleen in textuur of materiaal
verschillen zonder dat de geometrie of het palet meebeweegt — de catalogus kent
per model alleen zijn basiskleuren, geen texturen — en varianten die te ver uit
elkaar liggen voor de drempels. Voor die tweede soort is er §5.

## 4. Vlak onder de drempel

55 paren halen 0,78–0,90: gelijkend, maar met een verschil dat te groot is voor
"dezelfde asset". Ze staan onder `verwant` in `asset_variants.json`. Een paar dat
met de hand alsnog is samengevoegd (§5) blijft daar staan: die lijst is de
meting, en de meting verandert niet doordat iemand er overheen gaat. De sterkste:

- `village-kit/door-ornate` ↔ `door-simple` (0,897) — dezelfde deur, de ene met
  beslag.
- `village-kit/stone-curb-a` ↔ `-d` (0,897), `-a` ↔ `-c` (0,871), `-a` ↔ `-b`
  (0,867) — de stoepranden vormen een familie waarvan alleen b ↔ c (0,917) boven
  de drempel komt.
- `modulair-terrein/hilly-prop-fence-boards-a` ↔ `-b` (0,893).
- `village-kit/stucco-window-*` onderling (0,858–0,892) — de vensterfamilie
  loopt door tot onder de drempel.
- `dungeon/wall-window-closed(-scaffold)` kruislings (0,885) — de vier vormen
  eigenlijk één familie; de meting knipt hem in twee paren.
- `fantasy-town-kit/roof-left` ↔ `roof-right` (0,866) — elkaars spiegelbeeld; de
  meting draait wel om de hoogte-as maar spiegelt niet.

Een drempel op 0,86 zou deze families compleet maken en kost, afgaand op de
lijst, weinig extra ruis. 0,90 is de voorzichtige keuze gebleven.

## 5. Met de hand erbij

Dertig groepen komen uit `HANDMATIG` in het script en worden onvoorwaardelijk
samengevoegd: een mens die zegt dat twee modellen dezelfde asset zijn wint van
het raster. Ze tonen stuk voor stuk een grens van de meting.

**Te veel detail voor de driehoekendrempel.**

- `resources/wood-plank-a` ↔ `-c` — dezelfde plank in dezelfde bounding box,
  maar 28 tegen 76 driehoeken. Dat valt af op de driehoekendrempel, die er juist
  is om detail te scheiden dat het raster niet ziet. Hier scheidt hij te veel.
- `dungeon/torch` ↔ `torch-lit`, `dungeon/candle` ↔ `candle-lit` en
  `dungeon/candle-thin` ↔ `candle-thin-lit` — aan en uit. De brandende versie
  draagt een vlam, en dat is genoeg extra geometrie om onder de drempel te
  zakken. Het is wel hetzelfde voorwerp.

**Spiegelbeeld.**

- `dungeon/stairs-wall-left` ↔ `stairs-wall-right` — 574 driehoeken elk in
  dezelfde bounding box, de trap loopt de andere kant op. De meting draait wel
  om de hoogte-as maar spiegelt niet, dus voor haar is de ene trap de andere
  niet. Hetzelfde geldt voor `fantasy-town-kit/roof-left` ↔ `roof-right` (§4),
  dat nog niet is samengevoegd.

**Te weinig verschil voor het raster.**

- `resources/wood-log-a` ↔ `-b` — hetzelfde blok hout, `b` dunner (0,275 tegen
  0,361 breed). Voor het gelijkmatig geschaalde raster is dunner een andere
  vorm, en dat is meestal terecht: een halve muur is geen hele muur. Bij een
  boomstam is het dat niet.
- De vloertegels van 1 × 1 uit de grot: `floor-dirt-small-a` ↔ `-b` ↔ `-c`,
  `floor-tile-small-broken-a` ↔ `-b` en `floor-tile-small-weeds-a` ↔ `-b`. Het
  reliëf op zo'n tegel is kleiner dan een rastercel, dus de meting houdt ze op
  0,80–0,88 — net onder de drempel, terwijl ze naast elkaar alleen in hun
  patroon verschillen.
- `dungeon/wall-archedwindow-open` ↔ `wall-broken` — hetzelfde muurpaneel van
  1,4 × 0,35 × 1,4: de een met een boogopening, de ander met een gat erin
  geslagen. Het verschil zit in wat er wég is, en dat is te veel gat voor het
  raster (635 tegen 784 driehoeken).
- `fantasy-town-kit/wall-wood-detail-cross`, `-diagonal` en `-horizontal` —
  hetzelfde paneel van 0,1 × 1 × 1 met ander beschot (80, 56 en 46 driehoeken).
  Alleen cross ↔ diagonal haalde 0,849; het beschot is te dun om het raster te
  vullen.
- `fantasy-town-kit/wall-wood-window-glass`, `-round` en `-shutters` —
  hetzelfde paneel van 1 × 1 met een ander raam erin. De ronde draagt een
  uitstekend kozijn en is daardoor 0,2 diep tegen 0,1; voor het gelijkmatig
  geschaalde raster is dat een ander paneel.
- `fantasy-town-kit/roof-corner` ↔ `roof-corner-round` — dezelfde dakhoek in
  dezelfde bounding box van 1,067 × 1,067 × 0,648; de ronde loopt met een boog
  waar de andere een verstek heeft, 44 tegen 36 driehoeken.
- `modulair-terrein/beach-prop-shell-a` ↔ `-b` en `beach-prop-starfish-a` ↔
  `-b` — strandspul van een paar centimeter: dezelfde schelp van 42 driehoeken
  (`b` een derde groter en in een andere paletcel) en dezelfde zeester van 28
  (`b` een vijfde groter). Op 0,05 × 0,06 × 0,01 en 0,09 × 0,10 × 0,01 heeft
  het raster niets meer om op te vallen.

### 5.1 Wat het raster bij natuur mist

**De forest-kit.** De 43 rotsen staan in tien groepen, alle tien met de hand. De
meting zag er één van (`rock-2-c` ↔ `-d`); de overige paren binnen een familie
komen niet verder dan 0,40–0,54, ver onder de verwantdrempel. Dat is precies wat
je bij deze vorm verwacht: een rots is een onregelmatige klomp, en twee klompen
die dezelfde rol spelen overlappen elkaar hooguit voor de helft. Waar het raster
bij een kubus te véél ziet (§3), ziet het hier te weinig.

Wat de families wél aanwijst, staat naast de meting: binnen een familie is het
driehoekental gelijk, de bounding box vergelijkbaar en het silhouet op de plaat
hetzelfde. Het zijn strooirotsen — bedoeld om door elkaar heen neer te zetten,
net als stone-wall a–e.

| groep | leden | driehoeken | hoogte | wat het is |
|---|---|---|---|---|
| `rock-1-a` | a, b, c | 48 | 0,27 | kegeltorentje, klein |
| `rock-1-d` | d, e, f | 84 | 0,56 | kegeltorentje, middel |
| `rock-1-g` | g, h, i | 104 | 0,93 | kegeltorentje, groot |
| `rock-1-j` | j, k, l, m | 494–529 | 1,68–1,82 | rotspartij |
| `rock-1-n` | n, o, p, q | 223–497 | 2,00–2,29 | spits |
| `rock-2-a` | a, b, c, d | 12–108 | 0,11–0,87 | afgeknotte kegel, vier formaten |
| `rock-2-e` | e, f, g, h | 312–488 | 1,38–1,60 | rotspartij |
| `rock-3-a` | a–f | 84 | 0,43–0,64 | gladde kei, klein |
| `rock-3-g` | g–l | 168 | 0,95–1,13 | gladde kei, middel |
| `rock-3-m` | m–r | 320 | 1,74–1,92 | gladde kei, groot |

`rock-2-a` is de enige familie waarin het formaat sterk uiteenloopt: dezelfde
afgeknotte kegel op 0,11 tot 0,87 hoog. De groep blijft één geheel — het is één
rots met een maatkeuze, zoals `box-large` ↔ `box-small` dat is.

**Elders in de collectie, om dezelfde reden.** Hetzelfde patroon — een vorm die
niets rechts of vlaks heeft om het raster mee te vullen — levert nog vier
families op:

- `pirate-kit/rocks a–c` en `rocks-sand a–c`, twee families van drie: dezelfde
  brokken in een andere opstelling. Ze blijven uit elkaar; `rocks-sand` is
  dezelfde partij op een zandsokkel, en die sokkel is het hele verschil. Alleen
  `rocks-b` ↔ `rocks-sand-b` haalde 0,836, kruislings tussen de families door.
- `rocks/pebbles-dirt a–d`, vier plukjes kiezels van ongeveer 1 × 0,9 × 0,1.
  Plat en onregelmatig tegelijk: het gerekte raster ziet vier verschillende
  verdelingen, het vaste raster ziet vier keer niets.
- `modulair-terrein/hilly-prop-tree-pine a–c` en `hilly-prop-tree-cedar a/b` —
  bomen. Een spar is een stapel kegels, en een kegel meer of minder verzet
  genoeg volume om onder de drempel te komen, terwijl je op de plaat driemaal
  dezelfde boom ziet.

Wat hier bijkomt hoort ook echt bij elkaar; het omgekeerde — een gemeten groep
met de hand uit elkaar halen — kan het script niet, en is tot nu toe niet nodig
geweest. De valse positieven van §3 zijn er wel, maar die staan er bewust in:
ze laten zien waar de meting blind is.

## 6. Waar dit voor te gebruiken is

- **Kleurvarianten zijn geen aparte assets.** De 36 resources-modellen zijn negen
  vormen met een paletkeuze. Wie de collectie inkort, kan daar snijden zonder
  vorm te verliezen. In de catalogus staat van elke groep het ijzer op de kaart.
- **Detailvarianten zijn juist bedoeld om te herhalen.** stone-wall a–e,
  cobblestone-transition a–d, wood-floor a–d, de grotvloertegels en alle
  natuurgroepen van §5.1 bestaan om afwisseling in een vlak te leggen; ze horen
  als set gebruikt te worden, niet één uit vier.
- **Bij het toevoegen van een model** is `tools/vind-varianten.mjs` de check of
  het er al is: het draait in vijf seconden over de hele collectie.
