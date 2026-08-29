# Catalog: colour bands used vs material tags

A per-model comparison of the colour bands recorded in `catalog/catalog.json`
(`colors`, read straight out of the `.glb`) against the material tags in
`catalog/tags.json`. Band names and ids follow Appendix A of
`docs/asset_style_guide.md`. 17 of the 18 distinct catalog colours are exactly
the mid-tone of a colormap band, so colour → band is unambiguous; `#ffffff` is
not in the colormap at all.

Scope: 1063 models, 13 material tags. The catalog records *which* bands a model
uses, not how much surface each covers, so a band that only appears as a small
accent looks the same here as one covering the whole model. Everything below is
a candidate for a render check, not a proven defect.

## Method

For every model:

- each colour is mapped to its band;
- each material tag licenses a set of bands (timber → wood light/middle, bark →
  bark, metal → grey/dark grey/terracotta-as-copper, precious-metal →
  gold/silver, stone → taupe/blue-grey/grey/dark grey, rock → grey/taupe,
  ceramic → terracotta/off-white/taupe/dark red, glass → dark green/dark red,
  bone and paper → off-white, textile → off-white/salmon/khaki/brown, rope →
  wood light/khaki, candle → off-white/yellow/dark grey);
- two mismatches are counted: **tag without its band** (the material is claimed
  but no band on the model can carry it) and **band without a tag** (a band on
  the model that none of its tags accounts for).

## Tag without its band

| Tag | Models | Mismatches |
| --- | --- | --- |
| metal | 131 | 37 |
| rock | 120 | 19 |
| precious-metal | 45 | 11 |
| stone | 129 | 6 |
| bark | 101 | 5 |
| timber | 372 | 3 |
| ceramic | 54 | 2 |
| rope | 16 | 1 |
| bone, paper, textile, glass, candle | 19/27/43/71/9 | 0 |

### metal (37)

Three separate causes, and only the first is legal:

- **Copper, rule R** — the nine `resources/copper-*` models are terracotta 5,0.
  Correct; the rule allows it.
- **Silver instead of grey** — `fantasy-props/key-metal`, `rpg-quaternius/key-3`,
  `fantasy-town-kit/cart`, `cart-high`, `watermill`, `watermill-wide`,
  `survival-kit/workbench-anvil`, `pirate-kit/flag` and `flag-high` put their
  metal on blue-grey-light 3,2. Rule R allows 3,2 as silver for jewellery only;
  for fittings, cart tyres and an anvil the rule asks for light grey 15,3.
- **Metal on a stone/dirt band** — `food-quaternius/fork`, `knife`, `spoon` and
  `fantasy-props/cage-small` are taupe 14,3 only; `pirate-kit/cannon-ball`,
  `rpgtools/tongs`, `halloween/lantern-hanging`, `lantern-standing` and
  `post-lantern` are blue-grey-dark 6,1 (the stone band) with no grey anywhere.
  Cutlery, a cage and a cannonball reading as stone is the clearest group here.
- **Metal accents too small to register** — `village-kit/barrel-a`, `barrel-a-open`,
  `barrel-b` and `bell-a`, `dungeon-quaternius/bucket`, `arch-door`,
  `ships-quaternius/boat-sail`, `dungeon/floor-tile-big-spikes`. These are
  timber models whose hoops/bands never got the metal band (rule T), so either
  the model or the tag is wrong.

### rock (19)

`rocks/pebbles-dirt-a…d` use wood-middle 1,0 — dirt on a timber lane, which
rule AB does not allow (taupe, khaki or salmon). `survival-kit/rock-*` and
`resource-stone*` (10 models) are salmon 13,0 only; `pirate-kit/rocks-sand-a…c`
and `mini-forest/stones` add terracotta 5,0; `dungeon/rubble-half` and
`rubble-large` are khaki 14,0; `rocks/debris-a`/`-b` are dark grey 10,0. Only
the khaki and salmon ones are defensible as sand/dirt (AB); terracotta and
wood-middle rocks are not.

### precious-metal (11)

