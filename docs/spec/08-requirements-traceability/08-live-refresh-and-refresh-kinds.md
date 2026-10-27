# Requirements Board and Traceability — Live Refresh and Refresh Kinds

Part 8 of 13 of [domain 08](../08-requirements-traceability.md), which indexes every part. Defines REQ-TRACE-334 – REQ-TRACE-381.

### Live Refresh and Refresh Kinds

- **REQ-TRACE-334** — The board SHALL subscribe to the engine's evaluation results and repaint **only the cards those results touch**, in place. No manual refresh SHALL be required and **the board as a whole SHALL NOT be reconstructed**. An evaluation whose outcome differs for exactly one requirement SHALL cause exactly one card to change.

- **REQ-TRACE-335** — Four things SHALL survive an update untouched: which card is selected, where each column is scrolled to, what is expanded, and any detail view currently open. Where an evaluation completes while the detail view is showing, that view SHALL be refreshed where it stands rather than closed and reopened.

- **REQ-TRACE-336** — The board SHALL **state when it last evaluated** and offer an explicit refresh, printing the absolute moment behind the relative age.

- **REQ-TRACE-337** — **Evaluation and projection work SHALL NEVER run on the interface event loop**; the board SHALL stay responsive during a full re-evaluation.

- **REQ-TRACE-338** — A **failed evaluation** SHALL show a persistent, actionable notice, SHALL keep the last good board, and SHALL never blank or fall back to a locally computed board. The retry action SHALL take its name from the operation it performs, not from the notice or banner that hosts it.

- **REQ-TRACE-339** — Every board refresh runs a propagation pass containing two kinds of work a user experiences as nothing alike: **deterministic rules** — arithmetic over files, done before the interaction finishes — and **analyses** that each wait on a language model, which on a store of any size is **minutes**. The surface SHALL distinguish them.

- **REQ-TRACE-340** — **Every refresh SHALL apply the deterministic rules.** Where a rule relocates a card, that relocation SHALL happen on every refresh no matter how cheap the refresh was meant to be: what a caller may economise on is judgement, never fact.

- **REQ-TRACE-341** — **A refresh the user initiates SHALL consult no model.** Exactly four triggers SHALL be cheap in this sense: re-evaluating by hand; the refresh that follows an accepted action; the refresh that follows a requirement being written; and opening the view for the first time. Each corresponding control SHALL describe that behaviour in wording consistent with what it actually does.

- **REQ-TRACE-342** — There SHALL be **one** control for the plain re-evaluation, stating that it re-reads the sources and stores and applies the propagation rules, that it consults no model and measures nothing, and that cards a rule moves will move. Two controls in different words for the same action are a defect.

- **REQ-TRACE-343** — Where a refresh **might reach a model**, it SHALL announce that fact for the duration, using **a sentence written for this case** rather than the generic loading indication; it SHALL say that the operation may run for minutes; and it SHALL provide a **stop**. Before it runs, the control SHALL explain that the refresh records an analysis and puts work on offer without commencing any of it. While it runs, the control SHALL turn into a stop, which SHALL explain that stopping takes effect once the judgement currently in progress concludes, that the board is still delivered with every rule-driven card movement intact, and that anything the pass did not judge is taken up by the next full evaluation.

- **REQ-TRACE-344** — **Stopping SHALL still deliver a complete board.** Rules that already fired remain in effect, the projection is still computed, and any requirement the pass did not get to judge is left for the next full pass to handle. Where no analysis is under way, a stop request SHALL answer that there is nothing to stop.

- **REQ-TRACE-345** — Requirements **still awaiting a judgement SHALL be listed by identifier and counted** on the surface, and requesting a judgement SHALL launch a full pass. Leaving work outstanding is the intended consequence of a cheap refresh; if that outstanding work goes unnamed, a card that has yet to be judged looks exactly like a card with no work owed.

- **REQ-TRACE-346** — Where the workspace's settings disable change analysis, the board SHALL **state that fact** rather than presenting an action that would accomplish nothing. That fact SHALL be reported **by the pass**, and the board SHALL NOT deduce it from the shape of the results it received: a failed analysis leaves behind an identical absence of judgements, so treating a malfunctioning provider as a deliberate configuration would send the user off to correct something that is not broken. Any control that is incapable of having an effect SHALL explain why instead of merely appearing disabled.

