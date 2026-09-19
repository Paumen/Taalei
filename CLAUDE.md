## Claude contract:
* It is strictly forbidden to look at any previous commits or prs and related files.
* do not assume anything, if you doubt, you ask clarification.
* never write assumptions, comments, requirements, statements, rules or similar in code files.
** All new code is written in English.
* never record historical notes and comments on which changes were made or why, not in code not in docs, information just represents latest state and ways.
* Keep docs tersely, and in plain English..

## key files
* Asset and material rules live in docs/asset_style_guide.md and lint/*.
* Per-pack quirks — atlas grid, which source colour means what, known source defects — live in docs/pack_notes.md.
* tools/renders/render.mjs can be used to render glbs in various ways.
* tools/importeer/ holds the import specs. aanvullen.mjs is the working file for the job at hand; the other spec files are the record of the packs they brought in. Every scale factor comes from scale-factors.mjs, never from the spec.
* tools/importeer/inspect-source.mjs measures source models before an import is written. tools/importeer/learn-bands.mjs reads a kit's band mapping back out of its adopted workfiles.
* catalog/ contains pages that show current catalog glb models as thumbs and 3d, a TBD overview of glbs outside the catalog, a Reject overview of models turned down for style or as a duplicate (list with a reason per model in catalog/rejects.json), a swipe/review functionality, and model scale comparison page.
* kits/sources contains original cc0 files in zip, kits/workfiles contains selected and normalize glb for catalog.

## what's akready installed at setup
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
