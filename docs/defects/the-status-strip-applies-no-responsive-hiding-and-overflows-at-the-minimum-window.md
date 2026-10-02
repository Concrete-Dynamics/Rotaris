## The status strip applies no responsive hiding and overflows at the minimum window

REQ-SHELL-047 hides the workspace-path item below 1180 px and the background-session item below 1080 px. The built strip
(`packages/ui/src/AppShell.tsx`, items from `apps/desktop/src/renderer/main.tsx`) hides nothing at any width: at
REQ-MONITOR-051's 1000 × 680 floor it still draws `bg sessions: 0`, and it holds items REQ-SHELL-038's list does not have
(the run's state, the theme's name, each child service and the applied/reset/refused counters). The strip's content is then
wider than the window and falls back to its own horizontal scroll (`overflow-x: auto`, `packages/ui/src/shell.css`).
Measured 2026-10-02 by fin8 with `pnpm app:drive` at 1000 × 680, load about 2.2: with an unconfined session focused the
strip's `scrollWidth` was 1026 px against a `clientWidth` of 1000 px; with a confined one, whose `sandbox: bubblewrap` item
REQ-SANDBOX-121's repair added (141 px with its gap), 1167 px; at 1400 px wide both fit. Noticed while drawing that item
([no-workspace-indicator-names-the-confinement-backend.md](fixed/no-workspace-indicator-names-the-confinement-backend.md));
not repaired there: the thresholds and the strip's item list are REQ-SHELL-038/047's, and where the new item stands is
OQ-184's.

## Specs

- REQ-SHELL-047: the two responsive-elision thresholds, unbuilt; "An item added to the strip is given its threshold here".
- REQ-SHELL-038: the strip's items left to right; the build draws others besides them.

## Relevant files

- `apps/desktop/src/renderer/main.tsx`: the `status` memo, the strip's items, with no width condition.
- `packages/ui/src/AppShell.tsx`: the strip, drawing every item it is handed.
- `packages/ui/src/shell.css`: `.status-strip`'s `overflow-x: auto`, the last resort a full strip falls back to.
