# Colour conventions and rules

Recovered from the repository's own history (commits, merged PRs, deleted
tools) and checked against the current `kits/colormap.png`, `catalog/catalog.json`
and the recolour tools in `tools/`. It collects what `docs/asset_style_guide.md`
§1 and §3 state in two lines, plus the rules that only ever lived in commit
messages and in tools that have since been deleted.

Where a rule is no longer in force, that is said so explicitly. Nothing here
is a new rule.

## 1. The shared colormap

`kits/colormap.png` is 512 × 512 and is read as a grid of **16 columns × 4 rows**
(`KOLOMMEN`/`RIJEN` in every tool that touches it, and `COLUMNS`/`ROWS` in
`catalog/tools/build-catalog.mjs`). A cell is 32 × 128 pixels and is called a
*lane* (`baan`).

- A lane is **one colour horizontally** and a **light-to-dark gradient
  vertically**. The vertical position of a UV inside its lane *is* the baked
  shading; there is no lighting information anywhere else in the asset.
- A model points its `TEXCOORD_0` at a lane. A model may use several lanes —
  a lane is not a boundary a model has to stay inside (mini-forest's tree takes
  the trunk from one cell and the leaves from the cell below).
- **Black is not a colour, it is empty space in the atlas. No UV may land on
  it.** 48 of the 64 cells are empty; 16 are filled.
- **One colormap per model.** `build-catalog.mjs` throws
  `more than one colormap in a single model`.
