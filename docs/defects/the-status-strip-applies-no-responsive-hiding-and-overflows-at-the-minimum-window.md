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

**Amended 2026-10-02 (fin10, before the repair): the strip read against REQ-SHELL-038's whole list, not only its
thresholds.** On origin/main `97e1de4` the strip also lacks items and states something false:

- it draws none of REQ-SHELL-038's "Workspace folder", "Model runs use", "Tokens used" or "Cost so far" items (no source
  file holds those names), so the workspace path is no link (REQ-SHELL-039/040) and no model, tokens or cost is shown
  (REQ-SHELL-043/044/045);
- it has no `unsaved settings` flag (REQ-SHELL-041, REQ-TOOLS-184);
- its file-access flag is the string literal `workspace-scoped` (`apps/desktop/src/renderer/main.tsx:1255`) whatever
  `runtime.allow_outside_workspace` says (`packages/config/src/sections/runtime.ts:45`, a live Tier-B key), so with the
  opt-out on the strip still tells the user agents are confined to the workspace where REQ-TOOLS-131 requires
  `outside-workspace!`: a safety indicator that misreports;
- a string flag's tooltip is its own text (`packages/ui/src/AppShell.tsx:183`), not REQ-SHELL-041's
  "{short form} — {explanation}", and the flags stand in another order than REQ-SHELL-041's fixed one;
- the background count reads `bg sessions: N` where REQ-SHELL-044 reads `N bg sessions`, its noun agreeing with N.

## Specs

- REQ-SHELL-047: the two responsive-elision thresholds, unbuilt; "An item added to the strip is given its threshold here".
- REQ-SHELL-038: the strip's items left to right; the build draws others besides them and lacks four of its own.
- REQ-SHELL-039/040: the workspace path is a link opening the folder; unbuilt.
- REQ-SHELL-041, REQ-TOOLS-131, REQ-TOOLS-184: the safety flags, their order, their joined tooltips, the file-access flag
  from the opt-out and the `unsaved settings` flag; the file-access flag is a literal.
- REQ-SHELL-043/044/045: the model, tokens and cost items, unbuilt; the background count's wording.

## Relevant files

- `apps/desktop/src/renderer/main.tsx`: the `status` memo, the strip's items, with no width condition.
- `packages/ui/src/AppShell.tsx`: the strip, drawing every item it is handed.
- `packages/ui/src/shell.css`: `.status-strip`'s `overflow-x: auto`, the last resort a full strip falls back to.
- `packages/ui/src/composer.ts`: the strip's item helpers (`statusStripRunItem`, `statusStripModeItem`, `statusStripSandboxItem`).
- `packages/config/src/sections/runtime.ts`: `allow_outside_workspace`, which the file-access flag never reads.
- `apps/desktop/scripts/mission-proof.mjs`: the one proof reading strip items (the run state).
