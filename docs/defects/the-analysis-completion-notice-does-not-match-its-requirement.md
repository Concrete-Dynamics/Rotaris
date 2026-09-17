## REQ-LIBRARY-124's completion notice was wrong in three ways, and one of them is still open

The notice raised when an improvement analysis stores its artifact did not match the requirement that
fixes its wording, its action and its two outcomes.

1. **The title.** It read `Improvement proposals are ready`, where REQ-LIBRARY-124 fixes
   `<N> improvement proposal ready` / `<N> improvement proposals ready`, singular and plural.
2. **The action.** It carried none, where the requirement fixes one labelled "Review proposals" opening
   the Library on the proposals tab. The notice therefore announced proposals a user then had to navigate
   to by hand.
3. **The zero-proposal outcome.** An artifact with no proposals raised the same success-shaped notice
   saying `0 proposals collected`, where the requirement fixes an informational notice reading
   `Improvement analysis complete — no proposals` and carrying no action.
4. **The worker-failure notice — still open.** A job that ended without producing an artifact for any
   reason other than cancellation MUST publish a warning notice naming the run and carrying the failure's
   reason. `createImprovementCoordinator` writes a line to the application log at each of its three failure
   points (`analyst could not start`, `artifact save failed`, `canonical reread failed`) and posts no
   notice at all, so a failed analysis is silent to the user. The requirement says the log entry stays
   **in addition to** the notice, not instead of it.

Points 1 to 3 were repaired on 2026-09-17 while building `PD-LIBRARY-002`'s retrospective, whose own
completion notice branches off the same call. Point 4 is untouched: it is a change to the coordinator's
failure paths rather than to the notice, it must distinguish a cancellation from a failure (REQ-LIBRARY-127
forbids a notice for the cancelled case), and nothing in the retrospective work needed it.

## Specs

REQ-LIBRARY-124 — the completion notice's two outcomes, its titles, its action label and its destination,
and the warning notice a non-cancelled job that produced no artifact owes. REQ-LIBRARY-127 — the
cancellation case that must stay silent, which is what makes point 4 more than a missing call.

## Relevant files

- `apps/desktop/src/main/index.ts` — the coordinator's `stored` dependency, which raises the notice
  (points 1 to 3, repaired here).
- `apps/desktop/src/main/improvements.ts` — `drain()`'s three failure returns and its `catch`, which log and
  post nothing (point 4, open).
- `packages/contracts/src/notices.ts` — `open-library`, the action vocabulary member the repair uses.

Noticed 2026-09-17 while building the retrospective pass of `PD-LIBRARY-002`.
