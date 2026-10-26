# Requirements Board and Traceability — Requirement Detail View

Part 7 of 13 of [domain 08](../08-requirements-traceability.md), which indexes every part. Defines REQ-TRACE-271 – REQ-TRACE-505.

### Requirement Detail View

- **REQ-TRACE-271** — Activating a card SHALL open a detail view carrying **exactly five** sections, every one of them always present and each with its own empty message:
  1. **Requirement** — the identifier and title, the description, which source it was read from and at what path within it, the hash it currently holds, its lifecycle and its delivery state.
  2. **Relations** — the parent epic, the children, the derived requirements, what it supersedes, what supersedes it, and its dependencies.
  3. **Execution** — the execution units, runs both active and completed, and the worktrees, branches and commits belonging to them.
  4. **Traceability** — implementation sites, test sites, missing evidence, stale evidence.
  5. **Verification** — test results, build results, the requirement-check result, and the last successful verification.

- **REQ-TRACE-272** — Each of the five sections SHALL be **built on every render, including when it holds nothing**: to a reader, a section that was omitted looks exactly like a section that was never written. A section counts as empty when it carries no facts, no links, no lines and no body text, and in that case SHALL display the empty message declared for it. Sections SHALL degrade individually, not as a whole view.

- **REQ-TRACE-273** — Every related requirement SHALL navigate to its own detail view. A **dangling** relation SHALL be shown as unresolved with its target identifier rather than hidden.

- **REQ-TRACE-274** — The relation vocabulary SHALL cover at least these twelve tokens with display labels: `parent`, `children`, `derived-from`, `derived-requirements`, `supersedes`, `superseded-by`, `depends-on`, `blocks`, `refines`, `refined-by`, `conflicts-with`, `related-to`.

- **REQ-TRACE-275** — The description SHALL be rendered **from the source**, never from a local copy: there is no second requirement repository.

- **REQ-TRACE-276** — A card and the detail view opened from it SHALL report the same lifecycle, the same delivery state, the same health and the same evidence values for that requirement; the two SHALL never disagree. The detail view SHALL additionally carry the description, whether the requirement can be edited, the source identifier and the path within it, the blockers, any outstanding change-work offer, the revisions, whether revision history is available and if not why, the priority, the epic, and whether the requirement is itself an epic.

- **REQ-TRACE-277** — The detail view SHALL be fully keyboard operable and SHALL close with the escape key, returning focus to the control it was opened from. Its accessible names SHALL include the source path and the current hash, and relation controls SHALL name the relation and its target.

- **REQ-TRACE-278** — The detail view SHALL present the requirement's revision history as an **ordered list, oldest to newest, with the current revision marked**. Each entry SHALL carry four things: that revision's hash; the run which implemented it; the commit in which it landed; and how delivery ended for it. A revision that was never delivered SHALL still appear, with its outcome stated rather than being left out. Activating a run SHALL reach its session; activating a commit SHALL reach the version-control view.

- **REQ-TRACE-279** — The revision history SHALL be produced by the engine, which joins the source's revisions against the locally recorded hashes and the delivery records. It SHALL NOT be reconstructed by the presentation layer: a card holds only two hashes and therefore cannot account for a requirement that has had three versions, and a surface that filled the gap by inference would give a different answer to "which version was actually built" than the agents give.

- **REQ-TRACE-280** — The history panel SHALL have **three** states, not two: available (the ordered list); unavailable, with a sentence stating that source history was not reported for this requirement, because only the engine can distinguish "this source keeps no history" from "this requirement has one revision"; and **pending**, with a sentence stating that the history is currently being read. The pending state is needed because the detail view opens against the board's projection, and revision history is not part of that projection; it is fetched off the interface thread, and reporting "unavailable" during that interval would be a false answer.

### Epic Cards

- **REQ-TRACE-281** — An epic SHALL be a requirement with children and SHALL behave on the board as a **grouping element**, not a work item someone could drag into a running state.

- **REQ-TRACE-282** — An epic card SHALL summarise its children on five counts: how many children it has; how those children are distributed across the delivery states; the proportion of them carrying an implementation trace; how many runs are executing beneath it; and how many blockers stand against them. Its progress line SHALL read `<done> of <total> requirements done`, the total counting only children that are not deprecated. Where the epic has deprecated children, the line SHALL carry a suffix stating how many were left out, so the child count and the progress total can be reconciled. The traced proportion SHALL be computed over the **same population** as the progress total — the children that are not deprecated — so that the two figures printed on one card always describe the same set of requirements.

