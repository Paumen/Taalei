# Thinnest parts in the catalog

The style guide asks for chunky, toy-like shapes — "not thin or spindly", with
building panels the one exception. This is the measurement behind that: for
every catalogue model, how thin is its thinnest solid part?

    node tools/dunste-delen.mjs [--aantal 20] [--ondergrens 0.001] [--kit <slug>] [--json <path>]

## Method

- A **part** is one connected piece of mesh: vertices are first welded on their
  world position, then triangles are unioned, the same way `tools/afsplitsen.mjs`
  picks a part. A model that reads as one object usually holds several — the
  handle of a jug, each plank of a fence. The 939 catalogue models hold 5911
  parts between them.
- The **thickness** of a part is the smallest width of its tightest box: for a
  direction, the distance between the two supporting planes, and the smallest of
  those over all directions. That minimum always lies either perpendicular to a
  face of the part's convex hull or perpendicular to two of its edges at once,
  so those are the only directions the tool has to try. An axis-aligned box will
  not do: a tilted part measures far too thick that way. The windmill blades are
  the clearest case — the part sits in a 53 × 1484 × 1484 mm axis-aligned box and
  is 4.6 mm thick.
- **Flat parts have no thickness and are left out.** Leaf cards, banners and the
  like measure zero: 21 of the 5911 parts are exactly coplanar, and 8 more (all
  quads in `pirate-kit/structure-roof` whose corners miss coplanarity by a hair)
  come out between 10⁻⁸ and 7 × 10⁻⁸ m. The cut-off is 1 mm and nothing real
  sits near it — the thinnest solid part in the catalogue is 1.1 mm — so it
  falls in a gap four orders of magnitude wide.
- A model is ranked by its **thinnest** part, so a single wafer in an otherwise
  chunky model is enough to put it on this list.
- 87 parts (1.5%) have a hull too fine for the exact search and fall back to a
  dense sampled direction search with a local refinement. None of them is in
  this list; checked against a ten times denser sampling, no model's figure is
  more than 0.2% off.

## Top 20

| # | model | thinnest part (mm) | that part, axis-aligned (mm) | tris | solid parts |
|--:|---|--:|---|--:|--:|
| 1 | `rpgtools/journal-open` | **1.1** | 23 × 7 × 9 | 6 | 20 |
| 2 | `fantasy-props/key-gold` | **1.6** | 5 × 2 × 3 | 18 | 14 |
| 3 | `fantasy-props/key-metal` | **1.7** | 5 × 2 × 4 | 18 | 7 |
| 4 | `village-kit/door-ornate` | **2.4** | 2 × 72 × 36 | 12 | 5 |
| 5 | `village-kit/door-simple` | **2.4** | 2 × 72 × 36 | 12 | 6 |
| 6 | `fantasy-props/book-stack-2` | **2.7** | 23 × 32 × 6 | 116 | 7 |
| 7 | `rpgtools/compass-base` | **2.9** | 99 × 3 × 99 | 22 | 10 |
| 8 | `natuur/lamp-post` | **3.3** | 3 × 26 × 26 | 96 | 6 |
| 9 | `natuur/flower-daisy-3` | **3.3** | 35 × 95 × 9 | 24 | 6 |
| 10 | `natuur/flower-bellflower-1` | **3.4** | 6 × 13 × 14 | 5 | 7 |
| 11 | `natuur/flower-bellflower-3` | **3.4** | 13 × 6 × 14 | 5 | 8 |
| 12 | `modulair-terrein/hilly-prop-cattail-a` | **3.6** | 18 × 197 × 17 | 25 | 2 |
| 13 | `modulair-terrein/hilly-prop-cattail-b` | **3.6** | 5 × 268 × 6 | 20 | 2 |
| 14 | `natuur/cattail-3` | **3.6** | 4 × 211 × 11 | 20 | 2 |
| 15 | `natuur/cattail-4` | **3.6** | 35 × 236 × 5 | 20 | 2 |
| 16 | `natuur/cattail-2` | **3.8** | 8 × 208 × 5 | 20 | 2 |
| 17 | `natuur/cattail-5` | **3.9** | 18 × 277 × 26 | 20 | 2 |
| 18 | `natuur/cattail-1` | **4.1** | 7 × 169 × 5 | 20 | 2 |
| 19 | `natuur/flower-bellflower-2` | **4.2** | 15 × 9 × 17 | 5 | 8 |
| 20 | `rpgtools/drafting-compass` | **4.2** | 9 × 26 × 8 | 24 | 11 |

## Reading it

- Three families fill the list: **small handled props** (both keys, both
  compasses, the book stack, the lamp post), **reeds** (all five cattails and
  the two terrain props that reuse them), and **flower heads** (three
  bellflowers, a daisy).
- `rpgtools/journal-open` is thinnest of all at 1.1 mm, and the render shows
  what those parts are: the text on the two open pages is modelled as relief.
  Five short strokes of 23 × 7 × 9 mm sit at 1.1 mm and twelve full-width lines
  at 3.7 mm, on a book body that is 97 mm thick. `journal-closed`, the same
  journal shut, holds six parts and nothing under 7.2 mm — the whole difference
  between the two is that raised lettering.
- Both `village-kit` doors carry the same 12-triangle plate of 2.4 × 72 × 36 mm.
  Its thin direction is exactly the world x-axis, so it is an axis-aligned
  panel rather than a bevel or a chamfer running out to an edge.
- For scale: the median model's thinnest part is 39 mm; 25 models have a part
  under 5 mm, 88 under 10 mm.
