# Kleurmap-review: de huidige colormap naast het voorstel

`kits/colormap.png` is ongewijzigd — het voorstel is **niet** toegepast. Het
staat als `tools/vergelijk-kleurmap/colormap-v2.png` naast de repo, met de atlas
zoals hij binnenkwam ernaast als `colormap-v2-aangeleverd.png`. Alle drie delen
hetzelfde raster van 16 × 4 cellen, dus de UV's van de modellen blijven waar ze
staan en alleen de textuur wisselt.

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
3. **Cellen met dezelfde kleur delen één baan**, en een paar families gaan samen:
   de twee donkerste banen (8,0 bij 10,0 en 6,1) en het gebroken wit met het zand
   (5,2 en 5,3). Bij zo'n samenvoeging wordt de kleurtoon het gewogen midden van
   de twee, naar hoeveel modellen elke kant meebrengt.
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
De maat was "hoeveel modellen dragen beide cellen" — 27 — maar die maat telt
alleen wat een model *verliest*. Cel 8,0 is nu een donker roodbruin dat op een
fles of een vuurkorf leest als schaduw van het bruin ernaast; in de donkere
familie wordt het een grijsgroen, en dan leest hetzelfde vlak als een ander
materiaal. Op `dungeon/bottle-c-brown` is dat goed te zien: goudkleurig lijf,
grijsgroen vlak, rode wig ernaast.

Een volgende poging moet families dus niet alleen op gedeelde modellen wegen
maar ook op kleurtoon: een roodbruin hoort niet bij een grijs, hoe donker ze
allebei ook zijn.

## De bladen

`tools/vergelijk-kleurmap/` zet props twee keer neer: één keer met de oude atlas
en één keer met de atlas die de kit nu meedraagt. Dat eerste gebeurt zonder iets
in `kits/` aan te raken — de renderer serveert elk verzoek onder `/voor/` naar
dezelfde bestanden, behalve `Textures/colormap.png`, waar `colormap-v1.png`
teruggaat.

Elke tegel wordt geschoten met dezelfde `<model-viewer>` als `kits/catalog.js`
gebruikt: `environment-image="neutral"`, `exposure="1.05"`, dezelfde schaduw en
dezelfde `camera-orbit`. Dat is de hele bedoeling — een oordeel over een kleur
moet gaan over de kleur zoals hij in de catalogus verschijnt. Een eigen scène met
eigen belichting laat dezelfde atlas er heel anders uitzien.

Twee bladen, elk met veertig props en zonder overlap:
[props-vergelijking.png](kleurmap_review/props-vergelijking.png) en
[props-vergelijking-b.png](kleurmap_review/props-vergelijking-b.png).

```
NODE_PATH=$(npm root -g) node tools/vergelijk-kleurmap/render.mjs
```

Zonder argument komen beide bladen langs; met een naam erachter alleen dat blad,
bijvoorbeeld `... render.mjs props-vergelijking-b`.

De lijsten staan in `props.json` en `props-b.json`. Elk van de twee is zo gekozen
dat de veertig samen elke cel raken die de kits met het gedeelde palet gebruiken
— 23 van de 23 — en dat ze over de groepen van de catalogus verdeeld liggen. De
twee lijsten delen geen enkel model, dus samen laten ze tachtig verschillende
props zien.

## De families en hun baan

Vijftien banen over 28 gevulde cellen. Per familie het verval dat die cellen
vóór de overname hadden, en het gemiddelde daarvan dat de hele familie kreeg.

| familie | cellen | ΔL\* voor, per cel | ΔL\* familie | baan |
| --- | --- | --- | ---: | --- |
| grasgroen | 3,1 · 4,1 | 22,5 · 0,0 | 22,5 | `#8daa49 → #4e701e` |
| hout | 5,0 | 21,2 | 21,2 | `#ca9260 → #8e5c34` |
| amber | 2,0 · 6,0 | −1,9 · 16,0 | 8,0 | `#eec471 → #eba739` |
| rood | 3,0 · 7,0 · 9,0 · 9,1 | 16,6 · 12,0 · 0,0 · 8,5 | 9,3 | `#cc614a → #b74233` |
| licht hout | 4,0 · 13,0 | 0,0 · 20,5 | 10,2 | `#c29763 → #a87b47` |
| donkerbruin | 8,0 | 11,4 | 11,4 | `#7a5739 → #5a3d26` |
| donker | 10,0 · 6,1 | 8,7 · 11,7 | 10,2 | `#46413a → #2e2b25` |
| bruin | 12,0 · 14,0 | 9,1 · 32,2 | 20,7 | `#b18b5d → #7b5633` |
| donkergroen | 1,1 · 2,1 · 5,1 | 12,2 · 15,0 · 25,5 | 17,6 | `#3b8245 → #22532e` |
| blauwgroen | 2,2 · 4,2 | 0,0 · 38,5 | 19,2 | `#3a92ad → #1d5f76` |
| blauwgrijs | 3,2 · 15,3 | 31,7 · 19,1 | 25,4 | `#aab8c3 → #677582` |
| gebroken wit | 5,2 | 17,0 | 17,0 | `#fffff7 → #d7d0c0` |
| zand | 5,3 | 6,3 | 6,3 | `#e6d9b6 → #dcc692` |
| grijsbruin | 14,3 | 24,8 | 24,8 | `#aaa093 → #696157` |
| lichtblauw (nieuw) | 6,2 · 7,2 | _waren leeg_ | — | `#bce4f2 → #7fbfda` |

