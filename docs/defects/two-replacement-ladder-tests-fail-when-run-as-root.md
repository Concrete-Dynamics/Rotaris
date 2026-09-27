## Two replacement-ladder tests fail when the suite runs as root

`tools/symbol-artifact/replace.test.ts` (*a contended replacement exhausts the ladder…*) and
`packages/engine/src/session-actions.test.ts` (*A9 / REQ-EVENTS-145 / REQ-TRACE-061: a destination that cannot be
replaced…*) stage contention off Windows by `chmod 0o555` on the parent directory. Root ignores the mode bits, so
under uid 0 the rename succeeds, the ladder is never exhausted, and both tests fail (`expected [Function] to throw
an error`; `expected true to be false`). `pnpm check` is therefore red in any container that runs as root, which
is the default for the cloud sessions that work on this repository.

Noticed 2026-09-27 while running `pnpm check` for R-054 on `main` at `56801df`, in a Linux container as uid 0.
Every other test passed.

## Specs

None contradicted. The product's ladder is untouched; the two tests stage a refusal that does not hold for root,
so the gate `CLAUDE.md` requires before a commit cannot go green there.

## Relevant files

- `tools/symbol-artifact/replace.test.ts`: `refuse`, the `chmodSync(dir, 0o555)` staging.
- `packages/engine/src/session-actions.test.ts`: the `chmodSync(parent, 0o555)` staging near line 337.
