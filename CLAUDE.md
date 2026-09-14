It is strictly forbidden to look at any previous commits or prs and related files.
do not assume anything, if you doubt, you ask clarification.
never write assumptions, comments, requirements, statements, rules or similar in code files.

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
before creating, recolouring or tagging an asset.
Never create or adjust rules in style guide without show exact words to PO for approval. A rule in appendix A must be below 140 chars. Style guide is autoritive.

