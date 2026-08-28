# Colour conventions and rules

Recovered from the repository's own history and checked against
`kits/colormap.png`, `catalog/catalog.json` and the tools in `tools/` as they
stand today. Nothing here is new.

**Where the rules come from.** The binding set is the fourteen numbered rules
settled with the PO and applied model by model in **PR #81** (merged), extended
by **#82** and **#83**. Two earlier drafts, **#79** and **#80**, proposed a
fuller colour↔material table; both were closed unmerged and are kept in §7 as a
proposal, not as rules. Everything else comes from commit messages and from
tools that have since been deleted. `docs/asset_style_guide.md` §1 states the
principle; this file is the detail.

## 1. The shared colormap

`kits/colormap.png` is 512 × 512, read as a grid of **16 columns × 4 rows**
(`COLUMNS`/`ROWS` in `catalog/tools/build-catalog.mjs`, `KOLOMMEN`/`RIJEN` in the
Dutch tools). A cell is 32 × 128 px and is called a *lane* (`baan`).

- A lane is **one colour horizontally** and a **light-to-dark gradient
  vertically**. Where a UV sits in that gradient *is* the baked shading; the
  ramp is for shading within one colour, not for extra colours.
- A model points its `TEXCOORD_0` at a lane, and may use several lanes — a lane
  is not a boundary a model must stay inside.
- **Black is empty atlas space and no UV may land on it.** 17 of the 64 cells
  are filled today; the rest are empty.
- **One colormap per model** — `build-catalog.mjs` throws
  `more than one colormap in a single model`.
- Every kit carries its own copy at `<kit>/Textures/colormap.png`; a change to
  the shared map has to be written to all of them (`#83`). Today 28 copies are
  byte-identical to `kits/colormap.png`; `modular-cave-kit` has a map of its own
  and is not part of this.
