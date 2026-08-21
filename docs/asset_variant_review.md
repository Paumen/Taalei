# Asset-variantoverzicht

Welke modellen in de collectie zijn varianten van elkaar — hetzelfde model,
met alleen een andere kleur, een andere maat, of een klein verschil in
samenstelling of detail? Gemeten over alle 1087 modellen uit
`kits/catalog.json` met `node tools/vind-varianten.mjs`. De uitkomst staat in
`docs/asset_variants.json`; per groep staat een plaat met de leden op ware
grootte naast elkaar in `docs/asset_variant_review/`, te regenereren met

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
één groep van 38 modellen op waarin dorpsmuren, kisten en vloerplanken door
elkaar liepen. Alleen het gerekte raster ziet een kist als een tegel. Verder
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

**46 groepen, samen 139 modellen — 13% van de collectie.** Vijf groepen lopen
over kitgrenzen heen, de rest zit binnen één kit.

| soort | groepen | wat het betekent |
|---|---|---|
| kleurvariant | 12 | dezelfde mesh, alleen een ander palet |
| maatvariant | 1 | dezelfde mesh, alleen een ander formaat |
| detailvariant | 33 | zelfde silhouet, verschil in samenstelling of detail |

Per kit (een groep telt bij elke kit waar leden uit komen):
village-kit 13, modulair-terrein 11, resources 10, dungeon 6, mini-dungeon 3,
pirate-kit 3, modular-cave-kit 2, en één elk voor props, fantasy-town-kit,
forest en taalei-kit.

## 2. De duidelijke gevallen

### 2.1 Kleurvarianten — dezelfde mesh, ander palet

De hele **resources**-kit is één kleurenfamilie: negen groepen van vier, waarin
koper, goud, ijzer en zilver telkens exact dezelfde mesh delen (identiek
driehoekental, identieke bounding box, identieke hoekpunten) en alleen in
palet verschillen — `*-bar`, `*-bars`, `*-bars-stack-small/medium/large`,
`*-nugget-small/medium/large` en `*-nuggets` (platen 06–14). Dat is 36 van de
139 modellen in dit overzicht. Ze zijn bedoeld als kleurenset en horen zo bij
elkaar; wie er één gebruikt, weet dat de andere drie gratis meekomen.

Verder:

- `dungeon/bottle-a-brown` ↔ `dungeon/bottle-a-labeled-brown` — dezelfde fles
  (144 driehoeken), de tweede heeft een etiketkleur extra (plaat 24).
- `modulair-terrein/cave-terrain-corner-outer-3x3-mid` ↔
  `escarpment-terrain-corner-outer-3x3-mid` — dezelfde zes driehoeken, ander
  terreinpalet (plaat 34).
- `modulair-terrein/hilly-terrain-hill-side-sharp` ↔
  `hilly-terrain-path-hill-sharp-plain-center` — idem (plaat 37).

### 2.2 Maatvariant

`dungeon/box-large` ↔ `dungeon/box-small`: dezelfde 188 driehoeken, dezelfde
kleuren, 0,525 tegen 0,35 units (plaat 25).

### 2.3 Detailvarianten binnen één kit

De grootste en meest bruikbare families:

| groep | leden | wat er verschilt | plaat |
|---|---|---|---|
| pirate-kit schepen, middel | `ship-medium`, `ship-pirate-medium`, `ship-ghost` | zelfde romp en tuigage; zeilkleur en vlaggen | 22 |
| pirate-kit schepen, groot | `ship-large`, `ship-pirate-large` | idem | 38 |
| pirate-kit schepen, klein | `ship-small`, `ship-pirate-small` | idem | 39 |
| village stone-wall a–e | 5 | zelfde muurpaneel 0,034 × 0,6 × 0,6, ander metselpatroon (98–152 driehoeken) | 02 |
| village cobblestone-dirt-transition a–d | 4 | zelfde overgangstegel, andere keienverdeling | 15 |
| village wood-floor-straight a–d | 4 | zelfde plankenvloer, andere nerf | 19 |
| village stucco-support-pillar a–c + `waterwheel-flume-pillar` | 4 | dezelfde paal 0,12 × 0,12 × 0,6, 12–20 driehoeken | 18 |
| village stucco-support-beam a–c + `roof-accent-ridge` | 4 | dezelfde balk, de ridge een kwartslag gedraaid | 16 |
| village doorways/vensters | 5 groepen | `stone` tegen `stone-stucco`, `rounded` tegen `single` — zelfde opening, andere omlijsting | 17, 23, 43–45 |
| modulair-terrein cave-prop-railway-straight a–d | 4 | zelfde rails, andere bielzen | 04 |
| modulair-terrein cave-prop-support-ceiling-beam a–d | 4 | zelfde steunbalk, 29–38 driehoeken | 05 |
| dungeon wall-window open/closed (± scaffold) | 2 × 2 | zelfde muur, luik open of dicht | 27, 28 |
| taalei-kit `balloon-basket-round` ↔ `-square` | 2 | zelfde ballon, ronde of vierkante mand | 41 |
| forest `rock-2-c` ↔ `rock-2-d` | 2 | dezelfde rots in 108 driehoeken, ×1,3 groter en iets ander profiel | 29 |
| resources `wood-plank-a` ↔ `-b` | 2 | zelfde plank, 28 tegen 52 driehoeken | 40 |

