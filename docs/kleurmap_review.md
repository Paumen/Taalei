# Kleurmap-review: de huidige colormap naast de kandidaat

`kits/colormap.png` is ongewijzigd; de kandidaat staat als
`tools/vergelijk-kleurmap/colormap-v2.png` naast de repo. Beide atlassen hebben
hetzelfde raster van 16 × 4 cellen, dus de UV's van de modellen blijven waar ze
staan en alleen de textuur wisselt.

`tools/vergelijk-kleurmap/` zet props twee keer neer: één keer met de atlas die
de kit zelf meedraagt en één keer met de kandidaat. Dat tweede gebeurt zonder
iets in `kits/` aan te raken — de renderer serveert elk verzoek onder `/voorstel/`
naar dezelfde bestanden, behalve `Textures/colormap.png`, waar de kandidaat
teruggaat.

Elke tegel wordt geschoten met dezelfde `<model-viewer>` als `kits/catalog.js`
gebruikt: `environment-image="neutral"`, `exposure="1.05"`, dezelfde schaduw en
dezelfde `camera-orbit`. Dat is de hele bedoeling — een oordeel over een kleur
moet gaan over de kleur zoals hij in de catalogus verschijnt. Een eigen scène met
eigen belichting laat dezelfde atlas er heel anders uitzien.

Er zijn twee bladen, elk met veertig props en zonder overlap:
[props-vergelijking.png](kleurmap_review/props-vergelijking.png) en
[props-vergelijking-b.png](kleurmap_review/props-vergelijking-b.png).

Opnieuw maken vanuit de repo-root:

```
NODE_PATH=$(npm root -g) node tools/vergelijk-kleurmap/render.mjs
```

Zonder argument komen beide bladen langs; met een naam erachter alleen dat blad,
bijvoorbeeld `... render.mjs props-vergelijking-b`.

## Keuze van de props

De lijsten staan in `tools/vergelijk-kleurmap/props.json` en `props-b.json`. Elk
van de twee is zo gekozen dat de veertig samen elke cel raken die de kits met
het gedeelde palet gebruiken — 23 van de 23 — en dat ze over de groepen van de
catalogus verdeeld liggen: bouwwerken, schepen, opslag, huisraad, licht, eten,
gereedschap, grondstoffen, bomen, planten, rotsen en verbindingen. Een
kleurwissel landt zo altijd op iets herkenbaars. De twee lijsten delen geen
enkel model, dus samen laten ze tachtig verschillende props zien.

## Twee aanpassingen aan de aangeleverde atlas

- **Cel 5,0 — de houtbaan.** Boomstammen, planken, trappen, scheepsrompen en
  tentstokken staan op die cel, en de aangeleverde atlas zette hem op dezelfde
  rode baan als het dak en het vuur. De kandidaat draagt daar nu een eigen
  houtbaan, `#dda06a → #7a4f2c`, op 55 afstand van beide bestaande houtbanen
  (redmean, zoals in `tools/kleurmap.mjs`), zodat treden en frame van de houten
  trap uit elkaar blijven.
- **Cellen 3,1 en 4,1 — de graspollen.** Het lichte groen `#96c95a → #5e9130`
  dekte beide cellen; ze staan in de kandidaat weer op het groen dat ze nu
  hebben: 3,1 op `#8daa49 → #4e701e` met verloop, 4,1 vlak op `#228b22`. De
  graspollen zien er dus uit als voorheen.

## Wat de kandidaat doet

Het is geen kleurcorrectie maar een kleinere set. De huidige atlas heeft 26
gevulde cellen met 26 verschillende kleurbanen; de kandidaat heeft er 28 gevuld,
maar daar staan nog maar **16 verschillende banen** in. Negen banen dekken
meerdere cellen af:

| baan in de kandidaat | cellen die erop uitkomen |
| --- | --- |
| `#e06b52 → #a33a2c` (rood) | 3,0 · 7,0 · 9,0 · 9,1 |
| `#3e8748 → #1f4d2a` (donkergroen) | 1,1 · 2,1 · 5,1 |
| `#ffd37a → #d99a34` (amber) | 2,0 · 6,0 |
| `#d0a26b → #997040` (licht hout) | 4,0 · 13,0 |
| `#b08a5c → #7c5734` (hout) | 12,0 · 14,0 |
| `#4a453d → #2a2721` (donker) | 10,0 · 6,1 |
| `#3b94af → #1c5c73` (blauwgroen) | 2,2 · 4,2 |
| `#a6b4bf → #6a7986` (blauwgrijs) | 3,2 · 15,3 |
| `#bce4f2 → #7fbfda` (lichtblauw, nieuw) | 6,2 · 7,2 |

