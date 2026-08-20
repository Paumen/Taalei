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

## Aanpassingen aan de aangeleverde atlas

- **Cel 5,0 — de houtbaan.** Boomstammen, planken, trappen, scheepsrompen en
  tentstokken staan op die cel, en de aangeleverde atlas zette hem op dezelfde
  rode baan als het dak en het vuur. De kandidaat draagt daar nu een eigen
  houtbaan, `#ca9260 → #8e5c34`, zodat treden en frame van de houten trap uit
  elkaar blijven.
- **Cellen 3,1 en 4,1 — de graspollen.** Het lichte groen `#96c95a → #5e9130`
  dekte beide cellen; ze staan in de kandidaat weer op het groen dat ze nu
  hebben: 3,1 op `#8daa49 → #4e701e` met verloop, 4,1 vlak op `#228b22`.
- **Het verval van elke baan.** Elke cel heeft nu hetzelfde verval in lichtheid
  als diezelfde cel in de huidige atlas — zie hieronder.

## Steilheid van de banen

Elke cel is een verticale baan van licht naar donker. Hoe steil die loopt, is te
meten als het verschil in L\* — waargenomen lichtheid — tussen de bovenste en de
onderste pixelrij.

De aangeleverde atlas gaf elke baan ongeveer hetzelfde verval, rond ΔL\* 19–22,
ook waar de huidige atlas vlak is of juist heel steil. Dat is teruggebracht: de
kleur van de kandidaat blijft, maar de lichtheid wordt om het midden van de baan
uitgerekt of ingedrukt tot het verval van de huidige cel. Was de baan vroeger
vlak, dan is hij weer vlak — één kleur, niet twee kleuren op gelijke lichtheid.

| ΔL\* over de baan | mediaan | gemiddeld | spreiding | laagste | hoogste | vlak (< 1) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| huidig | 15,0 | 14,6 | 10,5 | −1,9 | 38,5 | 4 van 26 |
| kandidaat, zoals aangeleverd | 19,4 | 19,0 | 5,4 | 0,0 | 32,9 | 1 van 26 |
| kandidaat, nu | 14,9 | 14,6 | 10,4 | 0,0 | 38,4 | 5 van 26 |

Van de 26 cellen die in allebei gevuld zijn, komen er 24 nu binnen 0,5 ΔL\* van
de huidige baan uit. De twee andere: cel 2,0 liep vroeger de verkeerde kant op
(ΔL\* −1,9, de onderkant lichter dan de bovenkant) en is nu vlak, en cel 5,2
loopt tegen wit aan, waardoor de bovenkant niet verder omhoog kan.

## Wat de kandidaat doet

Het is geen kleurcorrectie maar een kleinere set. Niet in het aantal banen — die
zijn er 27 tegen 26 — maar in het aantal kleurfamilies: cellen die zo dicht bij
elkaar liggen dat ze op het scherm hetzelfde heten. Bij een drempel van 45
(redmean, op de middenkleur van de baan) gaan er 23 families naar 14:

| familie in de kandidaat | cellen |
| --- | --- |
| rood | 3,0 · 7,0 · 9,0 · 9,1 |
| hout | 4,0 · 5,0 · 12,0 · 13,0 · 14,0 |
| donkergroen | 1,1 · 2,1 · 5,1 |
| amber | 2,0 · 6,0 |
| donker | 10,0 · 6,1 |
| blauwgroen | 2,2 · 4,2 |
| blauwgrijs | 3,2 · 15,3 |
| lichtblauw (nieuw) | 6,2 · 7,2 |

De cellen 6,2 en 7,2 zijn nu leeg; de kandidaat zet daar een lichtblauwe baan
neer waar nog geen enkel model naar wijst. Die twee hebben geen oude baan om het
verval van over te nemen en zijn gebleven zoals ze waren.

Het samenvoegen kost onderscheid binnen een model. Van de 1019 modellen met het
gedeelde palet zijn er **148** waarin twee duidelijk verschillende kleuren
(afstand > 60 volgens dezelfde redmean-formule die `tools/kleurmap.mjs` gebruikt)
in de kandidaat praktisch samenvallen (afstand < 12). Op de bladen is dat te zien
bij de kist — de banden en het hout lopen in elkaar over — en bij de kratten en
tonnen uit de dungeon-kit.

## Cel voor cel

`modellen` telt hoeveel van de 1019 modellen met het gedeelde palet de cel
aanraken; `afstand` is de gemiddelde redmean-afstand tussen de boven- en
onderkleur van beide banen.

| cel | huidig (boven → onder) | kandidaat | modellen | afstand |
| --- | --- | --- | ---: | ---: |
| 2,0 | #fde675 → #fbf02d | #ecb657 → #ecb657 | 4 | 121 |
| 3,0 | #f39ac2 → #e05c7a | #da6850 → #a83c2e | 0 | 179 |
| 4,0 | #f1976c → #f1976c | #b48955 → #b48955 | 4 | 112 |
| 5,0 | #f0976c → #b06041 | #ca9260 → #8e5c34 | 270 | 63 |
| 6,0 | #ffd566 → #ff922d | #fbcf78 → #dd9d35 | 40 | 46 |
| 7,0 | #c94d33 → #9b3440 | #d1634c → #b14031 | 43 | 54 |
| 8,0 | #934431 → #6c2e1e | #7a5739 → #5a3d26 | 105 | 50 |
| 9,0 | #930909 → #930909 | #c1523f → #c1523f | 0 | 184 |
| 10,0 | #474752 → #343437 | #444038 → #302d26 | 95 | 39 |
| 12,0 | #b06041 → #825442 | #9f7d53 → #8d633c | 199 | 53 |
| 13,0 | #f2bf99 → #c88159 | #d2a46c → #976f3f | 130 | 99 |
| 14,0 | #bca176 → #625040 | #c49a67 → #69492b | 281 | 34 |
| 1,1 | #206734 → #254525 | #387b41 → #255a32 | 11 | 53 |
| 2,1 | #8bca86 → #4da18a | #3a7e43 → #245630 | 13 | 223 |
| 3,1 | #8daa49 → #4e701e | #8daa49 → #4e701e | 21 | 0 |
| 4,1 | #228b22 → #228b22 | #228b22 → #228b22 | 60 | 0 |
| 5,1 | #60ca8b → #198268 | #418d4b → #1d4927 | 57 | 163 |
| 6,1 | #545867 → #3a3d48 | #48433b → #2d2a23 | 100 | 80 |
| 9,1 | #ff9c44 → #ff7244 | #ca6049 → #b94333 | 39 | 152 |
| 2,2 | #0070df → #0070df | #2b7891 → #2b7891 | 0 | 148 |
| 3,2 | #c5cef7 → #757a93 | #b2c1cc → #606e79 | 190 | 67 |
| 4,2 | #29abe2 → #1f3c85 | #46adcc → #144759 | 11 | 68 |
| 5,2 | #fffff9 → #d3cdce | #fffff7 → #d7d0c0 | 127 | 13 |
| 6,2 | leeg | #bce4f2 → #7fbfda | 0 | — |
| 7,2 | leeg | #bce4f2 → #7fbfda | 0 | — |
| 5,3 | #f1d0b2 → #efba88 | #e6d9b6 → #dcc692 | 41 | 35 |
| 14,3 | #a9988b → #675a50 | #aaa093 → #696157 | 213 | 19 |
| 15,3 | #868ba1 → #565b73 | #a2afba → #6e7e8b | 228 | 91 |
