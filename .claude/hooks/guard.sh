#!/bin/bash
in=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$in")
root=${CLAUDE_PROJECT_DIR:-$PWD}
locked='\.claude/(settings[^/ ]*\.json|hooks(/|\b))'
canon='(^|[/ "'\''])(canon\.md|lint/golden\.mjs|golden\.mjs)\b'

decide() {
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}
lock_msg="Canon C04: .claude/settings*.json and .claude/hooks/ are locked. Ask the PO to change them."
canon_msg="Canon C03: canon.md and lint/golden.mjs change only with PO approval. Approve only if the PO agreed to this change."

if [ "$tool" = Bash ]; then
  cmd=$(jq -r '.tool_input.command // ""' <<<"$in")
  writes='(\btee\b|\bsed\b[^|;&]*[[:space:]]-[a-zA-Z]*i|\bperl\b[^|;&]*[[:space:]]-[a-zA-Z]*i|\b(mv|cp|rm|ln|truncate|dd|patch|install|chmod|touch|rsync)\b|\bgit[[:space:]]+(checkout|restore|apply|mv|rm|stash|reset|cherry-pick|revert|am)\b|\b(python3?|node|ruby|bash|sh)\b[^|;&]*[[:space:]]-(e|c)\b)'
  redirect_into() { grep -Eq ">>?[[:space:]]*[^[:space:]]*$1" <<<"$cmd"; }
  if redirect_into '\.claude/(settings|hooks)' || { grep -Eq "$writes" <<<"$cmd" && grep -Eq "$locked" <<<"$cmd"; }; then
    decide ask "$lock_msg"
  fi
  if redirect_into '(canon\.md|golden\.mjs)' || { grep -Eq "$writes" <<<"$cmd" && grep -Eq "$canon" <<<"$cmd"; }; then
    decide ask "$canon_msg"
  fi
  exit 0
fi

f=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // ""' <<<"$in")
f=${f#"$root"/}
grep -Eq "$locked" <<<"$f" && decide deny "$lock_msg"
grep -Eq "^(\./)?(canon\.md|lint/golden\.mjs)$" <<<"$f" && decide ask "$canon_msg"
exit 0