- **The model is the record.** The catalogue reads colours out of the `.glb`
  itself — the lanes its UVs point at, or the material's `baseColorFactor` —
  and samples the lane's colour at the pixel halfway down. There is no colour
  list to keep in sync. `kits/palet.json` used to be that second bookkeeping and
  it drifted: for 107 of 764 models it named colours the model no longer wore.
  It was deleted, together with `tools/toets-palet.mjs`, in `ffdc11f` (#66).

## 2. The sixteen lanes

Sampled at the middle of each filled cell of `kits/colormap.png`. The material
column is what the catalogue *already* uses that lane for, counted over the
models carrying each material tag — not a prescription invented here.

| Lane | Hex | Reads as | Conventional use |
| --- | --- | --- | --- |
| 0,0 | `#cb9d78` | light wood | **timber** — the default wood (317 tagged models), and the lane recolours target for wood |
| 1,0 | `#9a6b4e` | mid brown | second timber tone (139) |
| 2,0 | `#714c39` | dark brown | **bark** (94) — the strongest colour↔material link in the catalogue, 74% |
| 5,0 | `#d07b56` | terracotta | no material convention; a warm mid tone |
| 6,0 | `#ffb349` | gold | **precious-metal** — every coin in the catalogue, plus `platformer-kit/star` and `fantasy-props/key-gold` |
| 8,0 | `#7f3927` | dark red | the catalogue's single red (the second red was merged into it) |
| 10,0 | `#3e3e44` | dark slate | dark tone; *not* a material marker — timber a quarter of the time |
| 13,0 | `#dd9f79` | pale sand | no material convention; a light warm tone |
| 14,0 | `#8f785b` | olive brown | no material convention; an aged mid tone |
| 1,1 | `#23562c` | dark green | foliage, and the green glass of `dungeon/bottle-a-green` |
| 3,1 | `#6d8d33` | leaf green | grass and leaves |
| 6,1 | `#474a58` | blue grey | dark **stone** (52) |
| 3,2 | `#9da4c4` | light lavender | light accents; on `journal-open` it is the handwriting, not fittings |
| 4,2 | `#2473b3` | blue | the one saturated blue; 13 models |
| 5,2 | `#f5f2e7` | off-white | **bone** and **paper**, plus sails, windmill blades and canopy cloth |
| 14,3 | `#88796d` | warm grey | **stone** (66) |
| 15,3 | `#6d738a` | steel blue grey | **metal** — 71 of 129 metal models use it as their steel |

Read the material column as "where a recolour of that material should land",
which is how `a9472b1` and `90ba910` used it. It does not run backwards: a lane
does not tell you what a surface is made of (§4).

Plus exactly one colour that is *not* on the colormap: the clear glass of
`rpgtools/compass-base`, `lantern` and `magnifying-glass`, which carry
`#ffffff` in their own `baseColorFactor`. That is the "except for one clear
glass color" in the style guide's `alphaMode` default; every other model in
the catalogue (1060 of 1063) colours itself from the colormap alone.

Material defaults otherwise: `alphaMode: "OPAQUE"`, `roughnessFactor: 1`,
`metallicFactor: 0`.

## 3. Adding a colour

A new colour may only be added when no existing one comes close **and** it has
more use cases across the existing catalogue than the single item prompting it.
If approved it goes into the shared colormap (`docs/asset_style_guide.md` §1).

The pressure runs the other way in practice. The sheet was cut from 26 to 16
lanes in `ffdc11f` (#66): five colours that hung on one to four models each were
moved to a neighbouring colour, and five lanes nobody pointed at were emptied.
The second red was merged into the first in `b4c34f1` (#64) — `#b2413a` → `#7f3927`
across seventeen models — which is why there is one red. The six flowers are the
standing exception: each keeps its own flower colour on the same stem.

## 4. Recolouring

**The rule.** Move UVs between lanes keeping each vertex's position in the
gradient. Baked shading survives; a recolour that lands every vertex on one
line of the gradient has flattened the model and is wrong.
`build-catalog.mjs` measures exactly this as `grad` (`gradientSpread`): the
vertex-weighted distance between the highest and lowest sample per lane.
`grad: 0` means the shading is gone.

**Read the model's own colour groups first, never geometry.** The UVs already
record which triangles the maker meant light and which dark: same lane,
different position in the gradient. List those groups (lane + gradient position,
counted per triangle) and map light group to light lane, dark group to dark
lane. That boundary is exact. Approximating it with normals-within-N-degrees,
distance from the centre, a fitted plane, or region growing cuts through the
bevel somewhere on any irregular shape, and the fault is only visible from
certain angles — so check the result from several viewpoints including straight
down the axis (`CLAUDE.md`).

**Move only the lanes that are actually the material.** From `a9472b1`: the
scroll's paper turns and its wooden rod stays; the books' pages turn and their
covers stay; the cannon's carriage turns to wood and its barrel stays dark
metal; the bucket's staves turn and its bands stay; the chest's body turns to
wood and its gold stays gold; the ships' hulls turn to wood and their sails stay
light.

**Pick the target lane by looking it up, not by taste.** Both `a9472b1` and
`90ba910` state it the same way: the target is the lane the catalogue already
uses for that material, measured across the models already carrying the tag.
That is what the table in §2 is.

**Colour does not imply material, and material does not imply colour.**
`87022f8` measured it: over 826 tagged models the best a palette entry predicts
is 74% (bark for `#714c39`) and most sit between 25% and 65% — `#3e3e44` is
timber only a quarter of the time. Material tags come from the maker's own
material names in the source (`Wood`/`DarkWood`/`LightWood` → timber,
`Metal`/`Steel` → metal, `Gold`/`Golden` → precious-metal, `Glass` → glass,
`Marble` and `Wall_`/`Floor_` → stone, `Fabric`/`Sail`/`Cobweb` → textile,
`Bone` → bone), never from the colormap lane.

**Never recolour per vertex by nearest colour.** An import that picked, per
vertex, the nearest colour in the shared colormap splintered one material's
baked gradient across several lanes — the triangular colour glitches in
dungeon, resources, rpgtools and forest, and wrong tints in props, fixed in
`412a720` (#59). Choose **one lane per material island of the source texture**
and convert the source's baked shading into vertical position within that lane.

**Rebuild after recolouring:** `node catalog/tools/build-catalog.mjs`, since the
catalogue reads colours out of the models.

### The tools

| Tool | What it does |
| --- | --- |
| `tools/herkleur-baan.mjs --van k,r [--van k,r] --naar k,r <glb...>` | Moves whole lanes, keeping gradient position; flips the position when source and target gradients run opposite ways. |
| `tools/herkleur-selectie.mjs <glb> --van k,r --naar k,r --bereik lo:hi` | Same, finer: target range inside the gradient is settable, and `--vbron lo:hi` / `--box` narrow the selection when cover and pages share a lane. `--uit` writes a copy for debug renders. |
| `tools/normaliseer-verloop.mjs <glb> --baan k,r` | Anchors the used gradient window of a lane on the middle of that lane, keeping the model's own shadow span, so the same lane shows the same colour on every model. |
| `tools/herkleur-quaternius.mjs` | Replays the manual colour choices for the Quaternius kits — a re-import rebuilds the `.glb`s and throws those choices away, so run it afterwards. |
| `tools/herkleur-dichte-paginas.mjs` | Book-specific: finds the "solid" page top/side islands and moves them to off-white 5,2. |

Deleted but part of the record: `tools/kleurmap.mjs`, `tools/hermap-kleur.mjs`
(recolour by hex pair, both hexes had to exist in the model's own colormap) and
`tools/toets-palet.mjs`, removed in `ca365ca`/`5b9476d`/`ffdc11f` once
`palet.json` was gone.

## 5. Shading and outlines

- Faces use palette colours and gradient lanes for baked shading — the shading
  is in the UV spread, not in geometry or lights.
- **Avoid outlines** unless an outline is a distinctive core feature of the
  object's appearance; note it to the PO when used.
- **No shadow casting in assets.**

## 6. Rules that were dropped

These stood in `docs/asset_style_guide.md` §1 until `e0442a1` (Paumen,
26 Aug 2026) rewrote the section. They are recorded here as history; they are
not in force unless the PO puts them back:

- *"Avoid transparency and emissive, unless it's core part of the piece's
  appearance. Add note to PO when you used it."* — partially survives as the
  `alphaMode: "OPAQUE"` default with the one clear glass exception.
- *"Cave kit is exempt from above rules."* — moot: the cave part is outside the
  catalogue since `e70a10e` (#61).
- *"Underwater kit is exempt too: imported pack, no colormap at all. Each
  material carries its own base colour in its `baseColorFactor`. Do not remap it
  to the shared colormap — that would recolour every species. New sea assets
  either carry their own material colours or use the shared colormap; say
  which."* — also moot: the old underwater kit left the catalogue in `e70a10e`,
  and today's Ocean group is on the shared colormap like everything else.
