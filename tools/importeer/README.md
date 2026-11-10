# Importing a pack

`importeer.mjs` turns source models into workfiles; `zet-catalogus.mjs` writes
what the catalogue reads about them. Both read one config per pack:

    node tools/importeer/importeer.mjs <kit>.json
    node tools/importeer/zet-catalogus.mjs <kit>.json

A config is a JSON object:

- `kit`: workfile folder and catalogue slug.
- `map`: the `BRONKITS` folder the source models come from; `bron`: the pack name
  written into each model.
- `url`, `licenseLabel`, `note`: the manifest row; `licentie`: a licence file
  copied to the kit's `LICENSE.txt`.
- `monsters`: how many points of the texture each triangle reads, 1 to 7
  (1 by default, the centre); with more, the band most points fall in wins.
- `cuts`: texture v values where the source texture changes colour; each
  triangle crossing one is cut along it, so a colour edge inside a source
  triangle stays a clean edge.
- `schaal`: the pack's scale; `drempel`: the angle in degrees below which faces
  share a smoothed normal.
- `banden`: source colour (`"r,g,b"`) → band.
- `texturen`: texture name a material asks for → file the pack carries; anything
  but a PNG is converted on read.
  A pack's `texture-map.json` wins over both, as on the TBD tab.
  A texture name found in several folders is taken from the model's own folder.
- `modellen`: a row per model with `bron` (source name), `naam` (workfile name),
  `kind`, `materialen`, `vlaggen`, `attributen`, `themas`, and optionally its own
  `banden` and a `factor` on top of the pack's scale where the style guide's `P10`
  names one. `vlakken: true` gives each flat face, a run of triangles sharing
  edges in one plane, the band covering most of its area, for textured sources
  whose detail would otherwise split big triangles into stray colours.
  `eilanden: <share>` gives every patch of one band, triangles sharing edges,
  whose area is under that share of the model's surface the band it borders
  most, so texture noise does not leave flecks.
- A band in `banden` may carry a tone, `nickel+0.3` or `slate-0.2`: the UV moves
  that far towards the dark or light end of the band, so two source greys can
  share one band and still read apart.
- `verloop`: for sources whose texture paints each part as a vertical gradient
  strip (Kenney 2.1 kits), how far the strip's light-to-dark position moves the
  UV within the band, per corner, so the gradient carries over; 0 by default.
  `verloopRijen` is the number of strip rows in the texture (4 by default).
  A row may set its own `verloop`.
- `binnenstebuiten: false` skips turning faces that a ray test reads as inside
  out; for sources whose own normals are right and whose parts overlap, where
  the ray test flips good faces. A row may set its own.
- `varianten`: groups of `leden` (workfile names) with a `type`, `detail-variant`
  when left out.

Per model the tool merges the source primitives into one draw call, reads a
band per triangle from the source colour, recomputes vertex normals with faces
joining below the threshold, and writes the UV into that band's cell of
`kits/colormap.png`, light at the top of the gradient and dark at the bottom.
The scale is built into the geometry; the node carries only the translation that
grounds and centres the model.
