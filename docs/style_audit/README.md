# Stijl-audit: uitschieters in de catalogus

Backbone: `facebook/dinov2-base` — pipeline: `tools/style-audit/` (acht neutrale views per asset, per-view DINO-vingerafdrukken, afstand tot de K=5 dichtstbijzijnde geaccepteerde assets). Rangschikking volgens **cls/zonder-kit** (beste AUC op de eigen keurgeschiedenis).

## Validatie (AUC stijl-afgekeurd set2 vs geaccepteerd set1; set3 = thema-controle)

| vingerafdruk/buurregel | AUC set2 | AUC set3 | gem. set1 | gem. set2 | gem. set3 |
|------------------------|---------:|---------:|----------:|----------:|----------:|
| cls/zonder-kit | 0.614 | 0.547 | 0.2709 | 0.3146 | 0.2832 |
| cls/met-kit | 0.780 | 0.721 | 0.1958 | 0.3107 | 0.2707 |
| patch/zonder-kit | 0.609 | 0.523 | 0.1555 | 0.1783 | 0.1592 |
| patch/met-kit | 0.791 | 0.723 | 0.1112 | 0.1757 | 0.1519 |

set3 hoort als verdeling tussen set1 en set2 te liggen: de mediaan van set3 ligt op het 56e percentiel van set1 (cls/zonder-kit).

## Kit-diagnose (set1, zonder-kit minus met-kit)

Groot verschil = de kit is zijn eigen dichtstbijzijnde stijl: kit-vingerafdruk, of een eigen-maar-geaccepteerd stijl-eiland. Klein verschil = het asset heeft ook buiten de eigen kit dichte buren.

| kit | n | gem. delta |
|-----|--:|-----------:|
| resources | 56 | 0.1199 |
| quaternius-nature | 34 | 0.1158 |
| taalei-kit | 4 | 0.1154 |
| pirate-kit | 45 | 0.1141 |
| natuur | 92 | 0.099 |
| village-kit | 137 | 0.0979 |
| dungeon | 139 | 0.087 |
| restaurant | 21 | 0.0841 |
| forest | 57 | 0.065 |
| fantasy-town-kit | 68 | 0.0581 |
| rocks | 25 | 0.0502 |
| fantasy-props | 28 | 0.0453 |
| halloween | 21 | 0.0434 |
| modulair-terrein | 71 | 0.0419 |
| survival-kit | 40 | 0.0363 |
| rpgtools | 35 | 0.034 |
| props | 26 | 0.0254 |
| platformer-kit | 24 | 0.0201 |
| prototype-kit | 3 | 0.0174 |
| modular-cave-kit | 4 | 0.0088 |
| mini-forest | 9 | 0.0007 |

## Top 30 minst passende catalogus-assets

Contactbladen in `sheets/`: eigen views boven, dichtstbijzijnde geaccepteerde buur eronder.