- **REQ-TRACE-347** — The declared repository events SHALL remain the moments at which judgement happens automatically; they become legible and interruptible, not disabled.

- **REQ-TRACE-348** — A board pass SHALL be held in **one value** so a reader can never observe half an update, and a detail read during a pass SHALL describe **one generation** of the board. A finished pass SHALL retire itself and never the pass that replaced it.

- **REQ-TRACE-349** — Two threads opening a cold board SHALL read the workspace source **once**: the first open coalesces concurrent reads.

- **REQ-TRACE-350** — Where a batch of due evaluations arrives while a read is already running, the batch SHALL be re-attempted **150 ms** later. This delay is explicitly **not** a debounce window: the triggering events have already fired and are queued, and the wait exists only so the request can be repeated once the in-flight pass has cleared.

- **REQ-TRACE-351** — Progress publication from a running pass SHALL be throttled **only when a phase reports more than 20 items**. A check suite consists of a handful of checks separated by minutes, and discarding one of those signals would leave the banner naming the previous check for the entire duration of the next; a phase that emits one signal per requirement in the store is the opposite situation. The minimum interval between publications SHALL be **0.1 s**: a per-requirement phase over a store-sized project emits signals faster than the interface loop can consume them, which lengthens the queue and postpones the very repaint the signals exist to trigger. Two signals SHALL be published **regardless of the throttle clock — a change of phase, and the final item within a phase** — so the narration never comes to rest on an out-of-date item.

- **REQ-TRACE-352** — The elapsed reading of a running pass SHALL be redrawn every **1000 ms** from a timestamp the pass set once — the value is not re-sent, only the reading recomputed — so that a check producing no output for minutes still reads as alive. The reading SHALL advance while no new progress value arrives and SHALL stop when the pass ends.

- **REQ-TRACE-353** — **Progress reporting is commentary; it SHALL carry no authority.** Which controls are live SHALL be decided solely by whether a pass is currently running. A progress value that arrives late, that the throttle discarded, or that never arrived at all SHALL NEVER be what enables a control or relocates a card.

- **REQ-TRACE-354** — A progress update SHALL change nothing except what the progress display shows. It SHALL never bring a card into existence, reuse one for another card, or repaint one, and the set of cards on the board together with their contents SHALL be identical before and after it.

- **REQ-TRACE-355** — Progress raised by a pass running away from the interface SHALL reach the interface only once it has been handed to the interface's own thread; nothing on screen SHALL be touched from the pass itself. Reporting progress SHALL not make the board unresponsive and SHALL not produce a threading fault.

- **REQ-TRACE-356** — A pass SHALL survive a re-evaluation of the board that happens beneath it: where a repository event arrives while the pass is in flight, the pass SHALL keep running and the board's statements about that pass SHALL remain in place.

- **REQ-TRACE-357** — Progress presentation SHALL obey these rules:
  - the phase SHALL be labelled with wording describing the work being done, and its **position within the pass's fixed phase sequence** SHALL be given beside that label;
  - a position SHALL be shown wherever a real denominator exists — this check of the suite, this requirement of the store — and every such figure SHALL be **printed together with the unit it counts**;
  - **no overall percentage SHALL be shown**, and where a phase reports no denominator **no bar SHALL be drawn at all** rather than one invented for the occasion;
  - every control and every meter SHALL carry an accessible name, SHALL state its value as text and not by fill level alone, and SHALL fit within the minimum supported window size.

- **REQ-TRACE-507** — The live-refresh subscription SHALL be a supervised resource. Where it ends, fails, or reports that the repository watcher behind it has stopped delivering, the board SHALL raise a **persistent, actionable notice** naming what stopped and carrying a re-subscribe action named after what it does, SHALL keep the last good board on screen, and SHALL go on stating when it last evaluated (REQ-TRACE-336) so that the age of what is displayed stays visible. The board SHALL NOT poll in place of a subscription, and SHALL NOT infer a dead watcher from silence: an idle repository and a stopped watcher present the identical absence of events, and a board that guessed between them would either cry wolf over a quiet project or conceal a real failure. Re-subscription SHALL be attempted only when asked for — no automatic retry schedule and no backoff — and the explicit re-evaluation control of REQ-TRACE-342 SHALL remain the guaranteed route to a current board, its availability never depending on the subscription being healthy.

