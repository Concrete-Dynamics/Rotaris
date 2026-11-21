[Product directives](../directives.md) › PD-SHELL-018

<a id="pd-shell-018"></a>

### PD-SHELL-018 — the title bar carries the update's progress and its ready state; the banner can open a release page

**The indicator.** While an update download of REQ-STARTUP-169 runs, and while a verified pending update waits
(REQ-STARTUP-174), the title bar SHALL carry an update indicator after the improvement-analysis indicator of REQ-SHELL-037
and before the window controls of [`PD-SHELL-003`](pd-shell-003.md#pd-shell-003). Downloading, it conveys the version and the
measured progress of REQ-STARTUP-118 and offers the cancel of REQ-STARTUP-170; ready, it conveys that the version is ready
and offers `Restart now` with REQ-STARTUP-174's guards. It is present whether or not the update notice holds the banner, so
the progress, the cancel and the restart stay reachable while another notice holds REQ-SHELL-114's single slot (UD-10 of
[`PD-STARTUP-008`](pd-startup-008.md#pd-startup-008)). It is absent at every other time. It takes no focus on its own, opens
nothing on its own, and carries an accessible name and a description stating the state, on REQ-SHELL-058's terms. Its drawing
is the design language's; its wording is left to the implementation.

**The actions.** REQ-SHELL-115's closed list gains, beside [`PD-SHELL-005`](pd-shell-005.md#pd-shell-005)'s cancel: **open
the page of an available release** ([`PD-STARTUP-014`](pd-startup-014.md#pd-startup-014)), and no other.

**The acknowledgement.** The first main window of an updated version shows REQ-SHELL-112's transient notification conveying
the version it now runs (UD-7), once.

**Why, and what it costs.** The owner, 2026-11-21 ([R-117](../requests.md#r-117)), chose a title-bar indicator over a
line in About & Legal when asked where progress lives while the banner is taken. What it costs: one more item in a fixed
strip whose 1000 px minimum is already measured (REQ-SHELL-065), so the indicator elides to an icon before anything else in
the bar is clipped; and one more member of a closed action list.

**Recorded, not built.** The first execution is owed to the plan's Stage 2 (the indicator) and Stage 3 (the action).

> **Extends:** REQ-SHELL-033
> **Narrows:** REQ-SHELL-115

Its case on REQ-SHELL-115 is the one action it adds, opening an available release's page, and is disjoint from the cases of
the two directives that already narrow that list: [`PD-SHELL-005`](pd-shell-005.md#pd-shell-005) (the cancel of a running
update download) and [`PD-SHELL-015`](pd-shell-015.md#pd-shell-015) (the count and names of the primary views). Its case on
REQ-SHELL-033 is the one indicator it adds, disjoint from [`PD-SHELL-003`](pd-shell-003.md#pd-shell-003)'s window controls.

*Decided by the owner, 2026-11-21, [R-117](../requests.md#r-117); worded by the model (`claude-opus-5-5`).*
