# Stijl-audit: uitschieters in de catalogus

Backbone: `facebook/dinov3-vitb16-pretrain-lvd1689m` — pipeline: `tools/style-audit/` (acht neutrale views per asset, per-view DINO-vingerafdrukken, afstand tot de K=5 dichtstbijzijnde geaccepteerde assets). Rangschikking volgens **patch/zonder-kit** (beste AUC op de eigen keurgeschiedenis).

## Validatie (AUC stijl-afgekeurd set2 vs geaccepteerd set1; set3 = thema-controle)

AUC 0.5 = ruis, 1.0 = perfecte scheiding. De thema-controle (set3) hoort laag te blijven: stijgt hij mee, dan meet de variant vreemdheid in plaats van stijl.

| vingerafdruk/buurregel | AUC set2 (dinov3-vitb16-pretrain-lvd1689m) | AUC set3 | AUC set2 (dinov2-base) | AUC set3 |
|------------------------|---------:|---------:|---------:|---------:|
| cls/zonder-kit | 0.608 | 0.591 | 0.614 | 0.547 |
| cls/met-kit | 0.809 | 0.791 | 0.780 | 0.721 |
| patch/zonder-kit | 0.633 | 0.559 | 0.609 | 0.523 |
| patch/met-kit | 0.824 | 0.769 | 0.791 | 0.723 |

set3 hoort als verdeling tussen set1 en set2 te liggen: de mediaan van set3 ligt op het 56e percentiel van set1 (patch/zonder-kit).

## Kit-diagnose (set1, zonder-kit minus met-kit)

Groot verschil = de kit is zijn eigen dichtstbijzijnde stijl: kit-vingerafdruk, of een eigen-maar-geaccepteerd stijl-eiland. Klein verschil = het asset heeft ook buiten de eigen kit dichte buren.

| kit | n | gem. delta |
|-----|--:|-----------:|
| resources | 56 | 0.0552 |
| taalei-kit | 4 | 0.0528 |
| village-kit | 137 | 0.0501 |
| quaternius-nature | 34 | 0.0468 |
| dungeon | 139 | 0.0452 |
| pirate-kit | 45 | 0.0448 |
| natuur | 92 | 0.0383 |
| forest | 57 | 0.0308 |
| fantasy-town-kit | 68 | 0.0303 |
| restaurant | 21 | 0.0296 |
| fantasy-props | 28 | 0.026 |
| halloween | 21 | 0.0195 |
| modulair-terrein | 71 | 0.0193 |
| rocks | 25 | 0.0189 |
| survival-kit | 40 | 0.0168 |
| rpgtools | 35 | 0.0141 |
| props | 26 | 0.0118 |
| platformer-kit | 24 | 0.0103 |
| prototype-kit | 3 | 0.0087 |
| modular-cave-kit | 4 | 0.0049 |
| mini-forest | 9 | 0.0009 |

## Top 30 minst passende catalogus-assets

Contactbladen in `sheets/`: eigen views boven, dichtstbijzijnde geaccepteerde buur eronder.

`score` = gemiddelde over de K buren. `beste buur` = afstand tot alleen buur 1. Een grote `kloof` betekent: er is één echte broer en de rest is ruis — het asset is dus wél beoordeelbaar, kijk naar buur 1. Een kleine kloof betekent dat niets erop lijkt, op geen enkele rang: isolatie, geen stijloordeel.

