## Canon
* canon.md holds the rules and key decisions, and binds over every other file. Read it first. Everything else, this file included, is context.
* docs/draft_spec.md is the spec: current working guidance, in line with canon.
* lint/golden.mjs is the canon test file.
* Canon changes go through the canon-proposal skill: drafted, checked by a reviewer following .claude/agents/canon-reviewer.md, decided by the PO on the proposal page https://claude.ai/artifact/Pp5sUgHL37z8nasTMWMEDU (source .claude/canon/proposals.html, decisions in its db collection `proposals`). Read pending decisions there at the start of a session that touches canon.
* The reset skill (/reset) restarts a task that keeps missing from the PO's words and canon.
* Hooks in .claude/hooks: guard.sh (approval prompt on edits to canon.md and lint/golden.mjs; blocks edits to .claude/settings*.json and .claude/hooks/), comment-gate.mjs (blocks new code comments), no-git-history.sh (approval prompt on git log, blame, reflog, whatchanged), golden-on-stop.sh (golden lint after model or tag changes).
* NEVER blindly reuse existing tools or helpers or copy their code for new tasks, even if the task is similar to a previous task. They might have never been successful, broken, bugged, stale, or created for totally different task or models than your new task. If you do reuse you must be sure it's suitable for the task, you must say so explicitly towards PO in session, and you must provided the specific reason you've decided reuse is possible and highly preferred. 

## Working with me
* I often type on my phone: short, with typos.
* `merge`, `Merge`, `erge`, `.erge`, `merg`, and similar all mean: merge the PR(s).
* Reply in plain English and keep it short. No jargon.
* Simpler beats more. Aim to remove lines.
* Show visual work as a render or screenshot or artefact.
* No PR check-ins or timers. I'll say merge.

## key files
* Asset and material rules live in docs/asset_style_guide.md and lint/*.
* lint/golden.mjs holds the golden rules, the most critical repo rules, checked on every PR by .github/workflows/golden.yml: `node lint/golden.mjs`. A broken rule fails the PR check. Rules: R01, no catalogue model's longest side under 0.05; R02, every normal is unit length; R03, no triangle across colormap cells; R04, no scale on a root node; R05, every model has triangles; R06, the only texture is Textures/colormap.png; R07, no transparency; R08, no PBR factors; R09, one draw call; R10, exactly one known kind per model; R11, known materials, never with their own subtype.
* lint/glb-lint.mjs checks glb files for glTF validity, geometry, z-fighting, shading and house rules: `node lint/glb-lint.mjs kits/workfiles [--only-problems] [--json out.json]`. Needs `npm install` first (gltf-validator, pinned in package.json).
* Other lints check catalogue models against the rules in lint/*.json and the style guide. They read catalog/build/catalog.json, so run `node catalog/tools/build-catalog.mjs` first after model changes: `node lint/measures.mjs [ids]` (measures, lint/measures.json), `node lint/size.mjs` (size per kind, kit sizes), `node lint/tpu.mjs` (tri budget), `node lint/mat.mjs` (kind → materials), `node lint/palette.mjs` (material colours), `node lint/bands.mjs` (kind colours), `node lint/backface.mjs` (back faces, from catalog/build/backfaces.json made by `node catalog/tools/backfaces.mjs`).
* tools/renders/render.mjs can be used to render glbs in various ways. If you make copies of glbs and want to render them, make sure you add the shared color map such they can find it. Most render modes will show backfaces in mangenta, if those are pre-existing and irrelevant for the task at hand, ignore them.
* A workfile in kits/workfiles is the asset itself.
* catalog/ contains pages that show current catalog glb models as thumbs and 3d, a TBD overview of glbs outside the catalog, an NPC overview of characters and animals split off from TBD (list in catalog/data/npc.json), a Reject overview of models turned down for style or as a duplicate (list with a reason per model in catalog/data/rejects.json), a swipe/review page (catalog/app/swipe.html), a lint swipe page (catalog/app/lint.html) for models with lint findings, a kind limits swipe page (catalog/app/limits.html) that shows each kind with at least three models from two kits in a to-scale line-up, without scale-tagged models, to pick its measure (longest or height) and min/max or skip, kept in the browser and exported as JSON, a model scale comparison page, a kit size curves page (catalog/app/size-curves.html, built by catalog/tools/size-curves.mjs), and an Info page (catalog/app/overview.html) with a kits table and the kinds tree, read from catalog/build/catalog.json, packs.json, size-curves.json and lint/*.json.
* kits/sources contains original cc0 files in zip, kits/workfiles contains selected, normalize and modified glb for catalog.
* kits/sources, kits/reject, kits/tbd, kits/npc and scenes are symlinks into the public repo Paumen/lp-sources, cloned next to this repo (../lp-sources). Clone it only when a task needs source zips, reject, TBD or NPC models, or scenes (build-lists.mjs, import tools, adding a pack, scene work); commit changes there in that repo.
* tools/review/review.mjs runs the review skill (.claude/skills/review): doubtful model changes go to the PO as a before/after artifact page with verdicts (keep, keep but, revert, retry, relax rule, other, later) and a comment; `apply` reverts and lists the work left. Every task that changes models per case ends with one.
* tools/detail/slim.mjs serves the detail skill (.claude/skills/detail): cuts triangles on dense models by dropping minor detail, thinning repeats and swapping dense parts for simple shapes, never by automatic simplification.
* tools/sheepdog/sheepdog.mjs runs the sheepdog skill (.claude/skills/sheepdog): random kinds fixed per kind by sub agents, logged in tools/sheepdog/log.json; every run ends with a review (.claude/skills/review) of its changes, whose verdicts revert and calibrate.
* scenes/ holds scenes made of workfiles. scenes/<name>/layout.json (floor rows, wall patterns, zones of placed models) builds into scenes/<name>/<name>.glb with `node tools/scenes/build.mjs scenes/<name>/layout.json`, which also lists items that overlap or leave the room. scenes/view.html?s=<name> shows it. The glb holds copies of the workfiles, so rebuild a scene after changing a workfile it uses. A model tagged `mounted` hangs or is fixed above the floor: give it a `y` in the layout.

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
