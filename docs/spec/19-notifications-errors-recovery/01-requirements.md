# Notifications, Error Handling, and Recovery — A1. Guarantees that bind every requirement below

Part 1 of 7 of [domain 19](../19-notifications-errors-recovery.md), which indexes every part. Defines REQ-NOTIFY-254 – REQ-NOTIFY-032.

## Requirements

### A1. Guarantees that bind every requirement below

**REQ-NOTIFY-254** — No failure is reported by silence. Every refusal carries a reason worded by the layer that determined it, and no record of a terminal unsuccessful outcome in this domain — a run record, a unit failure, a blocked requirement, a hook refusal, a checkpoint refusal — can be stored without one.

**REQ-NOTIFY-255** — Where this domain asks whether something is still running — a session's process, the flow owning a requirement, the precondition guarding a worktree integration — and the question cannot be answered, the answer taken is that it is running. No automatic path treats an unanswered liveness question as evidence that work has stopped, and a state entered on such an answer is left only through an explicit repair (REQ-NOTIFY-153, REQ-NOTIFY-161).

**REQ-NOTIFY-256** — Inspecting state never changes it. Every repair is requested rather than automatic, yields the same result when requested again, and is announced through at least one of: a notice, a transient acknowledgement, a sentence rendered in the view that requested it, a timeline entry.

**REQ-NOTIFY-257** — Verification results, completion-gate decisions, repair decisions and completion-contract fields are written by the execution runtime alone. Values for any of those fields appearing in model-authored output are discarded before a report is stored.

**REQ-NOTIFY-258** — No state is distinguishable by colour alone. Severity is carried by a border together with a glyph; a boundary holds at least 3:1 contrast against the surface behind it and text at least 4.5:1; transient and persistent surfaces draw from one glyph set; and every notice exposes its severity word in its accessible name.

**REQ-NOTIFY-259** — Each window presents one persistent notice at a time; the most recent publication is the one presented; a starting run clears only unscoped notices and notices scoped to that same session; and a dismissal identified by notice identifier cannot remove a notice published after it.

**REQ-NOTIFY-260** — A failed operation keeps everything it was given. Composer drafts, the failed session, submitted prompts, produced artifacts, worktrees and branches all remain afterwards.

**REQ-NOTIFY-261** — A fact is worded once, by the component holding it, and carried unchanged by every surface reporting it. This binds the missing-quality-gate warning, blocker reasons, checkpoint preview verbs, the awaiting-input sentence, refused board transitions and sandbox launch refusals.

**REQ-NOTIFY-262** — Four orderings are observable. The dismissed update version is recorded before the notice naming it is cleared. Clearing a notice at run start yields the same outcome whichever order the start and completion events arrive in across threads. A post-crash repair makes the corrected status durable before the lock is released. Verification evidence is attached to a report before any outcome is finalised, so a passing exit and a failing exit both carry it.

### A2. What every workflow makes visible

**REQ-NOTIFY-001** — Six conditions are distinguishable on screen for every workflow a user can start, each visible as soon as it holds and without the user opening, expanding or querying anything: offered but not yet run, including any first-run setup it still needs; executing; finished with a result; finished with nothing to show; failed with one concrete next step named; failed with no next step available, carrying technical detail the user can select and copy. For any two conditions a workflow can reach, its presentation in one differs from its presentation in the other.

**REQ-NOTIFY-002** — The prerequisites of a workflow — provider, model, workspace, branch, path, session — are checked before it begins expensive work, and each unmet prerequisite is named. No workflow begins work that cannot succeed, and none ends without either a result or a stated failure.

**REQ-NOTIFY-010** — Each primary view — dashboard, git, library, mission, requirements, settings, workspace — carries onboarding for its empty condition, a primary action appropriate to what it holds, progress presentation for its long operations, and disabled-reason text on the controls it disables.

### A3. Regions, controls and confirmations

**REQ-NOTIFY-006** — A card, table, list, pane or tab holding zero items shows, throughout, a sentence naming why it holds nothing and at least one instruction or control that would put something in it. Both parts appear in that region's accessible tree and are announced as ordinary content of it.

**REQ-NOTIFY-007** — Repeating the gesture that began an action already in flight — the same button, the same menu entry, the same keystroke — begins no second instance of it. While the action runs, unrelated controls respond, the window repaints, and move, resize and close are honoured.