### Board Scaling and Virtualisation

- **REQ-TRACE-358** — The board SHALL construct card widgets **only for cards currently on screen**. Each column SHALL retain the full ordered membership from its model but SHALL build widgets only for the cards lying within its own scroll viewport, extended by a small overscan margin, using the scroll position the column already tracks. Scrolling SHALL **reuse** the existing widgets instead of allocating additional ones.

- **REQ-TRACE-359** — A widget SHALL be **reused rather than torn down and reconstructed**. When one card leaves the realised band, the widget it occupied SHALL be repainted where it stands to show the card that has entered the band, going through **the identical update path** that live refresh uses.

- **REQ-TRACE-360** — A column SHALL keep cards realised for a fixed margin above and below its viewport, so that a wheel step, a page key or a card taller than expected lands on a card that already exists rather than on a gap. Until real measurements exist the column SHALL size its scroll range from an estimate and SHALL adopt the measurements once they do, so that the scroll range and the realised band agree. The number of card widgets the board holds SHALL stay bounded by what the viewport and that margin require: after a filter is widened so that a column's membership grows and then narrowed again, the board SHALL hold no more card widgets than it held before the filter was widened. The margin SHALL be **5** cards above and **5** below the viewport band, and the pool of released widgets a column retains for reuse SHALL be capped at **20**; a widget released beyond that cap SHALL be discarded rather than held.

- **REQ-TRACE-361** — Until at least one card in a column has genuinely completed layout, the column SHALL continue to use its height estimate.

- **REQ-TRACE-362** — A **filter change SHALL recompute membership and repaint the bands**. Nothing SHALL be torn down: the existing column widgets and card widgets SHALL persist, and the current selection, each column's scroll offset and any open pane SHALL be carried through a filter change just as they are carried through a re-evaluation. Even a filter that matches almost nothing SHALL leave every column standing, simply with fewer members.

- **REQ-TRACE-363** — Text typed into the search box SHALL be applied only after **150 ms** have passed without a further keystroke, so that a burst of typing produces **one** recomputation and one repaint rather than one per character. While that pause is outstanding the box SHALL hold the typed text, the board SHALL report itself as populating, and the filter in force SHALL be unchanged. Once the text is applied the board SHALL report itself as no longer populating.

- **REQ-TRACE-364** — Since **no widget exists** for a card the user has never scrolled into view, the board SHALL expose an explicit operation that forces a named card to be realised. Returning to the board and focusing the current selection SHALL use it, as SHALL any other caller that needs one particular card to exist. It SHALL scroll the column to the card, return the now-visible widget, **not** realise everything on the way there, and return nothing for an unknown identifier and for an empty identifier.

- **REQ-TRACE-365** — For a column of 300 cards in a viewport of about 1000 × 640 the following SHALL hold: the column reports all 300 as members; fewer than a quarter of them have widgets, and that count does not grow with the column's length; the pending count equals the membership minus the realised count; the board reports itself finished populating by the time the update call returns; and the realised cards form one **contiguous band beginning at the top** rather than a scattering. Scrolling the column from end to end in ten steps SHALL leave the realised count bounded by the viewport band and its margin, SHALL make the set of cards visible at the bottom **disjoint** from the set visible at the top, and SHALL leave the last card reachable. **Every realised widget SHALL paint the card it is currently filed under**; a reused widget SHALL never go on showing the card it previously held. Revealing a named card SHALL realise that card and the band around it and SHALL NOT realise the cards passed over on the way.

- **REQ-TRACE-366** — The board SHALL publish a **readiness flag** and a **pending count** as observable state, so that a caller can wait for the bands to finish realising.

- **REQ-TRACE-367** — The cost of putting a board on screen SHALL be governed by how much of it is visible, not by how many requirements the store holds. Spreading the construction of every card across successive turns of the event loop SHALL NOT be accepted as satisfying this, since it leaves the total work unchanged. Typing a character into the search box SHALL NOT discard and rebuild the board's cards. One keystroke SHALL cost no board work beyond restarting the debounce timer of REQ-TRACE-363 and painting the character typed, and the recomputation that follows the debounce pause SHALL occupy the interface thread for no more than **100 ms** under the same reference conditions.

### Surface Composition and Staging

