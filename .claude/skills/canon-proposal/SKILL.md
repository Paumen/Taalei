---
name: canon-proposal
description: Draft a change to canon.md as a self-contained proposal, get it checked by the canon-reviewer subagent, post it to the PO's proposal page, and act on the PO's decisions. Use when a canon item blocks a task and the block seems wrong, an invariant is unclear, a direction keeps being misread, a context-only limit should become canon, an item's review date has passed, or the PO asks for a canon change. Also use to read and apply decisions from the proposal page.
---

# Canon proposal

canon.md changes only through this flow. While a proposal waits, carry on with whatever isn't blocked.

Proposal page: https://claude.ai/artifact/HzPVT8oxhCnGZyG6jNEi9H (db collection `proposals`). Read and write it with the `ArtifactData` tool (load it with ToolSearch). Source: .claude/canon/proposals.html.

## 1. Draft

One proposal per item. Fields, with word limits:

- `title`: the change in under 8 words.
- `old`: the current canon line, exactly. Empty for a new item.
- `new`: the new canon line in the canon.md format: `- [ID · type · scope: … · test: … · review YYYY-MM] item — why: reason`. Item about 20 words, why about 10. Next free ID for a new item. Review date one month out. Empty to remove an item.
- `trigger`: the situation that led here, about 10 words.
- `effect`: what becomes allowed or blocked, or how Claude behaves differently, about 10 words.
- `risk`: what could go wrong, about 10 words.
- `example`: optional; only when the wording alone is ambiguous, since examples anchor strongly.

For lint/golden.mjs, `old` and `new` hold the rule's wording (R-number and line from CLAUDE.md), and `effect` sums up the code change in one line.

Write for a PO who has not seen the session, the files or a diff. No jargon. Invariant: precise. Direction: broad on purpose.

## 2. Review

Run the `canon-reviewer` subagent with the full draft and nothing else. It checks the draft against canon.md with a fresh context. Revise and rerun until it passes, at most two rounds. Put its findings in `review`, about 10 words: what you fixed and what is left open.

## 3. Post

`ArtifactData` `set` on `proposals/<repo>-<yyyymmdd>-<slug>` with the fields above plus `repo` (repo folder name), `status: "pending"`, `created` and `updated` (ISO time), `thread: []`. Tell the PO in one line, with the page link.

## 4. Decisions

At the start of a session that touches canon, and when the PO says they decided, `ArtifactData` `list` on `proposals` and act on every one of this repo's not `pending` or `applied`:

- `approved`: apply `new` to canon.md exactly (the edit gate asks the PO to confirm), keep the canon section order, then `update` the proposal with `status: "applied"` and `updated`.
- `rejected`: `delete` the proposal. Rejections are not recorded.
- `clarify`: answer the PO's note. Append `{by: "claude", note, at}` to `thread`, set `status: "pending"`.
- `adjust`: redraft per the note, rerun step 2, update the fields, append your one-line change to `thread`, set `status: "pending"`.

## Due reviews

When an item's review month has passed, propose to keep (same line, new review date), sharpen, or remove it.
