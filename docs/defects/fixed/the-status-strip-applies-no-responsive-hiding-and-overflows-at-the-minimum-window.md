## The status strip applies no responsive hiding and overflows at the minimum window

REQ-SHELL-047 hides the workspace-path item below 1180 px and the background-session item below 1080 px. The built strip
(`packages/ui/src/AppShell.tsx`, items from `apps/desktop/src/renderer/main.tsx`) hides nothing at any width: at
REQ-MONITOR-051's 1000 × 680 floor it still draws `bg sessions: 0`, and it holds items REQ-SHELL-038's list does not have
(the run's state, the theme's name, each child service and the applied/reset/refused counters). The strip's content is then
wider than the window and falls back to its own horizontal scroll (`overflow-x: auto`, `packages/ui/src/shell.css`).
Measured 2026-10-02 by fin8 with `pnpm app:drive` at 1000 × 680, load about 2.2: with an unconfined session focused the
strip's `scrollWidth` was 1026 px against a `clientWidth` of 1000 px; with a confined one, whose `sandbox: bubblewrap` item
REQ-SANDBOX-121's repair added (141 px with its gap), 1167 px; at 1400 px wide both fit. Noticed while drawing that item
([no-workspace-indicator-names-the-confinement-backend.md](no-workspace-indicator-names-the-confinement-backend.md));
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

## Outcome (fin10, 2026-10-02)

