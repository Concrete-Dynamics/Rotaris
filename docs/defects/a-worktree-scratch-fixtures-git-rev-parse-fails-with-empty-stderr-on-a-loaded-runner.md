## The worktree scratch fixture's `git rev-parse HEAD` fails intermittently when the gate runs the suite under load

`tools/worktree/overlaps.test.ts` builds a scratch repository in the system temporary directory
(`scratchRepo()`, `mkdtempSync(join(tmpdir(), 'worktree-tools-'))` in `tools/worktree/scratch.test-support.ts`),
one bare `origin.git` and a `primary` clone, and drives the real `git` binary through `gitIn`/`gitOk`.
Under the `gate (pnpm check)` job the fixture has failed with

```
FAIL  tools/worktree/overlaps.test.ts > worktree:overlaps > reads every branch worktree: its files, origin/main's
      movement, and what two branch …
Error: git rev-parse HEAD in D:\a\_temp\worktree-tools-rzXL3J\primary failed:
 ❯ gitOk tools/worktree/scratch.test-support.ts:29:29
```

The message carries an empty stderr: `git rev-parse HEAD` answered with a non-zero status and said nothing.
`scratchRepo()` has just made the `primary` clone and committed `fixture` into it, so `HEAD` exists by
construction; a later `rev-parse` failing with no message is not a repository-state failure the fixture can
explain. The same head passed the suite in the sibling job on the same commit (`✓ tools/worktree/overlaps.test.ts
(7 tests)`, 10.4 s and 8.5 s), and the file runs green alone on this host and in this worktree (7/7, 0.7 s), so
the class is an intermittent failure of the fixture's scratch directory under a loaded runner and not a
regression in `tools/worktree/`.

Recorded rather than repaired: the cause was not found, and this note does not name one. What is evidenced is
the shape — a temp-directory fixture, a spawned `git`, an empty stderr, one job red and its sibling green on
one tree.

**Two observations for whoever takes it.** `gitOk` reports `r.stderr` alone; a non-zero status with empty
stderr loses whatever `git` wrote on stdout, which is the only diagnostic this failure left behind. And the
fixture's `ENV` is built by dropping `REDIRECTING` entries from `process.env` (`scratch.test-support.ts:12`),
so a variable the runner sets that steers `git`'s behaviour without being on that list would reach the spawned
process; that is a place to look, not a finding.

**Seen once**, on `gate (pnpm check)` of run [43074654228](https://github.com/Concrete-Dynamics/Rotaris/actions/runs/43074654228)
for PR #84's head `485672f6`, 2026-11-11; the rerun of that job passed.

## Specs

None. `tools/worktree/` is repository tooling rather than product behaviour, and the run this carries no
requirement; what the suite asserts is the report of `pnpm worktree:overlaps`, which no `REQ-` names.

## Relevant files

- `tools/worktree/overlaps.test.ts` — the suite that failed, at the case "reads every branch worktree: its files, origin/main's movement, and what two branch …".
- `tools/worktree/scratch.test-support.ts` — `scratchRepo()` (the `mkdtempSync(join(tmpdir(), 'worktree-tools-'))` fixture), `gitIn`, `gitOk:29` where the failure is thrown, and `ENV:12`.
- `tools/worktree/overlaps.mjs` — the tool under test; not implicated by anything this failure showed.
- `docs/defects/the-pty-process-death-assertions-flake-on-a-loaded-host.md` — the neighbouring class: a second suite that goes red on one job and green on its sibling on one loaded host.
