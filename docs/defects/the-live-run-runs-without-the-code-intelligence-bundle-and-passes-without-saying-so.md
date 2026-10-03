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
([`init-proof-reads-a-missing-code-intelligence-bundle-as-a-task-that-recorded-nothing.md`](fixed/init-proof-reads-a-missing-code-intelligence-bundle-as-a-task-that-recorded-nothing.md):
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
