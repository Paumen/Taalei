# Propfamilies — renderoverzicht

Renders van 21 propfamilies uit de kits, elke familie in één beeld. Wat niet op één
rij past, loopt door op een volgende rij; het beeld wordt zo hoog als nodig. Elke rij
heeft links én rechts een meetlat.

```
node tools/vergelijk-groottes/render.mjs tools/vergelijk-groottes/groepen-props.json docs/asset_review_props
```

De indeling staat in `tools/vergelijk-groottes/groepen-props.json`. De meetlat zakt mee
met de familie (1 / 0,5 / 0,25 / 0,1 / 0,05 unit) zodat kleine props niet wegvallen naast
een lat van een hele unit — kijk dus altijd even welk getal erboven staat. Achter elk
label staat de hoogte van het model.

## Drie kits opnieuw geschaald

Deze renders zijn gemaakt ná een schaalcorrectie van drie kits (zie
`tools/herschaal-kit.mjs`):

| Kit | Factor | Waarom |
| --- | --- | --- |
| dungeon | ×0,714 (÷1,4) | stond op een eigen 0,7/1,4-raster; wandhoogte was 1,40 en vloertegels 0,70 en 1,40. Nu wand 1,00 en tegels 0,50 / 1,00, dus op hetzelfde raster als fantasy-town-kit. |
| fantasy-props | ×0,5 | grootste losse props van alle kits: vat en krat waren 0,90 hoog, drie keer een village-kit-vat. Nu 0,45. |
| quaternius-nature | ×0,5 | mediane hoogte 1,84; de log was 2,67 lang tegen 0,43–1,21 voor de natuur-logs. |

Wat dat opleverde, per familie:

- vaten en kegs liepen van 0,30 tot 1,26 en lopen nu van 0,25 tot 0,64
- kratten en dozen liepen tot 1,16 en lopen nu tot 0,83
- kale en dode bomen liepen van 1,43 tot 4,37 en lopen nu van 0,95 tot 3,81
- gras liep tot 1,20 en loopt nu tot 0,60

Let op: **kleiner maken verhoogt de driehoekendichtheid.** Het budget is 1000 driehoeken
per unit, gemeten over het aantal bezette cellen, dus hetzelfde model in een kleinere
bounding box telt zwaarder. Over de hele catalogus ging het aantal assets boven budget
van 51 naar 69; de 18 nieuwe zijn 15 quaternius-nature-bomen en 3 dungeon-assets.

## De families

| Render | Assets | Hoogte | Kits |
| --- | ---: | --- | ---: |
| `servies-kookgerei.png` | 22 | 0,01 – 0,52 | 6 |
| `paddenstoelen.png` | 8 | 0,07 – 0,29 | 4 |
| `vaten-kegs.png` | 14 | 0,25 – 0,64 | 5 |
| `kisten.png` | 6 | 0,33 – 0,46 | 5 |
| `kratten-dozen.png` | 18 | 0,07 – 0,83 | 7 |
| `flessen-drankjes.png` | 14 | 0,10 – 0,36 | 5 |
| `kruiken-vazen-emmers.png` | 9 | 0,09 – 0,28 | 2 |
| `boeken-rollen.png` | 17 | 0,03 – 0,32 | 3 |
| `kaarten-sleutels.png` | 7 | 0,01 – 0,30 | 3 |
| `kaarsen.png` | 13 | 0,07 – 0,39 | 3 |
| `lantaarns-fakkels.png` | 15 | 0,26 – 1,74 | 7 |
| `ladders.png` | 6 | 0,72 – 2,36 | 4 |
| `trappen.png` | 16 | 1,00 – 1,45 | 3 |
| `hekken.png` | 30 | 0,22 – 1,00 | 5 |
| `bomen.png` | 46 | 1,15 – 7,85 | 11 |
| `bomen-kaal-dood.png` | 41 | 0,95 – 3,81 | 5 |
| `boomstronken.png` | 6 | 0,10 – 0,48 | 3 |
| `bloemen.png` | 23 | 0,14 – 0,53 | 3 |
| `planten-mais-lisdodde-cactus.png` | 25 | 0,18 – 0,99 | 4 |
| `gras.png` | 23 | 0,10 – 0,60 | 6 |
| `zeesterren-schelpen.png` | 9 | 0,01 – 0,02 | 2 |

