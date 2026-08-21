# Kleurmap-review: de huidige colormap naast het voorstel

`kits/colormap.png` is ongewijzigd — het voorstel is **niet** toegepast. Het
staat als `tools/vergelijk-kleurmap/colormap-v2.png` naast de repo, met de atlas
zoals hij binnenkwam ernaast als `colormap-v2-aangeleverd.png`. Alle drie delen
hetzelfde raster van 16 × 4 cellen, dus de UV's van de modellen blijven waar ze
staan en alleen de textuur wisselt.

De cijfers hieronder gelden voor `kits/palet.json` zoals het nu is, na het
herstel van de kleurglitches in de dungeon-, resources- en rpgtools-kits. Draai
`node tools/build-catalog.mjs` en daarna de scripts hieronder opnieuw als er aan
de kits of aan het palet iets verandert; de tabellen verschuiven mee.

## Hoe het voorstel is opgebouwd

`bouw-kandidaat.mjs` leidt het af uit de aangeleverde atlas, met
`kits/colormap.png` als ijkpunt voor hoe de banen lopen:

```
node tools/vergelijk-kleurmap/bouw-kandidaat.mjs
```

1. **Cel 5,0 is de houtbaan.** De aangeleverde atlas zette hem op dezelfde rode
   baan als het dak en het vuur, waardoor boomstammen, planken, trappen en
   scheepsrompen rood werden. Hij draagt nu een eigen houttoon.
2. **De cellen 3,1 en 4,1 dragen de graspollen** en staan allebei op de baan die
   cel 3,1 in `kits/colormap.png` heeft: `#8daa49 → #4e701e`.
3. **Cellen met dezelfde kleur delen één baan**, en twee families gaan samen:
   de twee donkerste banen (8,0 bij 10,0 en 6,1) en het gebroken wit met het
   zand (5,2 en 5,3). Bij zo'n samenvoeging wordt de kleurtoon het gewogen
   midden van de twee, naar hoeveel modellen elke kant meebrengt.
4. **Elke familie krijgt de lichtheid terug van de cellen die hij vervangt** —
   zowel het midden als het verval, gewogen naar hoeveel modellen een cel
   gebruiken. Zonder die correctie wordt het palet als geheel donkerder, en
   verkleurt een cel als 13,0 — die het kaarsvet en het tafelgoed licht houdt —
   naar bruin.

De baan zelf loopt door OKLab in plaats van rechttoe rechtaan door sRGB: de
lichtheid loopt gelijkmatig en naar de schaduw toe wordt de kleur iets
verzadigder, zoals verf zich gedraagt.

## Wat er nog niet klopt

Het samenvoegen van cel 8,0 met de donkere grijzen is te goedkoop beoordeeld.
De maat was "hoeveel modellen dragen beide cellen" — vijf — maar die maat telt
alleen wat een model *verliest*. Cel 8,0 is nu een donker roodbruin dat op een
fles of een vuurkorf leest als schaduw van het bruin ernaast; in de donkere
familie wordt het een grijsgroen, en dan leest hetzelfde vlak als een ander
materiaal. Die 58 modellen op cel 8,0 zien de kleur dus niet samenvallen met een
andere kleur die ze al dragen — ze zien hem van kleurtoon veranderen, en dat is
precies wat de maat niet ziet.

Een volgende poging moet families dus niet alleen op gedeelde modellen wegen
maar ook op kleurtoon: een roodbruin hoort niet bij een grijs, hoe donker ze
allebei ook zijn.

## De bladen

`tools/vergelijk-kleurmap/` zet props twee keer neer: links de atlas die de kit
nu meedraagt, rechts hetzelfde model met het voorstel. Dat tweede gebeurt zonder
iets in `kits/` aan te raken — de renderer serveert elk verzoek onder
`/voorstel/` naar dezelfde bestanden, behalve `Textures/colormap.png`, waar
`colormap-v2.png` teruggaat.

Elke tegel wordt geschoten met dezelfde `<model-viewer>` als `kits/catalog.js`
gebruikt: `environment-image="kits/omgeving.hdr"`, `exposure="1.25"`, dezelfde
schaduw en dezelfde `camera-orbit`. Dat is de hele bedoeling — een oordeel over
een kleur moet gaan over de kleur zoals hij in de catalogus verschijnt. Een
eigen scène met eigen belichting laat dezelfde atlas er heel anders uitzien.

