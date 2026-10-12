#!/bin/bash
input=$(cat)
[ "$(jq -r '.stop_hook_active // false' <<<"$input")" = true ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
base=$(git rev-parse -q --verify '@{u}' || echo origin/main)
watch=('*.glb' catalog/data/tags.json lint/kinds.json lint/materials.json lint/golden.mjs lint/variables.json)
changed=$( { git status --porcelain -- "${watch[@]}"; git diff --name-only "$base"...HEAD -- "${watch[@]}"; } 2>/dev/null | head -1)
[ -z "$changed" ] && exit 0
out=$(node lint/golden.mjs 2>&1) && exit 0
{ echo "Golden lint failed after model or tag changes:"; grep -E '^error' <<<"$out" | head -30; tail -1 <<<"$out"; } >&2
exit 2
