# Missing models — closest catalogue match

For 162 models under `kits/missing/`, this is the closest model in the catalogue,
found with [DINOv3](https://huggingface.co/facebook/dinov3-vitb16-pretrain-lvd1689m)
on the render sheets. Every image here has the layout of `docs/stijlreferentie`:
the missing model on top, its closest catalogue match below, both as the same
eight views on one 896 × 448 sheet.

One image per missing model, named `<pack>__<model>.png`; `matches.json` holds the
same result plus the runner-ups (top 5 per model).

## Reproducing

```
node tools/vind-match/renders.mjs
HF_TOKEN=... python3 tools/vind-match/inbedden.py docs/missing_matches/.tussenstand/views/missing docs/missing_matches/.tussenstand/emb_missing.npz
HF_TOKEN=... python3 tools/vind-match/inbedden.py docs/catalogus_views/catalogus docs/missing_matches/.tussenstand/emb_catalogus.npz
python3 tools/vind-match/match.py docs/missing_matches/.tussenstand/emb_missing.npz docs/missing_matches/.tussenstand/emb_catalogus.npz docs/missing_matches/matches.json
python3 tools/vind-match/bladen.py docs/missing_matches/matches.json docs/missing_matches/.tussenstand/views/missing docs/catalogus_views/catalogus docs/missing_matches
```

The model is gated on Hugging Face, so `HF_TOKEN` has to be a token on an account
that has been granted access. The renders, the embeddings and everything else that
is only an intermediate step land in `docs/missing_matches/.tussenstand/`, which is
not checked in; both scripts pick up where a previous run stopped. Embedding the
939 catalogue sheets takes about fifteen minutes on four CPU cores, the 162 missing
ones about three.

Which models are compared is `tools/vind-match/modellen.txt` — one path per line,
relative to the repository root.

## Method

The missing models are rendered with the same eight cameras as the catalogue
(`tools/renders/index.html`): neutral grey, flat shading, orthographic and
normalised on the bounding sphere, so only shape, silhouette and faceting are
left — colour and absolute size stay out of it, exactly as the catalogue sheets
have them.

Each tile is 224 × 224, which is the input size of DINOv3 ViT-B/16, so the eight
views go through the net unscaled. Per view this leaves one normalised CLS vector;
the score between two models is the mean cosine over the eight views, view against
the same view.

A model that stands a quarter turn rotated gives the same four views at elevation 30
in a different order. So besides the straight comparison, three rotations are
scored: for a quarter turn the four elevation-30 views map onto each other, for a
half turn those four plus the two at elevation 5. The best of the four rotations
counts. **Caveat:** a quarter turn is therefore judged on four views and the
straight comparison on eight, which flatters the quarter turn a little — the eight
views include the top view and the oblique view, and those usually score lower.
On a check over 145 models whose name contains a recognisable object word
(barrel, chest, key, …), whether the top-1 hit carries the same word, the two
variants are level: 71/145 with rotation, 69/145 without. The rotation variant
does noticeably better on individual cases (`FantasyProps/Coin` → `prototype-kit/coin`
instead of `rpgtools/magnifying-glass`, `FantasyProps/Banner_1` →
`fantasy-town-kit/banner-green` instead of `dungeon/wall-open-scaffold`), which is
why it is the one used.

## What the score says

The score is a similarity, not a verdict. **Every missing model gets a match, also
when the catalogue simply doesn't have the object.** That is the normal case here:
these packs are missing precisely because their objects aren't in the catalogue. So
`KayKit Tree_1_A` (a round crown on a trunk) ends up at `props/mushroom-a` at 0.761,
and that is the honest answer to "closest" — not proof that the catalogue has that
tree.

| Score | Models | Reads as |
| --- | ---: | --- |
| 1.000 | 5 | the same model, already in the catalogue under another kit |
| 0.90 – 0.99 | 10 | the same object or one that is indistinguishable in grey |
| 0.80 – 0.90 | 34 | the same kind of object, other proportions or detailing |
| 0.70 – 0.80 | 62 | related shape, often another object |
| 0.60 – 0.70 | 36 | roughly the same mass, otherwise unrelated |
| below 0.60 | 15 | nothing in the catalogue comes close |

Median 0.750, lowest 0.410.

### Five are literally already in the catalogue

| Missing | In the catalogue as |
| --- | --- |
| `KayKit_Forest_Nature_Pack_1.0_FREE/Rock_2_C_Color1` | `forest/rock-2-c` |
| `kenney_castlekit/tree-log` | `survival-kit/tree-log` |
| `kenney_pirate-kit/tool-paddle` | `pirate-kit/tool-paddle` |
| `kenney_platformer-kit/chest` | `pirate-kit/chest` |
| `Ultimate_Nature_Pack_by_Quaternius_OBJ/Wheat` | `quaternius-nature/wheat` |

Score exactly 1.000 over all eight views: the renders are identical, pixel for pixel.
Three of them sit in the catalogue under the same name in the imported version of
their own kit (`pirate-kit/tool-paddle`, `quaternius-nature/wheat`, `forest/rock-2-c`);
`kenney_castlekit/tree-log` and `kenney_platformer-kit/chest` are in the catalogue
under another kit — Kenney ships the same model in more than one pack.

### Lowest scores

`kenney_holidaykit/hanukkah-menorah-candles` (0.410), `Quaternius/Corn_1` (0.506),
`Modular Village/Prop_Hay_1` (0.506), `LowPolyNaturePackLite/flower02_orange` (0.544),
`modular_terrain_collection/Hilly_Prop_Camp_Lean_To` (0.550) and
`nature_kit/Tent_Leanto_1` (0.553). A menorah, a corn plant, a hay bundle and two
lean-to tents: shapes the catalogue has nothing of.

### What gets picked most often

`fantasy-town-kit/tree-high-round`, `pirate-kit/chest` and `dungeon/barrel-small`
are each the closest match for four different missing models, `restaurant/crate`,
`dungeon/chair` and `rocks/rock-natural-d` for three. Round crowns, chests and
barrels: the catalogue has one archetype of each and everything of that kind lands on it.

## All matches

### FantasyProps_glTF_1k (21)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Barrel` | `village-kit/barrel-b` | 0.888 |
| `Crate_Metal` | `village-kit/crate-a` | 0.844 |
| `Shelf_Simple` | `dungeon/shelf-large` | 0.809 |
| `Stool` | `dungeon/table-small` | 0.805 |
| `Bench` | `fantasy-town-kit/overhang` | 0.790 |
| `Whetstone` | `rpgtools/grindstone` | 0.787 |
| `FarmCrate_Empty` | `restaurant/crate` | 0.782 |
| `Pickaxe_Bronze` | `rpgtools/pickaxe` | 0.776 |
| `Anvil` | `rpgtools/anvil` | 0.751 |
| `Bucket_Metal` | `props/bucket-a` | 0.751 |
| `Chair_1` | `survival-kit/structure-floor` | 0.738 |
| `Banner_1` | `fantasy-town-kit/banner-green` | 0.732 |
| `Crate_Wooden` | `fantasy-town-kit/wall-wood-block` | 0.722 |
| `Chest_Wood` | `dungeon/chest-gold` | 0.720 |
| `Table_Knife` | `natuur/timber-cut-4` | 0.701 |
| `Candle_1` | `dungeon/candle-melted` | 0.683 |
| `Coin` | `prototype-kit/coin` | 0.661 |
| `Bed_Twin1` | `pirate-kit/structure-platform-dock-small` | 0.660 |
| `Axe_Bronze` | `rpgtools/pickaxe` | 0.635 |
| `Stall_Cart_Empty` | `village-kit/cart-a` | 0.582 |
| `Stall_Empty` | `pirate-kit/structure-fence` | 0.561 |

### Ultimate_Nature_Pack_by_Quaternius_OBJ (17)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Wheat` | `quaternius-nature/wheat` | 1.000 |
| `Rock_Moss_1` | `quaternius-nature/rock-1` | 0.981 |
| `PalmTree_2` | `natuur/tree-palm-3` | 0.739 |
| `Bush_1` | `rocks/rock-natural-h` | 0.737 |
| `BushBerries_1` | `natuur/stepping-stone-1` | 0.647 |
| `BirchTree_1` | `rocks/rock-natural-d` | 0.641 |
| `Plant_3` | `forest/grass-2-c` | 0.640 |
| `Plant_2` | `natuur/tree-bare-2` | 0.631 |
| `BirchTree_Snow_4` | `rocks/rock-natural-d` | 0.627 |
| `TreeStump` | `props/roast-a` | 0.623 |
| `Plant_1` | `pirate-kit/palm-detailed-bend` | 0.606 |
| `Cactus_1` | `quaternius-nature/cactus-3` | 0.602 |
| `Willow_1` | `rocks/rock-natural-b` | 0.578 |
| `Grass_2` | `forest/grass-2-d` | 0.573 |
| `CommonTree_2` | `rocks/debris-b` | 0.568 |
| `Plant_4` | `pirate-kit/palm-detailed-straight` | 0.560 |
| `Corn_1` | `modulair-terrein/beach-prop-tree-palm-c` | 0.506 |

### LowPolyNaturePackLite (14)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `simple_bush` | `forest/rock-3-d` | 0.958 |
| `mushrooom01_red` | `props/mushroom-a` | 0.890 |
| `pine01` | `fantasy-town-kit/tree` | 0.878 |
| `fence` | `fantasy-town-kit/fence` | 0.801 |
| `rock` | `rocks/rock-natural-e` | 0.797 |
| `bush_berries_red` | `natuur/rock-7` | 0.793 |
| `dead_tree` | `natuur/tree-bare-4` | 0.750 |
| `tree_dead01` | `natuur/tree-bare-4` | 0.730 |
| `hat_mushroom_brown` | `natuur/mushroom-red-spotted` | 0.703 |
| `tent_blue` | `fantasy-town-kit/roof-flat` | 0.668 |
| `tree01` | `fantasy-town-kit/tree-high-round` | 0.627 |
| `grass03` | `forest/grass-2-b` | 0.616 |
| `plant02` | `natuur/tree-palm-2` | 0.610 |
| `flower02_orange` | `modulair-terrein/hilly-prop-flower-daisy` | 0.544 |

### kenney_graveyardkit_5.0 (13)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `detail-plate` | `restaurant/plate-small` | 0.919 |
| `debris-wood` | `pirate-kit/platform-planks` | 0.789 |
| `detail-bowl` | `dungeon/plate-small` | 0.778 |
| `hay-bale-bundled` | `dungeon/trunk-large-c` | 0.761 |
| `shovel` | `rpgtools/shovel` | 0.740 |
| `fence` | `platformer-kit/poles` | 0.738 |
| `lantern-glass` | `dungeon/barrel-small` | 0.734 |
| `fence-damaged` | `platformer-kit/fence-broken` | 0.728 |
| `lightpost-single` | `pirate-kit/flag-high` | 0.725 |
| `detail-chalice` | `village-kit/well-inside` | 0.714 |
| `hay-bale` | `natuur/log-1` | 0.694 |
| `trunk` | `pirate-kit/rocks-sand-b` | 0.692 |
| `trunk-long` | `pirate-kit/rocks-sand-b` | 0.638 |

### kenney_platformer-kit (13)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `chest` | `pirate-kit/chest` | 1.000 |
| `crate-item` | `dungeon/box-small` | 0.966 |
| `barrel` | `dungeon/barrel-small` | 0.869 |
| `crate` | `props/box-a` | 0.835 |
| `fence-low-corner-curved` | `platformer-kit/fence-corner-curved` | 0.792 |
| `key` | `dungeon/key` | 0.781 |
| `tree-pine-small` | `survival-kit/tree` | 0.757 |
| `crate-strong` | `dungeon/box-small` | 0.749 |
| `door-rotate` | `fantasy-town-kit/wall-wood-door` | 0.732 |
| `tree` | `fantasy-town-kit/tree-high-round` | 0.681 |
| `saw` | `rocks/rock-natural-d` | 0.677 |
| `flowers-tall` | `platformer-kit/mushrooms` | 0.676 |
| `trap-spikes-large` | `dungeon/floor-tile-big-spikes` | 0.609 |

### KayKit_Forest_Nature_Pack_1.0_FREE (9)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Rock_2_C_Color1` | `forest/rock-2-c` | 1.000 |
| `Bush_1_A_Color1` | `pirate-kit/cannon-ball` | 0.939 |
| `Tree_3_A_Color1` | `natuur/mushroom-grey` | 0.770 |
| `Tree_1_A_Color1` | `props/mushroom-a` | 0.761 |
| `Tree_4_B_Color1` | `fantasy-town-kit/tree-high-crooked` | 0.750 |
| `Bush_2_E_Color1` | `modulair-terrein/hilly-prop-stepping-stones-f` | 0.699 |
| `Tree_1_C_Color1` | `platformer-kit/mushrooms` | 0.674 |
| `Tree_3_C_Color1` | `natuur/mushroom-grey` | 0.642 |
| `Tree_2_B_Color1` | `forest/rock-2-h` | 0.592 |

### KayKit_Furniture_Bits_1.0_FREE (9)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `chair_stool_wood` | `dungeon/stool` | 0.881 |
| `shelf_A_big` | `resources/wood-plank-c` | 0.840 |
| `book_set` | `fantasy-props/book-group-small-3` | 0.838 |
| `shelf_B_large` | `resources/wood-plank-c` | 0.836 |
| `table_medium` | `props/table-a` | 0.819 |
| `book_single` | `fantasy-props/book-simplified-single` | 0.797 |
| `chair_B_wood` | `dungeon/chair` | 0.770 |
| `chair_A_wood` | `dungeon/chair` | 0.729 |
| `bed_single_B` | `fantasy-town-kit/wall-wood-block-half` | 0.670 |

### kenney_survival-kit (8)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `chest` | `pirate-kit/chest` | 0.840 |
| `tool-axe` | `survival-kit/signpost-single` | 0.821 |
| `tool-hammer` | `platformer-kit/arrow` | 0.744 |
| `tree-autumn-trunk` | `natuur/stump-2` | 0.734 |
| `tree-trunk` | `natuur/stump-2` | 0.734 |
| `bucket` | `props/jug-c` | 0.728 |
| `grass-large` | `forest/grass-1-d` | 0.651 |
| `grass` | `survival-kit/campfire-pit` | 0.626 |

### PropsLite_FBX (7)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Fence_01` | `fantasy-town-kit/fence` | 0.864 |
| `Candle_02` | `halloween/candle` | 0.846 |
| `Coin_01` | `modulair-terrein/hilly-prop-stepping-stones-e` | 0.838 |
| `Coin_03` | `survival-kit/campfire-pit` | 0.771 |
| `Pointer_03` | `survival-kit/signpost` | 0.768 |
| `Food_04` | `restaurant/food-ingredient-ham` | 0.768 |
| `Candle_01` | `rpgtools/file` | 0.710 |

### kenney_mini-dungeon (7)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `chest` | `pirate-kit/chest` | 0.955 |
| `wood-structure` | `mini-forest/building-structure` | 0.931 |
| `barrel` | `dungeon/barrel-small` | 0.869 |
| `potion` | `survival-kit/bottle` | 0.798 |
| `key` | `dungeon/key` | 0.788 |
| `chair` | `dungeon/chair` | 0.746 |
| `trap` | `dungeon/coin-stack-small` | 0.710 |

### kenney_mini-forest_1.0 (7)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `fence` | `platformer-kit/fence-rope` | 0.837 |
| `flag` | `pirate-kit/flag` | 0.766 |
| `weapon-arrow` | `village-kit/roof-accent-ridge-end` | 0.681 |
| `rocks-high` | `forest/rock-1-m` | 0.680 |
| `building-platform` | `pirate-kit/structure-platform-dock-small` | 0.665 |
| `tent` | `fantasy-town-kit/roof-gable-detail` | 0.634 |
| `building-roof` | `pirate-kit/structure-roof` | 0.586 |

### modular_terrain_collection (7)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Hilly_Prop_Bush_2` | `modulair-terrein/hilly-prop-rock-d` | 0.926 |
| `Hilly_Prop_Tree_Oak_1` | `modulair-terrein/hilly-prop-mushroom-a` | 0.858 |
| `Hilly_Prop_Tree_Cedar_1` | `fantasy-town-kit/tree-high-round` | 0.814 |
| `Beach_Prop_Treasure_Chest` | `dungeon/chest` | 0.792 |
| `Hilly_Prop_Camp_Sitting_Log` | `natuur/log-1` | 0.749 |
| `Hilly_Prop_Hollow_Trunk` | `survival-kit/tree-log-small` | 0.714 |
| `Hilly_Prop_Camp_Lean_To` | `survival-kit/tent-canvas` | 0.550 |

### kenney_castlekit (6)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `tree-log` | `survival-kit/tree-log` | 1.000 |
| `rocks-small` | `survival-kit/rock-sand-b` | 0.878 |
| `tree-large` | `fantasy-town-kit/tree` | 0.868 |
| `tree-small` | `survival-kit/tree` | 0.823 |
| `tree-trunk` | `survival-kit/resource-stone` | 0.776 |
| `door` | `pirate-kit/chest` | 0.624 |

### nature_kit (6)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Mountain_1` | `natuur/mountain-4` | 0.896 |
| `Tree_Oak_1` | `natuur/coconut` | 0.847 |
| `Tree_Cedar_1` | `fantasy-town-kit/tree-high-round` | 0.802 |
| `Tree_Oak_3` | `natuur/coconut` | 0.765 |
| `Tree_Oak_8` | `modulair-terrein/shared-prop-boulder-d` | 0.616 |
| `Tent_Leanto_1` | `fantasy-town-kit/roof-gable-detail` | 0.553 |

### kenney_pirate-kit (5)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `tool-paddle` | `pirate-kit/tool-paddle` | 1.000 |
| `palm-bend` | `pirate-kit/palm-detailed-bend` | 0.913 |
| `barrel` | `dungeon/barrel-small` | 0.868 |
| `crate` | `restaurant/crate` | 0.823 |
| `tool-shovel` | `pirate-kit/tool-paddle` | 0.766 |

### TropicalIslandLite_FBX (4)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Rock_01` | `natuur/rock-6` | 0.900 |
| `PalmTree_05` | `natuur/tree-palm-3` | 0.777 |
| `Chest_01` | `restaurant/crate` | 0.736 |
| `Pier_02` | `survival-kit/structure-floor` | 0.723 |

### kenney_holidaykit (4)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `cabin-fence` | `props/bench-a` | 0.814 |
| `lantern` | `pirate-kit/flag-high` | 0.638 |
| `lantern-hanging` | `rpgtools/lantern` | 0.555 |
| `hanukkah-menorah-candles` | `dungeon/floor-tile-big-spikes` | 0.410 |

### kenney_fantasy-town-kit_2.0 (3)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `stall-stool` | `props/stool-a` | 0.837 |
| `stall-bench` | `halloween/bench` | 0.828 |
| `stall` | `props/table-a` | 0.793 |

### KayKit_Restaurant_Bits_1.0_FREE (1)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `chair_B` | `dungeon/stool` | 0.707 |

### Modular Village (1)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Prop_Hay_1` | `dungeon/trunk-small-c` | 0.506 |
