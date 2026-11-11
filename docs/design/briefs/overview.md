# Overview — brief

**Status:** proposed — an audit alone: none of the brief's eleven sections is written yet (`.agents/skills/design-ui/references/surface-audit.md`, step 1); the audit's executable items were implemented 2026-11-03, and items 2 and 11 on 2026-11-05 once OQ-537, OQ-539 and OQ-540 were ruled
**Written:** 2026-11-02 by `design-ui` (audit mode), for [R-093](../../product/requests.md#r-093), the design-system overhaul's dry run
**Surface:** the Overview primary view; §7 row "Overview"; mockup sections `HOME`, `expanded overview strip`; nearest built code `packages/ui/src/OverviewView.tsx`; theme `rotaris-dim`

## Parts

Split on 2026-11-05 under [the document budget](../../README.md#the-document-budget): the brief stood 89 bytes under 32 KiB before its third section. Each audit and each execution is one part; a new one is appended as the next part and listed here.

| Part | Holds |
|---|---|
| [1](overview/01-audit-2026-11-02.md) | The audit of 2026-11-02: items 1 to 17, the predicted rows P1 to P4, taste, what was left, and the open-question candidates with their rulings |
| [2](overview/02-execution-2026-11-03.md) | The execution of 2026-11-03: items 1, 3–6, 8–10, 12–16 and P1–P4, pack `7ad30102af5b/iteration-2`, the critique |
| [3](overview/03-execution-2026-11-05.md) | The execution of 2026-11-05: items 2 and 11 after OQ-537, OQ-539 and OQ-540, pack `a10ad853566d/iteration-3`, the critique |
| [4](overview/04-audit-2026-11-10.md) | The audit of 2026-11-10 ([R-097](../../product/requests.md#r-097)): one item, the page frame the titled primary views share |
| [5](overview/05-brief-2026-11-11.md) | The brief of 2026-11-11 for the two delegation cards ([R-098](../../product/requests.md#r-098), [`PD-MONITOR-009`](../../product/directives/pd-monitor-009.md#pd-monitor-009)): the graph with its run controls and the agent activity table, the Mission view's until [`PD-SHELL-015`](../../product/directives/pd-shell-015.md#pd-shell-015) |

**Where each item stands.** Items 1, 3, 8, 12, 14 `verified-resolved` (iteration 2); 2 and 11 `verified-resolved` (iteration 3); 4, 5, 6, 9, 10, 13, 15, 16 and P1–P4 `implemented` (iteration 2, drive captures); 7 proposed, waits on `build-ui`; 17 waits on its harness note (`UNREACHED` 0 in iterations 2 and 3).
