## REQ-LIBRARY-125/126's two activity indicators are never drawn — the channel that carries them has no consumer

Main publishes analyst activity on channel 11 and the preload exposes it, and no renderer subscribes.
`createImprovementCoordinator` publishes an `ImprovementActivity` on every enqueue, start and finish;
`main/index.ts` sends it to every live window on `CHANNEL.improvementActivity`; `preload/index.ts` exposes
`onImprovementActivity`. The only other mention of that method in the repository is its type in
`contracts/src/commands.ts`. Nothing in `apps/desktop/src/renderer` or `packages/ui` reads it, so neither
indicator exists: not the title-bar one, not the workspace run header's.

The consequence a user meets is that a completed run's background analysis is invisible while it runs. The
proposals appear with a notice when it finishes (REQ-LIBRARY-124, built but not to its own wording — see
`the-analysis-completion-notice-does-not-match-its-requirement.md`), and nothing between the
run ending and that notice says work is in flight.

## Specs

REQ-LIBRARY-125 — "While analysis is running, two activity indicators MUST be visible: one in the
application title bar and one in the workspace run header. Both MUST carry the label 'Reviewing run for
improvements…'", with the title-bar indicator exposing the accessible name "Improvement analysis status"
and the stated description. REQ-LIBRARY-126 fixes what they do with several sessions analysing at once, and
REQ-LIBRARY-122 names them as the pass's only progress signal. None of the three is met.

## Relevant files

- `apps/desktop/src/main/improvements.ts` — `publish()`, the activity the coordinator emits.
- `apps/desktop/src/main/index.ts` — the `activity` dependency, which sends `CHANNEL.improvementActivity`.
- `apps/desktop/src/preload/index.ts` — `onImprovementActivity`, exposed and unused.
- `packages/contracts/src/channels.ts` — channel 11 and `ImprovementActivityPublishSchema`.
- `apps/desktop/src/renderer/main.tsx`, `packages/ui/src/AppShell.tsx`, `packages/ui/src/RunHeader.tsx` —
  where the subscription and the two indicators belong.

Noticed 2026-09-17 while planning the retrospective pass of `PD-LIBRARY-002`, which requires its own
activity to be signalled by this pattern.

## Repaired — 2026-09-17

Built as part of `PD-LIBRARY-002` (ADR-0065 decision 5), once for both passes. `packages/ui/src/ImprovementActivity.tsx`
is the one component; `AppShell.tsx` draws it in the title bar and `RunHeader.tsx` in the workspace run header, both
reading `useShellState`'s `improvementAnalysis`. `apps/desktop/src/renderer/main.tsx` subscribes to
`bridge.onImprovementActivity` — the consumer channel 11 never had — and the coordinator publishes `pass` beside
`active` so each indicator carries the label of the pass that is running. Covered by
`packages/ui/src/improvement-activity.test.ts` and measured in the built application by `pnpm retrospective-proof`
(present while a pass runs, on both surfaces, and absent when none does).
