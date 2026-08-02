# Stijl van de modellen

Beschrijving van de visuele stijl van de 3D-modellen in `kits/`, afgeleid uit de
bestanden zelf (292 `.glb`-modellen, 7 kits). Bedoeld als referentie bij het
bouwen van de Eiland- en Zone-views, en als toets voor nieuwe assets: past het
hierin, dan past het in Taaleiland.

## In één zin

Chunky low-poly speelgoedwereld: harde vlakken zonder afronding, alles op een
1×1-raster, en géén echte texturen — elk vlak prikt één kleur uit één gedeeld
palet, waardoor de hele wereld als één samenhangend geheel oogt.

## Kerncijfers

| | |
|---|---|
| Modellen | 292 `.glb`, verdeeld over 7 kits |
| Driehoeken totaal | ~125.000 |
| Texturen | 1 atlas van 512×512 px (`colormap.png`), byte-identiek in alle 7 kits |
| Materialen | 1 (`colormap`) — plus één uitzondering (`Water`, alleen fantasy-town) |
| Herkomst | Kenney-kits, geëxporteerd via UnityGLTF (zie `LICENSE.txt` per kit) |

## 1. Vormtaal

- **Low-poly met harde randen.** Gemiddeld 142–510 driehoeken per model (de
  grot-kit uitgezonderd). Normalen zijn per vlak gesplitst: `chest` heeft 296
  vertices op 96 unieke posities, `tree` 396 op 112. Er wordt dus *niets*
  glad gesmoothed — elk vlak vangt zijn eigen licht. Dat facetten-effect is
  het handelsmerk van de stijl.
- **Geen bevels, geen chamfers, geen microdetail.** Detail zit in silhouet en
  in extra losse onderdelen (`fountain-round` vs `fountain-round-detail`),
  nooit in oppervlakte-uitwerking.
- **Speelgoedproporties.** Kist 0,52 × 0,34, krat 0,50 × 0,50, boom 1,1 × 2,8.
  Objecten zijn gedrongen en overdreven dik; niets is realistisch slank.
- **Vriendelijk, niet kinderachtig.** Er zit slijtage en avontuur in het
  materiaal (`wall-wood-broken`, `ship-wreck`, `fence-low-broken`), maar geen
  bloed, geen grimmigheid, geen babyvormen. Precies de "not too childish"-lijn
  uit `brainstorm.md`.

## 2. Raster en pivot

- **Voetafdruk van 1×1 eenheid.** De meest voorkomende bounding boxes zijn
  1,0 × 1,0 (vloeren, muren, tegels); muren zijn 0,1 dik en staan op de rand
  van hun tegel. De grot-kit werkt in veelvouden: 1×1, 2×2, 5×5.
- **Pivot op onderkant-midden.** Bij elk gecontroleerd model is `min.y = 0` en
  ligt x/z rond nul. Modellen kun je dus zonder correctie op een vlak
  neerzetten en op 90°-stappen roteren.
- **Y-up, meters-achtige schaal.** Eén eenheid ≈ één tegel ≈ ongeveer een
  halve mensmaat; bomen zijn 1,7–3,4 hoog, schepen ~4 × 5.

## 3. Kleur: het paletatlas-principe

Dit is het belangrijkste onderdeel van de stijl, en meteen de grootste
technische winst.

- De atlas is een raster van **16 × 4 cellen** (elk 32 × 128 px). Slechts
  **21 cellen zijn ingekleurd**; de rest is zwart en ongebruikt.
- Elk vlak van elk model heeft UV's die precies op het **midden van één cel**
  vallen (bijv. u = 0,34375 = kolom 5). Er is dus geen textuurpatroon,
  geen tiling, geen UV-unwrap — alleen "welke kleur ben ik".
- **Binnen een cel loopt een verticale gradiënt** van licht (boven) naar donker
  (onder), en modellen prikken op **5 vaste v-hoogtes** (stappen van 0,05).
  Zo krijgt een houten muur licht- en schaduwvlakken uit dezelfde kleur:
  kolom 5 loopt van `#f0976c` bovenin naar `#b76746` onderin. De "schaduw" zit
  dus ingebakken in de textuur, niet in de belichting.
- Één cel is een echte textuur in plaats van een effen kleur: cel `[0,0]`
  beslaat 4 kolommen en bevat de rotswand van de grot-kit (`palet.json`,
  `"drempel": 4`).

Het palet (de 21 gevulde cellen, kleur gemeten in het midden van de cel):

| Cel | Kleur | Rol |
|---|---|---|
| 0–3,0 | `#bc7654` | rotswand-textuur (grot) |
| 4,0 | `#f1976c` | licht hout |
| 5,0 | `#d07b56` | hoofdhout — verreweg het meest gebruikt |
| 6,0 | `#ffb349` | goud/geel: munt, sleutel, ster, bloemen |
| 7,0 | `#e76047` | rood: hart, paddenstoel, doel |
| 10,0 | `#3e3e44` | bijna-zwart: kanon, romp, kerkermuur |
| 12,0 | `#995a41` | donker hout |
| 13,0 | `#dd9f79` | zand |
| 2,1 | `#6cb588` | licht gras |
| 3,1 | `#a16d58` | grotsteen licht |
| 4,1 | `#8a5d4b` | grotsteen donker |
| 5,1 | `#3da679` | gebladerte/gras |
| 6,1 | `#474a58` | donker metaal |
| 9,1 | `#ff8744` | oranje accent (vis) |
| 3,2 | `#9da4c4` | blauwgrijs metaal/steen |
| 5,2 | `#dcdce9` | wit doek: zeil, vlag, tent |
| 5,3 | `#f0c59d` | licht doek/hout |
| 15,3 | `#6d738a` | steengrijs |

