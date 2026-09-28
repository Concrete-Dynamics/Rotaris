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

## Repaired — 2026-09-28 under R-062

**This note and `two-contention-tests-cannot-contend-as-root.md` describe one defect** — the same two tests,
recorded twice — repaired once; see that note's "Repaired" section for the full account. In short: off Windows
the refusal now holds for the uid running the test. An unprivileged user keeps the `chmod 0o555` parent refusal
(the `EACCES` staging denial the ladder retries — the mechanism that passed before this defect, so the test
still passes for that uid). Root, which ignores mode bits, instead meets an **immutable target** (`chattr +i` /
`chflags uchg`) it cannot rename over: `EPERM`, transient, so the REAL ladder runs to five attempts with the
previous file retained on the real filesystem. No skip, no `skipIf(root)`, no loosened assertion.

Pinned by `tools/symbol-artifact/replace.test.ts` and `packages/engine/src/session-actions.test.ts`, both green
as root under Node 24.
