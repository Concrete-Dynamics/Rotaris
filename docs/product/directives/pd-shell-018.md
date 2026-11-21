[Product directives](../directives.md) › PD-SHELL-018

<a id="pd-shell-018"></a>

### PD-SHELL-018 — the title bar carries the update's progress and its ready state; the banner can open a release page

*Revision 2 (2026-11-21, [R-072](../requests.md#r-072), the ruling of [OQ-556](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-556)) — **REQ-NOTIFY-044 joins the
Narrows list** for the one action this directive already adds, which that requirement states from the notice's side. The
owner's decision and its words are unchanged; the paragraph that states the disjoint cases gains REQ-NOTIFY-044.*

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
*Revision 2:* REQ-NOTIFY-044's vocabulary, the same list seen from the notice, gains the same member and no other; it
carries no parameter, main holding the page with the offer and checking it as PD-STARTUP-014 states, so no address
crosses from a renderer.

**The acknowledgement.** The first main window of an updated version shows REQ-SHELL-112's transient notification conveying
the version it now runs (UD-7), once.

**Why, and what it costs.** The owner, 2026-11-21 ([R-117](../requests.md#r-117)), chose a title-bar indicator over a
line in About & Legal when asked where progress lives while the banner is taken. What it costs: one more item in a fixed
strip whose 1000 px minimum is already measured (REQ-SHELL-065), so the indicator elides to an icon before anything else in
the bar is clipped; and one more member of a closed action list.

**Recorded, not built.** The first execution is owed to the plan's Stage 2 (the indicator) and Stage 3 (the action).

**Built in part, 2026-11-21 (R-117, the plan's Stage 2): the indicator and the acknowledgement; first executed.** The
indicator is `packages/ui/src/UpdateIndicator.tsx`, drawn after the improvement-analysis indicator and before Sessions, fed by
channel 17 (`update:state`) and the `update.state` read; its action is the notice's own member (`cancel-update`, `restart`).
The acknowledgement is UD-7's `Updated to Rotaris {version}`, raised by the first check of a launch that finds its pending
update applied. Executed over fakes (`updater.background.test.ts`, `update-indicator.test.ts`) and in the built application
on the Linux agent host through the driver's verification-only face seam (`updater/face-seam.ts`): present downloading and
ready, absent at rest, standing while another notice holds the banner and after a Dismiss; `.title-bar` never overflowed at
1400, 1180, 1080 and 1000 px. **Found, and repaired before landing** (the `review-ui` critic, iteration 1): the action was one
control relabelled from `Cancel` to `Restart now` under the focus and the pointer, so a press aimed at cancelling could restart
— it is now keyed by its member, in the indicator and on the banner; focus fell to `body` when the indicator left after a
cancel — it now moves to Sessions, else the first window control, measured. **A reading, not ruled:** the chip's "floor" of
the give-way is `…/<last segment>` of the full path; at 1000×680 with no improvement indicator the full form stands, and it
steps to the label-less and icon forms only when the chip would go below that floor (measured with stand-ins for the busiest
state). **Not executed:** the open-release-page action (Stage 3), a screen reader's announcements, a released artifact.

> **Extends:** REQ-SHELL-033
> **Narrows:** REQ-SHELL-115, REQ-NOTIFY-044

Its case on REQ-SHELL-115 is the one action it adds, opening an available release's page, and is disjoint from the cases of
the two directives that already narrow that list: [`PD-SHELL-005`](pd-shell-005.md#pd-shell-005) (the cancel of a running
update download) and [`PD-SHELL-015`](pd-shell-015.md#pd-shell-015) (the count and names of the primary views). Its case on
REQ-SHELL-033 is the one indicator it adds, disjoint from [`PD-SHELL-003`](pd-shell-003.md#pd-shell-003)'s window controls. *Revision 2:* its case on REQ-NOTIFY-044 is the
same one action, disjoint from [`PD-STARTUP-008`](pd-startup-008.md#pd-startup-008)'s case there (item 10, the cancel of
a running update download); [`PD-SHELL-001`](pd-shell-001.md#pd-shell-001) extends that requirement and displaces nothing.

*Decided by the owner, 2026-11-21, [R-117](../requests.md#r-117); worded by the model (`claude-opus-5-5`).*

*Revision 2 raised by the consortium under the owner's delegation, 2026-11-21; logged as [R-072](../requests.md#r-072), the
ruling of [OQ-556](../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-6.md#oq-556), for [R-117](../requests.md#r-117).*
