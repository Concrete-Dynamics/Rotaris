## The live run runs without the code-intelligence bundle and passes without saying so

Observed 2026-10-03 by the orchestrator's duress live run at origin/main `1763f7f` (pack `2026-10-03T06-15-52-273Z` of the
`wt-live` worktree, git-ignored; finding U5 of its autopsy), which ended `live-run PASSED`, 18 checks. The worktree that ran
it had no bundled code-intelligence runtime — `apps/desktop/resources/` held only `setup-manifest.json` — and the run was
started with `--skip-build` (the pack has no `build.log`). So:

- the background setup failed at `create` in both launches: `sign-in/app.log:22` ("mcp setup: create failed — exited with
  code 127 … rotaris: the bundled code-intelligence runtime is not present in this installation (build it with pnpm
  code-intel:bundle)", 258 ms) and `duress/app.log:24` (574 ms);
- tool discovery of `code_intelligence` then failed (`duress/app.log:37`), and every persona prompt listed the server with no
  tools (traffic #103 and #190);
- none of the 18 PASS lines says so. The duress acceptance never exercised code intelligence, so three findings it was meant
  to re-check (D1, REQ-MCP-034; a71-1, the `.serena/` marker; a71-2, the manual re-sent) were not exercised, and the default
  run at the same head, whose worktree had the bundle, judged a differently provisioned tree.

`init-proof` was given exactly this precondition when its sibling note was repaired
([`init-proof-reads-a-missing-code-intelligence-bundle-as-a-task-that-recorded-nothing.md`](init-proof-reads-a-missing-code-intelligence-bundle-as-a-task-that-recorded-nothing.md):
`ensureBundle` in `apps/desktop/scripts/lib/code-intelligence-bundle.mjs`). `live-run.mjs` has none.

## Specs

- None (harness). The product behaved as specified for a tree without the runtime (REQ-WORKSPACE-084, REQ-MCP-042/048); the
  defect is that the live run judges such a tree and its checks cannot tell.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the build step (`if (!has('skip-build')) { … }`, lines 515-522 at `1763f7f`), which
  builds the desktop app and never the bundle; `launch`, where every scenario's per-launch checks are made.
- `apps/desktop/scripts/lib/code-intelligence-bundle.mjs` — `ensureBundle`, `init-proof`'s precondition (`bundle.mjs
  --check`; with `--skip-build` a refusal naming `pnpm code-intel:bundle`, without it the bundle built).
- `apps/desktop/scripts/code-intelligence/bundle.mjs` — `pnpm code-intel:bundle` and its `--check`.

Noticed 2026-10-03 by the autopsy of the duress live run at `1763f7f`.

## Repaired — 2026-10-03

Two halves, both in the harness:

- **The precondition.** `live-run.mjs` calls `ensureBundle` (`lib/code-intelligence-bundle.mjs`, which gained a
  `consequence` argument for the refusal's own words) once the key is known and before any pack, sandbox or launch exists.
  With `--skip-build` an absent or stale tree refuses at once — "the bundled code-intelligence runtime is absent or stale,
  and --skip-build builds nothing: run pnpm code-intel:bundle first. Without it every launch's code-intelligence setup and
  discovery fail (REQ-WORKSPACE-084, REQ-MCP-042), and this run would judge a tree in which code intelligence never ran." —
  and exits 1; without it the bundle is built and checked again. The printed plan (`pnpm live-run` without `--confirm`)
  gains a `Bundle:` line, and `results.json` records `codeIntelligenceBundle` (`present` or `built`).
- **The statement.** Every launch reads its application log with `codeIntelligenceDiscovery`
  (`lib/code-intelligence-discovery.mjs`, new) and states the outcome: "`<scenario>`: code-intelligence discovery
  succeeded" PASSes with what was listed, and FAILs naming the failure when any discovery of the server failed, or when no
  discovery ran and a setup step failed; a launch that starts no run reads "code-intelligence discovery did not run in this
  launch" as a NOTE. `results.json` keeps each launch's reading under `evidence.<scenario>.codeIntelligence`.

Pinned by:

- `apps/desktop/scripts/lib/code-intelligence-bundle.test.ts` — "live-run states the same precondition, and says in every
  launch whether code intelligence ran (U5)": the call's place before the pack, the sandbox and the first launch; the
  refusal's words with `--skip-build`; the per-launch check (all three red before the repair);
- `apps/desktop/scripts/lib/code-intelligence-discovery.test.ts` — the reader over this pack's own lines: `duress` reads
  `failed`, `sign-in` reads `setup-failed`, a listed discovery `listed`, a failure under another root fails the launch.

Shown on the branch (fin13, worktree `Rotaris-crw-wt-fin13-mcpfateandli`, which has no bundle): `node
apps/desktop/scripts/live-run.mjs --skip-build` (no `--confirm`: it spends nothing and launches nothing) printed "Bundle:
absent or stale — a --skip-build run refuses to start; run `pnpm code-intel:bundle` first"; the new reader over this pack's
logs answers `sign-in setup-failed` and `duress failed`, so both launches would now FAIL their statement instead of passing
in silence. The refusal of a `--confirm --skip-build` launch itself was not run here (this plan runs no live-run launch);
the unit tests above hold it. The live scenarios that show it are the default run's sign-in and a duress run, each on a tree
with the bundle (the `Bundle:` line, and a PASS "code-intelligence discovery succeeded" in every launch that starts a run),
and a `--confirm --skip-build` launch on a tree without it (the refusal, exit 1, before any pack); the orchestrator runs
them after the merge.
