#!/bin/bash
in=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$in")
event=$(jq -r '.hook_event_name // ""' <<<"$in")
sid=$(jq -r '.session_id // ""' <<<"$in")
mark="${TMPDIR:-/tmp}/taalei-history-ok-$sid"
g='(^|[;&|(` ])git( -C [^ ]+| -c [^ ]+| --no-pager)* '
restore="${g}(checkout +[^- ][^;&|]* -- |restore [^;&|]*(--source|-s )|revert\b|reset [^;&|]*(--hard|--soft|--mixed|HEAD[~^]|[0-9a-f]{7,}|origin/)|show [^ ]+:[^;&|]*>)"
history="${g}(log|blame|reflog|whatchanged|show)\b"
ask() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $r}}'
  exit 0
}
if grep -Eq "$restore" <<<"$cmd"; then
  [ "$event" = PostToolUse ] && exit 0
  ask "Canon C19: restoring files or undoing commits from before this session needs PO approval. Approve only if you allow it."
fi
if grep -Eq "$history" <<<"$cmd"; then
  if [ "$event" = PostToolUse ]; then
    [ -n "$sid" ] && touch "$mark"
    exit 0
  fi
  [ -n "$sid" ] && [ -e "$mark" ] && exit 0
  ask "Canon C12: reading git history needs PO approval. A yes covers history reads for the rest of this session."
fi
exit 0
