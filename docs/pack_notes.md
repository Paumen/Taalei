# Pack notes

What a source pack does that its neighbours do not. Read the row for the pack
before writing an import spec; `tools/importeer/inspect-source.mjs` and
`tools/importeer/learn-bands.mjs` answer the rest.

## Atlas grid

A pack whose texture is a band grid needs its grid passed as `raster`:

| artist | grid |
|---|---|
| KayKit | 8 × 4 |
| Kenney | 16 × 4 |
| Tiny Treats | 8 × 8 |

Quaternius, Toon Shooter and the terrain packs carry a flat colour per material
instead, so they take `kleuren` keyed by hex.

## Per pack

**Kenney Holiday Kit** — the same green serves two things: the roof surface, which
takes `ceramic` sienna, and painted wall boarding, which takes `wood-planks`. The
orange is log ends on walls (`wood-worked`) and plank goods on floors and benches
(`wood-planks`). Snow takes `ceramic` ivory. `floor-wood`, `floor-wood-snow` and
`cabin-overhang-door` ship every face twice; `ontdubbel()` drops the inward copy.

**Kenney Prototype Kit** — untextured grey stock. Walls, stairs and doorways read
as `stone-masonry` (nickel light, slate dark), the ladder as `metal-iron-cast`,
the door as `wood-beam` with a cast-iron handle. Its red accent has no home in any
wood palette and is folded into the leaf. `wall-doorway` ships every face twice.
Several source names repeat across the pack, so check a new workfile name against
the pack before importing.

**Kenney Castle Kit** — cell 13,3 is both the sandstone wall and the wooden bridge.
Walls take `stone-masonry` taupe with nickel for the lighter walkway; the bridge
deck takes `wood-planks`.

**KayKit Medieval Hexagon** — the buildings use cell 6,1 for masonry, but the same
cell is the weathered crate. Per-model mapping, not one answer for the pack.

**KayKit Restaurant Bits** — the walls are cream plaster over a teal dado. Teal has
no legal band, so the dado drops to `ceramic` taupe.

**KayKit Holiday Bits** — `band.ceramic` on plates admits only ivory and terracotta,
and both are taken at both sizes. The white plates take `metal-iron-steel`, which is
also the closest read of white.

**Tiny Treats (all)** — glass is always a separate 4-triangle primitive named
`*_GLASS` at cells 6,6 and 7,7, and it reaches past the frame it sits in. The
kitchen's green tiles have no legal band and drop to `ceramic` terracotta.
`wall_modular_tiles_kitchen_window_large_B` is authored one-sided, to be seen from
the side away from the default camera.

**Toon Shooter** — one flat colour per material. `#818491` is steel on objects,
but `str` forces `metal-iron-cast`, so a fence built from it takes slate.

**Modular Terrain Collection** — `#bead9c` is bark and `#dfd0b5` the cut face on
anything wooden; elsewhere `#bead9c` is taupe stone.

## Source defects seen so far

- **Doubled faces.** Every face present twice, the duplicate wound inward. It
  z-fights and renders as a solid backface. Kenney Holiday and Kenney Prototype
  both ship some.
- **Inward single faces.** Groove strips, door reveals and one-sided modular
  panels that face away. They show under `render.mjs --modes clay` as magenta and
  not in the catalogue thumbnails.