| # | kit | asset | score | beste buur | kloof | afwijkendste view | dichtstbijzijnde buren |
|--:|-----|-------|------:|-----------:|------:|-------------------|------------------------|
| 1 | quaternius-nature | cactus-flower-4 | 0.2491 | 0.2409 | 0.0082 | az255-el5 | forest__tree-bare-2-b, forest__tree-bare-2-c, halloween__tree-dead-large |
| 2 | quaternius-nature | cactus-4 | 0.2447 | 0.2342 | 0.0105 | az255-el5 | forest__tree-bare-2-b, forest__tree-bare-2-c, halloween__tree-dead-large |
| 3 | quaternius-nature | cactus-5 | 0.2437 | 0.2362 | 0.0075 | boven | halloween__tree-dead-large, forest__tree-bare-2-b, forest__grass-1-d |
| 4 | rpgtools | scissors | 0.2348 | 0.2038 | 0.0311 | az165-el55 | restaurant__knife, fantasy-props__key-metal, fantasy-props__key-gold |
| 5 | survival-kit | fish-large | 0.2267 | 0.2114 | 0.0153 | boven | natuur__log-3, natuur__log-4, props__roast-a |
| 6 | survival-kit | fish | 0.2267 | 0.2114 | 0.0153 | boven | natuur__log-3, natuur__log-4, props__roast-a |
| 7 | village-kit | windmill-blades | 0.2085 | 0.126 | 0.0826 | boven | fantasy-town-kit__windmill, pirate-kit__mast-ropes, survival-kit__campfire-fishing-stand |
| 8 | rpgtools | saw | 0.2081 | 0.1926 | 0.0155 | az30-el30 | dungeon__key, modulair-terrein__hilly-prop-fence-boards-a, village-kit__sign-a |
| 9 | natuur | stump-3 | 0.2069 | 0.1893 | 0.0176 | az75-el5 | modulair-terrein__beach-prop-starfish-a, modulair-terrein__hilly-prop-camp-campfire, modulair-terrein__beach-prop-starfish-b |
| 10 | quaternius-nature | cactus-flower-3 | 0.2057 | 0.201 | 0.0047 | boven | natuur__tree-palm-5, halloween__tree-dead-large, natuur__tree-palm-4 |
| 11 | quaternius-nature | cactus-3 | 0.2047 | 0.2002 | 0.0045 | az165-el55 | forest__tree-bare-2-b, halloween__tree-dead-large, dungeon__torch-lit |
| 12 | pirate-kit | ship-large | 0.2041 | 0.1879 | 0.0162 | boven | resources__parts-pile-medium, dungeon__wall-tsplit-sloped, dungeon__wall-shelves |
| 13 | quaternius-nature | cactus-2 | 0.2027 | 0.1914 | 0.0114 | boven | forest__tree-bare-2-b, forest__tree-bare-2-c, forest__tree-bare-2-a |
| 14 | rpgtools | trowel | 0.2013 | 0.1964 | 0.0049 | az210-el30 | platformer-kit__arrow, dungeon__candle-thin-lit, fantasy-props__torch-metal |
| 15 | quaternius-nature | cactus-flower-2 | 0.2005 | 0.1893 | 0.0112 | boven | forest__tree-bare-2-b, halloween__tree-dead-large, forest__tree-bare-2-a |
| 16 | rpgtools | rope-bundle-b | 0.2004 | 0.1734 | 0.0271 | az75-el5 | halloween__ribcage, restaurant__food-ingredient-steak, dungeon__keyring |
| 17 | quaternius-nature | wheat | 0.1986 | 0.1937 | 0.0049 | boven | rpgtools__torch, rpgtools__torch-burnt, pirate-kit__mast-ropes |
| 18 | taalei-kit | balloon-basket-square | 0.1977 | 0.1964 | 0.0013 | az255-el5 | natuur__coconut, natuur__mushroom-red-spotted, props__barrel-a |
| 19 | taalei-kit | balloon-basket-round | 0.1952 | 0.192 | 0.0032 | az255-el5 | natuur__mushroom-red-spotted, natuur__coconut, props__barrel-a |
| 20 | fantasy-town-kit | windmill | 0.1943 | 0.126 | 0.0684 | boven | village-kit__windmill-blades, village-kit__waterwheel-flume-brace-double, platformer-kit__sign |
| 21 | rpgtools | rope-bundle-a | 0.1943 | 0.1713 | 0.023 | boven | dungeon__keyring, fantasy-props__key-gold, halloween__ribcage |
| 22 | quaternius-nature | cactus-flower-1 | 0.1938 | 0.1686 | 0.0251 | boven | forest__grass-1-c, forest__grass-1-b, forest__grass-1-d |
| 23 | pirate-kit | ship-medium | 0.1932 | 0.1793 | 0.0138 | boven | resources__parts-pile-medium, dungeon__wall-tsplit-sloped, dungeon__wall-shelves |
| 24 | pirate-kit | ship-pirate-large | 0.1929 | 0.1752 | 0.0177 | boven | resources__parts-pile-medium, dungeon__wall-tsplit-sloped, dungeon__crates-stacked |
| 25 | rpgtools | magnifying-glass | 0.1927 | 0.184 | 0.0087 | az210-el30 | survival-kit__signpost-single, survival-kit__signpost, pirate-kit__flag |
| 26 | dungeon | floor-tile-big-spikes | 0.1896 | 0.1842 | 0.0054 | az255-el5 | village-kit__cobblestone-dirt-transition-c, village-kit__cobblestone-dirt-transition-b, village-kit__cobblestone-dirt-transition-a |
| 27 | taalei-kit | balloon | 0.1895 | 0.188 | 0.0015 | az30-el30 | modulair-terrein__hilly-prop-rock-d, forest__rock-3-d, natuur__mushroom-red-spotted |
| 28 | rpgtools | handplane | 0.189 | 0.1827 | 0.0062 | az75-el5 | prototype-kit__lever-double, platformer-kit__lever, dungeon__bed-floor |
| 29 | rpgtools | torch | 0.1888 | 0.1871 | 0.0017 | az255-el5 | natuur__cattail-1, natuur__cattail-3, natuur__lamp-post |
| 30 | rpgtools | torch-burnt | 0.1888 | 0.1871 | 0.0017 | az255-el5 | natuur__cattail-1, natuur__cattail-3, natuur__lamp-post |
