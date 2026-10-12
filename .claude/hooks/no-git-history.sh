#!/bin/bash
cmd=$(jq -r '.tool_input.command // ""')
if grep -Eq '(^|[;&|(` ])git( -C [^ ]+)? (log|blame|reflog|whatchanged)\b' <<<"$cmd"; then
  jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: "CLAUDE.md says never look at previous commits. Approve only if you lift this."}}'
fi
exit 0
