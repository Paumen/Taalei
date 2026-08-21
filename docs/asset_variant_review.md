# Asset-variantoverzicht

Welke modellen in de collectie zijn varianten van elkaar — hetzelfde model,
met alleen een andere kleur, een andere maat, of een klein verschil in
samenstelling of detail? Gemeten over alle 808 modellen uit
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

**36 groepen, samen 108 modellen — 13% van de catalogus.** Drie groepen lopen
over kitgrenzen heen, de rest zit binnen één kit.

| soort | groepen | wat het betekent |
|---|---|---|
| kleurvariant | 10 | dezelfde mesh, alleen een ander palet |
| maatvariant | 1 | dezelfde mesh, alleen een ander formaat |
| detailvariant | 25 | zelfde silhouet, verschil in samenstelling of detail |

Per kit (een groep telt bij elke kit waar leden uit komen):
village-kit 13, resources 11, dungeon 6, pirate-kit 3, en één elk voor props,
fantasy-town-kit, forest, mini-dungeon, modulair-terrein en taalei-kit.

Twee groepen staan er op gezag en niet op meting: `wood-plank-a` ↔ `-c` en
`wood-log-a` ↔ `-b` (zie §5). Ze staan in `HANDMATIG` in het script.

## 2. De duidelijke gevallen

### 2.1 Kleurvarianten — dezelfde mesh, ander palet

De hele **resources**-kit is één kleurenfamilie: negen groepen van vier, waarin
koper, goud, ijzer en zilver telkens exact dezelfde mesh delen (identiek
driehoekental, identieke bounding box, identieke hoekpunten) en alleen in
palet verschillen — `*-bar`, `*-bars`, `*-bars-stack-small/medium/large`,
`*-nugget-small/medium/large` en `*-nuggets` — de platen `kleurvariant-resources-iron-*`.
Dat is 36 van de 108 modellen in dit overzicht; in de catalogus staat het ijzer
van elke groep op de kaart en de andere drie erachter. Ze zijn bedoeld als kleurenset en horen zo bij
elkaar; wie er één gebruikt, weet dat de andere drie gratis meekomen.

De tiende is `dungeon/bottle-a-brown` ↔ `dungeon/bottle-a-labeled-brown`:
dezelfde fles van 144 driehoeken, de tweede met een etiketkleur extra
(`kleurvariant-dungeon-bottle-a-brown`).

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
| forest `rock-2-c` ↔ `rock-2-d` | 2 | dezelfde rots in 108 driehoeken, ×1,3 groter en iets ander profiel | `…-forest-rock-2-c` |
| resources `wood-plank-a`, `-b`, `-c` | 3 | dezelfde plank in 28, 52 en 76 driehoeken; `c` staat er met de hand bij (§5) | `…-resources-wood-plank-a` |
| resources `wood-log-a` ↔ `-b` | 2 | hetzelfde blok hout, `b` dunner; staat er met de hand bij (§5) | `…-resources-wood-log-a` |

### 2.4 Over kitgrenzen heen

Drie groepen mengen kits, en alle drie zijn ze kubus:

- `dungeon/floor-foundation-allsides`, `-corner`, `-front-and-back` — één
  fundering, verschil zit in welke zijden een stenen rand krijgen. `props/box-a`
  staat er ten onrechte bij (`detailvariant-dungeon-floor-foundation-allsides`,
  zie §3).
- `dungeon/floor-foundation-front` ↔ `fantasy-town-kit/wall-wood-block`
  (`detailvariant-dungeon-floor-foundation-front`) en `mini-dungeon/dirt` ↔
  `village-kit/stucco-block` (`detailvariant-mini-dungeon-dirt`) — kubussen die
  alleen hun silhouet delen; zie §3.

## 3. Wat de meting niet ziet

Alle drie de groepen van §2.4 zijn silhouetmatches, geen varianten. Ze staan
bewust in `asset_variants.json` — de meting kan ze niet van echte varianten
onderscheiden — maar bij naslag op de platen houden ze geen stand:

1. **`props/box-a` in de fundering-groep.** Een houten krat van 334 driehoeken
   naast drie stenen funderingsblokken van 202–360. Even groot driehoekental,
   dezelfde kubusvorm, verder niets gemeen.
2. **`dungeon/floor-foundation-front` ↔ `fantasy-town-kit/wall-wood-block`** en
   **`mini-dungeon/dirt` ↔ `village-kit/stucco-block`.** Kale kubussen van
   12–123 driehoeken uit verschillende kits.

Het patroon is steeds hetzelfde: hoe eenvoudiger de vorm, hoe minder het raster
te zeggen heeft. Bij een kubus blijft alleen "het is een kubus" over, en dat
delen ze dan ook echt.

Omgekeerd mist de meting varianten die alleen in textuur of materiaal
verschillen zonder dat de geometrie of het palet meebeweegt — de catalogus kent
per model alleen zijn basiskleuren, geen texturen — en varianten die te ver uit
elkaar liggen voor de drempels. Voor die tweede soort is er §5.

## 4. Vlak onder de drempel

56 paren halen 0,78–0,90: gelijkend, maar met een verschil dat te groot is voor
"dezelfde asset". Ze staan onder `verwant` in `asset_variants.json`. De sterkste:

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

Twee paren staan in `HANDMATIG` in het script en worden onvoorwaardelijk
samengevoegd: een mens die zegt dat twee modellen dezelfde asset zijn wint van
het raster. Ze tonen allebei een grens van de meting:

- `resources/wood-plank-a` ↔ `-c` — dezelfde plank in dezelfde bounding box,
  maar 28 tegen 76 driehoeken. Dat valt af op de driehoekendrempel, die er juist
  is om detail te scheiden dat het raster niet ziet. Hier scheidt hij te veel.
- `resources/wood-log-a` ↔ `-b` — hetzelfde blok hout, `b` dunner (0,275 tegen
  0,361 breed). Voor het gelijkmatig geschaalde raster is dunner een andere
  vorm, en dat is meestal terecht: een halve muur is geen hele muur. Bij een
  boomstam is het dat niet.

Wat hier bijkomt hoort ook echt bij elkaar; het omgekeerde — een gemeten groep
met de hand uit elkaar halen — kan het script niet, en is tot nu toe niet nodig
geweest. De valse positieven van §3 zijn er wel, maar die staan er bewust in:
ze laten zien waar de meting blind is.

## 6. Waar dit voor te gebruiken is

- **Kleurvarianten zijn geen aparte assets.** De 36 resources-modellen zijn negen
  vormen met een paletkeuze. Wie de collectie inkort, kan daar snijden zonder
  vorm te verliezen. In de catalogus staat van elke groep het ijzer op de kaart.
- **Detailvarianten zijn juist bedoeld om te herhalen.** stone-wall a–e,
  cobblestone-transition a–d en wood-floor a–d bestaan om afwisseling in een vlak
  te leggen; ze horen als set gebruikt te worden, niet één uit vier.
- **Bij het toevoegen van een model** is `tools/vind-varianten.mjs` de check of
  het er al is: het draait in vijf seconden over de hele collectie.