The strongest cluster in the whole comparison, all in `rpg-quaternius`:
`gold-ingots` is wood-light 0,0 and nothing else — gold ingots rendered as
wood. `necklace-1/-2/-3` carry wood-light plus blue, terracotta or dark green,
with no gold or silver. `backpack`, `bag` and `book-2/-3` carry the tag with
only leather/paper bands. Either these models were never recoloured to gold
6,0 (rule R) or the precious-metal tag is wrong on them; the ingots and
necklaces look like the recolour, the bags and books like the tag.

### stone (6)

`resources/stone-brick`, `stone-bricks-stack-{small,medium,large}`,
`stone-chunks-{small,large}` are blue-grey-**light** 3,2 — the silver band —
where rule Z asks for taupe 14,3, blue-grey-dark 6,1 or light grey 15,3. One
band off, consistently across the six.

### bark (5)

`quaternius-nature/tree-birch-dead-1…5`: dark grey 10,0 + off-white 5,2, no
bark lane. Birch bark genuinely is white with dark marks, so this is a real
exception to rule M rather than an error — but nothing in the guide records it.

### timber (3)

`natuur/timber-stack-1`/`-2` are bark 2,0 only. Rule M says a cut face shows
two tones, so a stack of sawn logs should show wood-light on the ends.
`rpgtools/pencil-b-long` has no wood band at all (blue-grey-light, dark grey,
salmon, yellow) — a painted pencil, arguably fine, but then the timber tag adds
nothing.

### ceramic (2), rope (1)

`props/jug-b` and `jug-d` are grey 15,3 + khaki 14,0, outside rule E's
terracotta/off-white/taupe/dark red. `rpgtools/torch-burnt` has no rope band.

## Band without a tag

### bark lane 2,0 on 14 models with no bark tag

Rule M allows this for leather only. Legal under that exception: the eight
`rpg-quaternius` books, `backpack`, `bag`, `scroll` (cover/strap). Not covered:
`food-quaternius/chicken-leg`, `pirate-quaternius/skeleton`,
`skeleton-headless` and `pirate-henry` — meat, bone and a figure using the
darkest brown.

### wood bands with no timber, bark, rope, textile or flora tag (30)

`resources/textiles-a` and `textiles-stack-small` (cloth on a wood lane),
`resources/iron-bars` (wood-middle on iron), `pirate-quaternius/house-1…3` and
`sawmill` (wooden buildings with no timber tag), `pirate-quaternius/tree-palm-1…3`
(trunks with no timber/bark tag), `fish-quaternius/whale`,
`food-quaternius/frying-pan`, `pirate-quaternius/bottle-1`/`-2` (cork, rule V —
probably fine, tag missing), plus the `rpg-quaternius` and `rocks/pebbles-dirt`
models already listed above. The buildings, palms and textiles are tagging
gaps, not colour errors.

### `#ffffff`, not a colormap band (3)

`rpgtools/compass-base`, `rpgtools/lantern`, `rpgtools/magnifying-glass`. All
three are glass-tagged, so this is likely the transparent/glass material (rule
J) rather than a stray colour — worth confirming in the `.glb`.

### 144 models carry no material tag at all

Mostly `nature` (90) and `flora`/`foliage`, where the tag vocabulary has no
material for leaves or grass, plus 21 `fauna`. Not a colour problem, but it
means the comparison cannot say anything about a seventh of the catalog.

## What was checked on the models

Every flagged model was rendered from three viewpoints — front three-quarter,
the opposite three-quarter, and straight down the axis — before any call was
made; the sheets are in `docs/asset_review_banden/`. The renders settled several
groups the colour data alone could not:

- `gold-ingots` really is a stack of wood-coloured ingots, and the necklaces are
  a cord with a gem and no metal at all — but `backpack`, `bag` and `book-2/-3`
  are plain leather and paper with no clasp, so there the tag was the error.
- The cutlery reads brown, but the lanterns, cannonball and tongs read correctly
  as dark iron: their band was one step off the cast-iron band, not off by a
  material. `cage-small` reads as a wooden cage.
- Silver 3,2 reads distinctly lilac against the warm wood — the anvil especially.
- The rock family on salmon and terracotta is a coherent sandstone reading; only
  the dirt clods on the timber lane stood out.
