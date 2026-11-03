# 13. States, feedback and time

The states matrix, feedback timing thresholds, acknowledgement against notice, progress, optimistic interaction and undo windows.

**Review date:** 2026-11-02
**Status:** guidance — informs craft within `docs/design/README.md` §1 and structure within §2; overrides nothing.

Guide 13 of 14 of [the design research corpus](README.md), which indexes every guide and fixes the template below.

## 1. Purpose and scope

The question: which states each region has and how each says what it is; how long a wait may run before it owes which feedback; and through which channel — acknowledgement, notice, transcript row, dialog, status strip — an outcome reaches the operator. The answer is the states matrix of `design-ui` brief step 4, scored by rubric F2 and C9.

It decides no surface, view, tab or label (`REQ-SHELL-023`; design README §2) and reopens none of the feedback surfaces' constants (`REQ-SHELL-112`–`REQ-SHELL-118`, `REQ-NOTIFY-011`–`REQ-NOTIFY-043`); arguments with them are section 8's. A toast, which this product calls an acknowledgement, and an inline banner, which it calls a notice, take the glossary's words from here on.

## 2. Principles

**Every region has states, and the transitions are designed.** "The five screen states and the seamless transitions between them" — ideal, empty, error, partial, loading — are the design [36]. Empty splits into first use, user-cleared and no results [36]; a filtered empty has its own copy and replaces a table's rows [38]. Between empty and error sits data that exists but cannot be shown, which names its cause and the way out [37]. An empty state reports emptiness only [38]; shown for content that failed to load it implies loss [19], and shown during a load it makes loading, failure and empty indistinguishable [20]. Each operation runs initiated, in progress, completed, failed, and a failure owes a next step [5]. An agent's steps are states too, waiting for approval among them [22].

**Time sets the feedback owed.** About 0.1 s feels instant, 1 s keeps the train of thought, 10 s is the limit of attention; past it a wait owes percent done, an expected finish and an interrupt, and the person may need to reorient on return [1]. Under 1 s show nothing, because a flash feels slower; 1–3 s indeterminate; 3–10 s determinate; past 10 s the work moves to the background [5]. A spinner for variable work appears only after a delay [6]; with no known total, name each unit as it is done [1].

**The form of progress is a promise.** An indeterminate ring says the wait blocks, a bar that work goes on around it [7]. Progress sits inline beside its content as one combined estimate [4], and only moves forward; a level that rises and falls is a meter and looks distinct [44]. Late pauses make a bar feel slower [23]. A static "Loading…" cannot reveal a hang: name the work and count it [3]. Skeletons belong to tables, cards and lists on first load, never to dialogs or acknowledgements [39]; a frame-only one reads as broken [2].

**A press is answered at once, and honestly.** A warning not to click twice is a symptom; show that the first press was accepted [3]. An optimistic value reverts on failure but is not a pending signal, so in-flight is marked separately [18]; optimism hides latency without removing it, and a failure exposes it [42].

**Event against condition chooses the channel.** A transient message reports a single event; an ongoing condition belongs in a strip that lasts as long as it does [15]. Inline messages persist until resolved [8], one with an action stays until acted on [9], errors never auto-dismiss [10], and a required action is never transient [12]. Transient and persistent messages never share a stack [10]; one notice and one dialog at a time [8]. A message on a timer is a time limit, acceptable only where its information remains available elsewhere [31]; one floor is 5 s, pausing on hover and focus [11]. A persistent strip takes layout space, may stay until resolved and must not flap [14]. An outcome the person may walk away from needs a channel that survives it, and a dialog's error shows inside it while it stays open [13].

**Interruptions cost minutes, and frequency spends attention.** Interrupting at a coarse task boundary cut annoyance by 56 % against the worst moment [26]. After an email alert a diversion averaged over nine minutes and resumption about sixteen, and a suspended task left visible was resumed sooner [27]. Frequent warnings lose attention, skilled users most [28]; under habituation, briefly inhibiting the default answer made informed choices two to three times likelier [29]. With a coding assistant, verifying took 22.4 % of session time against 4.2 % waiting [35]: review states matter more than loading states.

**Reversal beats warning.** Confirmations habituate; undo protects better [16]. A confirmation earns itself only for serious or irreversible actions, restates what happens to which item, labels buttons by outcome and has no default [17]. Deleting stored data must be reversible, checked or confirmed, reversible first [34]. Developers backtrack about ten times an hour, 9.5 % of it selective, which linear undo cannot do [41].

