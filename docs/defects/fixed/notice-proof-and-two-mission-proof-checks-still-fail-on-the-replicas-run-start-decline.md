## notice-proof and two mission-proof checks still fail on the replica's run-start decline

**Outcome (2026-10-15, fin47): repaired, the repair this note named.** `notice-proof.mjs` imports `unexpectedRendererErrors` and
`replicaRunStartDeclines` from `apps/desktop/scripts/lib/renderer-console.mjs`; all eleven of its renderer-error checks (the
nine the note counted grew to eleven before the repair: `advisory`, `hook-load-fault`, `global-merged-warning`, `scoping`,
`stack`, `review-action`, `review-other`, `review-refused`, `retry-action`, `retry-image-first`, `retry-image`) read through the
filter, and so does the twelfth, `action-refused` (section 6f, which landed on main while this repair was built and was brought through the filter at the landing rebase, the source-shape case red on it until then), and `launch` counts what it let through per launch in `results.json` → `replicaRunStartDeclines`. `mission-proof.mjs`'s
`unexpected` is defined once beside `results`, before the first launch, and its `painted` and `waiting` checks read through it
as its later items did, each recording `replicaDeclines`. Pinned by two source-shape cases in
`apps/desktop/scripts/lib/renderer-console.test.ts` ("notice-proof and every mission-proof launch read renderer errors through
the shared filter"): no `<x>.errors.length === 0` remains in either proof and every `renderer errors:` check is the filtered
form; both cases failed on the proofs before the repair. Driven at the branch's build: `notice-proof` passed (load 2.50 to
2.86 on 4 CPUs; every launch met 0 declines), and `mission-proof` passed (load 2.50 to 2.42; `painted`, `waiting` and
`timedOut` each met 0). Neither run met the decline, so the filter's letting it through is shown by its own cases in
`renderer-console.test.ts`, not by these runs.

`palette-proof` went red on the replica's run-start diagnostic "[replica] declined increment on <session>: earliest-changed 2
precedes oldest held 3", which is REQ-SESSION-161's own recovery and no fault
([`fixed/palette-proof-fails-on-the-replicas-documented-run-start-decline.md`](palette-proof-fails-on-the-replicas-documented-run-start-decline.md)).
Its repair (2026-10-14, fin46) moved the filter `mission-proof` kept to itself into
`apps/desktop/scripts/lib/renderer-console.mjs` (`unexpectedRendererErrors`) and routed every `palette-proof` check and
`mission-proof`'s `unexpected` through it. Two other places read the same relayed lines with no filter, found by reading the
code while doing that work:

- `apps/desktop/scripts/notice-proof.mjs` ends nine launches with `expect(r.errors.length === 0, …)` (lines 208 to 893, one of
  them `first.errors`), and its launches start scripted runs (`ROTARIS_SCRIPT`, set ten times), the moment the decline is met.
- `apps/desktop/scripts/mission-proof.mjs`'s `painted` and `waiting` launches (lines 169 and 201) also end with
  `r.errors.length === 0` and both start a delegating run; only its later checks read through `unexpected`.

Not seen red: `notice-proof` was not run for this note, and the one whole `mission-proof` run taken beside the repair (load
2.32) passed, its launches meeting no decline. `palette-proof`'s persona stage, which starts one run, met the
decline in 2 of 6 launches on the base `9437077` at loads of 0.87 and 2.99 on four CPUs, so a launch of these proofs that
starts a run can go red the same way with nothing wrong on screen. Recorded, not repaired: outside fin46's `accept1-6` task.
The repair is the one `palette-proof` took: `unexpectedRendererErrors(r.errors)` in place of `r.errors`, pinned by a
source-shape case in `apps/desktop/scripts/lib/renderer-console.test.ts`.

## Specs

None contradicted by the product. The proofs contradict REQ-SESSION-161, which makes the decline a recovery, as `palette-proof`
did.

## Relevant files

- `apps/desktop/scripts/notice-proof.mjs` — the nine `errors.length === 0` checks (`first.errors` at line 836).
- `apps/desktop/scripts/mission-proof.mjs` — the `painted` and `waiting` checks at lines 169 and 201.
- `apps/desktop/scripts/lib/renderer-console.mjs` — `unexpectedRendererErrors`, the shared filter.
- `apps/desktop/scripts/lib/renderer-console.test.ts` — where a source-shape case would pin each proof to it.
