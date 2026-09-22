# Importing a pack

`importeer.mjs` turns source models into workfiles; `zet-catalogus.mjs` writes
what the catalogue reads about them.

    node tools/importeer/importeer.mjs tools/importeer/<kit>.json
    node tools/importeer/zet-catalogus.mjs tools/importeer/<kit>.json

A config holds the kit slug, the `BRONKITS` folder it reads, the pack's scale
and shading threshold, the source colour → band table, and a row per model with
its source name, its workfile name, its kind, its materials and its flags. A row
may override the table for its own model. Where a pack's materials ask for a
texture file the pack does not carry under that name, `texturen` maps the name
asked for to the file that is there; anything but a PNG is converted on read.

Per model the tool merges the source primitives into one draw call, reads a
band per triangle from the source colour, recomputes vertex normals with faces
joining below the threshold, and writes the UV into that band's cell of
`kits/colormap.png`, light at the top of the gradient and dark at the bottom.
Geometry stays in source units; the node carries the scale and the translation
that grounds and centres the model.
