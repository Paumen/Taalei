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

## Summary

The two groups worth acting on first, because the model and the tag disagree in
a way a viewer would notice:

1. `rpg-quaternius` precious-metal — gold ingots and three necklaces on the
   wood lane, no gold band anywhere.
2. Metal on stone bands — cutlery, cage, cannonball, tongs and the three
   `halloween` lanterns.

Then the systematic one-band shifts: the six `resources/stone-*` on the silver
band, and the nine metal models on silver that should be light grey.
