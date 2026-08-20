# Kleurmap-review: huidige colormap naast atlas v2

`tools/vergelijk-kleurmap/` zet veertig props twee keer neer: één keer met de atlas
die de kits nu meedragen (`kits/colormap.png`) en één keer met de kandidaat
`tools/vergelijk-kleurmap/colormap-v2.png`. Model, licht en camera zijn per paar
identiek — alleen de textuur verschilt, want beide atlassen hebben hetzelfde
raster van 16 × 4 cellen en de UV's blijven waar ze staan.

Het blad staat in [kleurmap_review/props-vergelijking.png](kleurmap_review/props-vergelijking.png).

Opnieuw maken vanuit de repo-root:

```
NODE_PATH=$(npm root -g) node tools/vergelijk-kleurmap/render.mjs
```

## Keuze van de veertig

De props in `tools/vergelijk-kleurmap/props.json` zijn zo gekozen dat ze samen
elke cel raken die de kits met het gedeelde palet gebruiken — 23 van de 23 — en
dat ze over de groepen van de catalogus verdeeld liggen: bouwwerken, schepen,
opslag, huisraad, licht, eten, gereedschap, grondstoffen, bomen, planten,
rotsen en verbindingen. Een kleurwissel landt zo altijd op iets herkenbaars.

## Wat er verandert

Atlas v2 is geen kleurcorrectie maar een kleinere set. De huidige atlas heeft
26 gevulde cellen met 26 verschillende kleurbanen; v2 heeft er 28 gevuld, maar
daar staan nog maar **14 verschillende banen** in. Tien banen dekken meerdere
cellen af:

| baan in v2 | cellen die erop uitkomen |
| --- | --- |
| `#df6a51 → #a43b2d` (rood) | 3,0 · 5,0 · 7,0 · 9,0 · 9,1 |
| `#3e8648 → #1f4e2a` (donkergroen) | 1,1 · 2,1 · 5,1 |
| `#fed279 → #da9b35` (amber) | 2,0 · 6,0 |
| `#cfa16a → #9a7141` (licht hout) | 4,0 · 13,0 |
| `#af895b → #7d5835` (hout) | 12,0 · 14,0 |
| `#49453d → #2b2721` (donker) | 10,0 · 6,1 |
| `#95c859 → #5f9231` (grasgroen) | 3,1 · 4,1 |
| `#3b93ae → #1c5d74` (blauwgroen) | 2,2 · 4,2 |
| `#a5b3be → #6b7a87` (blauwgrijs) | 3,2 · 15,3 |
| `#bbe3f2 → #80c0da` (lichtblauw, nieuw) | 6,2 · 7,2 |

De cellen 6,2 en 7,2 zijn in de huidige atlas leeg; v2 zet daar een lichtblauwe
baan neer waar nog geen enkel model naar wijst.

Het samenvoegen kost onderscheid binnen een model. Van de 1019 modellen met het
gedeelde palet zijn er **170** waarin twee duidelijk verschillende kleuren
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
| 2,0 | #fde674 → #fbf02e | #fed279 → #da9b35 | 4 | 110 |
| 3,0 | #f399c1 → #e05d7b | #df6a51 → #a43b2d | 0 | 179 |
| 4,0 | #f1976c → #f1976c | #cfa16a → #9a7141 | 4 | 118 |
| 5,0 | #ef966b → #b16142 | #df6a51 → #a43b2d | 270 | 92 |
| 6,0 | #ffd465 → #ff932d | #fed279 → #da9b35 | 40 | 47 |
| 7,0 | #c84d33 → #9c3440 | #df6a51 → #a43b2d | 43 | 59 |
| 8,0 | #924431 → #6d2e1e | #845f3f → #503620 | 105 | 55 |
| 9,0 | #930909 → #930909 | #df6a51 → #a43b2d | 0 | 186 |
| 10,0 | #474751 → #343438 | #49453d → #2b2721 | 95 | 41 |
| 12,0 | #af6041 → #835442 | #af895b → #7d5835 | 199 | 58 |
| 13,0 | #f1be98 → #c8825a | #cfa16a → #9a7141 | 130 | 98 |
| 14,0 | #bba075 → #635141 | #af895b → #7d5835 | 281 | 55 |
| 1,1 | #206634 → #254625 | #3e8648 → #1f4e2a | 11 | 52 |
| 2,1 | #8ac986 → #4ea28a | #3e8648 → #1f4e2a | 13 | 223 |
| 3,1 | #8ca948 → #4f711f | #95c859 → #5f9231 | 21 | 73 |
| 4,1 | #228b22 → #228b22 | #95c859 → #5f9231 | 60 | 164 |
| 5,1 | #5fc98a → #1a8368 | #3e8648 → #1f4e2a | 57 | 164 |
| 6,1 | #545767 → #3b3d49 | #49453d → #2b2721 | 100 | 82 |
| 9,1 | #ff9c44 → #ff7244 | #df6a51 → #a43b2d | 39 | 153 |
| 2,2 | #0070df → #0070df | #3b93ae → #1c5d74 | 0 | 165 |
| 3,2 | #c4cdf5 → #767c94 | #a5b3be → #6b7a87 | 190 | 69 |
| 4,2 | #29a9e1 → #1f3e86 | #3b93ae → #1c5d74 | 11 | 84 |
| 5,2 | #fffff8 → #d4cece | #fbf7ee → #dfd9c8 | 127 | 26 |
| 6,2 | leeg | #bbe3f2 → #80c0da | 0 | — |
| 7,2 | leeg | #bbe3f2 → #80c0da | 0 | — |
| 5,3 | #f1d0b1 → #efba89 | #f3e6c1 → #ceba89 | 41 | 53 |
| 14,3 | #a8978a → #685b51 | #a2998c → #70685d | 213 | 23 |
| 15,3 | #858aa0 → #565c74 | #a5b3be → #6b7a87 | 228 | 91 |

## Cel 5,0 — de houtbaan die rood werd

Boomstammen, planken, trappen, scheepsrompen en tentstokken staan allemaal op
cel 5,0. In de huidige atlas is dat een warme houtbaan (`#ef966b → #b16142`);
atlas v2 zet die cel op dezelfde rode baan als het dak en het vuur. Om te kunnen
kiezen staan in [kleurmap_review/houtvarianten.png](kleurmap_review/houtvarianten.png)
zestien houtprops met drie houttonen op die cel naast de huidige atlas en v2:

| variant | baan | afstand tot 12,0 en 14,0 | afstand tot 4,0 en 13,0 |
| --- | --- | ---: | ---: |
| a — blokhout | `#af895b → #7d5835` | 0 | 73 |
| b — plankhout | `#cfa16a → #9a7141` | 73 | 0 |
| c — eigen hout | `#dda06a → #7a4f2c` | 58 | 57 |

Bij a en b valt cel 5,0 samen met een houtbaan die er al is; op het blad is dat
te zien aan de houten trap, waar de treden en het frame in a in elkaar overlopen.
Variant c houdt van beide banen genoeg afstand om het onderscheid te bewaren.

Opnieuw maken:

```
NODE_PATH=$(npm root -g) node tools/vergelijk-kleurmap/render.mjs houtvarianten
```
