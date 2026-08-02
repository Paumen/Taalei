# Stijl van de modellen

Stijl van de 292 `.glb`-modellen in `kits/` (7 kits), afgeleid uit de bestanden
zelf. Referentie voor de Eiland- en Zone-views en toets voor nieuwe assets.

**In één zin:** chunky low-poly speelgoedwereld — harde vlakken zonder
afronding, alles op een 1×1-raster, en géén echte texturen: elk vlak prikt één
kleur uit één gedeeld palet.

## Kerncijfers

| | |
|---|---|
| Modellen | 292 `.glb` over 7 kits, ~125.000 driehoeken |
| Textuur | 1 atlas van 512×512 px, byte-identiek in alle 7 kits |
| Materiaal | 1 (`colormap`), plus `Water` in de fantasy-town-fonteinen |
| Herkomst | Kenney (CC0), geëxporteerd via UnityGLTF; zie `LICENSE.txt` per kit |

## Vorm

- **Harde randen.** Normalen per vlak gesplitst — `chest` heeft 296 vertices op
  96 unieke posities. Niets is gesmoothed; elk vlak vangt zijn eigen licht.
- **Geen bevels of microdetail.** Detail zit in het silhouet en in losse
  onderdelen (`fountain-round` vs `fountain-round-detail`).
- **Speelgoedproporties.** Gedrongen en overdreven dik: kist 0,52 × 0,34,
  krat 0,50 × 0,50, boom 1,1 × 2,8.
- **Vriendelijk, niet kinderachtig.** Wel slijtage (`wall-wood-broken`,
  `ship-wreck`), geen grimmigheid en geen babyvormen — de "not too
  childish"-lijn uit [`brainstorm.md`](../brainstorm.md).
- **1×1-raster, pivot onderkant-midden.** `min.y = 0`, x/z rond nul, muren 0,1
  dik op de tegelrand. Neerzetten en roteren op 90°-stappen kan zonder
  correctie. Grot-kit in veelvouden: 1×1, 2×2, 5×5.

## Kleur: het paletatlas-principe

Het belangrijkste onderdeel van de stijl, en de grootste technische winst.

- De atlas is een raster van **16 × 4 cellen** (32 × 128 px); **21 zijn
  ingekleurd**, de rest is zwart en ongebruikt.
- UV's vallen op **celmiddens** (u = (kolom + 0,5) / 16). Geen patroon, geen
  tiling, geen unwrap — alleen "welke kleur ben ik".
- **Binnen een cel loopt een verticale gradiënt** en modellen prikken op **5
  vaste v-hoogtes**. Kolom 5 gaat van `#f0976c` bovenin naar `#b76746`
  onderin: licht- en schaduwvlakken uit dezelfde kleur. De schaduw zit dus in
  de textuur, niet in de belichting.
- Eén uitzondering: cel `[0,0]` beslaat 4 kolommen en bevat een echte
  rotswandtextuur ([`kits/palet.json`](palet.json), `"drempel": 4`).

| Cel | Kleur | Rol | | Cel | Kleur | Rol |
|---|---|---|---|---|---|---|
| 0–3,0 | `#bc7554` | rotswand (grot) | | 2,1 | `#6cb588` | licht gras |
| 4,0 | `#f1976c` | licht hout | | 3,1 | `#a16d58` | grotsteen licht |
| 5,0 | `#d07b56` | hoofdhout (meest gebruikt) | | 4,1 | `#8a5d4b` | grotsteen donker |
| 6,0 | `#ffb349` | goud: munt, sleutel, ster | | 5,1 | `#3da679` | gebladerte/gras |
| 7,0 | `#e76047` | rood: hart, paddenstoel, doel | | 6,1 | `#474a58` | donker metaal |
| 10,0 | `#3e3e44` | bijna-zwart: kanon, romp | | 9,1 | `#ff8744` | oranje accent |
| 12,0 | `#995a41` | donker hout | | 3,2 | `#9da4c4` | blauwgrijs metaal |
| 13,0 | `#dd9f79` | zand | | 5,2 | `#dcdce9` | wit doek: zeil, vlag |
| | | | | 5,3 | `#f0c59d` | licht doek/hout |
| | | | | 15,3 | `#6d738a` | steengrijs |

