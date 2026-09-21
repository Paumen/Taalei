# Pack notes

Per-pack quirks of the source packs: how a pack stores its colour, and the
defects its models carry.

## Kenney Food Kit — `ken-food`

The glb export carries flat per-material colours, no texture and no baked
shading, so a band comes from the material colour and the gradient from the
smoothed normals. The obj export holds the same colours as `Kd` values.

Utensils, leaves and other thin parts are single-sided sheets: from above they
read as backfaces, which a clay or pbr render flags magenta. Cauliflower, corn,
leek, radish, pineapple leaves, the fish fins, the cutlery, the spatula, the
whisk, the cookie cutter and the wine glass all show it.

The zips carry no licence file.

## Food Asset Pack — `food-pack`

FBX with one 512 × 512 palette texture of vertical gradient strips. The UVs are
in image space: sample without flipping v.

`Cheese_Small_With_Holes` and `Cheese_Big_Missing_Chunk_Holes` carry inverted
faces around the holes.

The zip carries no licence file and names no maker.

## RPG Mini Asset Package — `rpg-mini`

FBX with a 128 × 128 palette of flat 3 px swatches, so the pack has no baked
shading of its own. Feather vanes are single-sided planes.

The zip carries no licence file and names no maker.