**Repaired.** The strip is built from pure helpers in `packages/ui/src/composer.ts`: `stripItems(width, facts)` answers
REQ-SHELL-038's items in its order with its accessible names (`STRIP_NAMES`) — the workspace path as the one link
(REQ-SHELL-039; a design-system `Button`, its tooltip and description "Workspace folder: {path}. Opens it in your file
manager."), the branch, a spacer, REQ-SHELL-041's safety flags in their fixed order (`statusStripSafetyFlags`: `● CB armed`
while armed, `redaction: always on`, `unsaved settings` while the Settings view is dirty, exactly one of
`outside-workspace!` / `workspace-scoped` from `runtime.allow_outside_workspace`, OQ-184's `sandbox: <backend>` right after
it, `mode: {mode}`), each tooltip and accessible description the joined "{short form} — {explanation}"; the model at full
text strength with REQ-SHELL-043's tooltip; `{n} tok` grouped by thousands (REQ-SHELL-044); `{figure} cost` by the money
rule, absent until a figure exists, `n/a` for unpriced usage (REQ-SHELL-045; bare, as PD-MONITOR-001 revision 3 renders a
figure with no currency); `N bg session(s)` with the noun agreeing. REQ-SHELL-047's thresholds read the window's own width:
the path goes below 1180 px, the background count below 1080 px. The run state, the theme's name, the child services and the
replica counters are gone from the strip (the run header, the Mission subtitle and Settings carry the first two). The
cloud-credit item (REQ-SHELL-046) is never present: this build reads no credit balance. Two commands carry what the renderer
did not have: `workspace.openFolder` (REQ-SHELL-040: a failure is the transient error naming the path; an opener that never
answers counts after 5 s, `apps/desktop/src/main/open-folder.ts`) and `workspace.usage` (the tokens and cost over the
workspace's stored sessions, `packages/engine/src/workspace-usage.ts`).

**Readings the build proceeds under, raised:** the tokens item counts **this workspace's runs**, as the cost does — REQ-SHELL-044
names no scope (OQ-190); where the workspace domain states the strip otherwise (REQ-WORKSPACE-019's silent failure,
REQ-WORKSPACE-022's `unsaved settings`, mode, redaction and circuit-breaker explanations) the shell domain's statements are built, the file-access pair
being REQ-WORKSPACE-022's fixed one (OQ-191).

**Pinned by** `packages/ui/src/composer.test.ts` ("REQ-SHELL-038/047: the status strip, item by item": order, names, the one
link, both thresholds at 1179/1180 and 1079/1080, every flag's tooltip, `outside-workspace!` under the opt-out, tokens, cost
and the noun), `packages/ui/src/layout-regression.test.ts` (the item list at each threshold and the spacer's give),
`packages/engine/src/workspace-usage.test.ts`, `apps/desktop/src/main/open-folder.test.ts` and
`apps/desktop/src/renderer/recovery-wiring.test.ts` (no run item). Each strip test fails on the code before the repair, which
had no `stripItems`. `apps/desktop/scripts/mission-proof.mjs` read the strip's run item; it reads the Mission subtitle now.

**Shown in the built app** with `pnpm app:drive` on 2026-10-02 (load about 0.79), a confined session focused
(`sandbox_mode: workspace-write`, bubblewrap) after a scripted run: `.status-strip`'s `scrollWidth` equals its
`clientWidth` at 1000 (1000/1000, the spacer still 204 px wide), 1079 (1079/1079), 1080, 1179 (1179/1179), 1180 and 1400
(1400/1400), with the path shown from 1180 and the count from 1080 exactly; before, fin8 measured 1167/1000 here. Relaunched
with `allow_outside_workspace: true` the flag read `outside-workspace!`; an unsaved Settings edit raised `unsaved settings`;
the path link on this host (no `xdg-open`) raised "The workspace folder could not be opened" naming the path after 5 s.

Noticed while building and recorded, not repaired:
[the-status-strips-workspace-path-elides-at-its-end-not-its-middle.md](../the-status-strips-workspace-path-elides-at-its-end-not-its-middle.md),
[the-status-strips-branch-item-has-no-branch-icon-and-its-tooltip-no-full-stop.md](../the-status-strips-branch-item-has-no-branch-icon-and-its-tooltip-no-full-stop.md).

**Repair round, 2026-10-03 (the verifier's two findings against this repair).** Two flags still did not follow the
configuration the file-access flag had been made to read:

- `● CB armed` was `shell.hello`'s boot answer alone, so after `circuit_breaker.enabled: false` was saved the strip still
  read armed while the next run had no breaker (REQ-SHELL-041's display condition, REQ-TOOLS-184's 100 ms). It now follows
  the saved snapshot (`stripCircuitBreakerArmed` in `packages/ui/src/composer.ts`), the boot answer standing only until the
  first snapshot arrives and the host override `ROTARIS_CIRCUIT_BREAKER=off` (carried on `shell.hello` as
  `circuitBreakerHostOff`) still disarming it. Pinned by `composer.test.ts` ("`● CB armed` follows the saved
  configuration…") and `recovery-wiring.test.ts` ("main.tsx arms the strip's circuit-breaker flag from the configuration
  snapshot…", red before).
- Main sent every `config:changed` snapshot to every window, and each renderer adopted it, so with two main windows on two
  workspaces (REQ-SHELL-020) a Settings save in one rewrote the other's file-access, mode and circuit-breaker flags — and its
  Settings view — to the first workspace's values. Main now announces each main window its own workspace's snapshot
  (`announceConfig`, `apps/desktop/src/main/config-broadcast.ts`, used by `config.save`/`config.setField` and after a
  provider change). Pinned by `config-broadcast.test.ts` and `commands/config.test.ts` ("config.setField — every main window
  repopulates from its own workspace", red before).
- Carried from the same verifier's optional findings: a session with a priced cost qualifier but no tokens yet counted as
  priced, drawing `0.00 cost` before any usage (REQ-SHELL-045); `workspaceUsage` now counts a row's cost only once it
  reported usage (`workspace-usage.test.ts`, red before). And the strip memoises on its REQ-SHELL-047 band
  (`stripWidthBand`), so a resize that crosses no threshold rebuilds nothing (REQ-TOOLS-184; `composer.test.ts`).

Shown in the built app with `pnpm app:drive` on 2026-10-03 at 00:36 UTC (load 2.70): window A on one scratch workspace
and, by `workspace.choose {newWindow: true}`, window B on another, both reading `● CB armed | redaction: always on |
workspace-scoped`. The product's own `config.setField {circuit_breaker: {enabled: false}, runtime: {allow_outside_workspace:
true}}` sent from window A wrote A's `agents.yaml`; A's strip then read `redaction: always on | outside-workspace!` (no
breaker flag) and B's was unchanged (`● CB armed | redaction: always on | workspace-scoped`). Setting `enabled: true` again
from A brought `● CB armed` back in A; the opt-out written from B turned B's flag to `outside-workspace!`.

**Second repair round, 2026-10-03 (the verifier's finding against the first).** The first form of the `config:changed`
repair (5df1943) announced to the main windows alone (`mainWindows.ordered()`), where main had sent every window the
snapshot before: a persona window, which reads it through `useConfigSnapshot('persona')` for its entry and run-level model
(`entryOf`), its declared tools (REQ-MONITOR-060) and the compression threshold, was never sent it again and kept what it
mounted with until it was reopened. The verifier drove it: a `config:changed` counter in the main window read one
delivery, the persona window's none. Each main window's audience is now its family (`configFamily` in
`apps/desktop/src/main/config-broadcast.ts`): the main window, its persona windows and its terminal window, each taking
its owner's workspace's snapshot. Pinned by `config-broadcast.test.ts` ("configFamily — the windows that take one main
window's config:changed") and `commands/config.test.ts` ("config.setField — a main window's persona and terminal windows
repopulate with it", red on 5df1943). Shown with `pnpm app:drive` on 2026-10-03 at 01:01 UTC (load 1.62): a scripted run,
`window.openPersona {persona: 'orchestrator', agentId: 'run'}`, a counter on `window.rotaris.onConfigChanged` in both
windows, then `config.setField {runtime: {allow_outside_workspace: true}}` from the main window: each window received one
snapshot reading `true`, and the write back to `false` reached the persona window too (`[true, false]`). ADR-0037's first
execution and views 02 and 03 are amended in place beside their earlier sentences. Noticed alongside, not repaired: a
persona window's own commands, its mount read of the configuration among them, answer for the active main window rather
than its owner ([a-persona-windows-commands-answer-for-the-active-main-window-not-its-owner.md](../a-persona-windows-commands-answer-for-the-active-main-window-not-its-owner.md)).
