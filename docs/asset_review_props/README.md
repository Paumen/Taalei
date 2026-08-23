# Propfamilies — renderoverzicht

Renders van 22 propfamilies uit de kits, elke familie in één beeld. Wat niet op één
rij past, loopt door op een volgende rij; het beeld wordt zo hoog als nodig. Elke rij
heeft links én rechts een meetlat.

```
node tools/vergelijk-groottes/render.mjs tools/vergelijk-groottes/groepen-props.json docs/asset_review_props
```

Deze beelden zijn een momentopname. In de catalogus zelf staat dezelfde vergelijking
live: **`catalog/schaal.html`** (knop *Schaal* in de kop van de catalogus) laadt de
`.glb`'s in de browser en toont 38 families, dus die klopt ook meteen na een herschaling
of een verwijderde asset. De families daar komen uit `catalog/schaalgroepen.json`, dat
`build-catalog.mjs` afleidt uit de regels in `catalog/tools/schaalgroepen.mjs`.

De indeling staat in `tools/vergelijk-groottes/groepen-props.json`. De meetlat is overal **1 unit**, zodat elk blad dezelfde maatstaf heeft. Daarachter ligt
ruitjespapier met een fijne lijn om de 0,25 unit en een zware om de hele unit, dus je kunt
een hoogte direct aflezen. Elk label heeft de kit op de bovenste regel en het model met
zijn hoogte op de onderste.

## Zes kits opnieuw geschaald

| Kit | Factor | Wat het deed |
| --- | --- | --- |
| dungeon | ×0,714 (÷1,4) | stond op een eigen 0,7/1,4-raster: wand 1,40, vloertegels 0,70 en 1,40. Nu wand 1,00 en tegels 0,50 / 1,00, hetzelfde raster als fantasy-town-kit. |
| fantasy-props | ×0,5 | grootste losse props van alle kits: vat en krat waren 0,90 hoog, drie keer een village-kit-vat. Nu 0,45. |
| quaternius-nature | ×0,5 | mediane hoogte 1,84; de log was 2,67 lang tegen 0,43–1,21 voor de natuur-logs. |
| rpgtools | ×0,7 | mediane hoogte 0,33 → 0,23; het mes ging van 0,52 naar 0,36. |
| survival-kit | ×0,7 | mediane hoogte 0,51 → 0,35. |
| pirate-kit | ×0,8 | mediane hoogte 0,88 → 0,70; de grote schepen van 3,99 naar 3,19. |

De schaal zit in `tools/herschaal-kit.mjs`; voor fantasy-props en quaternius-nature staat
hij ook in het importeer-script, zodat opnieuw importeren hetzelfde oplevert.

**Let op — survival-kit is hiermee verder van het raster af komen te liggen.** Zijn
vloertegels en hekken waren 0,90 × 0,90 (10% onder het 1-unit-raster) en zijn nu
0,63 × 0,63. De losse props en het gereedschap uit die kit staan er beter voor, de
bouwstukken slechter. Terugdraaien kan met `node tools/herschaal-kit.mjs survival-kit 1.4286`.

**Kleiner maken verhoogt de driehoekendichtheid.** Het budget is 1000 driehoeken per
unit, gemeten over het aantal bezette cellen, dus hetzelfde model in een kleinere
bounding box telt zwaarder. Over de hele catalogus staan nu 66 van de 1016 assets boven
budget (was 51 vóór alle schaalcorrecties).

## Vier kits en tien assets verwijderd

Weg als hele kit: **furniture** (11), **holiday-kit** (11), **nature** (3) en
**mini-dungeon** (3) — 28 modellen. Niet alleen `kits/workfiles/`, maar ook hun blok in
`catalog/manifest.js`, hun importeer-scripts, hun kitkleur in `catalog.js` en hun
uitzonderingen in `catalog/tools/semantiek.mjs`. De catalogus telt nu **1016 modellen in
24 kits**.

Daarvoor waren dit al tien losse assets:

| Asset | |
| --- | --- |
| `holiday-kit/rocks-small`, `rocks-medium`, `rocks-large` | |
| `holiday-kit/lantern-hanging` | |
| `quaternius-nature/tree-birch-dead-snow-1` t/m `-5` | |
| `fantasy-props/vase-rubble-medium` | zat boven het driehoekenbudget (1113 per unit) |

Weg uit `kits/workfiles/`, uit `catalog/manifest.js`, uit de importeer-scripts (anders
komen ze bij een volgende import terug) en uit de groepsbestanden van de vergelijk-viewer.
Ook uit `catalog/manifest.js`, uit de importeer-scripts en uit de groepsbestanden van
de vergelijk-viewer — anders komen ze bij een volgende import terug.

## De families