- **REQ-TRACE-283** — An epic card SHALL expand to its children or filter the board to them, reaching them **without leaving the board**. Filtering to an epic SHALL leave on screen the children **plus the epic itself** as context and nothing from outside the epic, and the filter summary SHALL state that an epic filter is active and name it.

- **REQ-TRACE-284** — An epic card SHALL offer **no delivery action of its own**, and the container that would hold such actions SHALL be **omitted entirely rather than rendered in a disabled form**. That way a test can assert against the seam itself instead of asserting that one particular control happens not to be there. An epic's own state SHALL be derived from the states of its children.

- **REQ-TRACE-285** — An epic with **no children** SHALL state that rather than reporting complete progress.

- **REQ-TRACE-286** — An epic card SHALL be a distinct widget kind from a requirement card.

### Sorting, Filtering and Grouping

- **REQ-TRACE-287** — Three sort orders SHALL be offered, the first being the default: priority then identifier; identifier; health then identifier.

- **REQ-TRACE-288** — The priority order SHALL be exactly `Critical`, `High`, `Normal`, `Low`, and a card whose priority is not one of those SHALL rank **after** the last of them, deterministically — never randomly.

- **REQ-TRACE-289** — Identifier ordering SHALL be digit-run aware, so that `<PREFIX>-9` sorts before `<PREFIX>-10`, which lexicographic ordering gets wrong. There SHALL be **one** implementation of this ordering shared by the engine and the board rather than two that agree by luck.

- **REQ-TRACE-290** — Filtering SHALL offer exactly six dimensions: free text, epic, source, lifecycle, health and priority. A filter is active when any dimension is non-empty.
  - Free text SHALL match case-insensitively as a **substring** of either the identifier or the title.
  - The epic dimension SHALL match either a card's epic fact **or**, for an epic card, its own identifier.
  - Source, lifecycle, health and priority SHALL match by **exact** equality against the card's displayed value.

- **REQ-TRACE-291** — The active filter SHALL be described in a fixed part order — text, epic, source, lifecycle, health, priority — and SHALL emit a clearly distinguishable statement when no dimension is set, so that a board narrowed by a filter can never be read as a board with nothing on it.

- **REQ-TRACE-292** — Sorting, filtering and grouping SHALL be **display-only**: they change no delivery state, no scheduling order, and they write nothing. An active filter SHALL be visible and clearable in one action, and a filter matching nothing SHALL say so and offer to clear itself.

- **REQ-TRACE-293** — Six grouping axes SHALL be offered: `delivery` (the default), `health`, `lifecycle`, `epic`, `priority`, `source`. On every one of them the board SHALL emit a column for each distinct value and put that column's count in its header, in the same manner as the delivery axis.

- **REQ-TRACE-294** — The **set of columns SHALL be supplied by the projection** and SHALL never be read from a duplicate table maintained inside the presentation layer, which makes it impossible for an axis to contradict the values printed on the cards. Changing the axis SHALL redistribute the existing cards; it SHALL NOT re-query the engine and SHALL NOT write anything.

- **REQ-TRACE-295** — Closed axes SHALL emit **every** value, populated or not. Open axes — those whose values the project invents, namely epic and source — SHALL emit only the values the project actually has, sorted by identifier ordering, with an **unset** bucket appended **last** and only when something needs it. A requirement with no value for the chosen axis SHALL land in that stated column rather than disappearing.

- **REQ-TRACE-296** — Axis value derivation per card SHALL be: delivery axis, the card's delivery state; health axis, its health; lifecycle axis, its lifecycle; priority axis, its priority fact case-folded or a literal "none" when absent; source axis, its source fact; epic axis, the card's own identifier when it is an epic, else its epic fact. Each derived value SHALL be assertably equal to the value the engine computes for that card on the same axis over the same projection, so that no axis change can place a card in a column the engine would not have chosen. It follows — and SHALL be stated as intended behaviour rather than left as a consequence of the rule — that on the epic axis an epic card lands in the column named by its **own** identifier, alongside its own children.

- **REQ-TRACE-297** — **Drag-and-drop SHALL remain a delivery-state action.** On any non-delivery axis a card SHALL NOT be draggable between columns, and the refusal SHALL be **stated rather than silent**. The keyboard move control SHALL keep working on every axis, since it targets delivery states directly. The axis definition SHALL carry a draggable flag encoding this, because dragging into a column of a non-draggable axis would promise a write that cannot happen.

