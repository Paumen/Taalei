---
name: reset
description: Restart a task that keeps failing from the PO's own words and canon, dropping Claude's own assumptions. Use when a task still misses after the assumption list (C17), when the PO asks to start over, when a review gives a retry verdict on the task as a whole, or when the PO runs /reset.
---

# Reset

1. **Start from the PO's words.** Quote the initial request, the goal and every PO reply so far, verbatim. Below it, separately, write your own reading of them. Drift shows in the gap.
2. **Check canon.** Read canon.md. List what it allows and what it blocks for this task, by item ID.
3. **Drop your own assumptions.** Ignore what you deferred, assumed or stated yourself without the PO saying it explicitly, and any limit whose only source is context. List what you drop. Spec, docs and tools still inform.
4. **Ignore failing checks**, except `node lint/golden.mjs` (C05), which must pass.
5. **Compare the attempts so far.** If they are variations of one approach, the approach is the problem, not the details.
6. **Take more risk** if the attempts are not clear step-by-step improvements: pick a different approach. If canon blocks it, name the item and draft a proposal (canon-proposal skill); carry on with what isn't blocked.
7. **Write a reset statement**: goal, canon limits, assumptions dropped, new approach. Each line short. Show it to the PO only when the direction changes; otherwise keep it in your working notes and go on.
