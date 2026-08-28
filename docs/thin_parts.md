# Thinnest parts in the catalog

The style guide asks for chunky, toy-like shapes — "not thin or spindly", with
building panels the one exception. This is the measurement behind that: for
every catalogue model, how thin is its thinnest solid part?

    node tools/dunste-delen.mjs [--aantal 20] [--ondergrens 0.001] [--kit <slug>] [--json <path>]

## Method

- A **part** is one connected piece of mesh: vertices are first welded on their
  world position, then triangles are unioned, the same way `tools/afsplitsen.mjs`
  picks a part. A model that reads as one object usually holds several — the
  handle of a jug, each plank of a fence. The 915 catalogue models hold 5790
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
  like measure zero: 20 of the 5790 parts are exactly coplanar, and 8 more (all
  quads in `pirate-kit/structure-roof` whose corners miss coplanarity by a hair)
  come out between 10⁻⁸ and 7 × 10⁻⁸ m. The cut-off is 1 mm and nothing real
  sits near it — the thinnest solid part in the catalogue is 1.1 mm — so it
  falls in a gap four orders of magnitude wide.
- A model is ranked by its **thinnest** part, so a single wafer in an otherwise
  chunky model is enough to put it on this list.
- 86 parts (1.5%) have a hull too fine for the exact search and fall back to a
  dense sampled direction search with a local refinement. None of them is in
  this list; checked against a ten times denser sampling, no model's figure is
  more than 0.2% off.

## Top 20

| # | model | thinnest part (mm) | that part, axis-aligned (mm) | tris | solid parts |
|--:|---|--:|---|--:|--:|
| 1 | `fantasy-props/key-gold` | **1.6** | 5 × 2 × 3 | 18 | 14 |
| 2 | `fantasy-props/key-metal` | **1.7** | 5 × 2 × 4 | 18 | 7 |
| 3 | `fantasy-props/book-stack-2` | **3.8** | 5 × 24 × 11 | 28 | 7 |
| 4 | `rpgtools/drafting-compass` | **4.2** | 9 × 26 × 8 | 24 | 11 |
| 5 | `modulair-terrein/hilly-prop-flower-rose` | **6.0** | 24 × 19 × 17 | 20 | 5 |
| 6 | `fantasy-props/book-7` | **6.0** | 44 × 6 × 44 | 157 | 5 |
| 7 | `fantasy-props/cage-small` | **6.0** | 17 × 6 × 18 | 22 | 210 |
| 8 | `modulair-terrein/hilly-prop-cattail-a` | **6.0** | 20 × 198 × 19 | 25 | 2 |
| 9 | `modulair-terrein/hilly-prop-cattail-b` | **6.0** | 9 × 268 × 9 | 24 | 2 |
| 10 | `modulair-terrein/hilly-prop-flower-tulip` | **6.0** | 9 × 95 × 7 | 14 | 8 |
| 11 | `natuur/cattail-1` | **6.0** | 8 × 169 × 6 | 20 | 2 |
| 12 | `natuur/cattail-2` | **6.0** | 11 × 208 × 8 | 20 | 2 |
| 13 | `natuur/cattail-3` | **6.0** | 7 × 211 × 13 | 20 | 2 |
| 14 | `natuur/cattail-4` | **6.0** | 36 × 236 × 6 | 20 | 2 |
| 15 | `natuur/cattail-5` | **6.0** | 20 × 277 × 28 | 20 | 2 |
| 16 | `natuur/flower-balloon-1` | **6.0** | 10 × 20 × 21 | 5 | 7 |
| 17 | `natuur/flower-balloon-2` | **6.0** | 22 × 10 × 22 | 5 | 6 |
| 18 | `natuur/flower-balloon-3` | **6.0** | 60 × 162 × 9 | 24 | 7 |
| 19 | `natuur/flower-bellflower-1` | **6.0** | 40 × 138 × 8 | 32 | 7 |
| 20 | `natuur/flower-bellflower-2` | **6.0** | 15 × 9 × 17 | 5 | 8 |

## Reading it

- **The catalogue now has a floor of 6 mm, with four exceptions.** Every part
  that could be brought up to it has been, with `tools/verdik-delen.mjs`: rods
  widened around their own centre-line, plates and relief stretched along their
  thinnest axis only. The four that remain are not thin so much as *small* —
  their second dimension is under 6 mm as well, so thickening alone cannot fix
  them without redrawing their outline:

  | model | thinnest part | why it stays |
  |---|--:|---|
  | `fantasy-props/key-gold` | 1.6 mm | 12 parts (the wards, the bow) are 1.6–5.4 mm thick and only 3.1–5.8 mm wide |
  | `fantasy-props/key-metal` | 1.7 mm | same shape, 6 such parts |
  | `fantasy-props/book-stack-2` | 3.8 mm | one 28-triangle bookmark, 3.8 mm thick and 5.2 mm wide |
  | `rpgtools/drafting-compass` | 4.2 mm | both leg tips, 4.2 mm in two directions at once |

- Everything else in the list below sits exactly at the 6.0 mm floor, so the
  ranking past rank four is only an artefact of rounding.

- `rpgtools/journal-open` used to be thinnest of all at 1.1 mm: the text on its
  two open pages is modelled as relief, five short strokes at 1.1 mm and twelve
  full-width lines at 3.7 mm on a book body 97 mm thick. All nineteen are now at
  6 mm, which reads as bolder lettering standing prouder of the page.
- `village-kit/door-simple` carried a 12-triangle plate of 2.4 × 72 × 36 mm,
  its thin direction exactly along the world x-axis — an axis-aligned panel
  rather than a bevel running out to an edge. That one and the door's second
  thin part are now 6 mm.
- For scale: the median model's thinnest part is 40 mm; 4 models
  have a part under 6 mm, 85 under 10 mm.
