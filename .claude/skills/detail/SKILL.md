---
name: detail
description: Normalize the level of detail of catalogue models — cut triangles on dense models by dropping minor detail, thinning repeats and swapping dense round parts for simple shapes, so they match the catalogue's style and get lighter, without losing what makes them distinctive. Use when asked to reduce tris, lower tpu, simplify dense models, or bring a kit's detail in line with the catalogue.
---

# Normalizing level of detail

Goal: models look like the catalogue's median style and carry fewer triangles
and bytes. Both at once where possible; never at the cost of what makes a
model read as its kind and its type within the kind.

`stylize` shares the goal of a coherent look but works on proportions,
thickness and size; this skill works on detail. `catalog-assets` §6 is the
rebuild, `review` the PO's verdicts.

## 1. Find candidates

- **Dense overall:** sort `catalog/build/catalog.json` on `tpu` or `tris`, or
  run `node lint/tpu.mjs` for models over their kind's budget.
- **Dense for their kind:** within kinds whose models share a specific shape,
  form and size (apple, book, cleaver, human skull, axe; not
  str-fixture-marker, str-fixture-leisure, ship, mammal, computer, toy,
  audio, instrument, phone), compare each model's `tpu` with the kind median.
  Leave out `char`, `set`, and models tagged `plural` or `comp`.
- **Look for clusters:** outliers often share a kit (styloo, m3-base, quat),
  which points at one modelling habit to treat the same way.
- **Detailed but not dense:** a model with many small parts can be a
  candidate even at an average or low `tpu`.
- **Hidden triangles:** a dense model may hide content on purpose (gold in a
  chest, food in a fridge, flowers in a coffin). Render it in `xray` mode;
  leave deliberate hidden content alone.

## 2. Methods

Only these three, unless the PO asks for more:

1. **Drop minor detail:** small feet on furniture and appliances, text and
   lettering, screws, knobs on the back, clips, decals.
2. **Thin out repeats:** fewer buttons, wheels, vents, bars, rings, shoes on
   a rack. A coin tray with 4 columns instead of 5 is still a coin tray.
3. **Swap shapes:** a dense tube, sphere or cone part becomes a plain one; a
   fine net becomes one with bigger holes.

No automatic simplification or decimation unless the PO asks for it or
approves it first. Catalogue models are already low-poly, and collapsing
edges melts rounded edges, flattens thin parts and flips faces.

## 3. Level of detail to aim for

There is no fixed number for most of this; judge each model by how it looks
next to its original and its peers, and lean on the PO's past verdicts (§6).

- Keep the core shape and the **distinctive** features, including those that
  make a model a special type within its kind: inlaid gems on a warhammer,
  numbers on a dartboard, twisted cake candles, a glowing bulb in a lamp.
  Losing them is a revert even when the kind still reads.
- A repeat's count matters in proportion to how much it is the look. Ask
  whether the result still reads as "covered in sprinkles" or "a spiral
  binding", not what share was cut: the same cut can be too much on one
  model and too little on another.
- Round parts get enough sides to stay round at catalogue scale, and no more
  than their peers use; thin shafts need fewer than wide rims or balls.
- Nets, baskets and grilles keep a regular pattern; bigger holes are fine.
- A swapped part keeps its colour, size and placement; small colour accents
  (steel hubs, amber bulbs) must survive, or `palette` fails.
- A swapped part keeps its shading: many parts run a light-to-dark gradient
  across their colour cell, and a part in one flat tone looks wrong next to
  its shaded neighbours. Compare in `pbr`, not only in clay.
- Small hardware goes freely: rivets, bolts, screws, pins and feet under a
  model. Turned legs, knobs and collars may become plain shapes. A handle or
  pull keeps what makes it graspable; a flat plate is not a pull.
- A swapped part never goes thinner than the original's thinnest tube, or
  `G27` fails.

## 4. Tool

`node tools/detail/slim.mjs` (no arguments prints help) works on a one-mesh
workfile by parts, a part being a shell of welded triangles:

- `parts <glb>` lists the parts with ids, triangles, size, centre and colour,
  grouping identical ones; `--all` lists every group and every id.
- `edit <glb> '<ops>' --out <glb>` applies `keep`, `drop`, `replace`
  (`cyl`, `cone`, `sphere`, `box`), `add` and `net`, then re-grounds and
  re-centres the model in world space if it was before. `replace` and `add`
  carry the part's colour gradient over to the new shape.

To see what a part is, `keep` it into a scratch file and render that.
Swapped shapes fit the part's oriented box: check the axis (`axis`, `flip`,
`up`), and scale slivers down, since a box around a sliver is fatter.

## 5. Process

1. Prove the approach on a handful of models across the three methods, show
   the PO before/after renders, and adjust. Only then hand batches to sub
   agents, with the approved models as the bar.
2. Per model: render the original and the result in `pbr` and `claywire`
   from two angles or more, and in `faceorient`; new magenta is a defect.
   `node lint/glb-lint.mjs <file> --only-problems` shows nothing new.
3. Colour variants that share geometry get identical edits.
4. Rebuild (`catalog-assets` §6), run the seven lints and `golden`, and
   compare with the baselines: no new errors, including `G27` thin sticks
   from new strips and `palette` from lost colour accents.
5. Put every changed model on a `review` page titled `Detail: …`, easy-to-see
   changes first, and apply the verdicts.

## 6. Calibrate

Every verdict on a `Detail:` review is the skill's memory. Before any round,
and in every sub agent's brief, run

    node tools/review/review.mjs brief --review detail

and read the kept, reverted, ★ and ✕✕ changes with their comments. Match a
new case to the closest past ones, not to a rule: copy what was kept or ★,
avoid what was reverted or ✕✕, and when the nearest examples disagree, put
the change on the review page with high doubt. When the same lesson shows
up across several models and reviews, write it into §3 in general terms.
