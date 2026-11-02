## The duress run's "no child ended failed with nothing to say" check flags a cut-off child

The check counts a child as silent when it ended `failed` with an empty `final_response`. REQ-ORCH-110 has that field
populated only where the last assistant message was not followed by tool activity, so it is legitimately empty for a
child cut off mid-work — which carries `last_response`, `cut_off`, its changed paths and a timeout error instead. The
check failed on exactly such a child. A false positive.

Live-run finding: H-a (live runs of 2026-09-29)

## Specs

- None; harness. `REQ-ORCH-110` (the final-response field), `PD-ORCH-004` (the cut-off report).

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`: child `d` (`bg_b8da141a`) was cut off at its 1,200 s ceiling with `cut_off`,
  `changed_paths` and the continuation offer; the parent took the offer and the continuation `d2` succeeded. The check
  FAILED: "no child ended failed with nothing to say — d".

## Relevant files

- `apps/desktop/scripts/live-run.mjs:1899-1900` — `final_response === ''` alone.

## Outcome

Repaired 2026-09-29 under R-067. A failed child counts as silent only when its report carries none of its own words
and no cut-off: no `final_response`, no `last_response` and no `cut_off` block (`saysSomething` and
`silentFailedChildren` in `apps/desktop/scripts/lib/duress-checks.mjs`, called from the `duress` scenario). The summary is
not counted, because REQ-ORCH-110 makes one for every report. Pinned by `apps/desktop/scripts/lib/duress-checks.test.ts`
("a failed child with something to say is not silent"): child `d`'s recorded report is not silent, and its last
response alone, its `cut_off` block alone (with or without the timeout error PD-ORCH-004 puts beside it) and a final
response are each something to say; a report with none of them, or no report, still is. Replayed over the 2026-09-29
pack's store, the check now finds no silent child where it flagged `d`.

~~…and no error entry with a message … each of the four fields alone is something to say.~~ *Corrected 2026-09-30 (the
verifier's fix round 1), the first repair's reading kept struck through beside it: an error entry alone is **not**
something to say. The product writes one on every failed child — `timeout`, the caught error, `model` with the
report's error headline and `incomplete_execution` in `packages/engine/src/children/orchestration.ts`'s status
decision, and `child_exception` in `settleRaised` — so counting it left the check able to flag only a child with no
outcome at all. The eighty-second defect's children, failed with an error naming the abort and no words or `cut_off`,
passed it, and the case that claimed to pin that defect's observable pinned `errors: []`, a shape it never produced.
The case "the eighty-second defect's shape … is silent" now pins the recorded shape and fails on the first repair, and
three cases pin that a `timeout` without `cut_off`, a `child_exception` and an `incomplete_execution` entry alone are
nothing to say.*

**Live, 2026-09-30** (pack `.live-run/runs/2026-09-30T05-29-56-712Z`): no child ended `failed`, and the check passed.
The cut-off shape was not met live this time; the unit cases pin it.

**Live, second run of 2026-09-30, after the correction** (pack `.live-run/runs/2026-09-30T06-33-14-401Z`, session
`7099306f`): the cut-off shape was met live this time. `w2d reconcile docs` ended `failed`, cut off at its 1,200 s
ceiling with an empty `final_response`, a 104-character `last_response`, a `cut_off` block and a `timeout` error; its
continuation `w2d finish item 9` succeeded. The check passed: "every failed child reported".
