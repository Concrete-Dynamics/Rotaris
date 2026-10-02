## No live run has executed on the merged `main` that carries this round's repairs

Acceptance round 1 (finding A1) found that no live run has executed on merged `main` at `7ae8072`. Both acceptance live
runs were refused at launch by the agent host's permission system, whose automatic classifier read `pnpm live-run
--confirm` as a real-world transaction. Those runs were every scenario, and `duress` with `LIVE_RUN_DURESS_MS=5400000`.
R-066 and R-067 authorise both runs.

So no evidence pack exists for the merged head. When this note was written, at 11:38 on 2026-09-30, the only packs on
the host were the two under `/home/user/Rotaris-crw-wt-sweep/.live-run/runs/`, `2026-09-29T02-41-56-779Z` and
`2026-09-29T03-06-14-929Z`. Both were taken at `fa377e6`, before any repair of this round. *(Dated 2026-09-30 at 14:20, in a
later verification's fix round: the sentence was true at 11:38 and was left standing after it had stopped being true.)*

Later that day, agent sessions on this host ran five live runs against `katalyst`. Each ran on a repair branch cut from
`7ae8072`, and each ran only a few scenarios. All five printed `live-run PASSED`:

- 11:51:04 `--only=ask,edit` and 11:51:25 `--only=ask`, overlapping, on `fix-accept1-1` before it merged. Their packs
  were `2026-09-30T11-51-04-588Z` and `2026-09-30T11-51-25-612Z`. The row in `docs/architecture/first-executions.md` and
  `docs/defects/fixed/a-live-run-sweeps-a-concurrent-live-runs-sandbox.md` record them. The worktree that held the packs
  has since been removed.
- 12:42, 13:49 and 13:58, sign-in and `ask` only, on `fix-accept1-4` before it merged (`8574828`). The packs were
  `2026-09-30T12-42-18-802Z`, `2026-09-30T13-49-19-435Z` and `2026-09-30T13-58-57-863Z`, under
  `/home/user/Rotaris-crw-wt-acc1-4/.live-run/runs/`. That worktree has also been removed since.
  `docs/defects/fixed/the-capture-seams-settings-category-press-can-be-deflected-by-a-notice.md` records the first.

Read at 14:53 the same day, the host's only packs on disk are again the two at `fa377e6`. Packs live in the worktree
that took them, so this inventory goes stale whenever a worktree comes or goes; the times above are what dates it.

None of the five is the merged head. Each ran on a branch that carried its own repair and not the others'. Together they
ran only sign-in, `ask` and `edit`. `resume`, `requirements`, `shell`, `frictions`, `faults`, `terminal` and `duress`
did not run on any of them.

The repair branches merged into `7ae8072` each ran a targeted live run on their own branch before merging, and
`docs/architecture/first-executions.md` records those runs. The merged whole has never run live. That includes
`fix-transcript-update` and `fix-ui-audit-kind`, which merged last. No live check has therefore confirmed together the
repairs of the live-run findings L1–L14 and D1–D7, WF1, or PD-ORCH-005's pause, stop, resume and continue paths.

The classifier did not refuse every live run on this host. The launches it refused, here and in the two sections below,
were the ones that would close this gap. Those were the launch over every scenario (no `--only=`), and `duress` with the
90-minute window. The targeted `--only=` runs above were admitted on the same host on the same day. Nothing on the host
says why the classifier treats the two differently. This note does not assume a rule from it.

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
- `docs/defects/fixed/a-live-run-sweeps-a-concurrent-live-runs-sandbox.md`: the two targeted runs of 11:51 on
  2026-09-30 that the classifier admitted.

## Seen again 2026-09-30, on the repair branch

The branch `fix-accept1-2` was cut from `origin/main` `7ae8072`, and `pnpm build` passed in its worktree. The launch then
printed its plan without `--confirm`: endpoint `katalyst`, model `qwen3.8-flash-next`, no money ceiling because the
endpoint is registered unmetered, the key file present. `timeout 3600 xvfb-run … node apps/desktop/scripts/live-run.mjs
--confirm --skip-build` over the default scenarios was then refused before it started. It was refused the same way,
by the agent host's automatic classifier under "Real-World Transactions". Nothing ran, no tokens were spent, and no pack
was written.

Code cannot repair this, and an agent may not route around the refusal. The refusal belongs to the host's permission
settings, which only the owner can change. The refused launches are the full-scenario run and the `duress` run.
Splitting either into `--only=` pieces because such pieces are admitted is one way around the refusal, so it is not
done.
Two ways would close the gap:
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

## Outcome — closed 2026-10-01: both refused launches ran on merged `main` `71ad8e8` and passed

*The note's claim "the merged whole has never run live" was true when written on 2026-09-30, and is falsified as of
2026-10-01. The text above is kept as it was; this section records what replaced it.*

On 2026-10-01 the two launches this note says were refused both ran to the end on merged `main` `71ad8e8`. Their
worktree, `/home/user/Rotaris-crw-wt-accept`, was checked out at `71ad8e8` from 02:42:36 to 06:35:52 by its reflog, and
`pnpm build` ran there before the first launch. Both ran against the registered `katalyst` endpoint (vLLM,
`qwen3.8-flash-next`, registered unmetered, so no money ceiling applied) and both printed `live-run PASSED`:

- **Every scenario** (no `--only=`): pack `.live-run/runs/2026-10-01T02-42-49-120Z`. Sign-in, `ask`, `edit`, `resume`,
  `requirements`, `shell`, `frictions`, `faults` (ladder and stall) and `terminal` ran: 112 `PASS`, 9 `NOTE`, no
  `FAIL`, and 1,863,150 input and 47,457 output tokens. The `resume` scenario's checks of PD-ORCH-005's pause and
  continue passed (clauses 1 to 4, 6, 13 and 19). Two children were paused and resumed under their own task ids, and
  each one's next request carried what it had recorded before the pause.
- **Duress**, `LIVE_RUN_DURESS_MS=5400000`: pack `.live-run/runs/2026-10-01T03-15-27-194Z`. The long run reached its
  result in 5,078 s of the 5,400 s window, with 15 `PASS`, 4 `NOTE` and no `FAIL`. It made 397 tool calls through 9
  children, using 10,385,578 input and 441,753 output tokens. Three children were cut off at their 1,200 s limit while
  making progress and ended `failed`, as the owner ruled (R-048). The two originals, `reconcile-docs` (`bg_71164543`)
  and `verify-result` (`bg_5d571a7a`), each carried PD-ORCH-004's continuation offer, and the parent took both. The
  continuation of `reconcile-docs` (`reconcile-docs-continue`, `continuation_of` `bg_71164543`) was cut off too, and
  its report's `cut_off.continuation_offer` is `null`: it got no second offer, as PD-ORCH-004 requires of a continuation
  that itself times out. The continuation of `verify-result` (`verify-result-continue`) succeeded.
  *(Corrected 2026-10-01 in the verification's fix round. The text first read "Three children reached their 1,200 s
  limit and ended `failed`, each with PD-ORCH-004's continuation offer. The parent took two of the offers, and one of
  those continuations succeeded." The third child was itself a continuation and carried no offer.)*

An earlier `duress` launch at 02:58 received SIGTERM before it produced a pack. Its leftover directory,
`2026-10-01T02-58-14-306Z`, holds no store.

The orchestrating agent session ran both launches after the owner authorised live runs in that conversation (R-066).
That is neither of the two ways the section "Seen again 2026-09-30" names. Since 03:23 that day, the owner's allow rule
for the `--confirm --skip-build` launch forms has also stood in the host's git-ignored `.claude/settings.local.json`.
That is the first of the two ways. `.agents/skills/orchestrated-build/references/live-runs.md` lists the forms. No
launch was split into `--only=` pieces to get around a refusal.

A read-only autopsy of every session in both packs re-checked the repaired live-run findings: D1 to D7, and those of
L1 to L14 that the evidence reaches. None of them recurred. Its new findings were recorded on 2026-10-01 as ten notes
and OQ-161 to OQ-164 (merge `c34fa70`). WF1 was only partly repaired: since 2026-09-29 `write_file`'s description
names `operation`, and the run carried that. Its note,
[`write-files-first-use-refusal-recurred-under-duress.md`](../write-files-first-use-refusal-recurred-under-duress.md),
stays open under OQ-139, and the run hit it again: 2 of 5 first uses were refused. That evidence is added to the note and
to OQ-139. *(Corrected 2026-10-01 in the verification's fix round: the text first read "WF1 was never repaired", which
the note's section "Partly repaired — 2026-09-29 under R-067; still open" contradicts.)*

**What this does not close.** `main` has since moved past `71ad8e8`: `fix-accept1-18`, `-19`, `-20` and `-21` merged
after it, and so did every later merge of 2026-10-01. No live run has executed on the head that would be released. That
run is still owed. As `AGENTS.md` says, it runs when the owner asks for it, or when an agent asks the owner and is told
yes. R-066 is the owner's standing yes for the unmetered `katalyst` endpoint, and the acceptance plan after this round
is where that run is scheduled. This note's defect was the gap acceptance round 1 found on the head it examined,
`7ae8072`: the merged whole of the round before it (the repairs of L1–L14 and D1–D7 under R-067, and WF1's partial
repair), which had never run live. `71ad8e8` carries all of that, and acceptance round 1's own repairs up to
`fix-accept1-17`, and they have now run live. Acceptance round 1's later repairs, `fix-accept1-18` to `-25`, and every
other merge since `71ad8e8` have not. The note is moved to `fixed/`. The row is in
`docs/architecture/first-executions.md`. *(Corrected 2026-10-01 in the verification's fix round. The text first called
`7ae8072` "the merged whole of acceptance round 1's repairs" and said "`71ad8e8` carries all of those repairs". That
mislabelled the round: `7ae8072` is the head acceptance round 1 examined, and its repairs are the `fix-accept1-*`
branches, of which `git log --first-parent 7ae8072..71ad8e8` holds `-1` to `-17`.)*
