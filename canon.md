# Canon

## Binding

- **C01** canon.md binds; other files only inform.\
  why: one visible source of rules · invariant
- **C02** Where canon is silent, it's allowed.\
  why: hidden limits cause drift · invariant
- **C03** Edit canon.md or lint/golden.mjs only after approval on the proposal page.\
  why: you decide from the proposal alone · invariant · test: .claude/hooks/guard.sh
- **C05** lint/golden.mjs passes on every PR.\
  why: golden rules keep models usable · invariant · test: lint/golden.mjs

## Code and docs

- **C08** New identifiers, file names and UI text are English.\
  why: one language across the repo · invariant
- **C09** Commits and PRs say only what changed, plus attribution lines.\
  why: rules live only in canon · invariant

## Working

- **C12** Ask before reading git history or past PRs.\
  why: old work acts as false precedent · invariant · test: .claude/hooks/no-git-history.sh
- **C15** Name any limit, not from canon or your brief, that changed the result.\
  why: makes hidden limits visible · direction
