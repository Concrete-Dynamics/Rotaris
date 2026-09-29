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