| # | kit | asset | score | score met eigen kit | afwijkendste view | dichtstbijzijnde buren |
|--:|-----|-------|------:|--------------------:|-------------------|------------------------|
| 1 | quaternius-nature | cactus-flower-4 | 0.6276 | 0.3366 | boven | modulair-terrein__beach-prop-tree-palm-b, natuur__tree-palm-3, modulair-terrein__beach-prop-tree-palm-c |
| 2 | quaternius-nature | cactus-4 | 0.616 | 0.3388 | boven | forest__grass-1-d, modulair-terrein__beach-prop-tree-palm-b, natuur__tree-palm-3 |
| 3 | village-kit | windmill-blades | 0.607 | 0.5938 | az165-el55 | fantasy-town-kit__windmill, survival-kit__campfire-fishing-stand, survival-kit__signpost-single |
| 4 | rpgtools | scissors | 0.5901 | 0.5574 | az30-el30 | restaurant__knife, forest__tree-bare-2-b, forest__tree-bare-2-a |
| 5 | rpgtools | handplane | 0.5861 | 0.5861 | az300-el30 | pirate-kit__boat-row-large, pirate-kit__boat-row-small, platformer-kit__lever |
| 6 | quaternius-nature | cactus-flower-2 | 0.5806 | 0.3227 | az300-el30 | forest__tree-bare-2-a, natuur__tree-palm-5, halloween__tree-dead-small |
| 7 | fantasy-props | key-gold | 0.5523 | 0.4642 | az75-el5 | dungeon__keyring, rpgtools__shovel, dungeon__torch-mounted |
| 8 | village-kit | boat-oars-a | 0.5493 | 0.4891 | az255-el5 | natuur__timber-cut-4, pirate-kit__platform-planks, resources__wood-plank-c |
| 9 | quaternius-nature | cactus-5 | 0.5487 | 0.3418 | az300-el30 | forest__grass-1-b, fantasy-town-kit__tree-high-round, halloween__bone-a |
| 10 | village-kit | boat-oars-b | 0.5481 | 0.4876 | az75-el5 | natuur__timber-cut-4, modulair-terrein__hilly-prop-branch-b, modulair-terrein__hilly-prop-branch-a |
| 11 | rpgtools | saw | 0.5477 | 0.5477 | az30-el30 | dungeon__key, village-kit__roof-accent-ridge-end, modulair-terrein__hilly-prop-fence-boards-a |
| 12 | survival-kit | fish-large | 0.5475 | 0.4334 | boven | natuur__log-3, restaurant__food-ingredient-ham, natuur__log-4 |
| 13 | survival-kit | fish | 0.5475 | 0.4334 | boven | natuur__log-3, restaurant__food-ingredient-ham, natuur__log-4 |
| 14 | quaternius-nature | cactus-flower-1 | 0.5465 | 0.5465 | az30-el30 | natuur__tree-palm-2, natuur__tree-palm-1, forest__grass-1-c |
| 15 | village-kit | cart-a | 0.5427 | 0.5265 | az255-el5 | fantasy-town-kit__cart, fantasy-town-kit__cart-high, pirate-kit__structure-platform-dock |
| 16 | rpgtools | rope-bundle-a | 0.5416 | 0.4821 | boven | dungeon__keyring, modulair-terrein__hilly-prop-camp-campfire, fantasy-props__scroll-1 |
| 17 | pirate-kit | ship-large | 0.5375 | 0.0878 | az120-el30 | dungeon__wall-tsplit-sloped, dungeon__stairs-wood-decorated, resources__parts-pile-medium |
| 18 | pirate-kit | ship-medium | 0.5358 | 0.0698 | boven | resources__parts-pile-medium, dungeon__stairs-narrow, dungeon__wall-tsplit-sloped |
| 19 | fantasy-props | key-metal | 0.5357 | 0.4487 | az120-el30 | dungeon__keyring, dungeon__key, rpgtools__shovel |
| 20 | quaternius-nature | cactus-flower-3 | 0.5337 | 0.3507 | az30-el30 | dungeon__torch-lit, natuur__tree-palm-5, fantasy-town-kit__tree-high-round |
| 21 | fantasy-town-kit | windmill | 0.5279 | 0.5247 | az165-el55 | village-kit__windmill-blades, village-kit__ladder-a, survival-kit__campfire-fishing-stand |
| 22 | natuur | stump-3 | 0.5228 | 0.4783 | az255-el5 | modulair-terrein__hilly-prop-camp-campfire, pirate-kit__palm-detailed-straight, resources__parts-pile-small |
| 23 | quaternius-nature | wheat | 0.5221 | 0.5221 | az120-el30 | modulair-terrein__beach-prop-tree-palm-b, rpgtools__torch, rpgtools__torch-burnt |
| 24 | pirate-kit | ship-wreck | 0.5204 | 0.2701 | boven | resources__parts-pile-medium, dungeon__wall-tsplit-sloped, dungeon__floor-tile-small-decorated |
| 25 | pirate-kit | ship-pirate-large | 0.5185 | 0.0884 | az120-el30 | resources__parts-pile-medium, dungeon__wall-tsplit-sloped, dungeon__wall-shelves |
| 26 | rpgtools | drafting-compass | 0.5172 | 0.5172 | az30-el30 | mini-forest__target, pirate-kit__mast-ropes, dungeon__keyring-hanging |
| 27 | taalei-kit | lighthouse | 0.5153 | 0.5153 | az255-el5 | natuur__stump-2, fantasy-props__potion-2, fantasy-town-kit__rock-small |
| 28 | quaternius-nature | cactus-2 | 0.5146 | 0.3609 | az300-el30 | forest__tree-bare-2-a, dungeon__torch-mounted, forest__tree-bare-2-b |
| 29 | rpgtools | pickaxe | 0.514 | 0.4261 | boven | platformer-kit__arrow, pirate-kit__palm-detailed-straight, platformer-kit__arrows |
| 30 | natuur | cattail-4 | 0.5137 | 0.2165 | boven | modulair-terrein__hilly-prop-cattail-b, modulair-terrein__hilly-prop-cattail-a, village-kit__canopy-beam |
