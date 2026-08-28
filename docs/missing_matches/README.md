# Missing models — closest catalogue match

For 162 models under `kits/missing/`, this is the closest model in the catalogue,
found with [DINOv3](https://huggingface.co/facebook/dinov3-vitb16-pretrain-lvd1689m)
on the render sheets. Every image here has the layout of `docs/stijlreferentie`:
the missing model on top, its closest catalogue match below, each as the same
eight views on a sheet of 896 × 448, together one image of 896 × 956.

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

## Picking sheets out

`overzicht/` holds the same 126 sheets as contact sheets, sixteen to a page,
scaled down with a number above each one: `blad_01.png` … `blad_08.png`. The
number is the position in the alphabetical listing of `*.png`, and
`overzicht/index.md` maps every number back to its file name and page. Both are
made by

```
bash tools/vind-match/overzicht.sh
```

which reads the sheets already in this directory — no renders, no embeddings —
and rewrites `overzicht/` from scratch. Removing a sheet renumbers the ones
after it, so re-run it after any removal.

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
scored: the four elevation-30 views map onto each other, and for a half turn the
two views at elevation 5 do as well. **Every rotation is averaged over the same
eight view pairs**, otherwise the outcomes aren't comparable and the rotation with
the fewest pairs wins systematically. Views without a counterpart therefore stay on
their own index: at a quarter turn those compare two sides that don't coincide, and
that pushes the score of that rotation down — the safe way round, since a rotation
has to earn itself back on the views that do line up. The best of the four rotations
counts; for 115 of the 162 models that is the straight comparison.

On a check over 145 models whose name contains a recognisable object word (barrel,
chest, key, …), whether the top-1 hit carries the same word, this scores 72/145,
against 69/145 without any rotation and 68/145 when only the four elevation-30 views
are used. The rotation does the work on individual cases: `FantasyProps/Coin` →
`prototype-kit/coin` instead of `rpgtools/magnifying-glass`, `FantasyProps/Banner_1`
→ `fantasy-town-kit/banner-green` instead of `dungeon/wall-open-scaffold`.

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
| 0.80 – 0.90 | 24 | the same kind of object, other proportions or detailing |
| 0.70 – 0.80 | 57 | related shape, often another object |
| 0.60 – 0.70 | 45 | roughly the same mass, otherwise unrelated |
| below 0.60 | 21 | nothing in the catalogue comes close |

Median 0.723, lowest 0.389.

### Five are literally already in the catalogue

| Missing | In the catalogue as |
| --- | --- |
| `KayKit_Forest_Nature_Pack_1.0_FREE/Rock_2_C_Color1` | `forest/rock-2-c` |
| `kenney_castlekit/tree-log` | `survival-kit/tree-log` |
| `kenney_pirate-kit/tool-paddle` | `pirate-kit/tool-paddle` |
| `kenney_platformer-kit/chest` | `pirate-kit/chest` |
| `Ultimate_Nature_Pack_by_Quaternius_OBJ/Wheat` | `quaternius-nature/wheat` |

Score 1.000 over all eight views (`Quaternius/Wheat` 0.9997): the renders are identical.
Three of them sit in the catalogue under the same name in the imported version of
their own kit (`pirate-kit/tool-paddle`, `quaternius-nature/wheat`, `forest/rock-2-c`);
`kenney_castlekit/tree-log` and `kenney_platformer-kit/chest` are in the catalogue
under another kit — Kenney ships the same model in more than one pack.

### Lowest scores

`kenney_holidaykit/hanukkah-menorah-candles` (0.389),
`modular_terrain_collection/Hilly_Prop_Camp_Lean_To` (0.504),
`FantasyProps/Stall_Cart_Empty` (0.504), `Quaternius/Corn_1` (0.506),
`Modular Village/Prop_Hay_1` (0.506) and `nature_kit/Tent_Leanto_1` (0.517).
A menorah, two lean-to tents, a market cart, a corn plant and a hay bundle: shapes
the catalogue has nothing of.

### What gets picked most often

`dungeon/shelf-large`, `props/mushroom-a`, `pirate-kit/chest` and
`dungeon/barrel-small` are each the closest match for four different missing models,
`props/box-a`, `restaurant/crate` and `dungeon/chair` for three. Round crowns, chests
and barrels: the catalogue has one archetype of each and everything of that kind
lands on it.

## All matches

### FantasyProps_glTF_1k (21)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Barrel` | `props/barrel-a` | 0.879 |
| `Shelf_Simple` | `dungeon/shelf-large` | 0.809 |
| `Crate_Metal` | `props/box-a` | 0.788 |
| `FarmCrate_Empty` | `restaurant/crate` | 0.756 |
| `Stool` | `dungeon/table-small` | 0.753 |
| `Bucket_Metal` | `props/bucket-a` | 0.744 |
| `Whetstone` | `rpgtools/grindstone` | 0.743 |
| `Bench` | `dungeon/shelf-large` | 0.728 |
| `Pickaxe_Bronze` | `rpgtools/pickaxe` | 0.721 |
| `Chest_Wood` | `dungeon/chest-gold` | 0.719 |
| `Anvil` | `rpgtools/anvil` | 0.717 |
| `Candle_1` | `dungeon/candle-melted` | 0.677 |
| `Chair_1` | `survival-kit/structure-roof` | 0.664 |
| `Crate_Wooden` | `dungeon/chest-gold` | 0.663 |
| `Banner_1` | `fantasy-town-kit/banner-green` | 0.639 |
| `Table_Knife` | `village-kit/boat-oars-b` | 0.614 |
| `Bed_Twin1` | `pirate-kit/structure-platform-dock-small` | 0.606 |
| `Axe_Bronze` | `rpgtools/pickaxe` | 0.601 |
| `Coin` | `prototype-kit/coin` | 0.596 |
| `Stall_Empty` | `pirate-kit/structure-fence-sides` | 0.554 |
| `Stall_Cart_Empty` | `village-kit/cart-a` | 0.504 |

### Ultimate_Nature_Pack_by_Quaternius_OBJ (17)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Wheat` | `quaternius-nature/wheat` | 1.000 |
| `Rock_Moss_1` | `quaternius-nature/rock-1` | 0.981 |
| `PalmTree_2` | `natuur/tree-palm-3` | 0.739 |
| `Bush_1` | `natuur/stepping-stone-1` | 0.733 |
| `BirchTree_1` | `rocks/rock-natural-d` | 0.646 |
| `BushBerries_1` | `quaternius-nature/rock-5` | 0.637 |
| `TreeStump` | `rocks/rock-natural-h` | 0.615 |
| `Plant_3` | `forest/grass-2-c` | 0.600 |
| `Plant_1` | `pirate-kit/palm-detailed-bend` | 0.599 |
| `BirchTree_Snow_4` | `rocks/rock-natural-d` | 0.598 |
| `Willow_1` | `rocks/rock-natural-b` | 0.580 |
| `Cactus_1` | `quaternius-nature/cactus-3` | 0.573 |
| `CommonTree_2` | `rocks/debris-b` | 0.569 |
| `Plant_4` | `pirate-kit/palm-detailed-bend` | 0.543 |
| `Plant_2` | `natuur/tree-bare-2` | 0.539 |
| `Grass_2` | `forest/grass-2-d` | 0.530 |
| `Corn_1` | `modulair-terrein/beach-prop-tree-palm-c` | 0.506 |

### LowPolyNaturePackLite (14)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `simple_bush` | `forest/rock-3-b` | 0.953 |
| `mushrooom01_red` | `props/mushroom-a` | 0.890 |
| `pine01` | `natuur/tree-pine-2` | 0.855 |
| `bush_berries_red` | `natuur/rock-1` | 0.792 |
| `fence` | `platformer-kit/fence-straight` | 0.763 |
| `rock` | `rocks/rock-natural-e` | 0.754 |
| `dead_tree` | `natuur/tree-bare-4` | 0.710 |
| `hat_mushroom_brown` | `natuur/mushroom-red-spotted` | 0.703 |
| `tree_dead01` | `natuur/tree-bare-4` | 0.672 |
| `tent_blue` | `fantasy-town-kit/roof-left` | 0.636 |
| `grass03` | `forest/grass-2-b` | 0.616 |
| `tree01` | `props/mushroom-a` | 0.615 |
| `plant02` | `natuur/tree-palm-2` | 0.610 |
| `flower02_orange` | `modulair-terrein/hilly-prop-flower-daisy` | 0.543 |

### kenney_graveyardkit_5.0 (13)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `detail-plate` | `dungeon/plate-small` | 0.913 |
| `detail-bowl` | `dungeon/plate-small` | 0.778 |
| `hay-bale-bundled` | `dungeon/trunk-large-c` | 0.761 |
| `debris-wood` | `survival-kit/resource-planks` | 0.725 |
| `shovel` | `rpgtools/shovel` | 0.720 |
| `fence` | `platformer-kit/poles` | 0.708 |
| `lantern-glass` | `dungeon/barrel-small` | 0.708 |
| `detail-chalice` | `village-kit/well-inside` | 0.699 |
| `hay-bale` | `natuur/log-1` | 0.692 |
| `fence-damaged` | `platformer-kit/fence-broken` | 0.689 |
| `lightpost-single` | `pirate-kit/flag-high` | 0.679 |
| `trunk` | `pirate-kit/rocks-sand-b` | 0.669 |
| `trunk-long` | `pirate-kit/rocks-sand-b` | 0.624 |

### kenney_platformer-kit (13)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `chest` | `pirate-kit/chest` | 1.000 |
| `crate-item` | `dungeon/box-small` | 0.949 |
| `barrel` | `dungeon/barrel-small` | 0.869 |
| `crate` | `props/box-a` | 0.830 |
| `fence-low-corner-curved` | `platformer-kit/fence-corner-curved` | 0.792 |
| `key` | `dungeon/key` | 0.781 |
| `tree-pine-small` | `survival-kit/tree` | 0.757 |
| `crate-strong` | `props/box-a` | 0.707 |
| `flowers-tall` | `platformer-kit/mushrooms` | 0.687 |
| `door-rotate` | `dungeon/wall-doorway-scaffold` | 0.660 |
| `tree` | `fantasy-town-kit/tree-high-round` | 0.658 |
| `saw` | `rocks/rock-natural-d` | 0.647 |
| `trap-spikes-large` | `dungeon/floor-tile-big-spikes` | 0.581 |

### KayKit_Forest_Nature_Pack_1.0_FREE (9)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Rock_2_C_Color1` | `forest/rock-2-c` | 1.000 |
| `Bush_1_A_Color1` | `pirate-kit/cannon-ball` | 0.939 |
| `Tree_3_A_Color1` | `natuur/mushroom-grey` | 0.770 |
| `Tree_1_A_Color1` | `props/mushroom-a` | 0.761 |
| `Tree_4_B_Color1` | `fantasy-town-kit/tree-high-crooked` | 0.733 |
| `Bush_2_E_Color1` | `forest/rock-2-e` | 0.679 |
| `Tree_1_C_Color1` | `props/mushroom-a` | 0.663 |
| `Tree_3_C_Color1` | `natuur/mushroom-grey` | 0.642 |
| `Tree_2_B_Color1` | `forest/rock-2-h` | 0.592 |

### KayKit_Furniture_Bits_1.0_FREE (9)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `chair_stool_wood` | `dungeon/stool` | 0.858 |
| `shelf_A_big` | `dungeon/shelf-large` | 0.806 |
| `book_set` | `fantasy-props/book-group-small-3` | 0.793 |
| `table_medium` | `props/table-a` | 0.774 |
| `book_single` | `fantasy-props/book-simplified-single` | 0.753 |
| `chair_B_wood` | `dungeon/chair` | 0.730 |
| `chair_A_wood` | `dungeon/chair` | 0.709 |
| `shelf_B_large` | `dungeon/shelf-large` | 0.701 |
| `bed_single_B` | `resources/wood-planks-stack-small` | 0.649 |

### kenney_survival-kit (8)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `chest` | `pirate-kit/chest` | 0.835 |
| `tool-axe` | `survival-kit/signpost-single` | 0.821 |
| `tree-autumn-trunk` | `natuur/stump-2` | 0.734 |
| `tree-trunk` | `natuur/stump-2` | 0.734 |
| `tool-hammer` | `platformer-kit/arrow` | 0.712 |
| `bucket` | `props/jug-c` | 0.689 |
| `grass-large` | `forest/grass-1-d` | 0.634 |
| `grass` | `forest/grass-1-c` | 0.604 |

### PropsLite_FBX (7)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Coin_01` | `modulair-terrein/hilly-prop-stepping-stones-e` | 0.838 |
| `Candle_02` | `halloween/candle` | 0.825 |
| `Fence_01` | `platformer-kit/fence-straight` | 0.818 |
| `Food_04` | `restaurant/food-ingredient-ham` | 0.784 |
| `Pointer_03` | `survival-kit/signpost` | 0.768 |
| `Coin_03` | `pirate-kit/rocks-a` | 0.755 |
| `Candle_01` | `rpgtools/file` | 0.710 |

### kenney_mini-dungeon (7)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `chest` | `pirate-kit/chest` | 0.955 |
| `wood-structure` | `mini-forest/building-structure` | 0.920 |
| `barrel` | `dungeon/barrel-small` | 0.869 |
| `potion` | `survival-kit/bottle-red` | 0.798 |
| `key` | `dungeon/key` | 0.788 |
| `trap` | `dungeon/coin-stack-small` | 0.710 |
| `chair` | `dungeon/chair` | 0.686 |

### kenney_mini-forest_1.0 (7)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `fence` | `platformer-kit/fence-rope` | 0.826 |
| `flag` | `pirate-kit/flag` | 0.766 |
| `rocks-high` | `forest/rock-1-m` | 0.680 |
| `building-platform` | `pirate-kit/structure-platform-dock-small` | 0.644 |
| `tent` | `survival-kit/tent-canvas` | 0.625 |
| `weapon-arrow` | `dungeon/key` | 0.615 |
| `building-roof` | `pirate-kit/structure-roof` | 0.556 |

### modular_terrain_collection (7)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Hilly_Prop_Bush_2` | `modulair-terrein/hilly-prop-rock-d` | 0.921 |
| `Hilly_Prop_Tree_Oak_1` | `modulair-terrein/hilly-prop-mushroom-a` | 0.824 |
| `Hilly_Prop_Tree_Cedar_1` | `fantasy-town-kit/tree-high-round` | 0.808 |
| `Beach_Prop_Treasure_Chest` | `dungeon/chest` | 0.760 |
| `Hilly_Prop_Camp_Sitting_Log` | `natuur/log-1` | 0.712 |
| `Hilly_Prop_Hollow_Trunk` | `village-kit/waterwheel-flume-end` | 0.631 |
| `Hilly_Prop_Camp_Lean_To` | `fantasy-town-kit/roof-gable-detail` | 0.504 |

### kenney_castlekit (6)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `tree-log` | `survival-kit/tree-log` | 1.000 |
| `rocks-small` | `survival-kit/rock-sand-b` | 0.878 |
| `tree-large` | `fantasy-town-kit/tree` | 0.855 |
| `tree-small` | `fantasy-town-kit/tree-crooked` | 0.801 |
| `tree-trunk` | `survival-kit/resource-stone` | 0.776 |
| `door` | `pirate-kit/chest` | 0.623 |

### nature_kit (6)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Mountain_1` | `natuur/mountain-4` | 0.896 |
| `Tree_Oak_1` | `natuur/coconut` | 0.847 |
| `Tree_Cedar_1` | `fantasy-town-kit/tree-high-round` | 0.794 |
| `Tree_Oak_3` | `natuur/coconut` | 0.765 |
| `Tree_Oak_8` | `modulair-terrein/shared-prop-boulder-d` | 0.616 |
| `Tent_Leanto_1` | `fantasy-town-kit/roof-gable-detail` | 0.517 |

### kenney_pirate-kit (5)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `tool-paddle` | `pirate-kit/tool-paddle` | 1.000 |
| `palm-bend` | `pirate-kit/palm-detailed-bend` | 0.913 |
| `barrel` | `dungeon/barrel-small` | 0.868 |
| `crate` | `restaurant/crate` | 0.804 |
| `tool-shovel` | `pirate-kit/tool-paddle` | 0.766 |

### TropicalIslandLite_FBX (4)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Rock_01` | `natuur/rock-6` | 0.900 |
| `PalmTree_05` | `natuur/tree-palm-3` | 0.768 |
| `Pier_02` | `modular-cave-kit/template-floor-layer-raised` | 0.676 |
| `Chest_01` | `restaurant/crate` | 0.671 |

### kenney_holidaykit (4)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `cabin-fence` | `halloween/bench` | 0.761 |
| `lantern` | `rpgtools/chisel` | 0.621 |
| `lantern-hanging` | `rpgtools/lantern` | 0.555 |
| `hanukkah-menorah-candles` | `dungeon/floor-tile-big-spikes` | 0.389 |

### kenney_fantasy-town-kit_2.0 (3)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `stall-stool` | `props/stool-a` | 0.782 |
| `stall-bench` | `fantasy-town-kit/overhang` | 0.773 |
| `stall` | `props/table-a` | 0.742 |

### KayKit_Restaurant_Bits_1.0_FREE (1)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `chair_B` | `dungeon/stool` | 0.679 |

### Modular Village (1)

| Model | Closest catalog match | Score |
| --- | --- | ---: |
| `Prop_Hay_1` | `dungeon/trunk-small-c` | 0.506 |
