---
name: canon-proposal
description: Draft a change to canon.md as a proposal the PO can judge without context, get it reviewed, post it to the PO's proposal page, and act on the PO's decisions. Use when a canon item blocks a task and the block seems wrong, an item is unclear or keeps being misread, a context-only limit should become canon, or the PO asks for a canon change. Also use to read and apply decisions from the proposal page.
---

# Canon proposal

canon.md changes only through this flow. While a proposal waits, carry on with whatever isn't blocked.

Proposal page: https://claude.ai/artifact/Pp5sUgHL37z8nasTMWMEDU. Read and write its db with the `ArtifactData` tool (load it with ToolSearch): collection `drafts` (not shown on the page) and `proposals`. Source: .claude/canon/proposals.html.

## 1. Draft

One rule per proposal. Fields:

- `id`: the item ID; next free one for a new item.
- `rule`: the rule, about 10 words, one rule only.
- `old`: the current rule text, exactly; omit for a new item. `removed: true` to drop an item.
- `now`: what Claude does today, about 8 words.
- `after`: what Claude will do, about 8 words.
- `why`: about 6 words.
- `risk`: what could go wrong, about 8 words.
- `type`: `invariant` (precise, never broken) or `direction` (broad on purpose).
- `test`: optional, the hook or test file that enforces it.
- `repo`: repo folder name.

Write for a PO who has not seen the session, files or diff. No jargon.

## 2. Review

`ArtifactData` `set` each draft on `drafts/<repo>-<id>`. Run a general-purpose subagent told to follow .claude/agents/canon-reviewer.md, with the draft ids only; it reads the drafts and canon.md itself. Keep no local copies of drafts. Revise in place and rerun until it passes, at most two rounds. Put a short note in `review`: what you fixed and what is left open.

## 3. Post

In one batch, `set` each draft on `proposals/<same id>` with `status: "pending"`, `created`, `updated` (ISO time) and `thread: []`, and delete it from `drafts`. Tell the PO in one line, with the page link.

## 4. Decisions

At the start of a session that touches canon, and when the PO says they decided, `list` `proposals` and act on every one of this repo's not `pending` or `applied`:

- `approved`: write the item into canon.md (the edit gate asks the PO to confirm), then `update` it with `status: "applied"`.
- `rejected`: `delete` the proposal.
- `clarify`: answer the PO's note; append `{by: "claude", note, at}` to `thread`; set `status: "pending"`.
- `adjust`: redraft per the note through steps 1–2, update the fields, append a one-line note to `thread`, set `status: "pending"`.

## canon.md layout

Sections: Binding, Code and docs, Working. Each item on two lines:

```
- **C01** rule\
  why: reason · type · test: file
```

Now, after and risk stay on the page only.
