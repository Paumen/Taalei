---
name: triage
description: Decide, part by part, what is wrong with a catalogue model's level of detail and which fix fits, before any fix runs. Use first whenever a model is flagged dense (tpu), thin (G27), or too detailed or too coarse by the PO, and before running detail or lod.
---

# Triage

## Goal

Pick the right fix for each part of a model before changing anything. One
fix for a whole model goes wrong: the same cut that makes a bookcase read
better makes a blanket a dull hard block.

## Steps

1. **Where are the triangles?** `node tools/detail/slim.mjs parts <glb>`
   (`--mesh` on models of several meshes). Identical parts are grouped
   (`10× 60`). Take the parts that carry most of the triangles, until what is
   left is under the kind's budget. For a thin flag, take the part
   `tools/thin/walls.mjs <glb>` names.
2. **Look at each one.** `keep` it into a scratch file with `slim.mjs edit`
   and render it in `pbr` and `claywire` from two views. Label it by what you
   see, not by its numbers.
3. **Label and route** each part:

   | Label | Looks like | Fix | Never |
   | --- | --- | --- | --- |
   | Copies | books, bars, rivets, matches, round tops | detail: fewer, drop the small ones | smoothing each copy |
   | Soft surface | blanket, cushion, curved leg, carving | same shape, fewer triangles (automatic simplification) | a box or plain shape |
   | Hard part, too many sides | turned post, knob, many-sided ring | detail: `lathe`, swap shape | dropping it |
   | Thin | paper sheet, hairline strand | lod: thicken | dropping what makes the type |
   | Makes the type | lettering on a sign, carving on antique furniture | keep; cut elsewhere | any cut that loses it |

4. **Plan per model**: a table of part, triangles, label and fix. One model
   can take several fixes (container: copies on top, hard body below).
5. **Order**: copies and hard parts first, then soft surfaces, then thin
   parts, since cutting can make or remove thin parts.

## Asking the PO

- If the type-making parts must be cut to reach the budget, ask instead.
- A label you're unsure of goes to the PO with its render.

## Examples

- sofa-b, armchair: soft cushions and body. Simplified, 3688 → 1570 and
  2596 → 1244, look unchanged. Kept.
- bed-double, bed-single: posts were already lean; the triangles sat in the
  blanket, pillows and carved crest. Those simplified, posts left. Kept.
- wardrobe-short: four curved gold legs (252 each), simplified with the curve
  kept. Kept.
- bookcase-full: 39 books (60 each) are copies. Fewer books, not smoother
  books.