- Both skeletons use the bark lane only for boots and straps, which rule M already
  allows as leather. `chicken-leg` is roast meat.
- Birch really is white-barked, copper really is terracotta, and the `#ffffff` is
  the compass glass, the lantern panes and the magnifier lens.

## Changes made

All recolours move UVs from one colormap band to another with
`tools/herkleur-baan.mjs`, which keeps each triangle's position in the gradient —
the light/dark split recorded in the model itself is preserved exactly. The
Quaternius ones are recorded in `tools/herkleur-quaternius.mjs` so a re-import
cannot silently drop them.

| Models | Change |
| --- | --- |
| `rpg-quaternius/gold-ingots`, `necklace-1/-2/-3` | wood light 0,0 → gold 6,0 (whole model for the ingots, the pendant mount for the necklaces) |
| `rpg-quaternius/backpack`, `bag`, `book-2-closed/-open`, `book-3-closed/-open` | precious-metal tag dropped |
| `food-quaternius/fork`, `knife`, `spoon` | taupe 14,3 → light grey 15,3 |
| `halloween/lantern-hanging`, `lantern-standing`, `post-lantern`, `pirate-kit/cannon-ball`, `rpgtools/tongs` | blue-grey-dark 6,1 → dark grey 10,0 (rule G, cast iron) |
| `fantasy-props/cage-small` | metal tag → timber |
| `fantasy-town-kit/cart`, `cart-high`, `watermill`, `watermill-wide`, `survival-kit/workbench-anvil`, `pirate-kit/flag`, `flag-high` | silver 3,2 → light grey 15,3; `key-metal` and `key-3` keep silver under rule S |
| `rocks/pebbles-dirt-a…d` | wood middle 1,0 → khaki 14,0 (rule AB, dirt) |
| `food-quaternius/chicken-leg` | bark 2,0 → dark red 8,0 |
| `pirate-quaternius/bottle-1`, `bottle-2` | cork off wood middle 1,0 → salmon 13,0 (rule V) |
| `quaternius-nature/tree-birch-dead-1…5` | dark markings dark grey 10,0 → bark 2,0, so the bark tag has its lane; the white trunk stays off-white 5,2 |
| `pirate-quaternius/house-1/-2/-3`, `sawmill`, `tree-palm-1/-2/-3`, `food-quaternius/frying-pan` | timber tag added |
| `resources/textiles-a`, `textiles-stack-small`, `iron-bars` | textile tag added |

`catalog/catalog.json` and `catalog/schaalgroepen.json` were rebuilt from the
models afterwards.

## Deliberately left alone

- **The six `resources/stone-*` models** stay on silver 3,2: they read as
  blue-grey stone. The gold 6,0 straps around the three brick stacks stay too,
  though rule AK reserves yellow for coins, jewellery, light and fire.
- **The rock family** — `survival-kit/rock-*`, `pirate-kit/rocks-sand-a…c`,
  `mini-forest/stones`, `rocks/debris-a/-b`, `dungeon/rubble-*` — reads as
  sandstone and dark rock and was left as it is.
- **`pirate-henry`** keeps the bark lane on skin, and both skeletons keep it on
  their leather.
- **The exceptions** (birch aside) are recorded here only: the transparent glass
  behind `#ffffff`, and copper on terracotta under rule R. Neither is written
  into `docs/asset_style_guide.md`.
- **The 144 models with no material tag** (mostly nature, flora and fauna) still
  have none; the tag vocabulary has no material for leaves or grass.

## Still open after the changes

- `fantasy-props/cage-small` now carries the timber tag but sits entirely on
  taupe 14,3, so tag and band still disagree; moving it to wood middle 1,0 would
  settle it.
- `food-quaternius/chicken-leg`'s bone is taupe 14,3 where rule C asks for
  off-white.
- `rpg-quaternius/key-4` keeps a precious-metal tag on light grey 15,3.
- `natuur/timber-stack-1/-2` (bark only, no cut face), `rpgtools/pencil-b-long`
  (timber tag, no wood band), `props/jug-b`/`jug-d` (ceramic on grey and khaki)
  and `rpgtools/torch-burnt` (rope tag, no rope band) were outside the groups
  that were acted on.
