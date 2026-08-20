# Kleurmap-review: huidige colormap naast atlas v2

`tools/vergelijk-kleurmap/` zet veertig props twee keer neer: één keer met de atlas
die de kits nu meedragen (`kits/colormap.png`) en één keer met de kandidaat
`tools/vergelijk-kleurmap/colormap-v2.png`. Model, licht en camera zijn per paar
identiek — alleen de textuur verschilt, want beide atlassen hebben hetzelfde
raster van 16 × 4 cellen en de UV's blijven waar ze staan.

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

## Cel 5,0 — de houtbaan

Boomstammen, planken, trappen, scheepsrompen en tentstokken staan allemaal op
cel 5,0. De atlas zoals hij binnenkwam zette die cel op dezelfde rode baan als
het dak en het vuur, waardoor al dat hout rood werd. Die cel draagt nu een eigen
houtbaan: `#dda06a → #7a4f2c`.

Overwogen alternatieven waren de houtbanen die er al staan — `#b08a5c → #7c5734`
van de blokken en kratten (12,0 en 14,0) en `#d0a26b → #997040` van de planken
(4,0 en 13,0). Allebei laten ze cel 5,0 samenvallen met een baan die er al is;
bij de eerste lopen de treden en het frame van de houten trap in elkaar over. De
gekozen baan houdt van allebei afstand — 55 volgens de redmean-formule uit
`tools/kleurmap.mjs` — en blijft in dezelfde houtfamilie.

## Wat er verandert

Atlas v2 is geen kleurcorrectie maar een kleinere set. De huidige atlas heeft
26 gevulde cellen met 26 verschillende kleurbanen; v2 heeft er 28 gevuld, maar
daar staan nog maar **15 verschillende banen** in. Tien banen dekken meerdere
cellen af:

| baan in v2 | cellen die erop uitkomen |
| --- | --- |
| `#e06b52 → #a33a2c` (rood) | 3,0 · 7,0 · 9,0 · 9,1 |
| `#3e8748 → #1f4d2a` (donkergroen) | 1,1 · 2,1 · 5,1 |
| `#ffd37a → #d99a34` (amber) | 2,0 · 6,0 |
| `#d0a26b → #997040` (licht hout) | 4,0 · 13,0 |
| `#b08a5c → #7c5734` (hout) | 12,0 · 14,0 |
| `#4a453d → #2a2721` (donker) | 10,0 · 6,1 |
| `#96c95a → #5e9130` (grasgroen) | 3,1 · 4,1 |
| `#3b94af → #1c5c73` (blauwgroen) | 2,2 · 4,2 |
| `#a6b4bf → #6a7986` (blauwgrijs) | 3,2 · 15,3 |
| `#bce4f2 → #7fbfda` (lichtblauw, nieuw) | 6,2 · 7,2 |

De cellen 6,2 en 7,2 zijn in de huidige atlas leeg; v2 zet daar een lichtblauwe
baan neer waar nog geen enkel model naar wijst.

Het samenvoegen kost onderscheid binnen een model. Van de 1019 modellen met het
gedeelde palet zijn er **152** waarin twee duidelijk verschillende kleuren
(afstand > 60 volgens dezelfde redmean-formule die `tools/kleurmap.mjs` gebruikt)
in v2 praktisch samenvallen (afstand < 12). Op het blad is dat te zien bij de
kist — de banden en het hout lopen in elkaar over — en bij de kratten en tonnen
uit de dungeon-kit.

## Cel voor cel

`modellen` telt hoeveel van de 1019 modellen met het gedeelde palet de cel
aanraken; `afstand` is de gemiddelde redmean-afstand tussen de boven- en
onderkleur van beide banen.

| cel | huidig (boven → onder) | atlas v2 | modellen | afstand |
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
| 3,1 | #8daa49 → #4e701e | #96c95a → #5e9130 | 21 | 73 |
| 4,1 | #228b22 → #228b22 | #96c95a → #5e9130 | 60 | 165 |
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
