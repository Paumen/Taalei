## Claude contract:
* It is strictly forbidden to look at any previous commits or prs and related files.
* do not assume anything, if you doubt, you ask clarification.
* never write assumptions, comments, requirements, statements, rules or similar in code files.
** All new code is written in English.
* never record historical notes and comments on which changes were made or why, not in code not in docs, information just represents latest state and ways.
* Keep docs tersely, and in plain English..

## key files
* Asset and material rules live in docs/asset_style_guide.md and lint/*.
* tools/render/render.mjs can be used to render glbs in various ways.
* catalog/ contains pages that show current catalog glb models as thumbs and 3d, an excluded from catalog glbs overview, a swipe/review functionality, and model scale comparison page.
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