- **REQ-TRACE-298** — The blocked value SHALL keep a **pinned column on the delivery axis** and SHALL be an ordinary value elsewhere.

- **REQ-TRACE-299** — Filters and sort order SHALL compose with every axis unchanged. That composition SHALL hold in the degenerate case too: switching the grouping axis to a dimension a filter is already narrowing SHALL **preserve** the filter rather than clearing it, so that the board shows the one populated column that filtered value produces, together with whatever empty columns the axis rules of REQ-TRACE-295 require, and the filter summary SHALL continue to state that a filter is in force. Changing the axis writes nothing and SHALL NEVER alter a filter.

- **REQ-TRACE-300** — Grouping axes whose values the project supplies SHALL stay usable at the column counts a real store produces: over a store of roughly 1500 requirements the epic axis yields on the order of several dozen populated columns, while a closed axis can yield no more than its own vocabulary. The board SHALL therefore remain scrollable, foldable and keyboard-operable with several dozen populated columns on screen. The supported bound SHALL be **100** populated columns: up to that number every guarantee stated in this document holds unchanged. Beyond it the board SHALL still render correctly and remain operable, but no responsiveness budget SHALL be claimed, and the board SHALL NEVER truncate, hide or refuse a column on account of how many there are.

- **REQ-TRACE-301** — Persistence scope SHALL be split deliberately: filter, sort order, grouping axis and the blocked-column display setting are **global** (a property of the person); **column folds are per workspace** (a property of the project); permission and wait preferences are a property of this installation and MUST NOT be written into repository-carried configuration.

- **REQ-TRACE-302** — Where the stored sort order or grouping axis names something this build no longer offers, the board SHALL revert to the default for that setting instead of attempting to group by a value it has no renderer for.

### Collapsible Columns

- **REQ-TRACE-303** — A column holding no cards SHALL be **folded**, meaning it collapses to a narrow rail that still bears the column's heading and its count. Folding SHALL additionally be available as a deliberate user choice for any column, on **every** grouping axis, the delivery axis included.

- **REQ-TRACE-304** — Fold precedence SHALL be, in order:
  1. **An explicit user decision takes priority over the emptiness rule**, whichever way it points, and stands until that user revises it: a column folded by hand remains folded even after cards arrive in it, and a column unfolded by hand remains unfolded even while it holds nothing.
  2. Failing that, a column SHALL be folded **for precisely as long as it holds nothing**, and this condition SHALL be re-evaluated at **every** board update. Invariant: no card may land in a column that remains collapsed.
  3. **First-run exception**: where no card has yet moved out of the pipeline-entry columns — the first column together with the blocked condition, being where a requirement sits before anything at all has been done with it — the board SHALL open showing the pipeline **in full** rather than collapsing every downstream column to a rail. As soon as one card enters the pipeline proper, rule 2 takes over again. A deliberate fold by the user outranks this exception as well.

- **REQ-TRACE-305** — The rationale to be preserved: automatic folding pays for itself only when the distribution of cards is genuinely uneven. A board on which no column holds anything is not uneven — it is a project that has not begun — and the shape of a pipeline nobody has started is precisely what a first-time reader needs to be able to see.

- **REQ-TRACE-306** — The fold decision SHALL be a pure function of the column model and a flag controlling whether emptiness folds: a recorded user decision returns that decision; otherwise the column is folded when the flag is set and the column holds nothing.

- **REQ-TRACE-307** — Clicking a column's **heading** SHALL fold it and clicking the folded **rail** SHALL unfold it. There SHALL be **no separate control** and **no gesture only a mouse can make**. Neither action SHALL write a delivery record. Unfolding SHALL realise the column's visible band (REQ-TRACE-358) **within the same update that unfolds it**, never deferred to a later repaint, so that an expanded column is never observable empty or half-painted; folding SHALL release that column's card widgets in the same update, since a folded column holds none (REQ-TRACE-311).

- **REQ-TRACE-308** — A folded rail SHALL display the **heading and count that the open column would show**, and, where the column is empty, the very same sentence describing what belongs in it — carried on the rail's tooltip and on its accessible description. What folding removes is the cards, never the information.

- **REQ-TRACE-309** — Text on a folded rail SHALL be painted **upright and never rotated**. A heading too long for the rail SHALL wrap onto at most **2** lines and then elide, and the complete untruncated text SHALL remain available through both the rail's tooltip and its accessible name.

