## The CI gate's lint runs out of JavaScript heap at Node's default heap limit

**Outcome (repaired 2026-11-04, acceptance hrda, AF-02).** `pnpm lint` runs its last stage as
`node --max-old-space-size=8192 node_modules/eslint/bin/eslint.js . --max-warnings 0` in place of `eslint . --max-warnings 0`:
the bound is set on the eslint process itself, so the local gate and CI's `pnpm check` carry the same one, twice the
default the lint ran out at and within the runner's 16 GB. Nothing in what the lint checks changed. `tools/lint-heap.test.ts`
pins it: the last stage runs eslint under `node` with `--max-old-space-size` of at least 8192 MB, no stage runs a bare
`eslint`, and the file it runs is eslint's own `bin` entry (two of its three cases red on the script as it stood);
`tools/eslint-rules/rules.test.ts`'s zero-warning case reads the new stage. The mode was reproduced on this host by
lowering the bound below the lint's need: `node --max-old-space-size=3584 node_modules/eslint/bin/eslint.js .
--max-warnings 0` died after 177 s with the runner's `FATAL ERROR: Ineffective mark-compacts near heap limit` and exit
134 (host CPU 83 %, another tree's proof windows open). With the bound, `pnpm lint` passed in 179 s, and the bounded eslint
under `--trace-gc` peaked at 3,942 MB after a mark-compact against a limit of 8,288 MB, 48 % (host CPU 68 %, two other
trees' proof windows open). Not measured here: a CI run on GitHub with the bound, which the
landing's push to `main` is the first of; this note's table is what that run is read against. The heap the lint needs is
not reduced: it grows with the projects and the module graph, and a future red of this shape reads the peak again
(`node --trace-gc`, as below) before the bound is raised.

Seen 2026-11-04 by acceptance round 1 of plan hrda (finding AF-02), reading `gh run list --workflow CI` and each failed
run's `gh run view <id> --log-failed`. The `CI` workflow's gate job (`.github/workflows/ci.yml`, R-079; `pnpm check` on
`windows-latest`, Node 24.22.2 from `.node-version`) dies inside `pnpm lint`'s last stage, `eslint . --max-warnings 0`,
right after `eslint-plugin-boundaries`' deprecation warnings, with `FATAL ERROR: Ineffective mark-compacts near heap
limit Allocation failed - JavaScript heap out of memory` and exit 134. The heap trace in the log stands at about
3,950 to 3,980 MB at about 156 s, the default limit V8 sets on the runner's 16 GB. The test stage, the requirement
coverage summary and the coverage step never run, so such a run says nothing about the tests at all.

It is not one cause beginning at f7f5dc02, as the finding first read it: the mode began about 22 hours earlier and ran
intermittently before it ran every time. Of the 36 failed CI runs from 2026-11-03 21:46Z to 2026-11-04 17:22Z, 13 died
this way:

| Run | Head | Branch, event | Mode |
| --- | --- | --- | --- |
| 41748256477 | de779d29 | main, push (2026-11-04 00:37Z) | heap, in `eslint .` |
| 41753139722 | 2c3a9bc9 | main, push (01:18Z) | reached the tests (the timing note's mode) |
| 41763244637 | e53dc799 | main, push (02:49Z) | heap |
| 41764851592 | 8644bbda | main, push (03:05Z) | green |
| 41771387929 | 42fc3235 | main, push (04:08Z) | heap |
| 41772905833 | 1d663de6 | main, push (04:23Z) | heap |
| 41789009893 | 747b3911 | main, push (06:58Z) | reached the tests: `tools/worktree/land.test.ts` |
| 41801065291 | 393cd271 | main, push (08:38Z) | reached the tests: `checkpoints.test.ts` REQ-GIT-034/003 |
| 41820666334 | f7f5dc02 | main, push (11:24Z) | heap |
| 41824158275 | fc176c44 | main, push (11:50Z) | heap |
| 41827464917 | 761592d7 | main, push (12:13Z) | heap |
| 41829796480 | ad1a6698 | main, push (12:30Z) | heap |
| 41854850371, 41854902433 | 84422b11 | `docs/mcp-server-directive`, push and pull request (15:09Z) | heap |
| 41876152753, 41876164187 | c23e0d1d | Dependabot `electron` group, push and pull request (17:17Z) | heap |
| 41876948455, 41876960447 | 2a6ebdef | Dependabot `production` group, push and pull request (17:22Z) | heap |

No failed run in that window before de779d29 died this way. The lint's heap was measured on this branch's base (ad1a6698) on the Windows 11
ARM64 host, Node 26.13.0, whose default limit reads 4,192 MB (`v8.getHeapStatistics().heap_size_limit`) on 15.6 GB, at a
host CPU load of 15 %: `node --trace-gc node_modules/eslint/bin/eslint.js . --max-warnings 0` passed in 164 s, its
largest heap after a mark-compact **3,945 MB, 94 % of the limit**; the same run with `import-x/no-cycle` off peaked at
2,937 MB in 101 s. So the type-aware programs (`parserOptions.projectService`, hardening.md §3.5 row 1) hold about 2.9 GB
and `no-cycle`'s whole-workspace module graph (`maxDepth: Infinity`, row 3) about 1 GB more, in one process, against a
limit nothing sets: the local gate passes a few per cent under the bound and the runner's Node 24 crosses it. Which
landing pushed it over is not measured; the first heap red follows E2's one-project-per-process-kind solution
(9e069ace, row 5, 2026-11-03 22:50Z), which gives the project service more projects to hold, and between 393cd271 and
f7f5dc02 `eslint.config.js` lost only OQ-491's `pending` option.

## Specs

None contradicted. R-079 decided the CI workflow (`docs/product/requests.md#r-079`); the gate's content is AGENTS.md's;
the lint's rules are R-091's (`docs/architecture/hardening/02-the-findings.md` §3.5 rows 1 to 3), whose first execution
recorded the lint's time and not its heap.

## Relevant files

- `package.json` — the `lint` script, whose last stage runs `eslint . --max-warnings 0` at Node's default heap.
- `eslint.config.js` — the type-aware parse (`projectService`) and `import-x/no-cycle` at `maxDepth: Infinity`, the two
  holders of the heap.
- `.github/workflows/ci.yml` — the gate job's `pnpm check` step (lines 116-117), where the run dies.
- `docs/defects/the-ci-gate-on-githubs-windows-latest-runner-goes-red-on-a-different-timing-bound-test-at-most-pushes-to-main.md`
  — the timing-test mode of the same job, which counted these heap reds among its own.
