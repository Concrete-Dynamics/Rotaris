## The inspector says the record carries no run-level prompt reading

For the run-level agent the inspector's ring caption adds "The record does not carry the run-level agent's prompt reading
in this build." (`packages/ui/src/Inspector.tsx`). The record has carried it since Part AH (`SessionRecord.entryContext`,
REQ-MONITOR-089), and the same caption states the figure one line above — the live run's `ask.png`
(`.live-run/runs/2026-09-29T11-48-13-397Z`) reads "This agent's own context window: 4,505 of 262,144 tokens." and then
the sentence denying it. Seen 2026-09-29 while repairing live-run finding K1, the same class as that finding's false "no
artifact store" sentence; not repaired here, because K1 named the tools and the artifacts.

## Specs

- `REQ-MONITOR-089`: the run's synthetic root agent exposes the newest prompt reading so root-level surfaces have a figure.
- `REQ-MONITOR-065`: the meter is labelled as that agent's own context window — which the sentence contradicts.

## Relevant files

- `packages/ui/src/Inspector.tsx` — the `isRunLevel &&` note under the ring caption.
- `packages/engine/src/run/run.ts` — `entryContext`, the reading the sentence denies.
