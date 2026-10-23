#!/bin/bash
cmd=$(jq -r '.tool_input.command // ""')
if grep -Eq '(^|[;&|(` ])git( -C [^ ]+)? (log|blame|reflog|whatchanged)\b' <<<"$cmd"; then
  jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: "Canon C12: reading git history needs PO approval. Approve only if you allow it for this task."}}'
fi
exit 0
