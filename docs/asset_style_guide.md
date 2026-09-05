# Asset style guide

For an LLM creating or adjusting assets.
Scope: items in catalog.

## 0. Look

Toy-like and iconic: chunky, slightly caricatured — not thin or spindly, except for building panels (will get the look once assembled), also not overshot into too primitively.
Clean deliberate facets, chamfered edges — rounded-soft, not noisy.
Few details,, except for organic objects.

## 1. Color
- Colors come from the shared colormap image (`kits/colormap.png`): assets color
  themselves by pointing UVs at its bands. The model is the record — the catalog
  reads the colors straight out of the `.glb`, so there is no list to keep in sync. For recoloring to shared map, baked shading via uv spread on gradient band must be maintained.
- A new color addotion can only be added if none of existing comes close and has more use cases on existing catalog than just the item added. if approved, its added to the shared colormap.
- defaults:
* alphaMode: "OPAQUE", except for one clear glass color.
* roughnessFactor: 1
* metallicFactor: 0 

## 2. Geometry
- Flat-piece construction. Max 16 flat pieces per full circle equivalent. Typically 8-12, 16 for objects that are typically only full even circle in reality and or hero objects. 

## 3. Outlines and shading
- Avoid outlines; unless it's distinctive core feature  of the object's appearance. Add note to PO when you used it.
- Faces use palette colors and gradient bands for baked shading.
- No shadow casting in assets.

## 4. Scale
- One wall/floor segment = 1 × 1 unit footprint, wall height = 1 unit.
- Assets may stretch multiple units.
- No solid pieces thinner than 0.015 units.
- Max 2000 tris per occupied grid cell. Measured as tris ÷ (max(0.49, w × d) × max(0.7, h))
  over the bounding box: a 2 × 2 floor tile is judged on four cells, and an asset smaller
  than 0.7 × 0.7 × 0.7 is judged as if it were that size.
- Imported packs get one scale factor for the whole pack.

## 5. Origin and orientation
- Default on Y = 0; pivot at footprint centre in X/Z.
- Deviate deliberately, for a functional reason.
- Split nodes put their origin at the joint.
- Objects with distinctive moving features should draw in two or more calls. Eg windmill blades, ship sails, chest cap, etc.

## 6. Reference Assets
- You must render and look reference assets before creating new assets, not just read.
- You must render at least two reference assets next to a new asset at same scale when validating.

palm-detailed-bend
ship-large
boat-row-small
cannon-mobile
tent-canvas
crate-bottles
template-floor-layer-hole
windmill (blades only)
watermill (Rad only)
mast-ropes
structure-fence-sides
lighthouse

Appendix A: Material and color rules

Band ids are column,row in `kits/colormap.png`. Where a colour name below has
an id, it is: light grey 15,3 · blue-grey 6,1 · light blue-grey 3,2 ·
blue 4,2 · off-white 5,2 · taupe 14,3 · salmon 13,0 · terracotta 5,0 ·
yellow/gold 6,0 · dark red 8,0 · dark green 1,1 · light green 3,1 ·
wood light 0,0 · wood middle 1,0 · bark 2,0.

S. Special — the one way out of every rule below.

S1. A model tagged `special` is a deliberate exception and none of the rules below
apply to it. Only the PO assigns the tag; it is not a way to silence a finding you
would rather not fix, and every model carrying it should be one you can name the
reason for.

S2. A `special` model records the reason it is one, next to the tag. A `special`
without a stated reason is a finding on the tag, not a pass for the model.

M. Material to colour — what a thing is made of, and the colour that takes.

