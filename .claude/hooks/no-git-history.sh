#!/bin/bash
[ -e /tmp/allow-git-history ] && exit 0
cmd=$(jq -r '.tool_input.command // ""')
if grep -Eq '(^|[;&|(` ])git( -C [^ ]+)? (log|show|blame|reflog|whatchanged)\b' <<<"$cmd"; then
  echo "Blocked: CLAUDE.md says never look at previous commits. Only if the user lifts this for the session, run: touch /tmp/allow-git-history" >&2
  exit 2
fi
exit 0