- **REQ-TRACE-368** — The requirements feature SHALL be attached to a window exactly once, however many times the view is opened. Opening the view SHALL require nothing of the caller, and an action performed once on the board SHALL take effect once — never twice, and never in two views at the same time.

- **REQ-TRACE-369** — The requirements area SHALL install **its own default surfaces**. Staging SHALL differ by surface: the **board** SHALL be installed the first time the area is opened, and again on refresh; each **pane** — review, queue, editor, creation, blockers — SHALL instead be **constructed the first time it is actually needed**, so that a board opened only to be read does not pay the cost of surfaces nobody opens. A second use SHALL **reuse** the pane rather than building a second.

- **REQ-TRACE-370** — **No stage SHALL displace a surface a caller attached first**: a test's composition or another window's SHALL survive untouched. The attachment point SHALL stay an extension point, but SHALL now ship **with a default implementation**; an extension point that has no default leaves nothing behind it for a user to actually run.

- **REQ-TRACE-371** — Constructing the window SHALL build no board and read no requirement store: the area is lazy. Selecting the requirements view SHALL then yield a board carrying the project's requirements without any caller having attached a view.

- **REQ-TRACE-372** — Once the board is installed, **every control it presents as live SHALL do what it offers when it is operated**, and **every request its default surfaces can raise SHALL be answered** — no control on the board may be enabled and inert. It SHALL be possible to sweep the board's controls and demonstrate that each has an effect.

- **REQ-TRACE-373** — A board view MAY offer only part of the interaction surface the rest of the application is able to drive. Installing such a partial view SHALL succeed rather than fail: whatever the view does not offer SHALL be reported as not connected, whatever it does offer SHALL be reported as connected, and a capability the view lacks SHALL simply be absent rather than raising an error when something asks for it. The interaction surface SHALL cover, at minimum: the reading requests a user makes of the board without changing anything; every state-changing action in the closed set of REQ-TRACE-382; the board state, pending actions and feedback, queue, pass progress and move options handed back to the view; and navigation between the board, a requirement's detail and the panes of REQ-TRACE-375.

- **REQ-TRACE-374** — A state update handed to the board MAY name which requirements it affects. Where it does, **only the cards for those requirements SHALL change**, and every other card, the current selection, each column's scroll offset and any open pane SHALL be left exactly as they were. Where it does not, the board SHALL still come to show the same state it would have shown had the affected requirements been named.

- **REQ-TRACE-375** — The pane-key namespace SHALL be stable and closed: review, queue, editor, creation, blockers. Whether a given pane is already installed SHALL be answerable for any of those keys at any time, and asking SHALL neither construct that pane nor load anything the pane needs in order to run — so the question can be put to a board on which no pane has ever been opened, and asking it SHALL leave the board exactly as REQ-TRACE-369 leaves an unopened pane.

- **REQ-TRACE-376** — With **every** surface installed, nothing in the area SHALL clip at the minimum window size; every pane SHALL share one stack with the board.

- **REQ-TRACE-377** — **No module of the desktop application SHALL** launch a requirement-checking or verifier process, parse rendered output in place of the data, or re-compute evidence health, requirement health or epic progress. A guard test SHALL assert that no desktop module spawns such a process, and the health values rendered on cards SHALL be asserted identical to the projection's.

- **REQ-TRACE-378** — A board surface SHALL take every engine-derived value already translated, through the bridge and from no other route, and SHALL NOT load the requirement engine while running. Ordering of identifiers on the board SHALL produce, for any set of identifiers, exactly the order the engine produces for that same set.

- **REQ-TRACE-379** — Given the projection is unavailable, the view SHALL degrade to a **stated error** and SHALL NEVER fall back to a locally computed board.

- **REQ-TRACE-380** — Turning projection values into what the board displays SHALL be a pure mapping: every input it uses, **the current time included**, SHALL be supplied to it, and the same inputs SHALL always produce the same displayed values. That mapping SHALL read no file, consult no repository, reach no engine and require no user-interface toolkit.

- **REQ-TRACE-381** — The application as shipped SHALL open the requirements view onto a working board: the board, the detail view, the evidence view and the graph SHALL all be available without a caller supplying them, the review and queue panes SHALL be reachable, and the scheduling limits SHALL be in force. A status placeholder carrying no board SHALL NOT be an acceptable shipped state.
