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
  names one.
- `varianten`: groups of `leden` (workfile names) with a `type`, `detail-variant`
  when left out.

Per model the tool merges the source primitives into one draw call, reads a
band per triangle from the source colour, recomputes vertex normals with faces
joining below the threshold, and writes the UV into that band's cell of
`kits/colormap.png`, light at the top of the gradient and dark at the bottom.
The scale is built into the geometry; the node carries only the translation that
grounds and centres the model.
