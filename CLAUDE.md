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
before creating, recolouring or tagging an asset.
Never create or adjust rules in style guide without show exact words to PO for approval. A rule in appendix A must be below 140 chars. Style guide is autoritive.

Catalogue lint: `node tools/catalog-lint.mjs` checks catalog/catalog.json against the
Appendix A rules and the draw-call rule of §5, and exits non-zero on any error-severity finding. Run it after
recolouring or retagging an asset. Rule text and the band table are read from the
guide (catalog/tools/rules.mjs); lint holds only the checks. Flags: `--kit`, `--rule ID`
(a guide id takes its sub-checks, a block letter its block), `--severity`, `--model kit/name`,
`--limit`, `--rules` (list the rules with status and coverage), `--explain ID` (rule text,
status, what each check proves), `--index [path.md]` (rules by material tag, band and
kind), `--json path.json` (all findings, for grouping the report by catalogue group or
by kit — the console report is per rule only).
`node tools/rule-status.mjs --check` verifies the status markers and the rule grammar:
id pattern, 140-char limit, cross-references, band names and ids, lint coverage.

