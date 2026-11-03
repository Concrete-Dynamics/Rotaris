## The agent row's hand-drawn status dot paints done in the running hue

`.agent-row__dot` re-draws the design `StatusDot` by hand in six call sites (`AgentTree.tsx`, `AgentTable.tsx`,
`Inspector.tsx` twice, `MissionView.tsx`, `PersonaWindow.tsx`) and departs from it in five values. `done` takes
`--rt-ok`, which resolves to the same axis Y step as `--rt-run` in all three themes, so a done agent and a running one
differ only by the pulse; `failed` takes `--rt-danger-300`, not `--rt-fail`; the base class and `idle` take
`--rt-text-tertiary`, plain text colour, not `--rt-info-500`; `cancelled` takes `--rt-warn`, the waiting hue; and the
running pulse cycles at `--rt-duration-slow` (240 ms), not the adopted 1.6 s. Beside it, `@keyframes rt-pulse` is defined
twice in what the renderer loads — in the adopted `docs/design/system/components.css` (opacity 1 to 0.35) and in
`packages/ui/src/shell.css` (0.35 to 1) — and the later one wins. `docs/design/README.md` §7.2 (2026-09-09) left the copy
because it rendered identically to `.status-dot`; it no longer does. Noticed 2026-11-02 while writing guide 12 of the
design research corpus.

## Specs

- `REQ-MONITOR-040` and `REQ-MONITOR-052` ask for a state-coloured status dot that pulses while the agent is live; a done
  dot in the running hue is coloured by the wrong state.
- `REQ-SHELL-036` resolves `completed` to `done` and `idle` to `info`, lets no group fall back to plain text colour, and
  never shows one status word in two colours at the same moment; the run header's `StatusDot` paints done from
  `--rt-done` while the agent row paints it from `--rt-ok`, at least where the agent's state word is a lifecycle word
  (`REQ-NOTIFY-048`).
- `docs/design/README.md` §1.3 (which token means which state; health and lifecycle families not mixed) and §1.8 (two
  infinite animations, `.status-dot.is-pulsing` at 1.6 s).

## Relevant files

- `packages/ui/src/shell.css` — `.agent-row__dot` and its state modifiers (lines 847–854, 1680), the second
  `@keyframes rt-pulse` (line 568), the `StatusDot` state rules that state the adopted mapping (lines 190–196).
- `packages/ui/src/design-system/core.tsx` — `StatusDot`, the single home.
- `docs/design/system/components.css` — the adopted `.status-dot.is-pulsing` and its `rt-pulse` (lines 75–76).
- `packages/contracts/src/theme/themes.ts` — `--rt-ok` and `--rt-run` resolving to one value in every theme.
- `packages/ui/src/AgentTree.tsx`, `AgentTable.tsx`, `Inspector.tsx`, `MissionView.tsx`, `PersonaWindow.tsx` — the call
  sites; `packages/ui/src/persona-run-cancel.test.ts` pins `agent-row__dot--running`.
- `docs/research/design/12-design-system-governance-and-drift.md` — section 5 walks it as the worked example.

## Outcome — repaired 2026-11-03 (the Overview audit of 2026-11-02, item 4 and P2; R-093)

The six call sites draw the design `StatusDot` through one mapping, `agentDotState` in `packages/ui/src/agents.ts`: `running` →
`run`, pulsing; `waiting`, `queued` and `paused` → `wait`; `done` → `done`; `failed` and `cancelled` → `fail`, the family
REQ-MONITOR-169 counts them in (the lifecycle family has no waiting hue for a cancelled agent, and the health family may not mix
with it on one surface); no agent → `idle`, `--rt-info-500`. `.agent-row__dot` and its six modifiers are gone from `shell.css`,
and the second `@keyframes rt-pulse` with them, so the adopted `components.css` holds the one definition. Measured on the built
app with `pnpm app:drive` (1400×900, `rotaris-dim`): before, the Overview tree card's done row painted `oklch(0.65 0.188 165)`,
`--rt-ok` and `--rt-run` alike, and `document.getAnimations()` on a running row held `rt-pulse` at 240 ms on
`.agent-row__dot--running`; after, the done row paints `oklch(0.59 0.16 292)`, `--rt-done`, and the running row's one animation is
`rt-pulse` at 1,600 ms on `.status-dot.is-pulsing` with `data-motion="full"`. `agents.test.ts` pins the mapping,
`persona-run-cancel.test.ts` the pulsing run-state dot, `overview-view.test.ts` the done dot and the absent keyframes.