- **REQ-TRACE-310** — Rail width SHALL be measured in **average characters of the rail's own font** — **8** of them, that being the width at which the longest of the ordinary delivery labels still fits on a single line — rather than in points, so that raising the display scale or applying a screen magnifier enlarges the rail in step with the text inside it. A folded column's margin SHALL be **4** points, against an open column's margins of **10** on every side, because an open column's margin would be most of a rail's width.

- **REQ-TRACE-311** — A folded column SHALL hold **no realised card widget**. Folding a board the size of a whole store SHALL therefore cost strictly less than rendering that board open.

- **REQ-TRACE-312** — Folds SHALL be remembered **per workspace**, keyed by the workspace's resolved absolute path with a literal fallback key when the board has no workspace. A fold recorded in one workspace SHALL NOT reach another.

- **REQ-TRACE-313** — The persisted fold value SHALL be a **single JSON object string** whose sorted keys map a column key to a boolean. Storing one settings entry per column is not viable: the settings backend reads a path separator as a nesting delimiter, and a column key on the epic or source axis is an arbitrary project-supplied string that may contain one. Because the value is written whole, concurrent writers SHALL be resolved by **last writer wins**, with no merge, no locking and no reconciliation: a reader SHALL always observe one window's complete set of decisions and never a blend of two. Two windows open on one workspace are therefore expected to overwrite one another's fold decisions, which costs a fold and can never corrupt the stored value.

- **REQ-TRACE-314** — **Only the user's decisions SHALL be stored**, never the resulting fold set — that is what lets both rules coexist.

- **REQ-TRACE-315** — Reading stored fold state SHALL never raise. A stored value that cannot be parsed, or that is not an object, SHALL yield **no folds at all**; a member whose value is not a boolean SHALL be dropped on its own while the rest are kept. A board whose stored value came from a later build SHALL therefore open under the emptiness rule rather than fail to draw.

- **REQ-TRACE-316** — The stored fold set SHALL be **pruned** to the columns the board still has, so a workspace does not accumulate a dead entry per epic or source anybody ever renamed. Pruning SHALL be confined to columns whose keys are **project-supplied** — those of the epic and source axes — since that is the only place entries accumulate without bound. A decision recorded against a column of a **closed** vocabulary SHALL be retained even while that column is absent from the board, so that a column withdrawn by a display preference — the blocked column, whose presence the blocked-column setting governs, being the concrete case — comes back carrying the decision the user last made about it.

- **REQ-TRACE-317** — While a dragged card **hovers** a folded column, that column SHALL open, exposing both the drop target itself and the statement of whether it can be reached and why. It SHALL return to its folded form once the drag finishes.

- **REQ-TRACE-318** — From the moment a card is lifted out of its column, **every** rail on the board — not merely the one beneath the pointer — SHALL state its own answer **using the engine's wording unaltered**, and SHALL claim enough width to display that wording for the duration of the drag. A glyph on its own refuses without giving a reason, and putting the reason in a tooltip would confine it to users with a pointer or a screen reader. For the duration of a drag each rail SHALL grow by **1.5** lines of height and SHALL expand to the minimum width of an open column; when the drag finishes the borrowed width SHALL be surrendered **in full**. That widening SHALL NOT be animated: it SHALL take effect in the update that begins the drag and be surrendered in the update that ends it, so the reason is legible for the whole of the drag rather than arriving part-way through it.

- **REQ-TRACE-319** — A folded rail SHALL paint a first-line glyph distinguishing three situations: idle; drag in progress with this column reachable; drag in progress with this column refused. A visible hint label SHALL carry the **full sentence** alongside; the glyph SHALL NOT be allowed to stand alone. On drag cancellation the glyph SHALL return to idle and the rail's accessible description SHALL return to the empty-column sentence.

- **REQ-TRACE-320** — The column heading SHALL be a control whose accessible name states the label, the count and the fold action; the folded rail's accessible name SHALL state the unfold action and name the column. The rail SHALL take keyboard focus and unfold from the keyboard. Folding a column that contains the focused widget SHALL move focus to the rail: focus left inside a folded column is a defect.

- **REQ-TRACE-321** — Acceptance: on any axis, once at least one card has moved beyond the pipeline-entry columns, a board whose middle columns hold nothing SHALL open with exactly those columns folded and the remainder open; a folded column receiving its **first card SHALL be open by the next board update**, except where the user folded it deliberately; at the minimum window size the board SHALL stay usable with no rail text clipped; and reopening a workspace SHALL restore the fold state the user left there, while a different workspace SHALL open with whatever fold state was left in it.

### Relationship Graph