M1. Flowers may be any colour — this is a rule of its own, not an exception, so the colour-to-material rules below do not apply to a flower. Not every flower sits in the flowers group: the cactus flowers are filed under plants with the cactus they grow on, and the rule reaches them too.
M2. Stems and leaves follow foliage green.
M3. Flowers, grass and plants do not use dark green: that band is for trees and foliage, their green is light green.
M4. Grass is light green.
M5. Trees are usually dark green. Palms are the exception: their fronds are light green.
M6. Bones and skulls are off-white.
M7. Paper is off-white.
M8. Ceramics are usually terracotta, off-white, taupe, or dark red.
M9. Metal is usually light grey 15,3.
M10. Steel/cast iron can be blue-grey 6,1.
M11. Coins and metal in jewellery are usually gold 6,0, alternatively silver 3,2. Copper is terracotta 5,0. Sword and dagger grips are precious metal too: silver 3,2, so the grip reads apart from the light grey blade.
M12. Keys can be any metal or precious-metal colour.
M13. Textile: off-white, salmon 13,0, taupe 14,3 or brown 1,0. The wrapped grips and bindings on tools and weapons are one colour across the whole collection: taupe 14,3 in the light half of its gradient, 0.02-0.40. The wooden peg on a tool head and the bar of a T-handle are timber and stay in their wood lane.
M14. Rope is taupe 14,3. Not the light wood lane: rope is not timber, and against the planking it lashes it has to read as its own material. Where a model carries rope on a taupe it already holds for stone or textile, rule N2's merge applies and no extra band appears.
M15. Belts, shoes and straps are leather. A strap is leather wherever it turns up: the belt itself, the fixtures holding a book shut, the bands round a stack of bricks or a bundle of resources. Rule M35 gives leather its colour.
M16. Bottles are glass or ceramic.
M17. Glass is a special own material: transparent, or dark green or dark red.
M18. Usual colour variants: glass bottle shape exists in red and green.
M19. Roofs are usually dark red.
M20. Stone (worked stone: walls, bricks, floors) is taupe 14,3, blue-grey 6,1, or light grey 15,3.
M21. Rocks are light grey 15,3, secondarily taupe 14,3.
M22. Sand and dirt are taupe 14,3 or salmon 13,0. They are the `soil` material: laid paving and hewn stone are stone, loose boulders, gravel and rubble are rock, and a grass patch is flora sitting on the ground rather than soil of its own.
M23. Wicks are blue-grey 6,1.
M24. Light: flames and glow are yellow 6,0; candle wax and lampshades are off-white 5,2.
M25. All cork is taupe 14,3 — one colour across the whole collection, stoppers and everything else cut from cork bark.
M26. Fauna use naturalistic colours — off-white, salmon, taupe; fish may also be blue 4,2 or light blue-grey 3,2.
M27. The bands on barrels, chests, buckets, trunks, kegs, crates and boxes are metal, and that metal is light grey 15,3 — not the blue-grey of rule M10 and not a brown of its own. A band is metal whatever the model it sits on is made of.
M28. All chests, barrels, kegs, buckets, boxes, crates are mainly timber, regularly with metal accents.
M29. Structures and furniture are usually (predominantly) made of timber, and secondly stone (bigger type, not modern bricks); metals are used sparingly.
M30. Food is naturalistic — off-white 5,2, salmon 13,0, terracotta 5,0, dark red 8,0 or taupe 14,3; cheese is the one yellow 6,0. The bone in the meat follows rule M6 and the plate or bowl it is served on follows its own material.
M31. A liquid takes its own colour, and it is dark red 8,0, dark green 1,1 or blue 4,2: the colour of the potion in a filled flask is what says which potion it is, but it is one of those three and not any band it likes. Like the flowers of rule M1 this is a rule of its own, so the colour-to-material rules below do not reach the liquid — within those three bands. The flask around it follows rule M16 and its stopper rule M25.
M32. Meat is one colour across the whole collection: terracotta 5,0 in the dark half of its gradient, 0.55-1.00, the same way rule M13 holds the wrapped grips to one colour. That covers the joint, the drumstick, the ham, the steak and the roast bird; a cut or inner face stays the darker end of that same range rather than taking a band of its own. The bone follows rule M6, the fat rim the off-white beside it, and the plate or bowl its own material.
M33. What sits next to the meat on the plate is not meat, and rule M32 does not reach it: the mash on plate-food-a, plate-food-b and food-dinner, the carrots and potatoes in food-stew and on the dinner plate, the peas. Read it from the source model before recolouring — on our palette a mash mound and a slab of meat can both land on salmon 13,0, but the pack they came from gives them different colours and says which is which. food-stew and plate-food-b hold no meat at all, only vegetables and a bone.
M34. Buckles are metal: light grey 15,3. That covers the buckle on a belt, on a strap and on a bag, whatever the strap it closes is made of.
M35. Leather is bark 2,0 — the darkest brown lane of rule G1. That is why G1 lets a leather-look surface take the bark lane without carrying a bark tag: belts, straps, boots, bracers, quivers, satchels and book covers are all one brown.
M36. Gemstones are dark red 8,0, dark green 1,1 or blue 4,2 — the stone set in a ring, a necklace, an amulet or a hilt. The metal around it follows rule M11.
M37. Book covers are bark 2,0 (the leather of rule M35), dark red 8,0, dark green 1,1 or blue-grey 6,1. The pages follow rule M7 and the clasps and corners rule M9.
M38. Timber is wood light 0,0 or wood middle 1,0. Which of the two a given surface takes is rule G1; a model carrying timber shows at least one of them.
M39. Bark is bark 2,0. A trunk with a cut face carries timber too and shows both lanes (rule G1), but bark itself is never anything other than the darkest lane.
M40. Foliage is dark green 1,1 or light green 3,1 — trees and their foliage take the dark green of rule M5, the small flora the light green of rules M3 and M4.
M41. A gemstone carries the `gemstone` material tag. Rule M36 gives it its colour; without the tag that rule can only excuse a band and never require one, and dark red, dark green and blue fall back to excusing every model in the coins-jewelry group — a plain gold ring as readily as a real stone.