| Render | Assets | Hoogte | Kits |
| --- | ---: | --- | ---: |
| `servies-kookgerei.png` | 21 | 0,01 – 0,40 | 5 |
| `gereedschap.png` | 41 | 0,07 – 0,75 | 6 |
| `paddenstoelen.png` | 8 | 0,07 – 0,29 | 4 |
| `vaten-kegs.png` | 14 | 0,25 – 0,64 | 5 |
| `kisten.png` | 6 | 0,32 – 0,38 | 5 |
| `kratten-dozen.png` | 18 | 0,07 – 0,83 | 7 |
| `flessen-drankjes.png` | 14 | 0,10 – 0,28 | 5 |
| `kruiken-vazen-emmers.png` | 8 | 0,13 – 0,28 | 2 |
| `boeken-rollen.png` | 15 | 0,03 – 0,22 | 2 |
| `kaarten-sleutels.png` | 7 | 0,01 – 0,30 | 3 |
| `kaarsen.png` | 13 | 0,07 – 0,39 | 3 |
| `lantaarns-fakkels.png` | 13 | 0,26 – 1,65 | 6 |
| `ladders.png` | 6 | 0,72 – 2,36 | 4 |
| `trappen.png` | 16 | 1,00 – 1,45 | 3 |
| `hekken.png` | 30 | 0,22 – 1,00 | 5 |
| `bomen.png` | 42 | 1,15 – 7,85 | 10 |
| `bomen-kaal-dood.png` | 35 | 0,95 – 3,81 | 4 |
| `boomstronken.png` | 6 | 0,10 – 0,48 | 3 |
| `bloemen.png` | 23 | 0,14 – 0,53 | 3 |
| `planten-mais-lisdodde-cactus.png` | 25 | 0,18 – 0,99 | 4 |
| `gras.png` | 23 | 0,08 – 0,60 | 6 |
| `zeesterren-schelpen.png` | 9 | 0,01 – 0,02 | 2 |

Kransen (wreath) bestaan niet in de kits — geen enkel model heeft `wreath` of `krans`
in de naam. Kaarten zijn maar twee stuks (`rpgtools/map-empty`, `rpgtools/map-rolled`)
en staan samen met de sleutels in één beeld.

## Gereedschap

41 assets, 0,07 – 0,75 hoog, uit zes kits maar met rpgtools als hoofdleverancier
(28 stuks), aangevuld met survival-kit (8), graveyard-kit (2) en één elk uit
fantasy-props, fantasy-town-kit en pirate-kit.

**Vier werktuigen bestaan meerdere keren.** Een schop komt vier keer voor
(`graveyard-kit/shovel` 0,61, `shovel-dirt` 0,66, `rpgtools/shovel` 0,44,
`survival-kit/tool-shovel` 0,37), een houweel drie keer (`fantasy-props/pickaxe-bronze`
0,60, `rpgtools/pickaxe` 0,39, `survival-kit/tool-pickaxe` 0,30), en bijl en hamer
allebei twee keer. De driehoekentelling verschilt daarbij sterk: `rpgtools/shovel` heeft
810 driehoeken, `survival-kit/tool-shovel` 124 voor hetzelfde gebaar.

**`fantasy-props/pickaxe-bronze` valt uit de toon.** Fel oranje (`#ffb349`) tegenover
het blauwgrijze staal (`#6d738a`, `#9da4c4`) van alle andere werktuigen, en met 0,60 het
op één na hoogste stuk van de familie — het is de enige die niet is meegeschaald.

**Boven het driehoekenbudget** staan vier stuks, alle vier rpgtools en alle vier klein en
plat, waardoor de dichtheid oploopt: `compass-base` 1320, `rope-bundle-a` 1248,
`drafting-compass` 1144, `grindstone` 1114.

## Wat verder opvalt

**Boven het driehoekenbudget** (1000 per unit, style guide §4) staan binnen deze
22 families 34 assets. De zwaarste:

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

Acht van de 36 kale/dode bomen zitten er nog boven, allemaal quaternius-nature, en zes van
de planten, waarvan vijf quaternius-cactussen. Dat blijven de duidelijkste kandidaten om
te vereenvoudigen.

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

**Messen staan er nu beter voor.** `rpgtools/knife` is met de kit meegeschaald en nu 0,36
in plaats van 0,52. `restaurant/knife` staat nog op 0,40, naast borden van 0,03 uit
dezelfde kit — dat is nu de scherpste maatafwijking die over is.

**Twee kookgerei-paletten.** De restaurant-kit gebruikt donkergrijs/marineblauw
(`#88796d`, `#6d738a`) voor pannen en potten; `mini-dungeon/pot` en de fantasy-props
zijn warm oranje. Naast elkaar lezen ze niet als één keuken.
`fantasy-props/table-plate` is met 0,01 bovendien bijna niet meer te zien en valt met
zijn bijna-zwarte kleur buiten het serviespalet.

**Zeesterren en schelpen zijn vlak.** Alle negen zijn 0,01–0,02 hoog: op de grond
gedrukte schijfjes. Daarom staat die familie **van boven** in beeld — van opzij zie je
niets. Het getal achter het label is daar dan ook de diepte (`d=`), niet de hoogte.

**Bomen: de spreiding zit bij natuur.** `natuur/tree-pine-6` is 7,85 hoog,
`tree-pine-5` 6,65 en `tree-pine-4` 5,21, terwijl alle andere kits tussen 1,15 en 3,74
blijven. Na het halveren van quaternius is natuur de enige uitschieter nog over.

**Kale en dode bomen komen uit vijf kits met drie stamkleuren:** roestbruin bij forest,
donker grijsbruin bij halloween, natuur en de quaternius willow/common, en wit-grijs bij
de quaternius birch-dead.

**Ladders en hekken zijn nog niet op één maat.** Ladders lopen van 0,72
(`modular-cave-kit`) via 1,00 (`platformer-kit`, `mini-forest`) naar 2,36
(`village-kit/ladder-a`); hekken van 0,22 tot 1,00.

**Gras is de enige familie met één palet:** alleen `#6d8d33` en `#23562c`.
