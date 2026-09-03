It is strictly forbidden to look at any previous commits or prs and related files.
do not assume anything, if you doubt, you ask clarification.

installed:
Python (pip)
* mcp ≥1.0, cairosvg, matplotlib, graphviz

npm (global)
* eslint 9, globals 15, prettier 3
* stylelint 16 + configs: standard 36, recess-order 5, declaration-strict-value 1
* alpinejs 3, three 0.185, playwright 1

apt
* imagemagick, graphviz

Browsers
* Playwright Chromium (+ system deps)

Binaries
* GitHub CLI (gh), latest release → /usr/local/bin

Conditional (only if claude CLI present)
* registers claude-design MCP server (user scope, HTTP)


Asset and material rules live in docs/asset_style_guide.md — the look, the
colormap bands, geometry, scale, and the numbered rules of Appendix A (which
colour a material takes, what counts as leather, timber or bark). Read it
before creating, recolouring or tagging an asset, and add new rules there.

Recolouring a model: read the original's own colour groups first.
A model's UVs already record which triangles the maker meant to be light and
which dark: same band, different position in the gradient. List those groups
(band + gradient position, counted per triangle) and map them — light group to
the light band, dark group to the bark band. That boundary is exact.
Never approximate it with geometry: normals within N degrees of an axis,
distance from the model centre, a fitted plane, growing until a crease. On an
irregular log every such threshold cuts through the bevel somewhere, so the rim
ends up light in patches — visible only from certain angles.
Check the result from several viewpoints, including straight down the axis; one
fixed camera hides exactly this kind of fault.

abc
