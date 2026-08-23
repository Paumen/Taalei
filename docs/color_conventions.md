# Color conventions

For an LLM creating or adjusting assets. Extends §1 of `docs/asset_style_guide.md`.
Cave kit and onderwater kit are exempt (see the style guide); everything else on the
shared colormap follows this document.

Grounded in the catalog as of 2026-08: 960 models, colors read straight from the
`.glb`s. A model's `kleuren` in `catalog/catalog.json` lists the colormap *bands*
its UVs touch — the band is the unit of color identity. `kits/colormap.png` holds
15 bands; each band is one color (its vertical ramp exists for shading within that
color, not for extra colors).

## The palette

| Name | Hex (band mid) | Band | Role |
| --- | --- | --- | --- |
| grass-green | `#6d8d33` | 3,1 | living ground vegetation, fresh light foliage |
| pine-green | `#23562c` | 1,1 | large/dense foliage; green glass; green dye |
| amber | `#ffb349` | 6,0 | gold; flame and lit glow; yellow accents |
| terracotta | `#d07b56` | 5,0 | warm planed wood; copper; fired-clay accents |
| tan | `#dd9f79` | 13,0 | pale fresh wood; sand; light leather |
| brown | `#995a41` | 12,0 | dark wood — beams, bark; roast food |
| brick-red | `#7f3927` | 8,0 | fired clay — roof tiles, pots; dark leather; red dye |
| khaki | `#8f785b` | 14,0 | weathered grey wood; rope; thatch; aged paper |
| off-white | `#f4efe3` | 5,2 | wax, bone, paper, canvas, glazed ceramic, plaster, snow |
| taupe | `#88796d` | 14,3 | dressed warm stone; dead wood; unglazed earthenware |
| slate | `#6d738a` | 15,3 | natural rock; iron and steel |
| periwinkle | `#9da4c4` | 3,2 | silver; polished metal; clear-glass tint |
| ink-blue | `#474a58` | 6,1 | dark cool stone; slate roofs; ship hulls; blue dye |
| charcoal | `#3e3e44` | 10,0 | soot and cast iron; wheel rims; burnt wood; coal |
| water-blue | `#2473b3` | 4,2 | water; unmistakably blue accents. Keep rare |
| white | `#ffffff` | (off-map) | glass glints only — 3 legacy rpgtools models. Prefer off-white |

## Rules per color

Reserved — one job, nothing else:

- **grass-green**: living plant matter only. Grass, ground plants, palm fronds,
  herbs, unripe fruit. Never wood, never dye, never food coloring beyond plant matter.
- **water-blue**: water and things that are unmistakably blue (blue flower, water on
  a map). At 8 models today it reads as special — keep it that way.
- **amber**: gold, flame/lit glow (candle flame, torch, lantern, lighthouse lamp),
  and small warm-yellow accents (flower hearts, star, cheese). Not a wood tone.
- **off-white**: the pale-organics color — candle wax, bone, paper and parchment
  pages, undyed canvas and linen, glazed ceramic, plaster, snow. Not a wood tone;
  painted wood trim on buildings is the one structural use.

Paired — a fixed short list of materials:

- **pine-green**: large and dense foliage (tree canopy, pines, bushes, cactus),
  plus green glass (bottles) and green dye (book cloth, banners, dyed textile).
- **brick-red**: fired clay (roof tiles, terracotta pots) plus dark leather (book
  covers) and red dye (banners, dyed textile).
- **slate**: natural rock, and iron/steel. Nothing wooden.
- **periwinkle**: silver, polished metal highlights (barrel hoops on fine barrels,
  blades), clear-glass tint. Nothing wooden.
- **ink-blue**: dark dressed stone (dungeon walls), slate roofs, ship hulls,
  dark iron fittings, blue dye.
- **charcoal**: soot-black — cast iron (cauldrons, cannon), wheel rims, burnt
  wood, coal.
- **taupe**: dressed warm stone (village walls, wells, floors), dead/bleached
  wood, unglazed earthenware.

The wood family — wood uses these four and only these four:

- **terracotta** — warm planed wood: furniture, barrels, crates, fences. Also copper.
- **brown** — dark wood: beams, bark, dark furniture. Also roast/baked food.
- **tan** — pale fresh-cut wood: plank faces, interiors. Also sand and light leather.
- **khaki** — weathered grey wood: driftwood, old posts, trunks. Also rope, thatch,
  aged paper.

## Rules per material

One color unless stated; pick from the listed options, don't invent new pairings.

| Material | Color(s) |
| --- | --- |
| wood, warm/planed | terracotta (faces tan, shadows brown) |
| wood, weathered / trunks | khaki (dead wood taupe) |
| tree canopy, dense | pine-green |
| grass, ground plants, palm fronds | grass-green |
| rock (natural) | slate |
| stone (dressed) | taupe or ink-blue — warm builds taupe, dungeon/cool builds ink-blue |
| iron / steel | slate |
| cast iron / soot | charcoal |
| copper | terracotta |
| gold | amber |
| silver | periwinkle |
| rope | khaki |
| bone | off-white |
| wax | off-white (flame amber) |
| paper / parchment | off-white (aged: khaki or tan) |
| book covers, banners, dyed textile | pine-green, brick-red or ink-blue |
| canvas / linen / bedding | off-white |
| leather | tan or brown (dark: brick-red) |
| ceramic, glazed | off-white |
| ceramic, fired clay | brick-red |
| ceramic, earthenware | taupe |
| roof tiles | brick-red (slate roofs ink-blue) |
| glass | green: pine-green · clear: off-white or periwinkle · blue: water-blue |
| water | water-blue |
| snow | off-white |
| plaster / stucco | off-white |

## Budget per model

- Aim for at most 3 bands per prop; 4 is the ceiling. Assemblies are exempt.
  (Today's median is 1–2; the worst prop touches 9.)
- One color per material within a model. A second wood tone is allowed for
  frame-versus-panel contrast — that is what a crate's khaki frame with tan
  panels is.
- At most one accent color (amber, water-blue, brick-red, the greens on
  non-foliage) per model.

## Known deviations (snapshot 2026-08)

Existing imported packs are the record as they stand — do not mass-recolor them;
that is a PO decision. New assets and touch-ups follow the conventions. The
deviations you will see next to your new asset:

- **Trunks**: fantasy-town-kit, mini-forest, survival-kit and pirate-kit palms use
  terracotta trunks; natuur and modulair-terrein use khaki/brown. New trees: khaki.
- **Rocks**: natuur's rocks are taupe; every other kit's rocks are slate.
- **Wood in grey bands**: 62 timber models sit in slate and 39 in periwinkle
  (greyed planks, ghost-ship wood). New weathered wood: khaki.
- **Mixed pine colors**: modulair-terrein has both grass-green and pine-green
  pines side by side.
- **Barrel hoops**: periwinkle on dungeon/fantasy-props, charcoal on props-kit.
  Either is fine per its role (polished vs cast); just don't mix within one kit.
- **Pure white**: 3 rpgtools models (compass, lantern, magnifying glass) use
  `#ffffff` off-map for glass. Prefer off-white for new glass.

## Verifying a new asset

- The catalog reads your bands back: after `build-catalog.mjs`, check the model's
  `kleuren` against the tables above.
- Render it next to its color family:
  `node tools/vergelijk-groottes/render.mjs tools/vergelijk-groottes/kleur.json <out-dir>`
  renders the color-review sheets (trees, wood, off-white family, stone) in
  `docs/asset_review_kleur/`; add your model to the matching group in
  `tools/vergelijk-groottes/kleur.json` and compare.
