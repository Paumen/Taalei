# Houtassets — renderoverzicht

Renders van alle losse houtassets in de kits: hout(stapel), brandhout, logs,
kampvuur, timber, planken, pallet, timber stack, takken en wortels. Elke familie
staat in één beeld; wat niet op één rij past loopt door op een volgende rij.

```
node tools/vergelijk-groottes/render.mjs tools/vergelijk-groottes/hout.json docs/asset_review_hout
```

De indeling staat in `tools/vergelijk-groottes/hout.json`. Links staat een meetlat die
meezakt met de familie (1 / 0,5 / 0,25 / 0,1 / 0,05 unit) — kijk dus welk getal eronder
staat. Achter elk label staat de hoogte van het model.

## De families

| Render | Assets | Hoogte |
| --- | ---: | --- |
| `hout-logs.png` | 13 | 0,25 – 0,75 |
| `hout-timber.png` | 7 | 0,05 – 0,29 |
| `hout-planken.png` | 11 | 0,06 – 0,61 |
| `hout-stapel-pallet.png` | 4 | 0,10 – 0,24 |
| `hout-kampvuur.png` | 6 | 0,09 – 0,51 |
| `hout-takken.png` | 7 | 0,04 – 0,28 |
| `hout-wortels.png` | 6 | 0,23 – 1,05 |

Buiten scope gelaten: bouwkundig hout (houten muren, vloeren, trappen, balken,
palen, relingen) uit fantasy-town-kit, village-kit, dungeon en mini-dungeon.
Dat zijn bouwstukken, geen losse houtprops. Zeg het als die er ook bij moeten.

## Wat de renders laten zien

**Twee houtpaletten naast elkaar.** natuur, quaternius-nature en
modulair-terrein/hilly gebruiken grijsbruin (`#8f785b`, `#88796d`);
resources, survival-kit, fantasy-town-kit, castle-kit en pirate-kit gebruiken
warm oranje (`#d07b56`, `#dd9f79`, `#995a41`). In `hout-logs.png` staan die twee
families onder elkaar en ze lezen als twee verschillende soorten hout.

**Schaal loopt ver uiteen bij logs.** natuur `log-1` t/m `log-5` zijn 0,25–0,35
hoog; quaternius `log` en `log-moss` zijn 0,69–0,75 hoog en ruim 2,6 units lang;
survival `tree-log` is 0,50 en 1,8 lang. Dat zijn drie verschillende maten voor
hetzelfde begrip "log".

**Shading.** De natuur-assets (logs, takken, wortels, stronken) renderen glad
geshadeerd — ronde, zachte vormen zonder zichtbare facetten. De kit-assets
(resources, survival, town) zijn wel duidelijk facetted.

**Wortels staan rechtop.** `root-3` t/m `root-6` zijn 0,63 / 0,69 / 0,81 / 1,05
hoog: staande punten, geen liggende wortels. Alleen `root-1` en `root-2` liggen
laag (0,23 / 0,24). Alle zes hebben 80 driehoeken en dezelfde kleur (`#88796d`).

**Timber is erg plat.** `timber-whole-1` en `timber-cut-1` t/m `-4` zijn 0,05–0,09
hoog bij ~0,42 lang; ze lezen als latjes, niet als balken.

**Twee assets met identieke geometrie.** survival `tree-log` en `tree-log-small`
hebben allebei 88 driehoeken en dezelfde footprint (0,449 × 0,499); alleen de
lengte verschilt (1,8 tegen 1,17).

**Boven het driehoekenbudget** (1000 per unit, style guide §4):
`resources/wood-log-stack` 3576, `natuur/timber-stack-2` 1460,
`resources/wood-planks-stack-large` 1176.

**Groepsindeling in de catalogus valt op:** kampvuren, `camp-wood-pile` en
`firewood-a` zitten in groep `eten`; `graveyard/debris-wood` zit in `rotsen`.