**Live readouts change quietly.** Peripheral status should not churn [43]. A time estimate updates at least every 5 s, does not bounce and carries no false precision — at hours, no seconds [44]. The more often an effect occurs, the subtler it must be [45]. A value swapped in place is not motion; a tweened counter is [46]. A timer is silent to assistive technology and announces a threshold once [47]. Auto-updating content offers pause or an update-frequency control [33]. Status messages take a role — status, alert only for urgent ones, log for sequences [30] — in a region mounted while empty [5]; changing an open notice's severity raises no new announcement [14].

## 3. Patterns and anti-patterns

Anti-patterns unless marked *(pattern)*; for a pattern the tell is what its absence looks like.

| Pattern | When | Tell | Counter-move |
|---|---|---|---|
| Empty while loading | first load | `EmptyState` before data | loading cell first (`REQ-NOTIFY-006`) [20] |
| Empty for failed content | a read fails | grid motif over a failure | `Notice` naming what is missing (`REQ-SHELL-116`); motif for empty only (§1.10) [19][37] |
| One empty, three causes | Library, palette, board | first use and filter share copy | three cells; filtered names its filter [36][38] |
| Flash spinner | commands under 1 s | `Spinner` blinks | nothing under 1 s; delayed `Spinner` [5][6] |
| Bare "Loading…" | waits over 2 s | a word, no count | name and count in `--rt-font-mono` (§1.4, §1.11) [3] |
| Progress that backs up | `MeterBar` as progress | fill drops per step | monotonic; `ContextRing` is a meter [44] |
| Double press | approve, send | a second instance | visible in 100 ms (`REQ-SHELL-150`); repeat starts nothing (`REQ-NOTIFY-007`) [3] |
| Silent optimism | board move, `ToggleSwitch` | rejection unseen | pending mark; visible revert and a notice [18][42] |
| Action on a timer | acknowledgement with a command | action withdraws unseen | a notice action (`REQ-NOTIFY-003`, `-039`); D13-3 [9][12] |
| Habituated approval | requests in a row | approved unread | Deny focused, no default (`REQ-TOOLS-063`); detail in mono [28][29] |
| Busy periphery | status strip, run timing | tint per update | swap in place; a threshold earns `--rt-warn` (§1.3, §1.8) [43][45][46] |
| *(pattern)* Absolute progress | a run | a lone `Spinner` | rows, group counts, tool row status (`REQ-MONITOR-105`) [1][22] |
| *(pattern)* Outcome survives leaving | run ends elsewhere | result only in the transcript | `StatusDot` `--rt-done` in strip and tree; a notice for failure [13][27] |

## 4. Method

Per region, before the first capture.

1. **Draw the matrix.** Rows are regions; cells are ideal, the three empties and filtered, cannot-show, loading, streaming or partial, error, success, disabled, permission-needed (rubric F2) [36][37]. Each names its requirement (`REQ-NOTIFY-001`, `-006`, `-010`) and component; one with neither is an open question.
2. **Time each operation.** Place it in a band, say whether it blocks [1][7], and choose nothing, a delayed `Spinner`, a mono count, a determinate `MeterBar` or reporting into the status strip [3][5][6].
3. **Answer the press.** Effect within 100 ms (`REQ-SHELL-150`); a repeat starts nothing (`REQ-NOTIFY-007`); a disabled control names why (`REQ-NOTIFY-008`); an optimistic value has a pending mark and a visible revert [18][42].
4. **Choose the channel.** Event or condition [15]; a failure, refusal or recovery action is also a notice (`REQ-NOTIFY-003`); a required answer is a dialog or the question stepper [12]; an outcome the operator may walk away from reaches the strip or a notice [13].
5. **Price each interruption.** Count what a run raises and which block it [27]; non-blocking ones take no focus (`REQ-NOTIFY-015`); modals come one at a time, queue counted [8].
6. **Prefer reversal.** Irreversible: `ConfirmDialog` naming what is lost (`REQ-NOTIFY-009`) [17]; restorable: D13-7. An agent's file changes reverse per change in the Git view [41].
7. **Quiet the readouts.** State each live figure's rate, precision and whether it is progress or a meter [43][44]; swap, never tween [46].
8. **Wire the announcements.** Acknowledgement `status`, error notice `alert`, transcript `log` [30]; regions mounted first [5]; an escalation re-announced [14]; timers silent [47].
9. **Design the return.** After a long wait, the final row and lifecycle label read at a glance [1][27].
10. **Evidence each cell.** `pnpm app:drive` `waitFor` its condition, never a sleep; a PNG per cell at 1400×900 and 1000×680; the box bounded, not only the child [50].

