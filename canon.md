# Canon

Canon binds; everything else informs.

One line per item: `- [ID · type · scope: … · test: … · review YYYY-MM] item — why: reason`. Scope and test appear only when used.
Invariant: precise, never broken without an approved change. Direction: broad on purpose; state your reading in one line when it shapes the result, and flag any deviation.

## Binding

- [C01 · invariant · review 2026-11] canon.md binds over other files. The PO's instruction binds its task, except C03; flag canon conflicts and propose. — why: one visible source of rules.
- [C02 · invariant · review 2026-11] Where canon is silent, the matter is allowed. Spec, docs, code, CLAUDE.md, lint data, history and PRs inform but never forbid. — why: hidden limits cause drift.
- [C03 · invariant · test: .claude/hooks/guard.sh · review 2026-11] Claude edits canon.md or lint/golden.mjs only after the PO approves its proposal at claude.ai/artifact/HzPVT8oxhCnGZyG6jNEi9H, then the guard.sh prompt. — why: the PO decides on the proposal, then confirms the edit.
- [C04 · invariant · test: .claude/hooks/guard.sh · review 2026-11] Claude never edits .claude/settings*.json or .claude/hooks/. — why: the guards must not guard themselves.
- [C05 · invariant · test: lint/golden.mjs · review 2026-11] `node lint/golden.mjs` passes on every PR. — why: golden rules keep catalogue models usable.

## Code and docs

- [C06 · invariant · test: .claude/hooks/comment-gate.mjs · review 2026-11] No new comments in code files, except QUIRK: for something likely to bite later, #! lines and licence headers. — why: comments turn into hidden rules.
- [C07 · invariant · review 2026-11] New code is written in English. — why: one language across the repo.
- [C08 · invariant · review 2026-11] Code, commit messages and PR descriptions say what is or what changed, plainly: no history notes, rationale, rules or assumptions. Docs hold no history notes. — why: rules live only in canon.
- [C09 · direction · review 2026-11] Docs are terse and in plain English. — why: quick to read on a phone.
- [C10 · invariant · review 2026-11] Import scripts run once per model set; source files stay for reference and comparison, never for reimport. — why: reimport overwrites hand edits.
- [C11 · direction · review 2026-11] Commit only final assets and work. — why: the repo shows the current state.

## Working

- [C12 · invariant · test: .claude/hooks/no-git-history.sh · review 2026-11] Reading git history or past PRs needs PO approval; status and the current diff stay free. — why: old work acts as false precedent.
- [C13 · direction · review 2026-11] Keep the first brief through iterations; drop a requirement only when the PO clearly changes it. — why: stops drift between iterations.
- [C14 · direction · review 2026-11] In doubt, ask the PO. — why: guesses become hidden constraints.
- [C15 · direction · review 2026-11] Following a limit whose only source is context: flag it in one line (what, from where). Dropping one: flag it when it changes the approach. — why: makes hidden limits visible.
- [C16 · direction · review 2026-11] When canon blocks a task, name the item; propose a change only when the block seems wrong. Carry on with whatever isn't blocked. — why: keeps work moving.
- [C17 · direction · review 2026-11] After one or two iterations that miss, list the working assumptions, each tagged with its source: a canon item or context. — why: exposes the assumption that misleads.
- [C18 · direction · review 2026-11] Findings live in the reply. They persist only as a canon proposal or a docs/draft_spec.md edit, noted in one line. — why: no stray notes acting as rules.
