## A worktree binding left `integrating` by a crash or a kill mid-integration is never reset, and never offered for merging again

Recorded 2026-10-21 by the builder of OQ-361's ruling (plan `loc1`, bundle `loc1-guard-2`), while reading the integration
requirements the ruling cites; nothing is built, since worktree integration is deferred from the first release (R-071).

REQ-GIT-130 stamps every source binding of an integration with merge status `integrating` (and the integration session id)
and flushes it. Only REQ-GIT-133 moves it on: to `merged` after a promotion that succeeded, or to `merge_failed` after one
that did not. A process that crashes or is killed between the two, after the stamp and before the promotion's outcome,
leaves each source binding `integrating` in the store, and no requirement resets it:

- REQ-GIT-094's stale-session check and REQ-GIT-160's repair set a stale session's **execution** status to `interrupted` and
  release its lock; neither touches a binding's `merge_status`;
- REQ-GIT-160 says the repair makes the session "eligible once more ... for integration (REQ-GIT-127)", but REQ-GIT-083
  enables "Merge selected" only for a row whose merge status is `ready` or `merge_failed`, so a binding left `integrating`
  is never offered for merging again, and its work can be integrated only by hand;
- REQ-GIT-131 marks the hidden integration session "durable for recovery", but names no recovery of the bindings it
  stamped.

OQ-361's ruling (2026-10-20) keeps the close guard and the workspace-open gate off this stamp for exactly this reason (a
stamp that one crash leaves set would have refused a window's close forever), so the guard is not affected; the merge
eligibility is.

## Specs

It contradicts no requirement: it is a gap. REQ-GIT-130 and REQ-GIT-133 together leave a binding `integrating` after a crash
or a kill mid-integration, REQ-GIT-094 and REQ-GIT-160 repair execution status alone, REQ-GIT-083 then never offers the
binding again, and REQ-GIT-131's "durable for recovery" names no recovery that would reset it. Recorded, not repaired: worktree
integration (REQ-GIT-083, REQ-GIT-125 to REQ-GIT-135) is deferred from the first release
([R-071](../product/requests.md#r-071)), and what the reset should be (back to `ready`, to `merge_failed`, or on what signal)
is the specification's to say when integration is built.

## Relevant files

- `docs/spec/` — REQ-GIT-015 (the binding and its `merge_status` vocabulary), REQ-GIT-083, REQ-GIT-094, REQ-GIT-130,
  REQ-GIT-131, REQ-GIT-133, REQ-GIT-160.
- `packages/contracts/src/repository.ts` — `MERGE_STATUSES`, the vocabulary; nothing in the product writes `integrating` yet.
- `apps/desktop/src/main/integration-guard.ts` — guard (2) and gate (2), which under OQ-361 never read the stamp.
- `docs/architecture/open-questions.md` — OQ-361, whose ruling (c) names this stamp's crash behaviour as the reason the guard
  reads main's own record.