## 5. Worked example

**Surface:** "Approval card" (§7); mockup `WORKSPACE` → the `approvalOn` block; nearest built code `packages/ui/src/ApprovalDialog.tsx`; gap G2; raised over the Workspace primary view.

1. **Matrix.** Six cells: alone; with a queue (`{n} other requests waiting.`); in flight (`busy`, buttons disabled); undeliverable (a `role="status"` line); answered elsewhere (closes); timed out while queued (never shown, `REQ-TOOLS-054`). No empty cell (`REQ-TOOLS-063`). The waiting cell outside it is the approval prompt row's `--rt-wait` rail (§7.2 item 2) [48].
2. **Time.** A press is a 0.1 s gesture (`REQ-SHELL-150`); `busy` disables at once, the guard `REQ-NOTIFY-007` asks [3]. Delivery is normally under 1 s, so nothing more is drawn [5]; past that, three disabled buttons say nothing — check against `REQ-NOTIFY-008`.
3. **Channel.** A required answer, so a dialog, never an acknowledgement [12]; never stacked, queue counted [8]; an undeliverable answer stays at the dialog's status line [13]. Afterwards the outcome is a transcript fact: Deny makes the tool row `blocked`, refused before it ran (`REQ-MONITOR-105`).
4. **Interruption.** Each presentation costs minutes of resumption [27] and cannot wait for a breakpoint [26]. Focus on Deny and an inert Enter guard a stray keystroke (`REQ-TOOLS-063`); "Approve for this session" thins the repeats that habituate [28]; the mono detail box is the field that changes between requests [29], so check it ranks second only to the headline (C1).
5. **Return and announcement.** The marked waiting row shortens the return [27]. The undeliverable line is a status message [30]; the queue line is plain text, unannounced when its count changes [5]. The count is a number, so check its computed face is `--rt-font-mono` (§1.4).
6. **Evidence.** A scripted run asking two approvals; `waitFor` each cell; capture it at 1400×900 and 1000×680, the dialog at its 560×380 minimum (G2).

## 6. Checks

From the `pnpm ui-review` pack or the DOM; rubric ids mark what the rubric carries, the rest are proposed.

