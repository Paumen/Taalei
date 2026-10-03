## Claude contract:
* Never look at any previous commits or prs and related files.
* If you doubt, you ask clarification.
* never write assumptions, comments, requirements, statements, rules or similar in code files.
** All new code is written in English.
* never record historical notes and comments on which changes were made or why, not in code not in docs, information just represents latest state and ways.
* Keep docs tersely, and in plain English..
* import scripts are used only once and not reused for same models.Source files are kept for reference and comparison, not for reimport
* After any catalogue change, always rebuild: every step in .claude/skills/catalog-assets/SKILL.md §6 except build-lists. Run build-lists only when source zips, rejects or TBD models change.
* `merge`, `Merge`, `erge`, `.erge`, `merg`, and similar all mean: merge the PR(s).

## key files
* Asset and material rules live in docs/asset_style_guide.md and lint/*.
* lint/glb-lint.mjs checks glb files for glTF validity, geometry, placement, shading and house rules: `node lint/glb-lint.mjs kits/workfiles [--only-problems] [--json out.json]`. Needs `npm install` first (gltf-validator, pinned in package.json).
* tools/renders/render.mjs can be used to render glbs in various ways. If you make copies of glbs and want to render them, make sure you add the shared color map such they can find it. Most render modes will show backfaces in mangenta, if those are pre-existing and irrelevant for the task at hand, ignore them.
* A workfile in kits/workfiles is the asset itself.
* catalog/ contains pages that show current catalog glb models as thumbs and 3d, a TBD overview of glbs outside the catalog, a Reject overview of models turned down for style or as a duplicate (list with a reason per model in catalog/data/rejects.json), a swipe/review page (catalog/app/swipe.html), a lint swipe page (catalog/app/lint.html) for models with lint findings, a model scale comparison page, a kit size curves page (catalog/app/size-curves.html, built by catalog/tools/size-curves.mjs), and an Info page (catalog/app/overview.html) with a kits table and the kinds tree, read from catalog/build/catalog.json, packs.json, size-curves.json and lint/*.json.
* kits/sources contains original cc0 files in zip, kits/workfiles contains selected, normalize and modified glb for catalog.
* kits/sources and kits/reject are symlinks into the public repo Paumen/lp-sources, cloned next to this repo (../lp-sources). Clone it only when a task needs source zips or rejected models (build-lists.mjs, import tools, adding a pack); commit changes there in that repo.
* scenes/ holds scenes made of workfiles. scenes/<name>/layout.json (floor rows, wall patterns, zones of placed models) builds into scenes/<name>/<name>.glb with `node scenes/build.mjs scenes/<name>/layout.json`, which also lists items that overlap or leave the room. scenes/view.html?s=<name> shows it. The glb holds copies of the workfiles, so rebuild a scene after changing a workfile it uses.

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