Kransen (wreath) zijn gevraagd maar bestaan niet in de kits — geen enkel model heeft
`wreath` of `krans` in de naam. Kaarten zijn maar twee stuks (`rpgtools/map-empty`,
`rpgtools/map-rolled`) en staan samen met de sleutels in één beeld.

## Wat blijft staan na de schaalcorrectie

**Boven het driehoekenbudget** (1000 per unit, style guide §4) staan binnen deze
21 families 33 assets. De zwaarste:

| Familie | Asset | per unit |
| --- | --- | ---: |
| kratten-dozen | `fantasy-props/crate-metal` | 2738 |
| vaten-kegs | `fantasy-props/barrel-holder` | 2676 |
| vaten-kegs | `fantasy-props/barrel-apples` | 2480 |
| bomen-kaal-dood | `quaternius-nature/tree-common-dead-snow-1` | 2368 |
| kratten-dozen | `dungeon/box-stacked` | 2173 |
| bomen-kaal-dood | `quaternius-nature/tree-common-dead-1` | 2126 |
| planten | `quaternius-nature/cactus-flower-1` | 2112 |
| vaten-kegs | `dungeon/keg-decorated` | 2058 |
| trappen | `dungeon/stairs-wood-decorated` | 2024 |
| bomen-kaal-dood | `quaternius-nature/tree-common-dead-snow-2` | 1770 |

Tien van de 41 kale/dode bomen zitten er nu boven, allemaal quaternius-nature, en zes
van de planten, waarvan vijf quaternius-cactussen. Die twee groepen zijn de duidelijkste
kandidaten om te vereenvoudigen.

**Paren met hetzelfde driehoekental én dezelfde bounding box** — kandidaten voor
duplicaten of pure hercolorering:

- `restaurant/pan-a` ↔ `pan-b` en `restaurant/pot-a` ↔ `pot-b` (alleen de kleur verschilt: bruin tegen donkerblauw)
- `dungeon/bottle-a-brown` ↔ `bottle-a-labeled-brown`
- `rpgtools/torch` ↔ `torch-burnt`
- `dungeon/stairs-wall-left` ↔ `stairs-wall-right` (gespiegeld, dus terecht)
- `modulair-terrein/hilly-prop-fence-gate-a` ↔ `gate-b`
- `quaternius-nature/tree-stump` ↔ `tree-stump-moss`
- halloween `tree-pine-orange-large/medium/small` ↔ `tree-pine-yellow-…` (drie paren)
- `holiday-kit/tree` ↔ `tree-snow-c`

**Messen zijn nog steeds te groot.** `rpgtools/knife` is 0,52 en `restaurant/knife`
0,40 — een halve wandhoogte, terwijl de borden ernaast 0,03 zijn. Die twee zijn niet
meegeschaald, want hun kits zijn verder wél in de maat.

**Twee kookgerei-paletten.** De restaurant-kit gebruikt donkergrijs/marineblauw
(`#88796d`, `#6d738a`) voor pannen en potten; `mini-dungeon/pot` en de fantasy-props
zijn warm oranje. Naast elkaar lezen ze niet als één keuken.
`fantasy-props/table-plate` is met 0,01 bovendien bijna niet meer te zien en valt met
zijn bijna-zwarte kleur buiten het serviespalet.

**Zeesterren en schelpen zijn vlak.** Alle negen zijn 0,01–0,02 hoog: op de grond
gedrukte schijfjes. Ze staan hier tegen een meetlat van 0,05 unit, anders zijn ze
niet te zien.

**Bomen: de spreiding zit nu bij natuur.** `natuur/tree-pine-6` is 7,85 hoog,
`tree-pine-5` 6,65 en `tree-pine-4` 5,21, terwijl alle andere kits tussen 1,15 en 3,74
blijven. Na het halveren van quaternius is natuur de enige uitschieter nog over.

**Kale en dode bomen komen uit vijf kits met drie stamkleuren:** roestbruin bij forest,
donker grijsbruin bij halloween, natuur en de quaternius willow/common, en wit-grijs bij
de quaternius birch-dead. Naast elkaar lezen die als drie verschillende soorten hout.

**Ladders en hekken zijn nog niet op één maat.** Ladders lopen van 0,72
(`modular-cave-kit`) via 1,00 (`platformer-kit`, `mini-forest`) naar 2,36
(`village-kit/ladder-a`); hekken van 0,38 (modulair-terrein, fantasy-town, platformer)
naar 0,88–0,93 (pirate, survival).

**Gras is de enige familie met één palet:** alleen `#6d8d33` en `#23562c`.
