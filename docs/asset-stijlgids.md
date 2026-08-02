# Asset style guide

For an LLM creating or adjusting assets.

## 1. Color
- All colors come from `palet.json`.
- One shared colormap image only: assets color themselves by pointing UVs at its cells.
- New cells may be added if the hex already exists in the palette.
- A genuinely new color only on explicit request, and always added to the shared palette + colormap.

## 2. Geometry
- Flat-piece construction, always. Round shapes must be visibly built from flat pieces.
- Max 24 flat pieces per full circle.

## 3. Outlines and shading
- No outlines; only on explicit request per asset.
- Faces use flat palette colors; existing gradient cells may be used — no invented shades. Light and shadow come from the scene at render time.

## 4. Scale
- World grid: one wall/floor segment = 1 × 1 unit footprint, wall height = 1 unit.
- Modular pieces follow this unit, footprints in whole or half units.
- Props are sized to sit believably against that grid.

## 5. Origin and orientation
Base on Y = 0; pivot at footprint centre in X/Z. Deviate only deliberately, for a functional reason.

## 6. File format
`.glb`, one model per file. Other formats only on request.

## 7. Verification
Before delivering: render from a few angles, check against these rules (flat-piece look, palette colors, base at Y = 0, grid fit), and show the renders.

---

## Running the check

`node tools/controleer-assets.mjs` measures rules 1–6 across every `.glb` in
`kits/` and exits non-zero on a hard violation. Use `--kit <slug>` to narrow it
down and `--json` for the full per-model numbers.

The script separates two kinds of findings:

- **Overtredingen** — things it can call wrong on its own: a color that does not
  come from the shared colormap, UVs pointing outside `palet.json`, a circle of
  more than 24 pieces, an embedded or diverging texture, an outline mesh.
- **Aandachtspunten** — the rules that end in "deviate only deliberately". An
  off-grid footprint, a base away from Y = 0 or averaged normals on a hard edge
  can each be the right call (a roof overhangs its eaves, a rock sinks into the
  terrain, a windmill pivots on its hub). The script reports them and leaves the
  judgement to you.

Rule 7 stays manual: render and look. `tools/` has no renderer — the catalog at
`index.html` uses model-viewer and is the quickest way to see a model from a few
angles.