- **REQ-TRACE-322** — The board SHALL offer a **graph presentation** centred on one requirement and covering what surrounds it: its relations to other requirements, its implementation sites and its covering tests. **Every node SHALL display its own health**, and the whole graph SHALL be drawn from the projection and nothing else. The rationale to be preserved: during impact analysis, during an audit and on any large or inherited codebase, the question being asked is what depends on this requirement, not which column it currently occupies.

- **REQ-TRACE-323** — Node depth SHALL be **bounded and the bound stated**, never silently truncated. The depth SHALL be clamped to a floor of **1** and a ceiling of **3**, with a default of **2**. The depth control SHALL have that range and initial value, an accessible name naming it as the graph depth, and an accessible description stating how many relation steps around the centre are shown and the maximum. The depth selection SHALL **not** be persisted: the graph SHALL open at the default depth every time it is opened, depth being a property of the question being asked at that moment rather than of the person, and the persisted display settings of REQ-TRACE-301 SHALL NOT be extended to cover it.

- **REQ-TRACE-324** — The bound SHALL be stated in one of two forms: when nothing is left unexpanded, that the current depth of the maximum has everything in view fully expanded; otherwise, the current depth of the maximum followed by the identifiers whose relations are not expanded here and an instruction to select one to re-centre on it. That list SHALL name at most **four** identifiers before an "and N more" tail.

- **REQ-TRACE-325** — The unexpanded set SHALL be computed as: nodes at exactly the bound depth, resolved, that have relations, at least one of whose targets is not already in the node set.

- **REQ-TRACE-326** — Four node kinds SHALL exist: requirement, epic, implementation and test. A node SHALL be **navigable** — selecting it re-centres the graph — only when its kind is requirement or epic **and** it is resolved. A node SHALL carry its identifier, kind, label, depth, health label, state label, whether it is resolved, and, for evidence nodes, its path and line.

- **REQ-TRACE-327** — The graph SHALL be **navigable**: selecting a node re-centres on it and **restates what is now in view** — a summary naming the centre and the counts of requirements (requirement and epic nodes summed), implementations and tests, plus the current depth.

- **REQ-TRACE-328** — The graph SHALL be reachable and operable by keyboard, with node controls as focusable elements laid out in depth columns, and SHALL carry a **textual alternative** listing exactly the same edges in the same order the columns show them, stated as such in the list's accessible description. Node sentences SHALL name the label, mark an unresolved node as unresolved, and append the health label, falling back to the state label. Edge sentences SHALL read as source, relation, target.

- **REQ-TRACE-329** — The centre's relations SHALL come from its **detail** — the projection's complete answer for one requirement, dangling edges included. Deeper levels SHALL use the epic relation the board's own cards carry — the parent epic fact, plus children found among cards whose epic fact names this identifier — which is exact but narrow. **Nothing SHALL be inferred from a truncated summary.**

- **REQ-TRACE-330** — A relation target with no card SHALL be rendered as an unresolved node whose label is the bare identifier and whose health label states that it is not in this requirement store. It SHALL be **shown, not hidden**.

- **REQ-TRACE-331** — Implementation and test nodes SHALL be attached **only at depth 1**, **only for the centre**, and **only when a detail is present**. A node identifier SHALL be composed of the site kind and its address; the edge's relation label SHALL be the site's own label.

- **REQ-TRACE-332** — Traversal SHALL be breadth-first from the centre, one level per iteration up to the bound, with **first-seen depth winning** (a node already placed is not re-added at a deeper level), duplicate edges suppressed, and the walk stopping early when a level reaches nothing new.

- **REQ-TRACE-333** — The graph surface SHALL carry accessible names for the graph itself, for the contents summary, for the statement of the depth bound, for the node area and for the edge list, together with a control back to the board that names the board as its destination. No graph content and no contents summary SHALL be presented before a centre has been chosen, a change of theme included.

- **REQ-TRACE-505** — The graph SHALL be bounded by **node count** as well as by depth, and that bound SHALL be stated rather than silently applied. At most **50** neighbours SHALL be admitted for any one node at any one level, taken in the identifier order of REQ-TRACE-289 so the selection is deterministic and identical on every read of an unchanged project. A node whose neighbours were cut off in this way SHALL be reported among the unexpanded set of REQ-TRACE-324, and the statement of the bound SHALL additionally say how many neighbours were left out and that re-centring on that node brings them into view. Evidence nodes (REQ-TRACE-331) SHALL be admitted under the same per-node bound, implementation sites and covering tests each taken in path-then-line order.