Het is een warm palet: aardetinten en hout domineren, koel grijsblauw is de
tegenhanger, en verzadigd geel/rood/oranje is gereserveerd voor *dingen die
ertoe doen* (munt, sleutel, hart, ster, doel). Die reservering is bruikbaar:
verzamelbare taal-items en doelen mogen die accentkleuren lenen, decor niet.

## 4. Materiaal en shading

- Eén materiaal `colormap`: `metallicFactor = 0`, geen roughness-override
  (dus 1,0 → volledig mat), `doubleSided: true`, `baseColorTexture` = de atlas.
  Geen normal maps, geen emissie, geen glans.
- De sampler staat overal op `minFilter 9987` (LINEAR_MIPMAP_LINEAR) — nodig,
  omdat een gradiëntatlas met harde filtering gaat banden en bleeden. De
  survival-kit week hier tot voor kort van af en is bijgetrokken.
- Enige uitzondering: `Water` in de fantasy-town-fonteinen — geen textuur, een
  blauw `baseColorFactor` met `alphaMode: BLEND` (alpha 0,6).
- Gevolg: alle 292 modellen delen één textuur en één materiaal, en zijn dus in
  principe in één batch te renderen. Dat is precies wat een browser-game op een
  schoollaptop nodig heeft.

## 5. Modulariteit en naamgeving

De kits zijn bouwdozen, geen losse decorstukken. De naamgeving is consequent en
machinaal bruikbaar:

- **Basis + modifier**, gescheiden door koppeltekens:
  `wall-wood-corner-diagonal-half`, `fence-low-broken`, `stairs-wide-wood-handrail`.
- Terugkerende modifiers: `-corner`, `-half`, `-wide`, `-high`, `-large`,
  `-small`, `-broken`, `-detail`, `-end`, `-opening`.
- **Varianten op `-a`/`-b`/`-c`** voor natuurlijke herhaling: `rock-a/b/c`,
  `rocks-sand-a/b/c`. Bedoeld om willekeurig door elkaar te strooien zodat
  herhaling niet opvalt.
- Meest voorkomende woorden over alle 292 namen: `wall` (38), `wood` (33),
  `fence` (20), `corner` (17), `roof` (14), `tree` (13).

`manifest.js` bevat de volledige modellijst per kit met de zone-koppeling;
`palet.json` legt vast welk model welke paletcel gebruikt.

## 6. Budget per kit

| Kit | Modellen | Driehoeken | Gem. | Zwaarste model |
|---|---|---|---|---|
| survival-kit | 50 | 7.125 | 142 | `rock-flat-grass` (758) |
| platformer-kit | 36 | 5.120 | 142 | `crate-strong` (428) |
| mini-dungeon | 21 | 3.744 | 178 | `trap` (408) |
| fantasy-town-kit | 75 | 15.458 | 206 | `fountain-round-detail` (1.628) |
| mini-forest | 20 | 5.390 | 269 | `tent` (847) |
| pirate-kit | 50 | 25.514 | 510 | `ship-wreck` (2.282) |
| modular-cave-kit | 40 | 62.704 | 1.567 | `room-large` (8.080) |

De grot-kit is de uitschieter: 14% van de modellen, maar **50% van alle
driehoeken**. Dat bevestigt de aanpak uit `brainstorm.md` — grot pas laden en
renderen zodra het kind door de ingang gaat, en dan als enige zone.

## 7. Wat dit betekent voor Taaleiland

**Belichting.** De schaduw zit al in de atlas-gradiënt. Dus: zacht ambient licht
plus één richtingslicht, geen harde schaduwen, geen post-processing die
contrast opvoert. Te veel licht platst de ingebakken gradiënt en de wereld
wordt vlak; te weinig en het facetten-effect verdwijnt.

**Camera.** De 1×1-modulariteit en de gedrongen proporties werken het best in
een licht getilte, semi-isometrische camera op enige afstand — dan lees je het
silhouet, wat deze stijl draagt. Close-ups laten zien dat er geen detail ís.

**Nieuwe assets.** Een nieuw model hoort: op het 1×1-raster te passen, pivot
onderkant-midden, harde normalen, en zijn kleur uit een **bestaande** paletcel
te prikken. Een nieuwe cel toevoegen kan (er zijn 43 lege cellen), maar dan wel
mét gradiënt en met een aantekening in `palet.json` — anders breekt de
samenhang die de kits nu gratis geven.

**2D-oefenview.** De oefeningen zijn 2D, maar mogen niet als een andere app
aanvoelen. De brug is het palet: gebruik dezelfde hex-waarden voor achtergrond,
kaders en knoppen, houd de accentkleuren (`#ffb349`, `#e76047`, `#ff8744`) voor
feedback en beloning, en vermijd verlopen en schaduwen die in 3D ook niet
bestaan. Vlakke kleurvlakken met harde randen sluiten naadloos aan.

**Licentie.** De kits zijn van Kenney (CC0), zie `LICENSE.txt` per kit.
Vermelding is niet verplicht maar wel netjes.
