# Requirements Board and Traceability — Pass Progress Reporting

Part 6 of 13 of [domain 08](../08-requirements-traceability.md), which indexes every part. Defines REQ-TRACE-210 – REQ-TRACE-270.

### Pass Progress Reporting

- **REQ-TRACE-210** — A pass SHALL report phases drawn from this closed set, encountered in this order: `reading` (the requirement source is being read), `checks` (the workspace's own check suite is running), `coverage` (the repository is being swept), `recording` (one verification is written per requirement), `adopting` (candidates are being moved by the completion gate). A pass SHALL report no phase outside this set and SHALL report nothing about how it goes about a phase.

- **REQ-TRACE-211** — Phase sequences SHALL be: verification — `reading`, `checks`, `coverage`, `recording`; adoption — `reading`, `checks`, `coverage`, `adopting`, `recording`. Recording SHALL come last in the adoption sequence: the verification that justified each move is written down **once the moves have already been made**.

- **REQ-TRACE-212** — Every progress report SHALL name its phase outright. A consumer SHALL never have to deduce the phase in progress from the order, count or shape of the reports it has received.

- **REQ-TRACE-213** — Progress SHALL be reported as plain values, in two kinds of report:
  - a **phase report** carrying the phase and the number of items that phase will report, where **0** states that the phase is one indivisible step. It SHALL be delivered **before** that phase's first item report, so a consumer always holds the denominator before it receives a position;
  - an **item report** carrying the phase, a label naming the item (a check's name, a requirement's identifier), a **1-based** position, the phase total, an optional detail, and the deadline in seconds currently applying to the item in progress, from which a countdown can be drawn.
  Where the wait budget is unlimited the deadline field SHALL be **absent** rather than carrying zero, so that a consumer can tell "there is no countdown to draw" from "no time remains". The stored-value convention under which zero denotes an unlimited wait belongs to the configuration setting alone (REQ-CONFIG-126, REQ-TOOLS-055, cited here by REQ-TRACE-467) and SHALL NOT reach this protocol.

- **REQ-TRACE-214** — Both callbacks SHALL happen on the thread running the pass. A host that must touch a user interface SHALL marshal for itself.

- **REQ-TRACE-215** — Dispatch SHALL be defensive and absent-by-default: a missing hook is skipped; a hook that raises is logged naming the hook and stepped over; and a pass running without a host SHALL perform **no reporting work whatsoever**, yielding a byte-for-byte identical report, identical stored records and identical writes to a pass that never had a progress layer. Nothing in the progress layer may alter what a pass concludes: a measurement that perturbs its subject is not a measurement.

- **REQ-TRACE-216** — Item-level reporting SHALL be wired as follows: `reading` — phase only, no total; `checks` — phase with the suite length, then one item per check emitted **as the check begins** rather than as it completes, since the fact worth showing is which check is executing right now; completion SHALL carry the position forward, so the final check does not sit one short of the total while the pass moves on; `coverage` — phase only, **no per-item progress**, so the repository sweep is a single opaque step even to the protocol; `recording` — phase with the number of verifications, then one item per written record.

- **REQ-TRACE-217** — A workspace that declares no checks SHALL receive an empty suite **together with a stated reason**, never a fabricated pass. An absence of checking and a clean result are two different findings, and only the second one constitutes evidence.

- **REQ-TRACE-218** — The seam SHALL NOT be shaped like any one surface: it SHALL be a protocol of plain values consumed by **at least two** independent hosts — the desktop worker and the project's own test suite, which drives the seam directly and not through any surface. A seam with only one consumer degenerates, without anyone noticing, into that consumer's private implementation detail, and a test suite that can only reach it through the desktop worker is not a second consumer. This requirement formerly named a programmatic embedding of the engine as the second host; that is withdrawn, because the product offers no embedding surface and no programmatic entry point (REQ-EVENTS-178), and a host that cannot exist cannot keep a seam honest. The obligation is unchanged in strength: two independent consumers, at least one of which is not a product surface.

- **REQ-TRACE-219** — Existing hosts SHALL stay unchanged. The verification seam that a test substitutes for SHALL retain its existing signature, so that a progress-reporting pass and a pass driven by a test double remain one and the same pass. Per-check progress already produced by the lower-level suite runner SHALL be adapted into `checks` items instead of a parallel mechanism being introduced alongside it, and a pass with no host SHALL leave the suite runner on precisely its usual path.

### Cancellation

- **REQ-TRACE-220** — Cancellation SHALL be a token safe to set from another thread, exposing a cancel operation, a cancelled predicate, and a checkpoint operation that raises a dedicated error whose message states that a requirement index refresh was cancelled and, optionally, where.

- **REQ-TRACE-221** — Cancellation exists for two reasons: a second refresh trigger may arrive before the first refresh has finished, and the user may dismiss the view mid-pass.

- **REQ-TRACE-222** — Checkpoints SHALL be placed **between one source and the next, and between one artifact and the next**. The worst-case waste from cancelling a refresh is therefore a single artifact read, not a whole traversal of the store. A read already under way SHALL NOT be interrupted part-way.

- **REQ-TRACE-223** — A cancelled pass SHALL NEVER blank the last good state: the previously published index still stands.

- **REQ-TRACE-224** — A fresh token SHALL be minted for each pass and SHALL NOT be carried over to another. The underlying signal is one-way and never clears, so a shared token would leave every pass after the first one already cancelled the moment it began.

- **REQ-TRACE-225** — Two refresh kinds SHALL exist: a deterministic-rules-only kind that reaches no analyst and creates **no** cancellation token (cards still move, because one propagation rule is owed on every refresh and costs no model call); and an analysing kind that runs every rule including impact analysis, clarification, migration planning and removal analysis, which is the only one worth cancelling. The **analysing** kind SHALL be the default for a caller that says nothing. Neither kind SHALL place a wall-clock bound on the engine read that backs a refresh, and that SHALL be a deliberate decision: the read runs off the interface thread (REQ-TRACE-337) so the surface never blocks, the board states that a refresh is in progress for as long as one is, the last good board stays on screen throughout (REQ-TRACE-338), and every external call the read makes is itself bounded (REQ-TRACE-201). A deterministic refresh SHALL therefore offer no stop control and no timeout; its cost is bounded by the store and the repository it reads.

- **REQ-TRACE-226** — A request to cancel SHALL return false when there is nothing to stop — no token, or nothing in flight — and true after signalling the token.

- **REQ-TRACE-227** — Cancellation SHALL NEVER abandon the pass: deterministic rules that have already been applied are not rolled back, the projection is still computed, and the result is still delivered. What a stop changes is only whether the caller waits out the outstanding judgements; it SHALL NOT change whether a board is produced.

- **REQ-TRACE-228** — A pass SHALL state, in the outcome it returns, what stopping cost: one sentence for each thing the pass did; whether it halted because it was asked to; the requirements left unjudged, divided into those beyond the depth the pass would go, those excluded by policy and those it did not reach before being stopped; and whether this workspace permits the analysis at all. Those lists SHALL be reported only: they SHALL NOT alter what a later pass does, and a later full pass SHALL take the same requirements up again from what is already stored.

- **REQ-TRACE-229** — A pass SHALL run on a worker and SHALL NEVER block the caller. Starting one while another is in flight SHALL return false rather than queueing. A call with no workspace at all SHALL emit an "unavailable" reason distinct from "a workspace whose store went unread".

### Board Surface: Columns and Delivery States

- **REQ-TRACE-230** — The requirements board SHALL be a primary view in the application's navigation rail, reachable by the same keyboard path as every other primary view, restored as the active view after a restart, with a navigation glyph that renders at the same perceived size at 100 %, 125 % and 200 % display scaling. Its navigation entry SHALL carry an accessible name naming the view it opens.

- **REQ-TRACE-231** — Given a workspace with no requirement source, the view SHALL present an empty state that says what a requirement source is and describes how one is configured — **never a blank pane**.

- **REQ-TRACE-515** — Given a configured requirement source whose documents the store **rejected**, the view SHALL state that the source does not parse and SHALL distinguish that state from the empty state of REQ-TRACE-231, which says the source holds no documents; a store that will not parse is not a store nobody has written to, and a reader told the second of those about the first is told something false. It SHALL name **each** rejection in the engine's own words — the document and what was rejected in it (REQ-TRACE-022) — rather than a count alone, since the correction is made in the document named. Where the store parses only in **part** the board SHALL be drawn from what parsed **and** SHALL state, on the board itself, how many documents were rejected together with those same errors: REQ-TRACE-026 makes a rejected document contribute nothing at all, so a board silently missing a requirement is otherwise indistinguishable from a board carrying every one. Neither statement SHALL be offered as a substitute for the check of REQ-TRACE-508, which remains the whole report; what the board owes is that the condition is never silent where a person is looking for their requirements.

- **REQ-TRACE-232** — On the delivery axis the board SHALL render **one column per delivery state**, in this fixed order, with these column tokens: `backlog`, `ready`, `running`, `review`, `needs-update`, `done`. The order SHALL be fixed and SHALL NOT be derived from data.

- **REQ-TRACE-233** — A `blocked` column token SHALL exist, but SHALL deliberately **not** count as one of the delivery stages, because being blocked describes a condition rather than a point reached along the pipeline. Under the model a blocked requirement continues to belong to the state it occupied when it became blocked, and clearing the blocker SHALL send the card back to precisely that state and to no other — a round-trip invariant. Movement in each direction is a special case: every column may transition into `blocked`, and the only exit from `blocked` is a return to the origin state.

- **REQ-TRACE-234** — Each column header SHALL state its count, rendered as `<Label> · <count>`. Non-identifier column keys SHALL be title-cased by splitting on hyphens; keys that are project-supplied identifiers (epic, source) SHALL be printed as-is.

- **REQ-TRACE-235** — Every requirement the projection returns SHALL appear in **exactly one** column (partition invariant), and on every axis the sum of the column counts SHALL equal the number of visible cards.

- **REQ-TRACE-236** — A column holding nothing SHALL say what would belong in it rather than showing bare space. On the delivery axis the sentence SHALL be specific to the column; on every other axis a single sentence covering the axis SHALL serve each of its columns.

- **REQ-TRACE-237** — At the minimum window size REQ-SHELL-022 fixes — which this requirement relies on for the figure and does not restate — no column, card or header SHALL clip and no action SHALL become unreachable. The columns area SHALL scroll **horizontally** rather than clipping; each column SHALL scroll **vertically**.

- **REQ-TRACE-238** — Column widths SHALL be bounded: an open column SHALL be at least **276** points wide (a card's own minimum plus margins plus its scroll bar) and at most **340**. Spare width SHALL be spent up to the cap and no further, because a card title read across several hundred points is not a card anybody scans. At the minimum window size with every column unfolded, every column SHALL still be at least the minimum and the columns area SHALL report a positive horizontal scroll range.

- **REQ-TRACE-239** — A board carrying several hundred requirements SHALL be displayed without the interface ceasing to respond to input, and the work of displaying it SHALL be bounded by what is on screen rather than by how many requirements the store holds (REQ-TRACE-358). Putting a board on screen once the engine has answered SHALL occupy the interface thread for no more than **100 ms**, measured at the minimum supported window size under the reference conditions of REQ-TRACE-088, and that figure SHALL NOT grow with the size of the store.

- **REQ-TRACE-240** — The board SHALL surface a **blocked summary** reachable without scrolling any column — positioned above the columns scroll area. It SHALL:
  - carry a heading stating the number of blocked requirements;
  - list one row per blocked requirement, labelled by identifier followed by the engine's own reason, without repeating the word "blocked" that the heading already said;
  - carry every engine reason verbatim in its accessible description;
  - offer two controls per row — first the move that addresses the block (returning the requirement to the state it came from, which is its only legal move), then navigation to the card;
  - on navigation, open the target column if it is folded, select the card and give it focus.
  The heading SHALL always state the **true total**, however many rows are shown. At most **20** rows SHALL be listed; where more requirements are blocked, one final row SHALL state how many were not listed and SHALL, when activated, filter the board to the blocked requirements, so the remainder stay reachable in a single action. A strip that ran to hundreds of rows would push the columns off the screen it sits above.

- **REQ-TRACE-241** — Blocked presentation SHALL NOT rely on colour alone: text or a glyph SHALL carry the condition too. Whether blocked cards *also* gather into a column of their own SHALL be governed by a display preference; toggling it SHALL leave the delivery model untouched.

### Requirement Cards

- **REQ-TRACE-242** — Seven facts SHALL appear on every card, with no card omitting any of them: the identifier; the title; the lifecycle badge; the delivery condition, needs-update included; the evidence indicator; the number of execution units; and how long ago the most recent run happened.

- **REQ-TRACE-243** — A card SHALL show these facts when present and omit them cleanly when absent, with no empty placeholders, in this fixed order: priority, parent epic, source, dependencies, assigned agent, last change.
  - Priority SHALL be omitted when the engine's priority token means "none".
  - The dependency list SHALL join identifiers and cap the list at **4** before an "and N more" tail, so a card cannot grow with its dependency list.
  - Last change SHALL carry the relative age as its value and the absolute moment as an attached detail; a card that omitted the fact SHALL NOT be able to carry the moment anyway.
  - Source SHALL be on the **card**, not only in the detail view, because the source filter and the source grouping axis read it off the card; without it both dimensions would be present in the interface and permanently empty.

- **REQ-TRACE-244** — Exceptional facts SHALL be stated in words rather than encoded only in colour: that the specification changed, that the requirement is blocked, and that evidence is failing. "Specification changed" SHALL appear exactly when the requirement's current hash differs from its satisfied hash.

- **REQ-TRACE-245** — Card alerts SHALL be emitted in this fixed order: (1) the specification-changed sentence; (2) the delivery state's blocked reason, labelled as blocked; (3) one per recorded blocker, labelled as blocked with its kind; (4) one per blocking evidence obligation, distinguishing a failing obligation from a missing one; (5) an unavailability reason when availability is not "available" and a reason exists; (6) an awaiting-review sentence when a review exists and its specification moved while the run was in flight.

- **REQ-TRACE-246** — Alerts SHALL be de-duplicated **on the sentence, not on the line**: any leading blocked label SHALL be removed before two alerts are compared. One and the same engine sentence arrives at the projection along two routes — as the reason attached to the delivery state, and again as the reason held on the blocker record raised for it. Where the two differ in spelling, **the earlier one SHALL be kept**. De-duplication SHALL happen in the translation layer, ahead of both painting and announcement, so the painted alerts, the announced accessible description and the board's blocked summary agree by construction.

- **REQ-TRACE-247** — Each alert SHALL carry a severity glyph as well as a colour, from a three-value set distinguishing failure, stopped and attention, because the palette's "stopped" and "attention" hues read alike. Alert lines are **words** and SHALL therefore meet a **4.5:1** contrast floor, while saturated status marks owe **3:1**.

- **REQ-TRACE-248** — Every colour a card paints SHALL be the one the theme in force prescribes at the moment of painting. A card built before a theme was chosen, and a card already on screen when the theme changes, SHALL both show the current theme's colours without being rebuilt.

- **REQ-TRACE-249** — The execution line SHALL always be a sentence, never a blank: zero units states that there are none yet; one unit and N units are spelled distinctly. The last-run half SHALL read as the run's age with its outcome in parentheses, or state that it has never run; when the age is unavailable the space SHALL collapse rather than leaving a gap. The two halves SHALL be joined by a middot separator.

- **REQ-TRACE-250** — Relative age SHALL be rendered from an **injected** clock, never one read inside the renderer, and SHALL follow these thresholds: no timestamp yields an empty string; a missing reference time or a timestamp lacking zone information yields the absolute stamp instead; a negative delta or under **60 seconds** reads as "just now"; under **1 hour** in minutes; under **1 day** in hours; otherwise in days. Singular and plural SHALL be distinguished.

- **REQ-TRACE-251** — The absolute moment SHALL be rendered in **local** time with a minute-resolution date-and-time stamp followed by the UTC offset, the offset appended only when the timestamp carries zone information — a zone-naive timestamp is printed as-is, because inventing an offset would be a guess. The card SHALL paint the age and offer the moment through its tooltip and accessible description; the detail view and the revision-history panel SHALL print both.

- **REQ-TRACE-252** — Health SHALL be exactly one of seven words: `healthy`, `needs-update`, `incomplete-traceability`, `verification-failed`, `blocked`, `superseded`, `deprecated`. Each word SHALL be shown together with a plain-English gloss defining **that word**, not describing the requirement it has been applied to, and with a sentence stating that health is derived from three inputs — the requirement's lifecycle, its delivery state and its evidence — and is set by nobody directly.

- **REQ-TRACE-253** — The card SHALL additionally explain, in words: what the evidence counts mean and that "not applicable" means the requirement does not owe that kind of evidence at all; and what an execution unit is, noting that a requirement nobody has released has none. The source fact SHALL explain that it names the configured requirement source the requirement was read from.

- **REQ-TRACE-254** — Health, evidence state, delivery state and epic progress SHALL be displayed exactly as the projection supplied them. None of the four SHALL be recomputed, adjusted, rounded or defaulted before display, and the health shown on a card SHALL be identical, character for character, to the health the projection reports for that requirement.

- **REQ-TRACE-255** — Selection SHALL be stated in a **word** on the card, with an explanation that the board's controls act on this requirement — not carried by a tint alone, which is both a colour-only signal and genuinely hard to find by eye on a board of dozens of cards. Giving a card focus SHALL set the selected requirement: focus **is** selection.

- **REQ-TRACE-256** — A card value SHALL additionally carry, for the board's use without opening the requirement: the state to which a blocked requirement would return, which is the sole destination the user is permitted to drag a blocked card to; the specification hash as it currently stands, so that any action can record which version it operated on; and the identifiers of the dependencies currently holding it, which the drag-time release indicator needs.

- **REQ-TRACE-257** — Every card element SHALL have an accessible name; the card as a whole SHALL be keyboard focusable and reachable in logical order; and card text SHALL stay readable both at the minimum window size and at 200 % scaling.

### Evidence Indicator

- **REQ-TRACE-258** — Each card SHALL carry an indicator divided into one segment per evidence obligation the requirement owes, ordered as the projection orders them, each segment coloured for that obligation's state: satisfied and verified; recorded but stale or unverified; failing verification; or missing or not owed. The sequence of segment states SHALL equal the sequence of obligation states the projection reports, position for position. The set of obligation kinds SHALL be **closed** and SHALL be exactly these three, in this fixed order: `implementation-trace`, owed where the requirement declares `trace: required`; `covering-test`, owed where it declares `test: required`; and `verification`, owed where the requirement is approved and the workspace declares a check suite. A card therefore carries at most three segments, and how many it carries SHALL be predictable from that requirement's own obligation flags and lifecycle. A fourth kind added to the engine SHALL fail the presentation lookup immediately rather than quietly receiving a fallback segment, exactly as REQ-TRACE-446 requires of blocker kinds.

- **REQ-TRACE-259** — The indicator SHALL explicitly **not** be a count of annotations, because a count would read as complete for a requirement whose tests fail. A requirement with complete traces but a failing test SHALL render a failing segment, not a wholly satisfied indicator.

- **REQ-TRACE-260** — Where a requirement owes **no** evidence obligations at all, its indicator SHALL be drawn **empty**, accompanied by a stated reason, and SHALL never resemble a satisfied one. Of everything this widget could render, an indicator that looks complete when in fact nothing was ever owed would mislead the reader most.

- **REQ-TRACE-261** — The indicator's accessible description SHALL name **every segment and its state**, in the form `<Obligation>: <State>`, and the card SHALL print an equivalent summary beside it, so that someone who cannot separate the alert hues reads exactly the same facts. Every indicator colour SHALL meet a **3:1** contrast floor against the card ground. Segment colours SHALL be taken from the **theme's semantic status tokens** — the same tokens the alert severities of REQ-TRACE-247 draw on — and SHALL NEVER be written as literal colour values inside this widget, so that a change of theme reaches the indicator without it being rebuilt (REQ-TRACE-248). The normative constraints on those colours are this contrast floor and the rule that colour never carries a fact on its own; their concrete values belong to the design system rather than to this specification.

- **REQ-TRACE-262** — Each segment SHALL carry its obligation kind, label, state, state label, the obligation's reason when the engine gave one, and whether the obligation level is required. The kind SHALL be one of the three tokens enumerated in REQ-TRACE-258 and the state one of the four states named there.

- **REQ-TRACE-263** — The indicator's segments SHALL be arranged so that no segment overlaps its neighbour, so that the segments taken together close the ring, and so that an angular gap separates each from the next — several obligations reading as several segments rather than as one ring painted in several colours. The first segment SHALL begin at twelve o'clock. A clear margin SHALL be left between the segments and the edge of the indicator, wide enough that the focus indication never paints over a segment.

- **REQ-TRACE-264** — The indicator SHALL be its own tab stop with a strong focus policy; it SHALL NOT be a hover-only affordance.

### Evidence Detail

- **REQ-TRACE-265** — Activating the indicator SHALL open the evidence view for that requirement. It SHALL contain: each implementation site and each covering test given as a **file and a line**, together with that site's pass state; the most recent verification, reported with its **verdict**, the **commit** it ran against and the **requirement hash** it was taken over; and the records of execution and of integration. The site listing SHALL be **complete**: every implementation site and every covering test SHALL be listed, ordered by repository-relative path and then by line, beneath a stated count per kind, and the view SHALL **scroll rather than paginate or truncate** — a site the view declined to show is a site nobody checks.

- **REQ-TRACE-266** — Each listed site SHALL be activatable and SHALL open its file **at its line**, using the projection's own path and line rather than a reconstruction. Each listed run SHALL open the session that produced it. The governing design constraint SHALL be that no more than two actions separate noticing a problem on the board from having the offending file open in front of you.

- **REQ-TRACE-267** — The evidence view SHALL be openable with a pointer and from the keyboard while the card holds focus. Where a requirement's evidence is incomplete, the view SHALL **name what is missing** instead of presenting an empty list.

- **REQ-TRACE-268** — A site control's accessible name SHALL state the site kind, its address as path and line, and its state.

- **REQ-TRACE-269** — What the evidence view shows SHALL be determined entirely by two values the board already holds for that requirement: its card and its detail. The same two values SHALL always yield the same content, with no file read, no repository access and no engine call of its own. Activating a listed site or a listed run SHALL be reported as a request — open this file at this line, or open this session — and the navigation SHALL be carried out by the surrounding application rather than by the view.

- **REQ-TRACE-270** — Exactly three evidence states SHALL mean that something was actually recorded: `satisfied`, `stale` and `failed`. That distinction SHALL govern only what the evidence action offers to do, and SHALL never be used to decide whether a requirement passes.