Cel 4,1 was vlak `#228b22` en draagt nu de baan van 3,1; dat is de grasvloer en
de graspol.

Twee dingen om te weten bij die middeling:

- Een cel die vlak was en in een familie zit met een steile cel, is niet meer
  vlak. Dat geldt voor 2,0, 4,0, 9,0 en 2,2. Van die vier wijzen alleen vier
  modellen naar 4,0; de andere drie worden door geen enkel model gebruikt.
- De houtbaan van cel 5,0 staat op afstand 38 van de bruine familie (12,0 en
  14,0). Bij een ruime opvatting van "dezelfde kleur" zouden die samen één
  familie zijn; ze staan los, want juist dat verschil houdt de treden en het
  frame van de houten trap uit elkaar.

## Steilheid van de banen

| ΔL\* over de baan | mediaan | gemiddeld | spreiding | laagste | hoogste | vlak (< 1) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| voor | 15,0 | 14,6 | 10,5 | −1,9 | 38,5 | 4 van 26 |
| zoals aangeleverd | 19,4 | 19,0 | 5,4 | 0,0 | 32,9 | 1 van 26 |
| nu | 17,5 | 15,5 | 6,1 | 6,4 | 25,5 | 0 van 26 |

De aangeleverde atlas gaf elke baan ongeveer hetzelfde verval, rond 19 in L\*,
ook waar de oude atlas vlak was of juist heel steil. Het gemiddelde ligt nu dicht
bij dat van daarvoor; de spreiding blijft kleiner, omdat een familie één baan
deelt en de uitschieters binnen zo'n familie tegen elkaar wegvallen. De banen
lopen bovendien vrijwel recht in waargenomen lichtheid: de grootste afwijking van
een rechte lijn in L\* is 0,4, tegen 4,4 daarvoor.

## Wat het palet kost

Het is geen kleurcorrectie maar een kleinere set: 23 kleurfamilies worden er 14
(bij een drempel van 45 redmean op de middenkleur). Van de 1019 modellen met het
gedeelde palet zijn er **156** waarin twee duidelijk verschillende kleuren
(afstand > 60 volgens dezelfde redmean-formule die `tools/kleurmap.mjs` gebruikt)
nu praktisch samenvallen (afstand < 12). Op de bladen is dat te zien bij de kist
— de banden en het hout lopen in elkaar over — en bij de kratten en tonnen uit de
dungeon-kit.

## Cel voor cel

`modellen` telt hoeveel van de 1019 modellen met het gedeelde palet de cel
aanraken; `afstand` is de gemiddelde redmean-afstand tussen de boven- en
onderkleur van beide banen.

| cel | voor (boven → onder) | nu | modellen | afstand |
| --- | --- | --- | ---: | ---: |
| 2,0 | #fde675 → #fbf02d | #eec471 → #eba739 | 4 | 111 |
| 3,0 | #f39ac2 → #e05c7a | #cc614a → #b74233 | 0 | 177 |
| 4,0 | #f1976c → #f1976c | #c29763 → #a87b47 | 4 | 113 |
| 5,0 | #f0976c → #b06041 | #ca9260 → #8e5c34 | 270 | 63 |
| 6,0 | #ffd566 → #ff922d | #eec471 → #eba739 | 40 | 52 |
| 7,0 | #c94d33 → #9b3440 | #cc614a → #b74233 | 43 | 55 |
| 8,0 | #934431 → #6c2e1e | #7a5739 → #5a3d26 | 105 | 50 |
| 9,0 | #930909 → #930909 | #cc614a → #b74233 | 0 | 183 |
| 10,0 | #474752 → #343437 | #46413a → #2e2b25 | 95 | 39 |
| 12,0 | #b06041 → #825442 | #b18b5d → #7b5633 | 199 | 61 |
| 13,0 | #f2bf99 → #c88159 | #c29763 → #a87b47 | 130 | 100 |
| 14,0 | #bca176 → #625040 | #b18b5d → #7b5633 | 281 | 53 |
| 1,1 | #206734 → #254525 | #3b8245 → #22532e | 11 | 53 |
| 2,1 | #8bca86 → #4da18a | #3b8245 → #22532e | 13 | 222 |
| 3,1 | #8daa49 → #4e701e | #8daa49 → #4e701e | 21 | 0 |
| 4,1 | #228b22 → #228b22 | #8daa49 → #4e701e | 60 | 136 |
| 5,1 | #60ca8b → #198268 | #3b8245 → #22532e | 57 | 165 |
| 6,1 | #545867 → #3a3d48 | #46413a → #2e2b25 | 100 | 80 |
| 9,1 | #ff9c44 → #ff7244 | #cc614a → #b74233 | 39 | 152 |
| 2,2 | #0070df → #0070df | #3a92ad → #1d5f76 | 0 | 163 |
| 3,2 | #c5cef7 → #757a93 | #aab8c3 → #677582 | 190 | 68 |
| 4,2 | #29abe2 → #1f3c85 | #3a92ad → #1d5f76 | 11 | 90 |
| 5,2 | #fffff9 → #d3cdce | #fffff7 → #d7d0c0 | 127 | 13 |
| 6,2 | leeg | #bce4f2 → #7fbfda | 0 | — |
| 7,2 | leeg | #bce4f2 → #7fbfda | 0 | — |
| 5,3 | #f1d0b2 → #efba88 | #e6d9b6 → #dcc692 | 41 | 35 |
| 14,3 | #a9988b → #675a50 | #aaa093 → #696157 | 213 | 19 |
| 15,3 | #868ba1 → #565b73 | #aab8c3 → #677582 | 228 | 91 |
