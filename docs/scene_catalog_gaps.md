# Catalogue gaps for scenes

What would make composing scenes from workfiles easier or better. None of it is in place yet.

## Scale

- Room parts and props have no shared anchor. The ken-arcade wall (0.95) is lower than the claw machines (1.04), so scenes scale walls ×1.5.
- Food is large next to tables 0.40 high: burgers 0.17–0.29.
- Stools disagree: kay-food stool 0.15, sq-cards play-stool 0.23.
- Wanted: a reference character height (about 0.7) with fixed door, wall, table and counter heights, linted like the size curves.

## Grid

- Floor tiles come in 0.64, 0.8, 0.85, 0.95, 1.0 and 1.2; walls are 0.3 to 0.57 deep. Most floors cannot sit under most walls.
- Wanted: one module size, or a `grid` attribute per room-part kit.

## Placement metadata

Per model, recorded rather than read off renders:

- `front`: facing axis. Bins have an opening that must face the aisle.
- `use side`: front, back, both or all round. The sq-arcade cocktail is two-player, with controls on both ends; the DJ booth is played from behind.
- `mount`: floor, wall, ceiling or surface. LED panels have a hanging yoke; signs, posters and stars hang on walls.
- `surface height`: usable top of tables, counters and cases.
- `rest pose`: how it lies when put down. Cones and popsicles cannot stand upright on a table.
- Full bounds (min and max), not only width × depth × height; several props sit off centre.

## Contrast

- Amber and gold models (marquee star, every trophy) vanish against the ken-arcade wall's orange band.
- Wanted: a check of wall-mounted and shelf-top props against the wall bands they meet, or a less saturated wall band.

## Missing pieces

- Ceiling tiles or truss for hanging lights, fans and disco balls.
- Wall corner pieces; corners now take a column.
- Thin interior walls to split zones.
- A dark patterned arcade carpet.

## Variety

- Colour variants of the main machines (driving cab, skee-ball, claw machines), so repeated rows do not look copied.
- Venue tags (`venue:arcade`, `venue:cinema`, …) across kits; arcade props are spread over nine kits.

## Small

- Props over budget for scenes: popcorn machine 3.7k tris, monstera potted large 4.1k.
- Skee-ball shows backfaces in renders.