Twee bladen, elk met veertig props en zonder overlap:
[props-vergelijking.png](kleurmap_review/props-vergelijking.png) en
[props-vergelijking-b.png](kleurmap_review/props-vergelijking-b.png).

```
NODE_PATH=$(npm root -g) node tools/vergelijk-kleurmap/render.mjs
```

Zonder argument komen beide bladen langs; met een naam erachter alleen dat blad,
bijvoorbeeld `... render.mjs props-vergelijking-b`.

De lijsten staan in `props.json` en `props-b.json`. Elk van de twee is zo gekozen
dat de veertig samen elke cel raken die de kits met het gedeelde palet gebruiken,
en dat ze over de groepen van de catalogus verdeeld liggen. De twee lijsten delen
geen enkel model, dus samen laten ze tachtig verschillende props zien.

## De families en hun baan

Dertien banen over 28 gevulde cellen. Dit is de tabel die `bouw-kandidaat.mjs`
zelf afdrukt: per familie hoeveel modellen de cellen samen dragen, en het midden
en het verval die de familie uit de oude atlas terugkrijgt.

| familie | cellen | modellen | midden L\* | verval ΔL\* | baan |
| --- | --- | ---: | ---: | ---: | --- |
| `#ffd37a→#d99a34` | 2,0 · 6,0 | 43 | 79,7 | 14,5 | `#ffd280 → #e2a633` |
| `#e06b52→#a33a2c` | 3,0 · 7,0 · 9,0 · 9,1 | 51 | 53,0 | 10,7 | `#cf6b59 → #bd412e` |
| `#d0a26b→#997040` | 4,0 · 13,0 | 114 | 70,6 | 20,1 | `#e9c091 → #b8884d` |
| hout | 5,0 | 242 | 60,1 | 21,2 | `#d3a273 → #a16729` |
| `#4a453d→#2a2721` | 10,0 · 6,1 · 8,0 | 208 | 30,5 | 10,7 | `#5c5247 → #463a2c` |
| `#b08a5c→#7c5734` | 12,0 · 14,0 | 481 | 49,3 | 23,6 | `#af8c68 → #764e20` |
| `#3e8748→#1f4d2a` | 1,1 · 2,1 · 5,1 | 61 | 56,2 | 22,9 | `#7fb585 → #377b43` |
| `#3b94af→#1c5c73` | 2,2 · 4,2 | 12 | 46,9 | 35,3 | `#68a8bf → #004f69` |
| `#a6b4bf→#6a7986` | 3,2 · 15,3 | 349 | 55,3 | 23,4 | `#98a5b0 → #5b6976` |
| `#fbf8ef→#dfd8c7` | 5,2 · 5,3 | 151 | 92,8 | 15,4 | `#ffffef → #dbd4c0` |
| `#bce4f2→#7fbfda` | 6,2 · 7,2 | 0 | — | — | onveranderd |
| `#a39a8d→#6f675c` | 14,3 | 205 | 51,9 | 24,8 | `#a39b90 → #655c4f` |

De graspollen staan niet in de tabel: cel 3,1 en 4,1 dragen de baan van 3,1 uit
`kits/colormap.png` en worden niet herrekend. Met die baan erbij zijn het er
dertien. Cel 4,1 was vlak `#228b22` en draagt nu diezelfde baan; dat is de
grasvloer en de graspol.

Twee dingen om te weten bij die middeling:

- Een cel die vlak was en in een familie zit met een steile cel, is niet meer
  vlak. Dat geldt voor 2,0, 4,0, 9,0 en 2,2. Samen dragen die vier cellen acht
  modellen, dus wat er verandert blijft klein.
- De houtbaan van cel 5,0 staat op afstand 83 van de bruine familie (12,0 en
  14,0). Bij een ruime opvatting van "dezelfde kleur" zouden die samen één
  familie zijn; ze staan los, want juist dat verschil houdt de treden en het
  frame van de houten trap uit elkaar.

## Steilheid van de banen

| ΔL\* over de baan | mediaan | gemiddeld | spreiding | laagste | hoogste | vlak (< 1) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| voor | 13,6 | 14,6 | 10,5 | −1,9 | 38,5 | 4 van 26 |
| zoals aangeleverd | 19,4 | 18,8 | 2,9 | 11,1 | 22,5 | 0 van 28 |
| nu | 20,0 | 18,8 | 6,8 | 10,2 | 34,6 | 0 van 28 |

