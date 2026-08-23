# Propfamilies — renderoverzicht

Renders van 21 propfamilies uit de kits, elke familie in één beeld. Wat niet op één
rij past, loopt door op een volgende rij; het beeld wordt zo hoog als nodig.

```
node tools/vergelijk-groottes/render.mjs tools/vergelijk-groottes/groepen-props.json docs/asset_review_props
```

De indeling staat in `tools/vergelijk-groottes/groepen-props.json`. Links in elk beeld
staat een meetlat; die zakt mee met de familie (1 / 0,5 / 0,25 / 0,1 / 0,05 unit) zodat
kleine props niet wegvallen naast een lat van een hele unit — kijk dus altijd even welk
getal eronder staat. Achter elk label staat de hoogte van het model.

## De families

| Render | Assets | Hoogte | Kits |
| --- | ---: | --- | ---: |
| `servies-kookgerei.png` | 22 | 0,02 – 0,52 | 6 |
| `paddenstoelen.png` | 8 | 0,07 – 0,29 | 4 |
| `vaten-kegs.png` | 14 | 0,30 – 1,26 | 5 |
| `kisten.png` | 6 | 0,37 – 0,46 | 5 |
| `kratten-dozen.png` | 18 | 0,07 – 1,16 | 7 |
| `flessen-drankjes.png` | 14 | 0,12 – 0,36 | 5 |
| `kruiken-vazen-emmers.png` | 9 | 0,13 – 0,52 | 2 |
| `boeken-rollen.png` | 17 | 0,06 – 0,32 | 3 |
| `kaarten-sleutels.png` | 7 | 0,01 – 0,43 | 3 |
| `kaarsen.png` | 13 | 0,13 – 0,39 | 3 |
| `lantaarns-fakkels.png` | 15 | 0,36 – 1,74 | 7 |
| `ladders.png` | 6 | 0,72 – 2,36 | 4 |
| `trappen.png` | 16 | 1,00 – 1,78 | 3 |
| `hekken.png` | 30 | 0,22 – 1,00 | 5 |
| `bomen.png` | 46 | 1,15 – 7,85 | 11 |
| `bomen-kaal-dood.png` | 41 | 1,43 – 4,37 | 5 |
| `boomstronken.png` | 6 | 0,10 – 0,62 | 3 |
| `bloemen.png` | 23 | 0,14 – 0,53 | 3 |
| `planten-mais-lisdodde-cactus.png` | 25 | 0,25 – 1,98 | 4 |
| `gras.png` | 23 | 0,10 – 1,20 | 6 |
| `zeesterren-schelpen.png` | 9 | 0,01 – 0,02 | 2 |

Kransen (wreath) zijn gevraagd maar bestaan niet in de kits — geen enkel model heeft
`wreath` of `krans` in de naam. Kaarten en sleutels staan in één beeld; kaarten zijn
maar twee stuks (`rpgtools/map-empty`, `rpgtools/map-rolled`).

## Wat de renders laten zien

**Boven het driehoekenbudget van 1000 per unit** (style guide §4) staan zeventien assets:

| Familie | Asset | per unit |
| --- | --- | ---: |
| kratten-dozen | `fantasy-props/crate-metal` | 2738 |
| vaten-kegs | `fantasy-props/barrel-apples` | 2480 |
| vaten-kegs | `fantasy-props/barrel-holder` | 2114 |
| planten | `quaternius-nature/cactus-flower-1` | 2112 |
| vaten-kegs | `dungeon/keg-decorated` | 2058 |
| kratten-dozen | `fantasy-props/crate-wooden` | 1576 |
| kisten | `dungeon/chest-gold` | 1568 |
| kisten | `tropical/chest-a` | 1506 |
| planten | `tropical/plant-a` | 1456 |
| kaarten-sleutels | `fantasy-props/key-gold` | 1366 |
| kratten-dozen | `dungeon/crates-stacked` | 1331 |
| kratten-dozen | `dungeon/box-stacked` | 1213 |
| kratten-dozen | `restaurant/crate-steak` | 1188 |
| planten | `quaternius-nature/cactus-flower-4` | 1179 |
| vaten-kegs | `dungeon/barrel-small-stack` | 1149 |
| kruiken-vazen-emmers | `fantasy-props/vase-rubble-medium` | 1113 |
| vaten-kegs | `dungeon/barrel-large-decorated` | 1047 |

De fantasy-props-kit springt eruit: drie van de zwaarste vijf komen daaruit.

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

**Servies loopt qua maat uit de pas.** In `servies-kookgerei.png` staat een bord van
0,02 hoog naast `rpgtools/knife` van 0,52 en `restaurant/knife` van 0,40 — die messen
zijn een halve wandhoogte en staan rechtop in beeld, terwijl al het andere serviesgoed
plat op tafelhoogte ligt. `fantasy-props/table-plate` (0,02) is bovendien bijna zwart
en valt daarmee buiten het serviespalet.

**Twee kookgerei-paletten.** De restaurant-kit gebruikt donkergrijs/marineblauw
(`#88796d`, `#6d738a`) voor pannen en potten; `mini-dungeon/pot` en de fantasy-props
zijn warm oranje. Naast elkaar lezen ze niet als één keuken.

**Zeesterren en schelpen zijn vlak.** Alle negen zijn 0,01–0,02 hoog: op de grond
gedrukte schijfjes. Ze staan hier tegen een meetlat van 0,05 unit, anders zijn ze
niet te zien.

**Bomen: de schaalspreiding is groot.** `natuur/tree-pine-6` is 7,85 hoog,
`natuur/tree-pine-5` 6,65 en `natuur/tree-pine-4` 5,21, terwijl de bomen uit
fantasy-town-kit, holiday-kit en modulair-terrein tussen 1,15 en 2,97 blijven.
De natuur-dennen zijn dus twee tot vijf keer zo hoog als de kitbomen.

**Kale en dode bomen zijn één samenhangende set** (41 stuks, 1,43–4,37) maar komen uit
vijf kits met drie duidelijk verschillende stamkleuren: roestbruin bij forest,
donker grijsbruin bij halloween, natuur en de quaternius willow/common, en wit-grijs bij
de quaternius birch-dead. Naast elkaar lezen die als drie verschillende soorten hout.

**Gras is de enige familie met één palet:** alleen `#6d8d33` en `#23562c`. Wel loopt de
hoogte van 0,10 (`pirate-kit/patch-grass`, een platte mat) tot 1,20
(`quaternius-nature/grass-2`, losse sprieten van meer dan een wandhoogte).

**Lantaarns en fakkels dragen fel amber glas** (`#ffb349`, acht assets). Als dat
emissive is, hoort er volgens de style guide §1 een notitie aan de PO bij.

**Hekken is de grootste familie met de laagste driehoekentelling** (30 assets, 14–560
driehoeken) en blijft netjes onder 1 unit hoog.
