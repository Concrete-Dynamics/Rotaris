## The CI gate on GitHub's windows-latest runner goes red on a different timing-bound test at most pushes to main

Seen 2026-11-03/04 on `Concrete-Dynamics/Rotaris` (the orchestrator of R-091 and R-092, reading `gh run list --workflow CI`
on 2026-11-04 at 10:20Z). The `CI` workflow (`.github/workflows/ci.yml`, R-079; its gate job runs `pnpm check` on
`windows-latest`) completed `failure` on eleven of the twelve pushes to `main` between 3cf1b4c1 (2026-11-03 23:44Z) and
393cd271 (2026-11-04 08:38Z); only 8644bbda (03:05Z) was green. `CodeQL` was green on every one of them. Each red is one
unit test of the gate's test stage, a different one each time, with the rest green:

| Push | Run | Red test | Reading |
| --- | --- | --- | --- |
| 393cd271 | 41801065291 | `packages/workspace/src/git/checkpoints.test.ts` › REQ-GIT-034/003 (nothing to record on a clean tree, HEAD tracking `.rotaris/` paths) | `expected 'failed' to be 'nothing-to-record'`, 2311 ms; 542 passed, 5 skipped |
| 747b3911 | 41789009893 | `tools/worktree/land.test.ts` › re-rebases and gates again when origin/main moves under the push | 539 passed, 5 skipped |

*Corrected 2026-11-04 (acceptance hrda, AF-02):* not every one of those reds is a test. Four of them (de779d29 at 00:37Z,
e53dc799, 42fc3235 and 1d663de6) never reached the test stage: `pnpm lint`'s `eslint .` ran out of JavaScript heap at
Node's default limit, and every CI run from f7f5dc02 (11:24Z) on died the same way. That mode had a cause of its own,
repaired the same day, and has a note of its own,
[the CI gate's lint runs out of JavaScript heap](../archive/defects/the-ci-gates-lint-runs-out-of-javascript-heap-at-nodes-default-heap-limit.md);
this note keeps the runs that reached the tests.

Every one of these heads passed the same `pnpm check` green on the landing host before its fast-forward push (the
landing's own gate, 7 to 9 minutes idle), so the product under test is not what differs: the GitHub-hosted runner is
two cores with a slower disk, the test stage runs its process-bound cases (git subprocesses, the landing's scratch
repositories, PTY and child deaths) against fixed bounds, and the log also carries `Error: AttachConsole failed` lines
from child processes on that runner. The shape is the one `docs/defects/the-windows-gate-goes-red-on-a-different-test-each-time-on-one-tree.md`
records for a loaded local tree, now on the hosted runner at every push, so the CI gate currently reports nothing an
operator can read without opening the run: a red that means "a timing test" and a red that means "the product" look the
same. Not repaired here: the acceptance plan hrda reads the runs since this note and decides whether the bounds, the
runner or a retry of the test stage is the repair. Recorded, not repaired.

## Specs

None contradicted. R-079 decided the CI workflow (docs/product/requests.md#r-079); the gate's content is AGENTS.md's.

## Relevant files

- `.github/workflows/ci.yml` — the gate job (`pnpm check` on `windows-latest`, 90-minute timeout) and the coverage step beside it.
- `packages/workspace/src/git/checkpoints.test.ts` — the REQ-GIT-034/003 case red at 393cd271.
- `tools/worktree/land.test.ts` — the re-rebase case red at 747b3911.
- `docs/defects/the-windows-gate-goes-red-on-a-different-test-each-time-on-one-tree.md` — the same shape on a loaded local tree.
