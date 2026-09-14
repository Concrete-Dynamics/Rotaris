## The event specification still calls `untrusted_workspace` the only defined hook skip reason

A4's amendment round widened `REQ-HOOKS-126`'s closed set of skip reasons from one member to two, adding
`plan_gate` for a hook invocation withheld while a run is held at the plan gate. Two places in
`docs/spec/20-event-history-replay-export.md` were not amended with it and still assert, in terms, that
there is exactly one defined value. A reader who validates `hook.finish` against the event document alone
would reject a conformant `plan_gate` event.

Noticed while building the plan gate (REQ-ORCH-152 to REQ-ORCH-154): the implementation emits the second
reason, and the two documents disagree about whether it exists. Nothing about the plan gate's behaviour is
in doubt — `REQ-HOOKS-126` owns the vocabulary and `REQ-HOOKS-102` and `REQ-HOOKS-123` both cite it as the
owner — so this is a stale restatement rather than a contradiction the build had to resolve.

This is a **defect found by building**, so it owes an amendment round as well as the row it already has in
`docs/architecture/first-executions.md`. Recording it here is not repairing it.

## Specs

**REQ-HOOKS-126** (`docs/spec/09-lifecycle-hooks.md`) as amended: "The defined reasons are exactly two.
`"untrusted_workspace"` is a hook the trust gate withheld … `"plan_gate"` is a hook invocation withheld
while a run is held at the plan gate (REQ-ORCH-153)."

**REQ-EVENTS-047** (`docs/spec/20-event-history-replay-export.md`) contradicts it: "`skip_reason` exactly
`untrusted_workspace` (the only defined value, REQ-HOOKS-126)". The event-payload table in the same
document repeats the claim: "`skip_reason` (`untrusted_workspace` is the only defined value,
REQ-HOOKS-126)".

Note that REQ-EVENTS-047's sentence is doing two jobs at once. Its restriction to `untrusted_workspace` is
correct *for the case it describes* — a hook the trust gate withheld — and stale only in the parenthetical
that calls that value the only one defined. An amendment should keep the first and repair the second.

## Relevant files

- `docs/spec/20-event-history-replay-export.md` — REQ-EVENTS-047 and the `hook.finish` row of the event
  payload table; the two places that restate the vocabulary.
- `docs/spec/09-lifecycle-hooks.md` — REQ-HOOKS-126, the owner of the set, and the payload summary beside
  it, which A4 did amend and which already names both values.
- `packages/contracts/src/hooks.ts` — `HOOK_SKIP_REASONS`, the product's single copy, now two members.
- `packages/hooks/src/engine.ts` — `announceWithheld` emits the first reason once per session; `runOne`
  emits the second once per withheld invocation.

## Repaired — 2026-09-14

Both restatements in `docs/spec/20-event-history-replay-export.md` were amended
in place, keeping what was correct and repairing what was stale. `REQ-EVENTS-047`
keeps its restriction of the trust-gate case to `skip_reason` exactly
`untrusted_workspace` — that sentence governs a hook REQ-HOOKS-090 withheld, and
only that hook — and its parenthetical now says that value is *one of the two*
REQ-HOOKS-126 defines, naming `plan_gate` and pointing at REQ-ORCH-153 for the
separate case. The `hook.finish` row of the payload table names both values and
cites REQ-HOOKS-126 for their meanings, delegating the vocabulary instead of
copying it — the pattern the table's neighbouring rows already follow.

The amendment round's record is appended to
`docs/spec/resolutions/20-event-history-replay-export.md`, which closes the
obligation the plan gate's row in `docs/architecture/first-executions.md`
carried. No code changed: `REQ-HOOKS-126`, `HOOK_SKIP_REASONS` in
`packages/contracts/src/hooks.ts`, and both emission sites in
`packages/hooks/src/engine.ts` were already conformant, which is why this was a
stale restatement rather than a contradiction the build had to resolve.
