## The inspector says the record carries no run-level prompt reading

For the run-level agent the inspector's ring caption adds "The record does not carry the run-level agent's prompt reading
in this build." (`packages/ui/src/Inspector.tsx`). The record has carried it since Part AH (`SessionRecord.entryContext`,
REQ-MONITOR-089), and the same caption states the figure one line above — the live run's `ask.png`
(`.live-run/runs/2026-09-29T11-48-13-397Z`) reads "This agent's own context window: 4,505 of 262,144 tokens." and then
the sentence denying it. Seen 2026-09-29 while repairing live-run finding K1, the same class as that finding's false "no
artifact store" sentence; not repaired here, because K1 named the tools and the artifacts.

**Outcome.** Repaired 2026-09-29 under R-067 (acceptance finding A36). Confirmed on `fix-accept1-22` (base `610f7fe`)
first: a unit case rendering the inspector on the run-level agent with `entryContext` 4,505 of 262,144 drew the figure
and the sentence beneath it, and went red on the sentence. The `isRunLevel &&` note is removed from the ring caption in
`packages/ui/src/Inspector.tsx`; the caption now states the run-level agent's own context window, as it does for every
agent, and nothing denies it. Pinned by `packages/ui/src/inspector-links.test.ts` ("REQ-MONITOR-089 / REQ-MONITOR-065
(acceptance A36)"), red before the change, and by `pnpm artifacts-proof` item 2, which now reads the running run-level
agent's ring caption in the built app and fails when it lacks "This agent's own context window: N of M tokens." or says
"does not carry" — run green against the repair, and red against a build of the base's `Inspector.tsx`.

## Specs

- `REQ-MONITOR-089`: the run's synthetic root agent exposes the newest prompt reading so root-level surfaces have a figure.
- `REQ-MONITOR-065`: the meter is labelled as that agent's own context window — which the sentence contradicts.

## Relevant files

- `packages/ui/src/Inspector.tsx` — the `isRunLevel &&` note under the ring caption.
- `packages/engine/src/run/run.ts` — `entryContext`, the reading the sentence denied.
- `packages/ui/src/inspector-links.test.ts`, `apps/desktop/scripts/artifacts-proof.mjs` item 2 — what pins the repair.