De aangeleverde atlas gaf elke baan ongeveer hetzelfde verval, rond 19 in L\*,
ook waar de oude atlas vlak was of juist heel steil. De spreiding komt nu weer in
de buurt van die van daarvoor, omdat elke familie het verval van zijn eigen
cellen terugkrijgt; helemaal gelijk wordt het niet, want binnen een familie
vallen de uitschieters tegen elkaar weg. De banen lopen bovendien vrijwel recht
in waargenomen lichtheid: de grootste afwijking van een rechte lijn in L\* is
0,8, tegen 4,4 daarvoor.

## Wat het palet kost

Het is geen kleurcorrectie maar een kleinere set: 23 kleurfamilies worden er 13
(bij een drempel van 45 redmean op de middenkleur). Van de 1008 modellen met het
gedeelde palet zijn er **99** waarin twee duidelijk verschillende kleuren
(afstand > 60 volgens dezelfde redmean-formule die `tools/kleurmap.mjs` gebruikt)
nu praktisch samenvallen (afstand < 12). Op de bladen is dat te zien bij de kist
— de banden en het hout lopen in elkaar over — en bij de kratten en tonnen uit de
dungeon-kit.

## Cel voor cel

`modellen` telt hoeveel van de 1008 modellen met het gedeelde palet de cel
aanraken; `afstand` is de gemiddelde redmean-afstand tussen de boven- en
onderkleur van beide banen.

| cel | voor (boven → onder) | nu | modellen | afstand |
| --- | --- | --- | ---: | ---: |
| 2,0 | #fde675 → #fbf02d | #ffd280 → #e2a633 | 4 | 99 |
| 3,0 | #f39ac2 → #e05c7a | #cf6b59 → #bd412e | 2 | 164 |
| 4,0 | #f1976c → #f1976c | #e9c091 → #b8884d | 2 | 105 |
| 5,0 | #f0976c → #b06041 | #d3a273 → #a16729 | 238 | 51 |
| 6,0 | #ffd566 → #ff922d | #ffd280 → #e2a633 | 39 | 51 |
| 7,0 | #c94d33 → #9b3440 | #cf6b59 → #bd412e | 30 | 75 |
| 8,0 | #934431 → #6c2e1e | #5c5247 → #463a2c | 58 | 82 |
| 9,0 | #930909 → #930909 | #cf6b59 → #bd412e | 1 | 197 |
| 10,0 | #474752 → #343437 | #5c5247 → #463a2c | 61 | 39 |
| 12,0 | #b06041 → #825442 | #af8c68 → #764e20 | 177 | 82 |
| 13,0 | #f2bf99 → #c88159 | #e9c091 → #b8884d | 111 | 27 |
| 14,0 | #bca176 → #625040 | #af8c68 → #764e20 | 302 | 56 |
| 1,1 | #206734 → #254525 | #7fb585 → #377b43 | 11 | 186 |
| 2,1 | #8bca86 → #4da18a | #7fb585 → #377b43 | 1 | 95 |
| 3,1 | #8daa49 → #4e701e | #8daa49 → #4e701e | 21 | 0 |
| 4,1 | #228b22 → #228b22 | #8daa49 → #4e701e | 60 | 136 |
| 5,1 | #60ca8b → #198268 | #7fb585 → #377b43 | 49 | 71 |
| 6,1 | #545867 → #3a3d48 | #5c5247 → #463a2c | 86 | 52 |
| 9,1 | #ff9c44 → #ff7244 | #cf6b59 → #bd412e | 18 | 142 |
| 2,2 | #0070df → #0070df | #68a8bf → #004f69 | 1 | 206 |
| 3,2 | #c5cef7 → #757a93 | #98a5b0 → #5b6976 | 117 | 112 |
| 4,2 | #29abe2 → #1f3c85 | #68a8bf → #004f69 | 11 | 94 |
| 5,2 | #fffff9 → #d3cdce | #ffffef → #dbd4c0 | 127 | 21 |
| 6,2 | leeg | #bce4f2 → #7fbfda | 0 | — |
| 7,2 | leeg | #bce4f2 → #7fbfda | 0 | — |
| 5,3 | #f1d0b2 → #efba88 | #ffffef → #dbd4c0 | 22 | 116 |
| 14,3 | #a9988b → #675a50 | #a39b90 → #655c4f | 205 | 10 |
| 15,3 | #868ba1 → #565b73 | #98a5b0 → #5b6976 | 226 | 47 |
