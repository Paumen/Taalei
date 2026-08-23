# Houtassets — renderoverzicht

Renders van alle losse houtassets in de kits: hout(stapel), brandhout, logs,
kampvuur, timber, planken, pallet, timber stack, takken en wortels.

Gemaakt met:

```
node tools/vergelijk-groottes/render.mjs tools/vergelijk-groottes/hout.json docs/asset_review_hout
```

De groepsindeling staat in `tools/vergelijk-groottes/hout.json`. Elke render toont
de meetlat van 1 unit links, de hoogte per asset in het label, en per groep een
paar `REF`-assets ter schaalvergelijking.

## De renders

| Render | Assets |
| --- | --- |
| `hout-logs-1.png` | natuur `log-1` t/m `log-5` |
| `hout-logs-2.png` | quaternius-nature `log`, `log-moss`; castle `tree-log`; survival `tree-log`, `tree-log-small` |
| `hout-logs-3.png` | resources `wood-log-a`, `wood-log-b`, `wood-log-stack` |
| `hout-timber-1.png` | natuur `timber-whole-1`, `timber-cut-1` t/m `-3` |
| `hout-timber-2.png` | natuur `timber-cut-4`, `timber-stack-1`, `timber-stack-2` |
| `hout-planken-1.png` | resources `wood-plank-a/b/c`, `planks-stack-small/medium/large` |
| `hout-planken-2.png` | survival `resource-planks`, pirate `platform-planks`, town `planks`, `planks-half`, `planks-opening` |
| `hout-stapel-pallet.png` | hilly `camp-wood-pile`, props `firewood-a`, resources `pallet-wood`, graveyard `debris-wood` |
| `hout-kampvuur-1.png` | natuur `campfire-star`, `campfire-teepee`, hilly `camp-campfire`, survival `campfire-pit` |
| `hout-kampvuur-2.png` | survival `campfire-stand`, `campfire-fishing-stand` |
| `hout-takken-1.png` | natuur `branch-1` t/m `-3`, nature `branch-a` |
| `hout-takken-2.png` | hilly `branch-a`, `branch-b`, `branch-c` |
| `hout-wortels-1.png` | natuur `root-1` t/m `root-4` |
| `hout-wortels-2.png` | natuur `root-5`, `root-6` |

Buiten scope gelaten: bouwkundig hout (houten muren, vloeren, trappen, balken,
palen, relingen) uit fantasy-town-kit, village-kit, dungeon en mini-dungeon.
Dat zijn bouwstukken, geen losse houtprops. Zeg het als die er ook bij moeten.

## Wat de renders laten zien

**Twee houtpaletten naast elkaar.** natuur, quaternius-nature en
modulair-terrein/hilly gebruiken grijsbruin (`#8f785b`, `#88796d`);
resources, survival-kit, fantasy-town-kit, castle-kit en pirate-kit gebruiken
warm oranje (`#d07b56`, `#dd9f79`, `#995a41`). In `hout-logs-1` t/m `-3` staan
die twee families naast elkaar en ze lezen als twee verschillende soorten hout.

**Schaal loopt ver uiteen bij logs.** natuur `log-1` t/m `log-5` zijn 0,25–0,35
hoog; quaternius `log` en `log-moss` zijn 0,69–0,75 hoog en ruim 2,6 units lang;
survival `tree-log` is 0,50 en 1,8 lang. Dat zijn drie verschillende maten voor
hetzelfde begrip "log".

**Shading.** De natuur-assets (logs, takken, wortels, stumps) renderen glad
geshadeerd — ronde, zachte vormen zonder zichtbare facetten. De kit-assets
(resources, survival, town) zijn wel duidelijk facetted. Zie het verschil tussen
`hout-logs-1.png` en `hout-logs-3.png`.

**Wortels staan rechtop.** `root-3` t/m `root-6` zijn 0,63 / 0,69 / 0,81 / 1,05
hoog: staande punten, geen liggende wortels. Alleen `root-1` en `root-2` liggen
laag (0,23 / 0,24). Alle zes hebben 80 driehoeken en dezelfde kleur.

**Timber is erg plat.** `timber-whole-1` en `timber-cut-1` t/m `-4` zijn 0,05–0,09
hoog bij ~0,42 lang; ze lezen als latjes, niet als balken.

**Twee assets met identieke geometrie.** survival `tree-log` en `tree-log-small`
hebben allebei 88 driehoeken en dezelfde footprint (0,449 × 0,499); alleen de
lengte verschilt (1,8 tegen 1,17).

**Boven het driehoekenbudget** (1000 per unit, uit de style guide):
`resources/wood-log-stack` 3576, `natuur/timber-stack-2` 1460,
`resources/wood-planks-stack-large` 1176.

**Groepsindeling in de catalogus valt op:** kampvuren, `camp-wood-pile` en
`firewood-a` zitten in groep `eten`; `graveyard/debris-wood` zit in `rotsen`.