- **The model is the record.** The catalogue reads colours out of the `.glb` —
  the lanes its UVs touch, sampled halfway down the lane, or the material's
  `baseColorFactor`. `kits/palet.json` was a second bookkeeping that drifted
  (for 107 of 764 models it named colours the model no longer wore) and was
  deleted with `tools/toets-palet.mjs` in `ffdc11f` (#66).

## 2. The material rules (#81, settled with the PO)

Numbering is #81's own.

1. **Flowers may be any colour** — the flower is free; stems and leaves follow
   foliage green.
2. **Bone is off-white** (5,2). Was already so everywhere.
3. **Paper is off-white, in the lower half of the lane** — maps, scrolls and all
   eleven fantasy-props books were recoloured, including solid page tops and
   sides that have no page geometry of their own.
4. **All off-whites are the lighter halloween-candle tone.** Lane 5,2's own
   gradient was changed (bottom `#d9d3d2` → `#ece6da`) in the shared map and in
   every kit copy. It still reads `#fffff5 → #f5f2e7 → #ece6da` today.
5. **Ceramic is cleaned up**: slate-blue outliers to taupe, the fantasy-props
   vases to terracotta. Pans and pots are metal — retagged and recoloured to
   steel / cast iron.
6. **Textile** carries off-white, salmon (13,0), khaki (14,0) or brown (12,0 —
   since retired, see #83).
7. **Bottles are glass or ceramic**: dark green (1,1), dark red (8,0) or
   terracotta. Labels white.
8. **Colour variants**: the dungeon ceramic bottles have green glass variants,
   and every glass bottle shape exists in red *and* green — clustered in
   `catalog/asset_variants.json`.
9. **Wood tags are split**: `timber` (sawn or worked wood) and `bark` (the
   outside of a trunk or branch); trunks and stumps with a cut face carry both.
   Today: 372 timber, 99 bark.
10. **Wood is one ladder in three lanes** — light **0,0** (surfaces, planks, cut
    faces), middle **1,0** (frames, construction), bark **2,0** (bark only, the
    darkest). All bark the same colour; **no bark lane without a `bark` tag**;
    bark with a cut face shows at least two tones. The five white birches keep
    birch white. The old wood lanes stay in use for textile, ceramic and food.
11. **The ladder is one continuous track, warmer and more saturated toward the
    dark end.** Four anchors — `#e6bc94 → #b07f5c → #845740 → #5e4232` — with
    0,0 running anchor 1→2, 1,0 running 2→3 and 2,0 running 3→4, so the lanes
    join seamlessly. Verified against the current map.
12. **Only wood belongs on the wood ladder.** Taupe (14,3) had been doing double
    duty; ten models had non-wood geometry in the ladder (stone doorways, stucco
    plinths, a clock, two lamp posts, a knife) and got their taupe back. Details
    riding along on the same lane — door handle, sign chains, well details,
    pencil tip and eraser — went back to their own lane.
13. **The gradient position inside a lane comes from the original.** An earlier
    migration anchored every model's window on the lane midpoint and threw away
    what the makers had set per model: 465 models checked, 419 restored, in the
    three wood lanes only.
14. **Which triangles are light or dark is stated in the source model.** Packs
    name their materials (`Bark_Log` / `Bark_Stump` next to `Wood_End`, `Wood`
    next to `Mushroom_Top` / `Mushroom_Bottom`) — that is the exact split, no
    approximation needed. Where a pack ships one material with one texture, the
    same split is in the UVs: separate cells or separate gradient positions per
    group. Every geometric approximation (normal within N degrees of an axis,
    distance from the centre, a fitted plane, growing until a crease) cuts
    through the bevel somewhere on an irregular trunk and leaves a rim that is
    half light, half bark. This rule is also in `CLAUDE.md`.

Added by the follow-up rounds:

15. **Candle wicks are grey or black** — the wicks of `dungeon/shelf-small-candles`
    went to charcoal 10,0 (#82). Note the contradiction: `#83`, merged
    an hour later, moved the halloween candle wicks to dark brown 2,0 instead,
    and that is where they still sit.
16. **Stone and earth are not bark**: the campfire ring stones went to taupe
    14,3 (matching `hilly-prop-rock-a`–`d`) and its earth faces to khaki 14,0;
    both had been sitting on the bark lane (#82).
17. **A retired lane is blanked to pure black**, in the shared map and in every
    kit copy, after every model on it has been moved and a repo-wide UV scan
    shows nothing samples it. That is how terracotta 12,0 (`#ab5f41`→`#865542`)
    went in `#83`: 36 models moved first — candle wicks to 2,0, dark-red bodies
    and book covers to 8,0, salmon items to 5,0, and the dungeon *decorated*
    furniture to 1,0 to match the plain furniture of its own kit.

## 3. The lanes today

Hex sampled at the middle of each filled cell of `kits/colormap.png`.

| Lane | Hex | Name | Use |
| --- | --- | --- | --- |
| 0,0 | `#cb9d78` | light wood | wood ladder 1: surfaces, planks, cut faces (372 timber models' main tone) |
| 1,0 | `#9a6b4e` | mid wood | wood ladder 2: frames and construction |
| 2,0 | `#714c39` | bark | wood ladder 3: **bark only** (99 bark models) |
| 5,0 | `#d07b56` | terracotta | fired-clay accents, salmon items, ceramic vases |
| 6,0 | `#ffb349` | amber | gold — every coin in the catalogue, plus `platformer-kit/star` and `fantasy-props/key-gold` |
| 8,0 | `#7f3927` | dark red | the catalogue's single red: fired clay, book covers, red dye, red glass |
| 10,0 | `#3e3e44` | charcoal | soot and cast iron, wheel rims, candle wicks |
| 13,0 | `#dd9f79` | salmon | light textile, pale accents |
| 14,0 | `#8f785b` | khaki | rope, thatch, earth, weathered textile |
| 1,1 | `#23562c` | pine green | dense foliage; green glass (`dungeon/bottle-a-green`) |
| 3,1 | `#6d8d33` | grass green | living ground vegetation, fresh foliage |
| 6,1 | `#474a58` | ink blue | dark cool stone (52 stone models) |
| 3,2 | `#9da4c4` | periwinkle | silver and light accents; on `journal-open` it is the handwriting, not fittings |
| 4,2 | `#2473b3` | water blue | the one saturated blue; 13 models |
| 5,2 | `#f5f2e7` | off-white | bone, paper (lower half), sails, canopy cloth, windmill blades, candles |
| 14,3 | `#88796d` | taupe | dressed warm stone, earthenware (66 stone models) |
| 15,3 | `#6d738a` | steel | metal — 71 of 129 metal models use it as their steel |

Retired: **12,0** terracotta-brown, blanked in `#83`. One colour lives off the
map: the clear glass of `rpgtools/compass-base`, `lantern` and
`magnifying-glass` (`#ffffff` in `baseColorFactor`) — the "except for one clear
glass color" in the style guide's `alphaMode` default. Every other model in the
catalogue colours itself from the colormap.

Read the use column as *where a recolour of that material should land*. It does
not run backwards: a lane does not tell you what a surface is made of (§5).

## 4. Adding and removing a colour

A colour may only be added when no existing one comes close **and** it has more
use across the catalogue than the one item prompting it; approved, it goes into
the shared colormap and all kit copies (`docs/asset_style_guide.md` §1).

The pressure runs the other way in practice: 26 lanes → 16 in `ffdc11f` (#66)
(five colours hanging on one to four models moved to a neighbour, five unused
lanes emptied), the second red merged into the first in `b4c34f1` (#64)
(`#b2413a` → `#7f3927` on seventeen models), and 12,0 retired in `#83`. The six
flowers are the standing exception to any narrowing: each keeps its own flower
colour on the same stem (rule 1).

## 5. Recolouring

- **Keep each vertex's position in the gradient.** `build-catalog.mjs` measures
  this per model as `grad` (`gradientSpread`), the vertex-weighted distance
  between the highest and lowest sample per lane. `grad: 0` means a recolour
  flattened the shading.
- **Take the light/dark split from the source, never from geometry** (rule 14),
  and take the gradient window from the original model (rule 13).
- **Move only the lanes that are actually the material.** From `a9472b1`: the
  scroll's paper turns and its rod stays; the books' pages turn and their covers
  stay; the cannon's carriage turns to wood and its barrel stays dark metal; the
  bucket's staves turn and its bands stay; the chest's body turns to wood and its
  gold stays gold; the ships' hulls turn to wood and their sails stay light.
- **Look the target lane up, don't choose it** — `a9472b1` and `90ba910` both
  take the lane the catalogue already uses for that material.
- **Never map per vertex by nearest colour.** Doing so splintered one material's
  baked gradient across several lanes: the triangular colour glitches in dungeon,
  resources, rpgtools and forest, fixed in `412a720` (#59) by choosing one lane
  per material island of the source texture.
- **Check before committing**: scan for triangles straddling two cells (split
  shared vertices where needed), render from several viewpoints including
  straight down the axis, then rebuild with `catalog/tools/build-catalog.mjs`.

### Tools

| Tool | What it does |
| --- | --- |
| `tools/herkleur-baan.mjs --van k,r --naar k,r <glb...>` | Moves whole lanes, keeping gradient position; flips it when source and target gradients run opposite ways. |
| `tools/herkleur-selectie.mjs <glb> --van --naar --bereik lo:hi` | Same, finer: target range inside the gradient, plus `--vbron` and `--box` to separate cover from pages; `--uit` writes a debug copy. |
| `tools/verplaats-cel.mjs` | Cell swap without the direction flip. |
| `tools/verplaats-selectie.mjs` | Moves by triangle range (material from the source OBJ) or by axis plane, splitting shared vertices. |
| `tools/splits-op-verloop.mjs` | Splits on the original's own colour groups — the exact method of rule 14. |
| `tools/splits-op-bron.mjs` / `tools/splits-op-obj.mjs` | Picks triangles by their cell or their named material in the source (OBJ matching is by centroid, since workfile triangle order differs). |
| `tools/splits-vertices.mjs` | Duplicates shared vertices so no triangle spans two cells. |
| `tools/normaliseer-verloop.mjs` | Anchors a lane's used window on the lane midpoint, keeping the model's shadow span. Rule 13 is the warning: this discards what the maker set. |
| `tools/herkleur-quaternius.mjs` | Replays the manual colour choices for the Quaternius kits — a re-import rebuilds the `.glb`s and throws them away. |
| `tools/herkleur-dichte-paginas.mjs` | Book-specific: finds solid page tops/sides and moves them to off-white 5,2. Reports only; `APPLY=1 node tools/herkleur-dichte-paginas.mjs <glb...>` writes. |
| `tools/zaagvlak-normaal.mjs`, `-plat.mjs`, `-groei.mjs`, `tools/kopvlak-uiteinden.mjs` | Geometric approximations — only for crisply modelled cut faces, never for irregular trunks (rule 14). |
| `tools/vergelijk-groottes/hoek.html`, `plat.html` | Render from a free azimuth/height/zoom, and render unlit so lane and shading do not blur together. |

Deleted but part of the record: `tools/kleurmap.mjs`, `tools/hermap-kleur.mjs`
(recolour by hex pair; both hexes had to exist in the model's own colormap) and
`tools/toets-palet.mjs`.

## 6. Colour does not imply material

`87022f8` measured it over 826 tagged models: the best a lane predicts is 74%
(bark for `#714c39`) and most sit between 25% and 65% — `#3e3e44` is timber only
a quarter of the time. Material tags come from the maker's own material names
(`Wood`/`DarkWood`/`LightWood` → timber, `Metal`/`Steel` → metal,
`Gold`/`Golden` → precious-metal, `Glass` → glass, `Marble` and `Wall_`/`Floor_`
→ stone, `Fabric`/`Sail`/`Cobweb` → textile, `Bone` → bone), never from the lane.

## 7. The unmerged proposal (#79, #80)

Both PRs are closed without merging. Kept here because they are the only written
attempt at a full colour↔material table, and because #81 adopted part of it. Not
in force; where it conflicts with §2, §2 wins — most visibly on wood, where the
proposal's four wood tones (terracotta, brown, tan, khaki) were replaced by the
three-lane ladder, and its brown `#995a41` at 12,0 no longer exists.

Reserved colours (one job only): grass-green — living plant matter; water-blue —
water and unmistakably blue things; amber — gold, flame and small warm-yellow
accents; off-white — the pale organics (wax, bone, paper, undyed canvas, glazed
ceramic, plaster, snow).

Paired colours (a fixed short list): pine-green — dense foliage, green glass,
green dye; brick-red — fired clay, dark leather, red dye; slate — natural rock
and iron/steel, nothing wooden; periwinkle — silver, polished highlights,
clear-glass tint; ink-blue — dark dressed stone, slate roofs, ship hulls, blue
dye; charcoal — cast iron, wheel rims, burnt wood, coal; taupe — dressed warm
stone, dead wood, unglazed earthenware.

Per material: rock → slate · dressed stone → taupe (warm builds) or ink-blue
(cool builds) · iron/steel → slate · cast iron → charcoal · copper → terracotta ·
gold → amber · silver → periwinkle · rope → khaki · bone → off-white · wax →
off-white with an amber flame · paper → off-white (aged: khaki or tan) · dyed
textile and book covers → pine-green, brick-red or ink-blue · canvas and bedding
→ off-white · leather → tan or brown, dark brick-red · glazed ceramic →
off-white · fired clay → brick-red · earthenware → taupe · roof tiles →
brick-red, slate roofs ink-blue · glass → pine-green, off-white/periwinkle or
water-blue · water → water-blue · snow and plaster → off-white.

Budget per model (proposed, never adopted): at most 3 lanes per prop, 4 the
ceiling, assemblies exempt; one colour per material within a model, a second
wood tone allowed for frame-versus-panel contrast; at most one accent colour.

## 8. Where the collection stands

Measured from the current `catalog/catalog.json`:

- **The bark lane holds 140 models, 46 of them without a `bark` tag** — against
  rule 10. Forty-five are in the six Quaternius kits imported later (#106):
  `rpg-quaternius` alone has 34, including books, bags, a frying pan and the
  skeletons. Those kits have not had a colour pass.
- **Candle wicks are split** between charcoal 10,0 (#82) and dark brown 2,0
  (#83) — see rule 15.
- The wood ladder anchors and the off-white gradient of rules 4 and 11 still
  hold exactly in `kits/colormap.png`.

## 9. Rules the style guide dropped

These stood in `docs/asset_style_guide.md` §1 until `e0442a1` (Paumen, 26 Aug
2026) rewrote the section. Recorded as history, not reinstated:

- *"Avoid transparency and emissive, unless it's core part of the piece's
  appearance. Add note to PO when you used it."* — partly survives as the
  `alphaMode: "OPAQUE"` default with the one clear-glass exception.
- *"Cave kit is exempt from above rules."* — the cave part left the catalogue in
  `e70a10e` (#61); `modular-cave-kit` still has its own colormap.
- *"Underwater kit is exempt too: imported pack, no colormap at all…"* — that kit
  left the catalogue in `e70a10e` too, and today's Ocean group is on the shared
  colormap like everything else.