### 2.4 Over kitgrenzen heen

Vijf groepen mengen kits. De opvallendste is de **vlakke vloertegel** (plaat
01): acht modellen die niets anders zijn dan één quad van twee driehoeken —
`mini-dungeon/floor`, `modular-cave-kit/template-floor` (vier driehoeken) en
zes tegels uit modulair-terrein (`cave-terrain-floor-normal` en `-raised`,
`beach-terrain-sand-floor-raised`, `hilly-terrain-grass-floor`,
`hilly-terrain-path-center`, `hilly-terrain-water-flat`). Twintig van de
achtentwintig paren in die groep zijn zuivere kleurvarianten: dezelfde quad,
1 × 1 of 0,5 × 0,5, met alleen een andere vlakkleur. Wie een vloertegel in een
nieuwe kleur nodig heeft, kopieert er één en verandert het palet — daar hoeft
geen model voor gemaakt te worden.

De andere vier:

- `mini-dungeon/floor-detail` ↔ `modular-cave-kit/template-floor-detail-a` —
  dezelfde gebarsten vloerplaat, 102 tegen 204 driehoeken (plaat 31).
- `dungeon/floor-foundation-allsides`, `-corner`, `-front-and-back` — één
  fundering, verschil zit in welke zijden een stenen rand krijgen (plaat 03).
- `dungeon/floor-foundation-front` ↔ `fantasy-town-kit/wall-wood-block`
  (plaat 26) en `mini-dungeon/dirt` ↔ `village-kit/stucco-block` (plaat 30) —
  kubussen die alleen hun silhouet delen; zie §3.

## 3. Wat de meting niet ziet

Drie groepen zijn silhouetmatches, geen varianten. Ze staan bewust in
`asset_variants.json` — de meting kan ze niet van echte varianten
onderscheiden — maar bij naslag op de platen houden ze geen stand:

1. **`props/box-a` in de fundering-groep** (plaat 03). Een houten krat van 334
   driehoeken naast drie stenen funderingsblokken van 202–360. Even groot
   driehoekental, dezelfde kubusvorm, verder niets gemeen.
2. **`dungeon/floor-foundation-front` ↔ `fantasy-town-kit/wall-wood-block`**
   (plaat 26) en **`mini-dungeon/dirt` ↔ `village-kit/stucco-block`**
   (plaat 30). Kale kubussen van 12–123 driehoeken uit verschillende kits.

Het patroon is steeds hetzelfde: hoe eenvoudiger de vorm, hoe minder het
raster te zeggen heeft. Bij een kubus of een quad blijft alleen "het is een
kubus" over, en dat delen ze dan ook echt. Voor de platte tegels van §2.4 is
dat juist de conclusie; voor de kubussen is het een vals positief.

Omgekeerd mist de meting varianten die alleen in textuur of materiaal
verschillen zonder dat de geometrie of het palet meebeweegt — de catalogus
kent per model alleen zijn basiskleuren, geen texturen.

## 4. Vlak onder de drempel

67 paren halen 0,78–0,90: gelijkend, maar met een verschil dat te groot is
voor "dezelfde asset". Ze staan onder `verwant` in `asset_variants.json`. De
sterkste:

- `village-kit/door-ornate` ↔ `door-simple` (0,897) — dezelfde deur, de ene
  met beslag.
- `village-kit/stone-curb-a` ↔ `-d` (0,897), `-a` ↔ `-c` (0,871), `-a` ↔ `-b`
  (0,867) — de stoepranden vormen een familie waarvan alleen b ↔ c (0,917)
  boven de drempel komt.
- `modulair-terrein/hilly-prop-fence-boards-a` ↔ `-b` (0,893).
- `modular-cave-kit/corridor-corner` ↔ `template-corner` (0,887).
- `village-kit/stucco-window-*` onderling (0,858–0,892) — de vensterfamilie
  loopt door tot onder de drempel.
- `dungeon/floor-tile-small-broken-a` ↔ `-b` (0,880).
- `fantasy-town-kit/roof-left` ↔ `roof-right` (0,866) — elkaars spiegelbeeld;
  de meting draait wel om de hoogte-as maar spiegelt niet.

Een drempel op 0,86 zou deze families compleet maken en kost, afgaand op de
lijst, weinig extra ruis. 0,90 is de voorzichtige keuze gebleven.

## 5. Waar dit voor te gebruiken is

- **Kleurvarianten zijn geen aparte assets.** De 36 resources-modellen en de
  acht vloerquads zijn vier respectievelijk één model met een paletkeuze. Wie
  de collectie inkort, kan daar snijden zonder vorm te verliezen.
- **Detailvarianten zijn juist bedoeld om te herhalen.** stone-wall a–e,
  cobblestone-transition a–d, wood-floor a–d en de railway-props bestaan om
  afwisseling in een vlak te leggen; ze horen als set gebruikt te worden, niet
  één uit vier.
- **Bij het toevoegen van een model** is `tools/vind-varianten.mjs` de check
  of het er al is: het draait in ruim vijf seconden over de hele collectie.
