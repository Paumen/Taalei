# Color conventions

Draft. Companion to `docs/asset_style_guide.md` §1 — that section says *where* colour
comes from (the shared colormap, `kits/colormap.png`); this one says *which band* a
surface gets.

Scope: the shared palette only. The onderwater kit and the cave kit are exempt, same as
in the style guide.

## 1. The bands

The colormap is a 16 × 4 grid of cells; fifteen carry a band. Each band is a vertical
gradient, light at the top, dark at the bottom — that range *is* the shading, so a face
picks a height in the band, never a different band, to read as lighter or darker.
"Hex" below is the band's midpoint, the value the catalog records.

| Name        | Hex       | Cell   | Light → dark        |
| ----------- | --------- | ------ | ------------------- |
| terracotta  | `#d07b56` | 5,0    | `#ed946a`–`#b36343` |
| amber       | `#ffb349` | 6,0    | `#ffd263`–`#ff952f` |
| brick       | `#7f3927` | 8,0    | `#914330`–`#6e2f1f` |
| charcoal    | `#3e3e44` | 10,0   | `#464650`–`#353539` |
| brown       | `#995a41` | 12,0   | `#ad5f41`–`#845442` |
| sand        | `#dd9f79` | 13,0   | `#f0bc96`–`#ca845c` |
| khaki       | `#8f785b` | 14,0   | `#b89d73`–`#665443` |
| dark green  | `#23562c` | 1,1    | `#206533`–`#254726` |
| light green | `#6d8d33` | 3,1    | `#8aa747`–`#517320` |
| slate       | `#474a58` | 6,1    | `#535666`–`#3b3e4a` |
| pale blue   | `#9da4c4` | 3,2    | `#c1caf2`–`#797e97` |
| blue        | `#2473b3` | 4,2    | `#29a6de`–`#1f4189` |
| off-white   | `#f4efe3` | 5,2    | `#fffff7`–`#d6d0d0` |
| taupe       | `#88796d` | 14,3   | `#a69588`–`#6a5d53` |
| steel       | `#6d738a` | 15,3   | `#83889f`–`#585d76` |

Names are for talking and reviewing; nothing reads them. The `.glb` stays the record.

## 2. Colour → material

Two kinds of band. **Reserved** bands mean one thing: seeing that colour anywhere in a
scene should tell you what the thing is made of. **Shared** bands are the neutral
building stock; they say "wood" or "stone" but not which.

### Reserved — one material each

| Band        | Means                                          | Do not use for                    |
| ----------- | ---------------------------------------------- | --------------------------------- |
| light green | living grass and low leaf: grass, ferns, crops  | tree canopy (that's dark green)    |
| dark green  | large foliage: canopy, bush, moss — and bottle glass | grass, painted green woodwork |
| amber       | gold/brass, and lit flame or lamp glow          | plain metal, yellow paint          |
| blue        | water, liquid in a vessel, blue bloom           | fabric, painted blue anything      |
| brick       | fired clay: pot, tile, roof tile, brickwork     | red paint, red fabric              |
| off-white   | undyed matter: wax, bone, paper, plain textile, rope, glazed ceramic, shell | paint, plaster, snow |

Dark green carrying two things (canopy *and* bottle glass) is deliberate and the one
overload we keep: the bottle reads by silhouette, never by colour, and one green fewer
is worth more than the ambiguity costs.

### Shared — several materials

| Band       | Materials                                                        |
| ---------- | ---------------------------------------------------------------- |
| brown      | timber (default), leather, bark, dark earth                        |
| terracotta | timber (warm, painted or fresh-cut), rooftop shingle, cloth        |
| sand       | timber (light, new plank), sacking, rope highlight, dry earth      |
| khaki      | weathered timber, rope, canvas, dry reed, mud                      |
| taupe      | cut stone, plaster, mortar, dry bone-dry earth                     |
| steel      | rock, iron, stone that is not cut                                  |
| slate      | dark stone, roof slate, deep shadow-stone, blued iron              |
| charcoal   | blackened iron, char, soot, night wood                             |
| pale blue  | silver, polished metal, clear glass, ice                           |

## 3. Material → colour

Some materials get exactly one band; picking is not a choice there. Others get a small
set, with a default. Nothing outside the set without saying why in the PO note.

| Material                    | Bands                                        |
| --------------------------- | -------------------------------------------- |
| wax (candle)                | off-white — only                              |
| bone, shell                 | off-white — only                              |
| paper, parchment            | off-white — only (ink/seal may add brick)     |
| rope, cord                  | khaki default, sand for new rope              |
| plain textile, canvas       | off-white default, khaki, terracotta, sand    |
| grass, crop, low leaf       | light green — only                            |
| tree canopy, bush, moss     | dark green — only                             |
| timber                      | brown default; terracotta, sand, khaki, charcoal |
| cut stone, plaster          | taupe default; slate                          |
| rock, boulder, pebble       | steel default; taupe                          |
| iron, steel, tools          | steel default; charcoal, slate                |
| silver, tin, polished metal | pale blue — only                              |
| gold, brass, bronze         | amber — only                                  |
| ceramic                     | brick (unglazed) or off-white (glazed)        |
| glass                       | pale blue (clear), dark green (bottle), off-white (frosted) |
| liquid, water               | blue — only                                   |
| flame, lamp glow            | amber — only                                  |

## 4. Rules

1. One surface, one band. Shade within the band's gradient; never cross bands to shade.
2. A material's default band is what you use unless the model needs to sit apart from a
   neighbour it will stand next to.
3. Reserved bands are never decoration. No amber trim on a wooden chest, no light green
   painted shutter.
4. Reuse before adding. A new band only when no existing one comes close, it fits the
   set, and it goes into `kits/colormap.png` — same bar as the style guide already sets.
5. Deviating is allowed, deliberately, and goes in the PO note with the reason.

## 5. Where the collection stands

Counted over the 1000-odd models on the shared palette (`catalog/catalog.json`). A model
carries several bands, so these are co-occurrences, not surface area — a barrel counts
as timber and as metal.

Conventions above mostly describe what is already there:

- off-white on 100% of the candle and bone models — already a single-band material.
- light green on 84% flora / 50% foliage models; dark green 71% flora.
- amber: gold, coin, flame and flower centre — 28% precious-metal, 12% light.
- steel on 65% of rock models, taupe on 53% of stone models — the rock/stone split holds.
- brick on 64% of ceramic models, off-white on 62% — the glazed/unglazed split holds.

Where it does not, and what §2 would cost to enforce:

- light green outside flora: 10 models (food on plates, a green bottle, `well-base-grass`).
- dark green outside foliage/glass/paper/textile: 8 models (dungeon decorated tables and
  boxes, `ship-ghost`).
- amber outside gold/light/flora: 20 models (pencils, `platformer-kit/star`,
  `taalei-kit/balloon`, `resources/stone-bricks-stack-*`, `survival-kit/fish`).

Open: whether those ~38 get recoloured, or the rule bends to fit them.
