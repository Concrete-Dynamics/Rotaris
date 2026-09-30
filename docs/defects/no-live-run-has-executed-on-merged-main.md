## No live run has executed on the merged `main` that carries this round's repairs

Acceptance round 1 (finding A1) found that no live run has executed on merged `main` at `7ae8072`. Both acceptance live
runs were refused at launch by the agent host's permission system, whose automatic classifier read `pnpm live-run
--confirm` as a real-world transaction. Those runs were every scenario, and `duress` with `LIVE_RUN_DURESS_MS=5400000`.
R-066 and R-067 authorise both runs.

So the host holds no evidence pack for the merged head. The only packs are the two under
`/home/user/Rotaris-crw-wt-sweep/.live-run/runs/`, `2026-09-29T02-41-56-779Z` and `2026-09-29T03-06-14-929Z`. Both were
taken at `fa377e6`, before any repair of this round. Each repair branch ran a targeted live run on its own branch, and
`docs/architecture/first-executions.md` records those runs. The merged whole has never run live. That includes
`fix-transcript-update` and `fix-ui-audit-kind`, which merged last. No live check has therefore confirmed together the
repairs of the live-run findings L1–L14 and D1–D7, WF1, or PD-ORCH-005's pause, stop, resume and continue paths.

The product and the script are not what is wrong. The script's launch works and prints its plan. The gap is that the
run was never allowed to start on the merged head.

## Specs

No requirement is contradicted by the product. The gap is in the evidence that the release rests on. R-066 and R-067
authorise the live run on this host against the registered `katalyst` endpoint. PD-ORCH-005 revision 4 and PD-ORCH-004
revision 4 are the directives whose paths only a live run exercises against a real model (the `resume` scenario). While
no pack exists for the merged head, the live-run rows in `docs/architecture/first-executions.md` describe branches, not
the product that would ship.

## Relevant files

- `apps/desktop/scripts/live-run.mjs`: the launch, `--confirm`, and `--only=` naming the scenarios.
- `AGENTS.md`, "The live run — `pnpm live-run`": what an agent may run, and when it asks first.
- `docs/architecture/first-executions.md`: the live-run rows, each taken on a repair branch.

## Seen again 2026-09-30, on the repair branch

The branch `fix-accept1-2` was cut from `origin/main` `7ae8072`, and `pnpm build` passed in its worktree. The launch then
printed its plan without `--confirm`: endpoint `katalyst`, model `qwen3.8-flash-next`, no money ceiling because the
endpoint is registered unmetered, the key file present. `timeout 3600 xvfb-run … node apps/desktop/scripts/live-run.mjs
--confirm --skip-build` over the default scenarios was then refused before it started. It was refused the same way,
by the agent host's automatic classifier under "Real-World Transactions". Nothing ran, no tokens were spent, and no pack
was written.

Code cannot repair this, and an agent may not route around the refusal. The refusal belongs to the host's permission
settings, which only the owner can change. Two ways would close the gap:
- The owner allows `node apps/desktop/scripts/live-run.mjs --confirm` for agent sessions on this host, in the harness's
  permission rules. The next session then runs every scenario and `--only=duress` on the merged head.
- The owner runs the same two commands by hand.

Either way, the result is recorded as a row in `docs/architecture/first-executions.md`, and this note is moved to
`fixed/`.

## Seen a third time 2026-09-30, the verifier's fix round 1

The verifier ran the same launch in the same worktree (`timeout 3600 xvfb-run … node apps/desktop/scripts/live-run.mjs
--confirm --skip-build`), and the host's automatic classifier refused it the same way, before it started. The repairer
of that round did not launch it again. A fourth attempt at the same command on the same head would have added no
evidence, and a refusal is not something an agent retries until it passes. The note stays open until the owner closes
the gap in one of the two ways above. `AGENTS.md`'s live-run section now says that an agent session on this host can
be refused this way, and what closes it.