Warm palet: aardetinten domineren, koel grijsblauw is de tegenhanger, en
verzadigd geel/rood/oranje is gereserveerd voor *dingen die ertoe doen*.
Die reservering is bruikbaar — taal-items en doelen mogen die accenten lenen,
decor niet.

## Materiaal

Eén `colormap`-materiaal: `metallicFactor 0`, geen roughness-override (mat),
`doubleSided`, geen normal maps, geen emissie. Sampler overal `minFilter 9987`
(LINEAR_MIPMAP_LINEAR), zodat de gradiënt op afstand wordt uitgemiddeld in
plaats van te flikkeren. Enige afwijking is `Water` (blauw `baseColorFactor`,
`alphaMode: BLEND`). Alle 292 modellen delen dus één textuur en één materiaal
en zijn in principe in één batch te renderen — precies wat een browser-game op
een schoollaptop nodig heeft.

## Naamgeving

Basis + modifier met koppeltekens (`wall-wood-corner-diagonal-half`), met
terugkerende modifiers `-corner`, `-half`, `-wide`, `-large`, `-small`,
`-broken`, `-detail`. Varianten op `-a`/`-b`/`-c` (`rock-a/b/c`) zijn bedoeld
om door elkaar te strooien zodat herhaling niet opvalt.
[`kits/manifest.js`](manifest.js) geeft de modellijst per kit met
zone-koppeling; [`kits/palet.json`](palet.json) welk model welke paletcel
gebruikt.

## Budget per kit

| Kit | Modellen | Driehoeken | Gem. | Zwaarste model |
|---|---|---|---|---|
| survival-kit | 50 | 7.125 | 142 | `rock-flat-grass` (758) |
| platformer-kit | 36 | 5.120 | 142 | `crate-strong` (428) |
| mini-dungeon | 21 | 3.744 | 178 | `trap` (408) |
| fantasy-town-kit | 75 | 15.458 | 206 | `fountain-round-detail` (1.628) |
| mini-forest | 20 | 5.390 | 269 | `tent` (847) |
| pirate-kit | 50 | 25.514 | 510 | `ship-wreck` (2.282) |
| modular-cave-kit | 40 | 62.704 | 1.567 | `room-large` (8.080) |

De grot-kit is 14% van de modellen maar **50% van alle driehoeken** — dat
bevestigt de aanpak uit [`brainstorm.md`](../brainstorm.md): grot pas laden en
renderen zodra het kind door de ingang gaat, en dan als enige zone.

## Wat dit betekent voor Taaleiland

- **Belichting.** De schaduw zit al in de gradiënt: zacht ambient plus één
  richtingslicht, geen harde schaduwen, geen contrastverhogende post-processing.
  Te veel licht platst de wereld, te weinig doodt het facetten-effect.
- **Camera.** Licht getilt en semi-isometrisch op afstand — dan lees je het
  silhouet, dat deze stijl draagt. Close-ups tonen dat er geen detail *is*.
- **Nieuwe assets.** Op het raster, pivot onderkant-midden, harde normalen, en
  kleur uit een *bestaande* paletcel. Een nieuwe cel mag (43 zijn leeg), maar
  dan mét gradiënt en genoteerd in `palet.json`.
- **2D-oefenview.** Deel het palet: dezelfde hex-waarden voor achtergrond en
  knoppen, de accenten (`#ffb349`, `#e76047`, `#ff8744`) voor feedback en
  beloning, en geen verlopen of schaduwen die in 3D ook niet bestaan.

## Verantwoording

Cijfers zijn ad hoc uit de `.glb`-bestanden gemeten (JSON-chunk `0x4E4F534A`),
niet uit Kenney's kit-beschrijvingen; bewust geen script, want dit is een
momentopname en geen build-stap. Bij gewijzigde kits opnieuw te controleren:
driehoeken via `accessors[indices].count / 3`; harde randen via vertices versus
unieke posities; raster en pivot via `accessors[POSITION].min`/`.max`;
paletgebruik via de `TEXCOORD_0`-waarden (celmidden + een van de vijf
v-stappen — wijkt een model af, dan sampelt het een ongeschilderde cel en wordt
het zwart, precies het probleem dat de fonteinen hadden); materiaal en sampler
via `materials` en `samplers`; en `md5sum kits/colormap.png
kits/*/Textures/colormap.png` moet één hash geven voor alle acht kopieën.