De cellen 6,2 en 7,2 zijn nu leeg; de kandidaat zet daar een lichtblauwe baan
neer waar nog geen enkel model naar wijst.

Het samenvoegen kost onderscheid binnen een model. Van de 1019 modellen met het
gedeelde palet zijn er **152** waarin twee duidelijk verschillende kleuren
(afstand > 60 volgens dezelfde redmean-formule die `tools/kleurmap.mjs` gebruikt)
in de kandidaat praktisch samenvallen (afstand < 12). Op de bladen is dat te zien
bij de kist — de banden en het hout lopen in elkaar over — en bij de kratten en
tonnen uit de dungeon-kit.

Wat de bladen daarnaast laten zien: de hele warme familie van de dungeon-kit —
tonnen, kisten, flessen, bedden, stoelen — staat in de kandidaat op vrijwel
dezelfde okertint. Waar nu terracotta naast blauwgrijs staat, staat er dan tan
naast lichtblauw.

## Cel voor cel

`modellen` telt hoeveel van de 1019 modellen met het gedeelde palet de cel
aanraken; `afstand` is de gemiddelde redmean-afstand tussen de boven- en
onderkleur van beide banen.

| cel | huidig (boven → onder) | kandidaat | modellen | afstand |
| --- | --- | --- | ---: | ---: |
| 2,0 | #fde675 → #fbf02d | #ffd37a → #d99a34 | 4 | 110 |
| 3,0 | #f39ac2 → #e05c7a | #e06b52 → #a33a2c | 0 | 179 |
| 4,0 | #f1976c → #f1976c | #d0a26b → #997040 | 4 | 119 |
| 5,0 | #f0976c → #b06041 | #dda06a → #7a4f2c | 270 | 68 |
| 6,0 | #ffd566 → #ff922d | #ffd37a → #d99a34 | 40 | 48 |
| 7,0 | #c94d33 → #9b3440 | #e06b52 → #a33a2c | 43 | 60 |
| 8,0 | #934431 → #6c2e1e | #85603f → #4f3520 | 105 | 56 |
| 9,0 | #930909 → #930909 | #e06b52 → #a33a2c | 0 | 187 |
| 10,0 | #474752 → #343437 | #4a453d → #2a2721 | 95 | 41 |
| 12,0 | #b06041 → #825442 | #b08a5c → #7c5734 | 199 | 59 |
| 13,0 | #f2bf99 → #c88159 | #d0a26b → #997040 | 130 | 99 |
| 14,0 | #bca176 → #625040 | #b08a5c → #7c5734 | 281 | 55 |
| 1,1 | #206734 → #254525 | #3e8748 → #1f4d2a | 11 | 52 |
| 2,1 | #8bca86 → #4da18a | #3e8748 → #1f4d2a | 13 | 224 |
| 3,1 | #8daa49 → #4e701e | #8daa49 → #4e701e | 21 | 0 |
| 4,1 | #228b22 → #228b22 | #228b22 → #228b22 | 60 | 0 |
| 5,1 | #60ca8b → #198268 | #3e8748 → #1f4d2a | 57 | 165 |
| 6,1 | #545867 → #3a3d48 | #4a453d → #2a2721 | 100 | 81 |
| 9,1 | #ff9c44 → #ff7244 | #e06b52 → #a33a2c | 39 | 154 |
| 2,2 | #0070df → #0070df | #3b94af → #1c5c73 | 0 | 166 |
| 3,2 | #c5cef7 → #757a93 | #a6b4bf → #6a7986 | 190 | 69 |
| 4,2 | #29abe2 → #1f3c85 | #3b94af → #1c5c73 | 11 | 86 |
| 5,2 | #fffff9 → #d3cdce | #fbf8ef → #dfd8c7 | 127 | 26 |
| 6,2 | leeg | #bce4f2 → #7fbfda | 0 | — |
| 7,2 | leeg | #bce4f2 → #7fbfda | 0 | — |
| 5,3 | #f1d0b2 → #efba88 | #f4e7c2 → #cdb988 | 41 | 55 |
| 14,3 | #a9988b → #675a50 | #a39a8d → #6f675c | 213 | 23 |
| 15,3 | #868ba1 → #565b73 | #a6b4bf → #6a7986 | 228 | 91 |