C. Colour to material — what a band may be used on.

C1. Lighter browns are only used for timber.
C2. Darkest brown is only used for bark and leather.
C3. Terracotta is not used for timber (copper, rule M11, is the exception outside ceramics).
C4. Light grey 15,3 is only used for metal, stone, and rock.
C5. (Retired with the dark grey band it named. Cast iron moved onto blue-grey in rule M10 and wicks in rule M23. The number is not reused.)
C6. Yellow is usually only used for coins, jewellery, light, or fire — and for cheese, the one yellow food of rule M30.
C7. Dark red is only used for ceramics, glass, roofs, liquids (rule M31), gemstones (rule M36), book covers (rule M37), and very minor details or accents.
C8. Dark green is only used for foliage, glass, liquids (rule M31), gemstones (rule M36), book covers (rule M37), and very minor details or accents.
C9. Light green is only used for nature: flora and foliage, including the grass and weed accents growing on objects and structures. It is not a general-purpose accent band — a green fletching or a green stripe on an object that grows nothing is a finding, not an accent.
C10. Blue 4,2 is used sparingly: fish (rule M26), liquids (rule M31), gemstones (rule M36), and otherwise only minor details or accents.
C11. Light blue-grey 3,2 is only used for silver (rule M11) and for fish (rule M26).
C12. Blue-grey 6,1 is only used for steel and cast iron (rule M10), worked stone (rule M20), wicks (rule M23) and book covers (rule M37).
C13. The clear glass colour is only used for glass. Rule M17 makes it a material of its own; nothing that is not glass is transparent.
C14. Salmon 13,0 is only used for sand and dirt (rule M22), textile (rule M13), food (rule M30) and fauna (rule M26).
C15. Off-white 5,2 and taupe 14,3 carry no "only" clause: they are the two general-purpose bands, and the materials that may take them are named in the M block instead. An off-white or taupe surface is judged by its material's own rule, not by this block. The omission is deliberate — taupe alone is reached by sixteen of the nineteen materials, so an "only" clause on it would say nothing.

N. Counting — bands against materials.

N1. A model usually has at least one material.
N2. A model usually uses equal or more color bands than materials. Retiring a band is the exception: where the material it carried lands on a band the model already holds, the model shows fewer bands than materials and that is the merge working, not a fault. village-kit/well-a carries its rope on the stone's taupe that way; since its timber took the middle lane beside the light one (rule G1) the counts are level again, and no model in the catalogue is under the line.
N3. A model usually does not use more than twice as many color bands than materials.
N4. A model uses at most eight colour bands if it is in the characters group, and at most six otherwise. The count is in bands: rule M17 makes the clear glass a material of its own rather than a band, so a model does not spend part of its ceiling on having windows. The ceiling is on a model, and an assembly is not one — it is a scene built from catalogued models whose colours are the sum of parts that each answer to the ceiling on their own, so N4 no more counts it a second time than the C and M blocks do. This is a ceiling on the count alone — it says nothing about which bands a model may take, so a model sitting at its ceiling still answers to the C and M blocks in full. It is also the one rule of this appendix that the `special` tag does not switch off: `special` excuses a model from being told which colour a material takes, not from being told how many it may spend.
N5. Where a model came in over its N4 ceiling, it is brought under by merging bands, never by repainting: two bands that carry the same material or the same garment become one. The band with the most triangles is the one that survives, and the triangles moving onto it keep their position in the gradient, so the baked shading of rule G3 comes through the merge intact. Merging away a two-tone the model is recognised by — the hood of rogue-hooded, the gold on a hilt beside its blade — costs more than it saves; take the merge the eye does not catch.
N6. Every model named in `catalog/tags.json` exists in the catalogue. A tag entry pointing at a model that has been renamed or removed is not harmless: the model it was meant for loses that tag silently, and an untagged model is one every M and C rule above passes over without a word.

G. Gradient, lanes and look — where the tones come from, and how the result should read.

G1. Wood is one ladder in three lanes — light 0,0 surfaces/planks/cut faces, middle 1,0 frames, bark 2,0 bark only; no bark lane without a bark tag; bark with a cut face shows two tones. Leather is the one exception: leather-look surfaces (book covers, bags, straps) may use the bark lane without a bark tag.
G2. The ladder is one continuous track: #e6bc94 → #b07f5c → #845740 → #5e4232, each lane running anchor to anchor so they join seamlessly.
G3. The gradient position inside a lane comes from the original model.
G4. Which triangles are light or dark is stated in the source model — the rule that's also in CLAUDE.md.
G5. If a model had different timber hues or lightness in the source material, it uses different bands on our shared palette too.
G6. Objects with brown colours and timber usually show visible planks/trunks, and don't have a too smoothed or polished look.