- **F2** — a PNG per matrix cell; each empty cell has a why-sentence and a control in the accessible tree (`REQ-NOTIFY-006`); no `EmptyState` while a load is pending [20][36].
- **F2, proposed** — a filtered empty names its filter; a cannot-show cell names its cause and a notice action [37][38].
- **F2, proposed** — sampled at 0, 500 and 1000 ms after a command finishing under 1 s, no `.spinner` was attached [5][6].
- **F2, proposed** — a wait over 2 s names its work; a counted one reads `n of m` in mono [3].
- **F2, proposed** — a gesture's effect lands within 100 ms (`REQ-SHELL-150`); a repeat starts nothing; a disabled control names why [3][25].
- **F2, proposed** — a forced rejection of an optimistic change restores the confirmed value with a notice; a progress `MeterBar` never decreases [18][42][44].
- **F4** — states read in `REQ-NOTIFY-048`'s vocabulary and `REQ-CHAT-008`'s labels; no bare "Loading…" [3].
- **C6** — notice severity is border, left rule and glyph, never a fill (`REQ-NOTIFY-035`) [10].
- **C9** — `document.getAnimations()` lists only `rt-pulse` and the spinner; no number tweens, no skeleton shimmers [45][46].
- **C9, proposed** — text mutations per second on the strip's token item during streaming are reported, no limit until D13-12 is ruled [43].
- **F3** — no acknowledgement takes focus (`REQ-NOTIFY-015`); the approval dialog opens on Deny [28].
- **F3, proposed** — acknowledgement `status`, error notice `alert`, transcript `log`; `.notice-slot` present while empty; a notice escalated in place (`REQ-SHELL-118`'s failed download) announced again; timer ticks unannounced [30][5][14][47].
- **Proposed, channel** — every acknowledged failure, refusal or recovery action has its notice (`REQ-NOTIFY-003`); no notice leaves on a timer (`REQ-NOTIFY-040`) [9][10].

## 7. How this applies here

**Requirements.** `REQ-SHELL-023`; `REQ-SHELL-036`, `REQ-SHELL-038`, `REQ-SHELL-047`; `REQ-SHELL-112`–`REQ-SHELL-118`; `REQ-SHELL-135`, `REQ-SHELL-137`, `REQ-SHELL-149`, `REQ-SHELL-150`; `REQ-NOTIFY-001`, `-003`, `-006`–`-011`, `-013`–`-024`, `-034`–`-044`, `-048`, `-258`, `-268`; `REQ-CHAT-008`, `REQ-CHAT-046`, `REQ-CHAT-060`, `REQ-CHAT-158`, `REQ-CHAT-164` (a stall stated at 10 s); `REQ-MONITOR-105`; `REQ-TOOLS-054`, `REQ-TOOLS-063`.

**Directives.** `PD-WORKSPACE-001` (an acknowledgement's action), `PD-CHAT-006` (no live-row animation), `PD-CHAT-008` (the run timer), `PD-SHELL-005` (the download notice), `PD-STARTUP-010` (the preparation warning).

**Tokens.** `--rt-wait`, `--rt-run`, `--rt-done`, `--rt-fail`, `--rt-warn`, `--rt-info-500`, `--rt-danger-500`, `--rt-focus`, `--rt-font-mono`, `--rt-duration`, `--rt-grid-unit`.

**Components.** `Spinner`, `StatusDot`, `Tag`, `MeterBar`, `ContextRing`, `Acknowledgement`, `AcknowledgementStack` (exported by `design-system/feedback.tsx`, not in the inventory), `EmptyState`, `ConfirmDialog`, `Table`, `TableCard`; built `Notice.tsx`, `Acknowledgements.tsx`, `ApprovalDialog.tsx`, `RunHeader.tsx`; gaps G1, G2, G7, G10, G12, G14. §4.1 says `Spinner` needs the name "Working" (`REQ-SHELL-137`); `design-system/feedback.tsx` still defaults to `Loading`.

**The record's lessons**, as experience: "the tokens hold but composition breaks" and the earned surfaces that repaired it, the approval row's rail among them [48]; UIR-001..012 [49]; "bound the box, not only the child", which a loading or empty cell obeys too [50]; a warning replaced within a second by the single notice slot [51].

| Derivative | Reads |
|---|---|
| `design-ui` brief §4 (states) | §2, §3, §4 steps 1–4 |
| `design-ui` brief §7 | §4 step 8 |
| `design-ui` brief §10 | §8 |
| `design-ui` brief §11 | §4 step 10 |
| `design-ui` audit step 2, capturing what the pack lacks | §4 step 1 (the matrix's columns, without a brief), §4 step 10 |
| rubric F2 | §2, §4 step 1 (the matrix's columns, without a brief), §6 |
| rubric C9 | §2, §6 |

No dated notes yet.

## 8. Where this disagrees with the adopted material

**D13-1 —** *Claim:* a design system avoids transient acknowledgements for accessibility, pending repairs, so perhaps provisionally [13]. *Adopted:* `REQ-SHELL-112`, `REQ-SHELL-113`, one acknowledgement surface. *Question:* should every event an acknowledgement reports also have an inline home in its view? — [OQ-498](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-498)

**D13-2 —** *Claim:* a timed message stays at least 5 s and pauses on hover and focus [11]; a time limit is adjustable unless its information is elsewhere [31]. *Adopted:* `REQ-NOTIFY-011`, 4200 ms everywhere; `REQ-NOTIFY-003`, other events need no other record. *Question:* should the lifetime meet a 5 s floor or pause, and which acknowledged events lack a persistent record under SC 2.2.1? — [OQ-498](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-498)

**D13-3 —** *Claim:* a message with an action stays until acted on [9]; a necessary action is never transient [12]; the timed region is a keyboard landmark [11]. *Adopted:* `PD-WORKSPACE-001`, one action, ignorable "until it withdraws", taking no focus; `REQ-NOTIFY-015`. *Question:* how does a keyboard-only operator reach "Start a new session" in time, and can the offer be found after? — [OQ-498](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-498)

**D13-4 —** *Claim:* a long background process's completion persists until dismissed, with times and a summary [21]. *Adopted:* the specified dialog set; `REQ-NOTIFY-003`, a success may be transient. *Question:* where does a long run's completion summary persist for an operator who was away? — [OQ-506](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-506)

**D13-5 —** *Claim:* a wait past 10 s owes progress and an interrupt [1], moves to the background [5] and sits inline [4]; an indeterminate ring blocks [7]. *Adopted:* `REQ-SHELL-117`, an indeterminate, window-modal, non-cancellable dialog shown at once (G12). *Question:* for a merge or checkpoint past 10 s, is the operator owed how far it has got? — [OQ-529](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-529)

**D13-6 —** *Claim:* accelerating late progress [23] or animating a bar's fill, by about 11–12 % [24], shortens the felt wait. *Adopted:* §1.11, exact numbers; `REQ-NOTIFY-043`, no estimated bar; §1.8, two infinite animations. *Question:* should the record state that both are declined for `MeterBar`, and at what cost? — none filed; already-ruled: §1.8, §1.11

**D13-7 —** *Claim:* confirmations habituate and undo protects better [16]; reversible comes first for deleting stored data [34]. *Adopted:* `REQ-NOTIFY-009`, a destructive action is confirmed by a dialog. *Question:* may a deletion the store can restore be offered an undo instead of `ConfirmDialog`? — [OQ-533](../../architecture/open-questions/71-spikes-and-later-questions-38.md#oq-533)

**D13-8 —** *Claim:* pulsing that starts itself and runs past 5 s beside other content needs a pause, stop or hide unless essential [33]. *Adopted:* §1.8, the 1.6 s pulse while a state runs; `REQ-SHELL-135`. *Question:* does the in-app reduced-motion setting stop the pulse and the spinner, and is it SC 2.2.2's mechanism? — [OQ-497](../../architecture/open-questions/69-spikes-and-later-questions-36.md#oq-497)

**D13-9 —** *Claim:* no false precision — at hours, minutes but not seconds [44]; peripheral status should not churn [43]. *Adopted:* §1.11; `REQ-CHAT-158`, `H:MM:SS` advancing at least once a second; `PD-CHAT-008`. *Question:* past an hour, does the run header's seconds digit inform, or only move? — [OQ-511](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-511)

**D13-10 —** *Claim:* each empty subtype gets a tone and an optional illustration, celebratory for cleared work [40]. *Adopted:* §1.11, no filler; §1.10, the grid motif only; §1.7, no decorative illustration. *Question:* may a user-cleared cell acknowledge finished work in words alone, and in which? — [OQ-515](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-515)

**D13-11 —** *Claim:* a persistent strip must not flap [14]; non-urgent interruptions wait for a boundary [26] and are postponable [32]. *Adopted:* `REQ-NOTIFY-024`, the newest publication current at once, one slot; `PD-STARTUP-010` [51]. *Question:* may a non-emergency notice be debounced or held, given `REQ-NOTIFY-268` records before rendering? — [OQ-511](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-511)

**D13-12 —** *Claim:* status figures change at a bounded rate [43]; auto-updating content offers an update-frequency control [33]. *Adopted:* `REQ-SHELL-150`, pending changes repainted at least every 120 ms. *Question:* does that floor bind the strip's token and cost figures, or may they be sampled at a stated slower rate? — [OQ-511](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-511)

**D13-13 —** *Claim:* agent steps include queued and waiting for approval, apart from running [22]. *Adopted:* `REQ-MONITOR-105`, `REQ-CHAT-060`, tool row status closed to `running`, `ok`, `failed`, `blocked`. *Question:* how does a tool row awaiting approval read distinct from one executing, within that set? — [OQ-520](../../architecture/open-questions/70-spikes-and-later-questions-37.md#oq-520)

## 9. References and further reading

[1] [NN/g (Jakob Nielsen), Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) — three limits; absolute progress; retrieved 2026-11-01
[2] [NN/g (Samhita Tankala), Skeleton Screens 101](https://www.nngroup.com/articles/skeleton-screens/) — frame-only skeletons; retrieved 2026-11-01
[3] [NN/g (Katie Sherwin), Progress Indicators Make a Slow System Less Insufferable](https://www.nngroup.com/articles/progress-indicators/) — counts; double clicks; retrieved 2026-11-01
[4] [GNOME HIG, Progress Bars](https://developer.gnome.org/hig/patterns/feedback/progress-bars.html) — inline; combined; retrieved 2026-11-01
[5] [GitHub Primer, Loading](https://primer.style/product/ui-patterns/loading/) — bands; lifecycle; live regions; retrieved 2026-11-01
[6] [GNOME HIG, Spinners](https://developer.gnome.org/hig/patterns/feedback/spinners.html) — delayed spinner; retrieved 2026-11-01
[7] [Microsoft Learn, Guidelines for progress controls](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/progress-controls) — ring blocks; retrieved 2026-11-01
[8] [IBM Carbon, Notifications pattern](https://carbondesignsystem.com/patterns/notification-pattern/) — persistence; one at a time; retrieved 2026-11-01
[9] [IBM Carbon, Notification: usage](https://carbondesignsystem.com/components/notification/usage/) — actions persist; retrieved 2026-11-01
[10] [Atlassian, Flag: usage](https://atlassian.design/components/flag/usage) — errors stay; no mixed stack; retrieved 2026-11-01
[11] [Adobe React Aria, Toast](https://react-aria.adobe.com/Toast) — 5 s floor; landmark; retrieved 2026-11-01
[12] [Microsoft Fluent 2, Toast: usage](https://fluent2.microsoft.design/components/web/react/core/toast/usage) — no required actions; retrieved 2026-11-01
[13] [GitHub Primer, Notification messaging](https://primer.style/product/ui-patterns/notification-messaging/) — no toasts; in-place outcome; dialog errors; retrieved 2026-11-01
[14] [Microsoft Learn, InfoBar](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/infobar) — inline; flapping; re-announce; retrieved 2026-11-01
[15] [GNOME HIG, Toasts](https://developer.gnome.org/hig/patterns/feedback/toasts.html) — event against condition; retrieved 2026-11-01
[16] [A List Apart (Aza Raskin), Never Use a Warning When you Mean Undo](https://alistapart.com/article/neveruseawarning/) — habituation; undo; retrieved 2026-11-01
[17] [NN/g (Jakob Nielsen), Confirmation Dialogs Can Prevent User Errors (If Not Overused)](https://www.nngroup.com/articles/confirmation-dialog/) — when to confirm; retrieved 2026-11-01
[18] [React (Meta), useOptimistic](https://react.dev/reference/react/useOptimistic) — revert; pending apart; retrieved 2026-11-01
[19] [GitHub Primer, Degraded experiences](https://primer.style/product/ui-patterns/degraded-experiences/) — no false empties; retrieved 2026-11-01
[20] [NN/g (Kate Kaplan), Designing Empty States in Complex Applications: 3 Guidelines](https://www.nngroup.com/articles/empty-state-interface-design/) — empty during load; retrieved 2026-11-01
[21] [NN/g (Kate Kaplan), Designing for Long Waits and Interruptions](https://www.nngroup.com/articles/designing-for-waits-and-interruptions/) — completion summary; retrieved 2026-11-01
[22] [Shape of AI (Emily Campbell), Stream of Thought](https://www.shapeof.ai/patterns/stream-of-thought) — step states; retrieved 2026-11-01
[23] [Harrison et al., Rethinking the Progress Bar (UIST 2007)](https://www.chrisharrison.net/projects/progressbars/ProgBarHarrison.pdf) — pauses; acceleration; retrieved 2026-11-01
[24] [Harrison et al., Faster Progress Bars (CHI 2010)](https://www.chrisharrison.net/projects/progressbars2/ProgressBarsHarrison.pdf) — animated fills; retrieved 2026-11-01
[25] [Kohavi et al., Online Controlled Experiments at Large Scale (KDD 2013)](https://exp-platform.com/Documents/2013%20controlledExperimentsAtScale.pdf) — 100 ms measurable; retrieved 2026-11-01
[26] [Adamczyk and Bailey, If Not Now, When? (CHI 2004)](https://interruptions.net/literature/Adamczyk-CHI04-p271-adamczyk.pdf) — timing of interruption; retrieved 2026-11-01
[27] [Iqbal and Horvitz, Disruption and Recovery of Computing Tasks (CHI 2007)](https://erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf) — resumption; visible cues; retrieved 2026-11-01
[28] [Akhawe and Felt, Alice in Warningland (USENIX Security 2013)](https://www.usenix.org/system/files/conference/usenixsecurity13/sec13-paper_akhawe.pdf) — warning frequency; retrieved 2026-11-01
[29] [Bravo-Lillo et al., Your Attention Please (SOUPS 2013)](https://cups.cs.cmu.edu/soups/2013/proceedings/a6_Bravo-Lillo.pdf) — inhibitive attractors; retrieved 2026-11-01
[30] [W3C WAI, Understanding SC 4.1.3: Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) — roles; retrieved 2026-11-01
[31] [W3C WAI, Understanding SC 2.2.1: Timing Adjustable](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) — toast as time limit; retrieved 2026-11-01
[32] [W3C WAI, Understanding SC 2.2.4: Interruptions](https://www.w3.org/WAI/WCAG22/Understanding/interruptions.html) — postponable; retrieved 2026-11-01
[33] [W3C WAI, Understanding SC 2.2.2: Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) — five seconds; auto-updating; retrieved 2026-11-01
[34] [W3C WAI, Understanding SC 3.3.4: Error Prevention (Legal, Financial, Data)](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html) — reversible first; retrieved 2026-11-01
[35] [Mozannar et al., Reading Between the Lines (CHI 2024)](https://arxiv.org/pdf/2210.14306) — verifying against waiting; retrieved 2026-11-01
[36] [Scott Hurff, How to fix a bad user interface](https://www.scotthurff.com/posts/why-your-user-interface-is-awkward-youre-ignoring-the-ui-stack/) — five states; three empties; retrieved 2026-11-01
[37] [IBM Carbon, Empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/) — cannot-show data; retrieved 2026-11-01
[38] [Shopify (Polaris, App Home), Empty state](https://shopify.dev/docs/api/app-home/patterns/compositions/empty-state) — filtered; in-table; retrieved 2026-11-01
[39] [IBM Carbon, Loading](https://carbondesignsystem.com/patterns/loading-pattern/) — where skeletons go; retrieved 2026-11-01
[40] [Atlassian, Empty state - Usage](https://atlassian.design/components/empty-state/usage) — tone by subtype; retrieved 2026-11-01
[41] [Yoon and Myers, Supporting Selective Undo in a Code Editor (ICSE 2015)](http://www.cs.cmu.edu/~NatProg/papers/ICSE15-Azurite-v12-CameraReady.pdf) — backtracking; retrieved 2026-11-01
[42] [Kleppmann et al., Local-First Software (Onward! 2019)](https://martin.kleppmann.com/papers/local-first.pdf) — optimism's failures; retrieved 2026-11-01
[43] [Microsoft Learn, Status Bars (Design basics) - Win32 apps](https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-status-bars) — peripheral change; retrieved 2026-11-01
[44] [Microsoft Learn, Progress Bars - Win32 apps](https://learn.microsoft.com/en-us/windows/win32/uxguide/progress-bars) — precision; monotonic; meters; retrieved 2026-11-01
[45] [Microsoft Learn, Animations and Transitions - Win32 apps](https://learn.microsoft.com/en-us/windows/win32/uxguide/vis-animations) — subtlety by frequency; retrieved 2026-11-01
[46] [W3C WAI, Understanding SC 2.3.3: Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) — swap is not motion; retrieved 2026-11-01
[47] [MDN Web Docs, ARIA: timer role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/timer_role) — silent timer; retrieved 2026-11-01
[48] [Rotaris record, design README §7.1–7.4](../../design/README/07-7-fidelity-consult-before-maintain-after.md) — composition; earned surfaces; retrieved 2026-11-02
[49] [Rotaris record, all twelve critic findings repaired](../../architecture/codebase/17-all-twelve-critic-findings-repaired-and.md) — UIR-001..012; retrieved 2026-11-02
[50] [Rotaris record, build-ui step 8](../../../.agents/skills/build-ui/SKILL.md) — bound the box; retrieved 2026-11-02
[51] [Rotaris record, PD-STARTUP-010](../../product/directives/pd-startup-010.md) — a warning replaced within a second; retrieved 2026-11-02
