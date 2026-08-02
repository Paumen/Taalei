# Asset style guide

For an LLM creating or adjusting assets.

## 1. Color
- All colors come from `palet.json`. One shared colormap image only: assets color themselves by pointing UVs at its cells.
- A new color only on explicit request, and always added to the shared colormap.
- Cave kit is exempt from above rules.

## 2. Geometry
- Flat-piece construction, always. Round shapes must be visibly built from flat pieces.
- Max 16 flat pieces per full circle equivalent.

## 3. Outlines and shading
- No outlines; only on explicit request per asset.
- Faces use flat palette colors; existing gradient cells may be used — no invented shades. Light and shadow come from the scene at render time.

## 4. Scale
- World grid: one wall/floor segment = 1 × 1 unit footprint, wall height = 1 unit. Tolerance 5%.
- Modular pieces follow this unit, footprints in whole or half units. Footprint = the grid tiles the piece occupies, not its bounding box. Detail may overhang the tile (eaves, handrails, banners)
- Props are sized to sit believably against that grid.

## 5. Origin and orientation
Base on Y = 0; pivot at footprint centre in X/Z. Deviate only deliberately, for a functional reason.

