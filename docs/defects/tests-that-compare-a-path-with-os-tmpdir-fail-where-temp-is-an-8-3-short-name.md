## Tests that compare a path with `os.tmpdir()` fail where TEMP is an 8.3 short name

R-079's first CI run (GitHub-hosted `windows-latest`, run 39668971523, 2026-10-21) ran `pnpm check` on a fresh clone:
22 tests in 11 files failed, 6815 passed. On that runner `TEMP` is `C:\Users\RUNNER~1\AppData\Local\Temp`, the 8.3 short
form of `C:\Users\runneradmin\…`. The code under test canonicalises (git's `rev-parse`, `realpath`, the shell's own
`$PWD`) and answers the long form; the tests build their expectation from `os.tmpdir()`'s short spelling. Measured:

```
Expected: "C:\Users\RUNNER~1\AppData\Local\Temp\rotaris-dev-time-repo-fozG8E"
Received: "C:\Users\runneradmin\AppData\Local\Temp\rotaris-dev-time-repo-fozG8E"
```

- spelling compared as text: `tools/dev-time/dev-time.test.ts` (4), `tools/worktree/land.test.ts` (3), `tools/worktree/new.test.ts`,
  `tools/worktree/git.test.ts`, `packages/agent-tools/src/terminal/terminal.test.ts` (the PowerShell reset's `cwd`);
- length computed from the short spelling, three characters short of the canonical path the store measures:
  `packages/store/src/store.test.ts` (5, D11's path limit: "expected … to contain '252 characters'", the message says 255),
  `packages/workspace/src/workspace.test.ts` (267 against 270);
- and in the same run, not yet attributed to the spelling: `apps/desktop/src/run-host/mcp.test.ts` and
  `packages/agent-tools/src/tools/observe.test.ts` (OQ-245's "another agent's writes are left out" sees them, as if the
  two spellings of the root were two roots), `apps/desktop/src/main/commands/initialization.test.ts` (2, the first
  window's workspace reads null) and `packages/providers/src/credentials.test.ts` (the foreign-ACE spike's finding).

A user whose profile directory has a short name (a long or non-ASCII account name, the runner's `runneradmin`) has
the same `TEMP`. Whether the product, and not only its tests, compares the two spellings anywhere is not established
here. `ci.yml` points `TEMP` and `TMP` at `RUNNER_TEMP`, which has no short form, as its workaround. The run after that change (39670741659) passed all of them but the credentials case, which is a
defect of its own (`fixed/on-the-built-in-administrator-account-every-credential-save-is-refused-at-the-read-back.md`):
the other 21 were the spelling.

## Specs

None contradicted by the tests' failure itself. The store's path limit (ADR-0058 consequence 18) is measured on the
canonical path, which is what the product does; the tests' expectation is what is wrong.

## Relevant files

- the eleven test files named above.
- `.github/workflows/ci.yml` — the TEMP and TMP redirect in both jobs.