**REQ-NOTIFY-008** — A disabled control names the condition that disables it, in adjacent text or in its tooltip, and exposes that same reason to assistive technology.

**REQ-NOTIFY-009** — A destructive action is confirmed by a dialog naming exactly what it will affect. Unsaved settings are held under three explicit choices: save, discard, cancel.

### A4. Choosing a channel

**REQ-NOTIFY-003** — A transient acknowledgement on its own is sufficient reporting only for an event that is none of the following: a failure, a refusal, an outcome carrying a recovery action. Each of those three is additionally published as a persistent notice and so stays readable after the acknowledgement lifetime of REQ-NOTIFY-011 has elapsed. This obligation is discharged at publication: the notice surface holds one notice, and a later publication may replace it under REQ-NOTIFY-024. Retrievability afterwards is carried by the record REQ-NOTIFY-268 requires, not by the notice surface. Any other event may be acknowledged transiently and reported nowhere else.
  > **Extended by [`PD-WORKSPACE-001`](../../product/directives/pd-workspace-001.md#pd-workspace-001), 2026-09-12.** This still
  > governs every other event. The directive's own offer — choosing the project folder a window already has
  > open — carries a recovery action and is nevertheless reported transiently and nowhere else, because what it
  > offers is reachable at any time from the window it appears in and there is nothing for a reader to come back
  > to once it has withdrawn. Nothing else on this clause moves: a failure and a refusal are still published
  > persistently, and that includes every refusal of the flow this offer belongs to.

**REQ-NOTIFY-004** — When an operation fails, the input the user supplied to it — a composed prompt among others — is still present and can be submitted again unchanged.

**REQ-NOTIFY-005** — An error reaches the user in two parts. Its headline is one plain sentence naming what did not work, readable by someone with no knowledge of the internals. Stack traces, provider response payloads and subprocess output appear only in a separate detail area the user can select and copy. An error whose headline is raw diagnostic output does not satisfy this requirement.

### A5. Transient acknowledgements

**REQ-NOTIFY-011** — A transient acknowledgement takes itself off screen 4200 ms after it becomes visible. This requirement is the product's single definition of the acknowledgement lifetime: a document that needs to say how long a transient acknowledgement stays on screen cites this identifier rather than restating the figure. No surface declares a transient lifetime of its own; the only departure from it is the non-expiring case of REQ-NOTIFY-020.

**REQ-NOTIFY-012** — A transient acknowledgement is placed with respect to its host window rather than the screen. It anchors to the bottom-right corner of the host window's content area, keeping a 16 px margin from that window's right edge and a 16 px margin from its bottom edge, clears the title bar, and is drawn over all other content of that window so that nothing covers it. Where the host is narrower than the bounded width of REQ-NOTIFY-013 plus those margins, the width is reduced and the margins are kept. Moving or resizing the window restores the same position relative to the window with no user action. This requirement is the product's single definition of where a transient acknowledgement is placed — the corner it anchors to, the margins it keeps, the fact that it is drawn over all other content of its host, and the narrowing that happens where the host is too narrow: a document that shows acknowledgements cites this identifier rather than restating any of them, contributing only which window is the host. No surface anchors an acknowledgement to a corner of its own.

**REQ-NOTIFY-013** — There is one acknowledgement surface, the stacked one of REQ-NOTIFY-016 through REQ-NOTIFY-022; a lone acknowledgement is that stack holding one member, and no separate single-acknowledgement surface exists. A transient acknowledgement wraps its text within a bounded width: at most 520 px while exactly one is visible, and at most 360 px while two or three are, in each case reduced to the host width less its margins where the host is narrower. A stack growing from one member to two narrows the acknowledgement already standing rather than replacing it or reordering it. This requirement is the product's single definition of the transient acknowledgement surface itself: there is one such surface in the product, its structure and its bounded widths are stated here, and a document that raises a transient acknowledgement cites this identifier rather than declaring a surface, a stack, or a width of its own. A surface that needs different behaviour extends this requirement rather than adding a second acknowledgement surface beside it.
  > **Extended by [`PD-WORKSPACE-001`](../../product/directives/pd-workspace-001.md#pd-workspace-001), 2026-09-12.** Taken up on this
  > requirement's own terms — the sentence above is the instruction the directive followed, and no second
  > acknowledgement surface exists. A transient acknowledgement may now carry **at most one action**, drawn as a
  > control inside the one surface this requirement defines. Its widths, its stack, its lifetime, its focus
  > behaviour and its motion are unchanged, and the action vocabulary of REQ-NOTIFY-044 is untouched: the
  > transient's action is a closed one-member type of its own, so REQ-SHELL-115's list of what a banner action
  > may do stays closed.

**REQ-NOTIFY-014** — A transient acknowledgement has two presentations, neutral and error, told apart by their borders. Both draw a 1 px border on all four sides: the neutral presentation draws it in the surface's ordinary border colour, and the error presentation draws it in the error severity colour and adds a rule down its left edge three times that width in the same colour, matching the persistent-notice treatment of REQ-NOTIFY-035. That left rule is the difference in shape REQ-NOTIFY-258 requires, so the two presentations stay distinguishable where colour is not perceived. Neither fills the acknowledgement's background with a status colour. In every theme offered, the border holds at least 3:1 contrast and the text at least 4.5:1 against the surface behind them. The presentation belongs to the message currently shown: changing theme while an acknowledgement is visible leaves it in the presentation its own message calls for, and an error acknowledgement never repaints as a neutral one.

**REQ-NOTIFY-015** — A transient acknowledgement never takes keyboard focus. One appearing while the user types leaves the caret position and the input focus untouched.

**REQ-NOTIFY-016** — Three acknowledgements are visible at most; publishing a fourth removes the oldest immediately. Stacking is reached whenever an acknowledgement is published while another is still visible, which is an ordinary condition of the product rather than an optional surface.

**REQ-NOTIFY-017** — In a stack, the newest acknowledgement occupies the slot nearest the anchoring corner and earlier ones move away from it: with the bottom-right anchor of REQ-NOTIFY-012 the newest is lowest and earlier ones move upward, separated by an 8 px gap. No existing acknowledgement is reordered or replaced where it stands.

**REQ-NOTIFY-018** — An acknowledgement carries one of four kinds, given here in ascending severity: `info`, `ok`, `warn`, `fail`. The glyph a kind uses is the glyph the corresponding notice severity uses.

**REQ-NOTIFY-019** — An acknowledgement's accessible name conveys its kind word followed by its title, in that order, the kind words being Notice, Done, Warning and Failed. The two are joined so that assistive technology announces them as distinct phrases rather than as one run-on word; the joining text itself is the implementation's and belongs to neither part's own content. Its body text becomes its accessible description. Kind is never signalled by colour alone.

**REQ-NOTIFY-020** — A timeout of zero or less leaves the acknowledgement on screen until something removes it, and the countdown can be restarted. Only the close control accepts interaction. Closing an acknowledgement in the same instant its timer expires removes it once and raises nothing.

**REQ-NOTIFY-021** — The close control's accessible name identifies the acknowledgement it removes. One clear operation removes every visible acknowledgement at once; changing view and shutting down each perform it.

**REQ-NOTIFY-022** — A transient acknowledgement animates into place by default: it enters by translating in from the window edge it anchors to, which is the right edge under REQ-NOTIFY-012, over 12 px and 160 ms while its opacity rises from zero to full, and it leaves by the reverse over 120 ms. The travel distance and the two durations are motion tokens of the active theme (REQ-SHELL-129) and the figures given here are the default theme's, so a theme declaring different ones is followed; the shape of the movement — the edge it comes from, the opacity rise, and the reversal on leaving — is not a theme's to change. Where reduced motion is in force — which is resolved by REQ-SHELL-135 and not by any rule of this document's own — its first painted frame is already at its final position at full opacity and nothing moves or fades afterwards. Reduced motion changes motion only: the same message appears, it leaves after the same 4200 ms, and no acknowledgement is suppressed, delayed or reordered. This requirement is the product's single definition of acknowledgement motion: a document that describes how an acknowledgement arrives or leaves cites this identifier rather than restating a direction, a distance or a duration.

### A6. Persistent notices: fields, identity and lifetime

**REQ-NOTIFY-023** — A persistent notice carries an identifier; a severity, being one of `info`, `success`, `warning`, `error` in ascending order; a title; a message body, possibly empty; a block of technical detail the user can copy, possibly empty; a `persistent` flag; an action label together with the identifier of the action it invokes, either of which may be empty; and a session identifier, possibly empty. The `persistent` flag has one observable effect, given in REQ-NOTIFY-040: whether a dismiss control is offered. A notice with the flag clear stays on screen exactly as long as one with it set.

**REQ-NOTIFY-024** — One notice is current at any moment, and it is the one published most recently. A publication replaces whatever notice was current, whichever session either concerns, and the replaced notice does not return unprompted. Replacement is a distinct event from clearing: the scoping rules of REQ-NOTIFY-028 and REQ-NOTIFY-029 govern what a starting run clears, and they exempt nothing from being replaced. Single-slot replacement is canonical and no notice is queued, restored or re-presented; a notice replaced before the user read it stays retrievable only through the record of REQ-NOTIFY-268.

**REQ-NOTIFY-025** — Notice identifiers are unique within an application session and increase monotonically. The notice store belongs to the application process rather than to any window: re-creating the main window within one process neither resets the identifier sequence nor discards the current notice, and the newly created window renders whatever notice is current under REQ-NOTIFY-024. An identifier is unique across every window of that process, so a clear request carrying an identifier under REQ-NOTIFY-026 stays meaningful after a window has been re-created.

**REQ-NOTIFY-026** — A clear request carrying no identifier removes whatever notice is current. A clear request carrying an identifier removes the current notice only where the identifiers match, so dismissing a notice already superseded leaves its successor standing.

**REQ-NOTIFY-027** — A notice outlives the acknowledgement lifetime of REQ-NOTIFY-011 without limit and stays until dismissed or superseded. Notices are not written to disk: no notice published before an application restart appears after it. An application session is one run of the application process; closing and re-creating a window does not end one, and only ending the process discards the notice store.

**REQ-NOTIFY-033** — A notice raised by work the user did not start appears without the user clicking, refreshing or changing view. Publications are totally ordered: whatever thread or component raises them, they are applied one at a time and in the order they were accepted, each one assigned its identifier under REQ-NOTIFY-025 and its clearing rules applied under REQ-NOTIFY-029 before the next is accepted, so no two publications interleave. Where several are published within one turn of the event loop, every one is applied, the one on screen once the burst has been applied is the last of them, and no earlier publication surfaces after a later one. Painting may be coalesced: a notice superseded within the same turn need never be drawn, and the absence of an intermediate frame is not a failure of this requirement.

**REQ-NOTIFY-268** — Every persistent notice of severity `warning` or `error` is, at publication, additionally recorded as an entry carrying its title, its message body and its technical detail unchanged. Where the notice carries a session identifier, or is unscoped while a run is focused, the entry is written to that session's timeline; where no session applies, it is written to the application diagnostics. Recording precedes rendering, so a notice replaced within the same event-loop turn is still recorded. The entry is therefore what a user reads after a notice was superseded before it could be acted on, and no failure or refusal becomes unreachable through replacement alone. Notices of severity `info` and `success` are not recorded by this requirement.

> **Extended by [`PD-ORCH-014`](../../product/directives/pd-orch-014.md#pd-orch-014), 2026-10-06.** The timeline entry this requirement
> writes is named `notice`, a word of domain 01's timeline vocabulary, and carries the notice's own severity.

### A7. Persistent notices: where and how they are drawn

**REQ-NOTIFY-034** — The application window renders the current notice as a single inline banner at the top of the window, below the title bar. A secondary or popped-out window renders its own banner, and activating an action in that banner is handled identically to activating the same action in the main window.

**REQ-NOTIFY-035** — A persistent notice signals severity with a border and a glyph, never by filling its background with the severity colour. It carries a 1 px border on all four sides and a 3 px rule down its left edge, both in the severity's colour, with the glyph in the severity's text colour. Against the surface behind them, border and left rule hold at least 3:1 contrast, and glyph and body text at least 4.5:1, in every theme offered.

**REQ-NOTIFY-036** — Severity glyphs are `i` for info, `✓` for success, `!` for warning and `×` for error, and are the same glyphs the corresponding acknowledgement kinds use.

**REQ-NOTIFY-037** — The title is always rendered. The message row and the detail row are rendered only where their text is non-empty. Detail text can be selected with the mouse.

**REQ-NOTIFY-038** — A copy control appears exactly where the detail block is non-empty, and activating it places the detail text on the system clipboard. Its accessible name states that it copies technical detail.

**REQ-NOTIFY-039** — An action control appears exactly where both an action label and an action identifier are present, and activating it dispatches that action identifier.

**REQ-NOTIFY-040** — A dismiss control appears exactly where the notice's `persistent` flag is set; activating it clears that notice and, under REQ-NOTIFY-026, cannot clear a notice that has since replaced it. A notice with the flag clear offers no dismiss control and cannot be removed by the user directly. No notice leaves on a timer: a notice leaves the surface only by replacement under REQ-NOTIFY-024, by a clear performed under REQ-NOTIFY-029 or REQ-NOTIFY-058, or, where the flag is set, by the user dismissing it.

**REQ-NOTIFY-041** — The banner's accessible name opens with the notice's severity word — `info`, `success`, `warning` or `error` — and continues with its title. Its accessible description is the message body followed by the technical detail; where only one of the two is present the description is that one; where neither is present the banner exposes no accessible description. In both the name and the description the parts are joined so that assistive technology announces them as distinct phrases; the joining text is the implementation's and belongs to no part's own content.

**REQ-NOTIFY-042** — Clearing the current notice hides the banner and releases the identifier it held.

**REQ-NOTIFY-043** — The banner can carry a thin progress meter. It is hidden unless asked for, and is removed whenever a different notice is displayed. Where no percentage is known the bar is absent rather than estimated. Percentages are clamped to the range 0 to 100. The fill is drawn in the accent colour at every value. The meter's label is also its accessible name, and the banner text states the same count in words.

### A8. Which session a notice belongs to

**REQ-NOTIFY-028** — A notice with an empty session identifier belongs to whichever run is focused. A notice carrying a session identifier concerns that other session and is treated as unread.

**REQ-NOTIFY-029** — A starting run clears the standing notice only where that notice's session identifier is empty or equal to the starting session's. A notice about a different session survives an unrelated run start, whatever order the start and completion events arrive in across threads.

**REQ-NOTIFY-030** — Changing the focused session moves every recovery affordance with it. Afterwards, a retry resubmits the newly focused session's draft, or that session's last submitted prompt where the draft is empty, and never the previously focused session's; the newly focused session still has its first automatic authentication fallback available under REQ-NOTIFY-070, whether or not the previously focused session spent one; the sandbox indicator describes the newly focused session; and the live output on screen belongs to that session alone.

**REQ-NOTIFY-031** — A run other than the focused one reaching a terminal state that is not a failure raises a persistent notice naming that session and the state it reached, with severity `success` where the state normalises to `completed` and `info` for every other non-failure terminal state. Its body states that the session on screen is unaffected and that the finished session can be opened for review, and it offers an action focusing that session. Publishing it changes neither the focused session nor what the focused view shows, and the session list shows the finished session's new state. A failure of a non-focused run is reported under REQ-NOTIFY-032 and raises nothing under this requirement.
  > **Extended by [`PD-SHELL-001`](../../product/directives/pd-shell-001.md#pd-shell-001) revision 3, 2026-10-14.** The action focusing the
  > session carries that session's workspace and reaches it: the main window holding it is surfaced, else one is added for it
  > on PD-SHELL-001's add terms, and the session is focused there ([OQ-292](../../architecture/open-questions/59-spikes-and-later-questions-26.md#oq-292)).

**REQ-NOTIFY-032** — A run other than the focused one that fails raises a persistent notice of severity `warning` naming that session, carrying in its copyable detail the failure text exactly as the run reported it, and offering an action focusing that session. It replaces the completion notice of REQ-NOTIFY-031 rather than accompanying it. It is the only notice such a failure raises: the classification of REQ-NOTIFY-060 still runs, setting the session's status and fixing the recovery that session will offer, but the classification's own error notice is not published while that session is not focused. Focusing that session publishes the classification notice for it, so the recovery affordances arrive with the focus change under REQ-NOTIFY-030 and two notices about one failure are never on screen at once. This notice's severity is `warning`, not `error`, because the work the user is looking at is unaffected; REQ-NOTIFY-065 governs error notices and does not reach this one.
  > **Extended by [`PD-SHELL-001`](../../product/directives/pd-shell-001.md#pd-shell-001) revision 3, 2026-10-14.** The action focusing the
  > session carries that session's workspace and reaches it: the main window holding it is surfaced, else one is added for it
  > on PD-SHELL-001's add terms, and the session is focused there ([OQ-292](../../architecture/open-questions/59-spikes-and-later-questions-26.md#oq-292)).
