# Architecture proposals — UI slice — 3. ADR proposals

Part 4 of 10 of [the ui proposal](../ui.md), which indexes every part.

## 3. ADR proposals

Numbering is local to this slice; the synthesis step assigns final numbers.

### ADR-UI-01 — Where authoritative UI state lives, and how the renderer stays in step

**Decision.** Which process owns the state the interface renders, and by what mechanism a renderer
converges on it while a run executes elsewhere.

**Constraints that bear on it.** S1–S13 (the whole sync contract), T2 (the notice store belongs to
the process, not a window), T3 (the prompt queue is shared across windows and runs), T4 (two main
windows coexist during a workspace switch), T5–T6 (auxiliary windows show the same data and must do
zero work while hidden), R2 (rows are released to and paged back from the session record), B3
(the apply stage's counters must be identical across fresh processes).

**Alternative A — renderer-authoritative store.** Each renderer owns a Zustand store that is the
source of truth for what it draws; the main process forwards raw events and the renderer folds them
in.

*For:* the simplest React data flow; no serialisation on the read path; selectors are cheap.
*Against:* it breaks T2 outright — the notice store must survive window re-creation within one
process, and a renderer-owned store dies with its window. It breaks T4 — during a workspace switch
two renderers would independently fold the same events. It makes S3 (persist before publish)
unenforceable from the renderer's side, and S9's "decline and re-read from a whole read" becomes a
renderer-initiated file read, which conflicts with R2's requirement that paging happen off the
interface thread against the session record. Every auxiliary window would fold events independently,
so X4's "identical visible cells at the same time" becomes a race rather than a guarantee.

**Alternative B — main-process authoritative projection; renderers hold a derived replica.** The
main process holds one *session view model* per followed session, built only from what has already
been persisted (S3). It publishes on the two channels S1 fixes. Each renderer holds a replica store
whose only writers are the two channel handlers and purely local UI state (scroll anchor, expansion
map, composer text, search query, drawer open state).

*For:* T2 and T3 fall out — the notice store and the queue live beside the projection, in the
process, and every window observes them. S3 is enforced structurally: the projection has no path to
a value that is not yet durable. S11 is a single-writer concern rather than a distributed one. T4
works because two renderers subscribe to two different session view models from the same owner.
S10 is enforceable: the publisher never awaits a renderer.
*Against:* every update crosses a process boundary and is serialised, which costs against S6/S7;
duplicated state in N renderers costs memory; the replica can drift if a channel handler has a bug,
which is exactly why S9's decline-and-re-read path is mandatory rather than optional.

**Alternative C — renderers read the persisted session record directly.** No push; each renderer
polls and reads `state/ui_transcript.json` and friends itself.

*For:* one source of truth, no replica drift, paging (R2) is a local read.
*Against:* fails S5 — "published immediately, no delay floor of any size" cannot be met by polling,
and the 750 ms/2000 ms cadences of S8 are explicitly described as a *correctness backstop* for a
local run, not the delivery path. Fails S7's "a session with nothing happening does no work at all".
Puts file I/O on the interface thread or forces a second worker per window. Multiplies read
amplification by the number of open windows.

**Recommendation: Alternative B.** The specification's own shape — two channels, earliest-changed
index, persist-before-publish, whole-session snapshot carrying every displayable field, a view that
may *decline* an increment — describes a publisher/replica pair with a re-read escape hatch. That is
alternative B almost verbatim.

Specifics of the recommendation:

- **One projection owner per followed session**, living in the main process next to the notice store
  and the prompt-queue service. It is the only thing that reads the session record for display.
- **Renderer store is Zustand**, but with a discipline: the two channel handlers are the only
  writers of run-derived state, and they write through a single `applyIncrement` /
  `applySnapshot` pair (see ADR-UI-04). Local-only UI state lives in separate slices so it can
  survive a `reset` without being republished. Zustand is a good fit here — it is a plain store with
  cheap selector subscriptions and no context re-render fan-out — but nothing in the specification
  requires it; any store with equality-checked selectors would do.
- **Renderers never read a session file.** Paging older rows (R2) is a request to the owner, which
  serves it from the live window or the archive and returns a span; "off the interface thread"
  is satisfied because the read happens in another process entirely.
- **Hidden windows unsubscribe.** T6 requires zero repaints *and* zero timers while off screen. A
  hidden renderer tells the owner it is not observing; on becoming visible it requests a whole
  snapshot and applies it before its first paint. This also gives the persona window's "closing
  hides rather than destroys" (T5) its meaning: the window and its DOM survive, its subscription
  does not.

**Consequences accepted.** Serialisation cost on every update, which ADR-UI-02 must budget for.
Replica drift is possible in principle, so the decline-and-re-read path is load-bearing and must be
exercised by tests rather than treated as an error branch. The main process becomes a place where a
slow projection can stall every window, so the projection must never do unbounded work synchronously.

**Revisit if.** The measured cost of crossing the process boundary threatens S6's 100 ms figure for
the run surfaces of REQ-ORCH-155; or the orchestration slice puts run execution in a third process
in a way that makes the main process a pure relay, at which point a direct runtime→renderer channel
may be cheaper (it would still have to preserve T2, T3 and S3).

**Open question.** REQ-CHAT-041 scopes the prompt queue's visibility to windows and runs "sharing
the same process", while the candidate stack proposes a separate runtime process for run execution.
If the orchestration slice takes that route, REQ-CHAT-038's atomic `QUEUED → TRIGGERED` transition
becomes a cross-process exactly-once problem. This is not mine to decide, but it must be decided
before ADR-UI-02's channel list is fixed.

---

### ADR-UI-02 — The IPC contract between the renderer and the rest of the system

**Decision.** What crosses the renderer/main boundary, in what shape, over what mechanism, and how
it is versioned and secured.

**Constraints that bear on it.** S1–S13; T1 (no second executable, so no external socket surface is
expected); T5 (several renderers observing overlapping data); S6 (100 ms and 250 ms p95 budgets);
S7 (2× cost ceiling at 10,000 rows); B4/B5 (the same path must work in an offscreen child process);
D3 (nothing crossing the boundary may end up in a diagnostics file as session content).

**Alternative A — one generic bidirectional event bus.** A single `ipcRenderer.on('event')` channel
carrying tagged messages, with a matching generic `invoke('command', …)`.

*For:* trivial to extend; one place to instrument; easy to record and replay for the benchmark.
*Against:* it puts the two channels S1 distinguishes into one lane, and S5 explicitly gives them
different timing rules (immediate for unseen rows, 50 ms trailing coalesce for growth). A single lane
means a whole-session snapshot can head-of-line-block an unseen transcript row. It also erases the
type boundary: S2 requires the snapshot to carry *every* displayable field, which is a property you
can only test if the payload has a declared shape.

**Alternative B — a small number of named, typed channels with a declared payload contract.**
Distinct channels for: transcript increment, whole-session snapshot, terminal stream frames, notice
publication/clearing, and a request/response surface for commands. Payload types are declared once in
a shared package and are the same types the projection produces and the replica consumes.

*For:* matches S1's two-channel shape and lets S5's two timing rules live in two different senders.
Terminal frames (X5, up to 250 ms repaint cadence and high volume) get their own lane so they cannot
delay a transcript row. Makes S2 checkable: "the snapshot type has a field for every field a view
component reads" is a compile-time property if the view components are typed against the same model.
*Against:* more surface to keep in step; a channel added carelessly re-creates alternative A's
problem one channel at a time.

**Alternative C — a shared read replica in the renderer backed by the database.** The renderer opens
the SQLite file read-only and subscribes to change notifications.

*For:* no serialisation of bulk state; the renderer can page rows itself.
*Against:* requires Node integration in the renderer, which forfeits the process isolation that makes
`contextIsolation` meaningful; two writers/readers of one SQLite file across processes brings locking
into the interface thread; and it still cannot satisfy S5's immediate publication without a push
channel on top, so it is alternative B plus a second mechanism rather than instead of it.

**Recommendation: Alternative B**, with these specifics.

- **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`** in every renderer. A
  preload script exposes exactly one frozen namespace built from an explicit method list. This is not
  a security posture chosen for its own sake: the transcript renders Markdown authored by a model
  (R11), and the terminal grid renders bytes authored by an arbitrary process (X1).
- **Five channels**, each with a declared payload type:
  1. `transcript:increment` — `{ sessionId, fromIndex, rows[], diffs[], personas[] }` (S1, S4).
  2. `session:snapshot` — the whole-session update of S1/S2, bounded collections in full.
  3. `terminal:frames` — `{ streamId, seq, kind: 'data' | 'meta', … }` (X5).
  4. `notice:current` — the single current notice or null (N2), plus the acknowledgement stream.
  5. `command` — request/response, every command returning an explicit outcome value rather than
     throwing across the boundary (N5 needs a headline and a detail block, which is a value, not an
     exception).
- **Every payload carries the `sessionId` it belongs to** and the renderer discards any payload whose
  session is not the one it is currently showing (S11). This is cheap and it makes the focus-change
  race structurally impossible rather than timing-dependent.
- **Structured clone, not JSON strings.** Electron's IPC uses the structured clone algorithm;
  hand-serialising to JSON adds a parse on both sides for no benefit. Rows should be plain objects
  with no class instances, no `Map`/`Set` in hot payloads (they clone, but more expensively), and no
  functions.
- **The increment is bounded by construction.** S4 says an increment carries rows from
  `fromIndex` onward. For an append that is one row. The sender must never publish `fromIndex = 0`
  for anything but a genuine reset (S4/REQ-MONITOR-229), because doing so silently converts every
  update into a whole-transcript transfer and breaks S7's 2× ceiling at 10,000 rows. This deserves an
  assertion in the sender and a counter in diagnostics.
- **Versioning.** The payload contract carries a schema version. A renderer receiving a version it
  does not understand declines every increment and re-reads (S9) rather than guessing. This matters
  because the benchmark launches a child process of the same build, so the versions always agree
  there — the check exists for the case where a stale renderer survives an in-place update.

**Consequences accepted.** Five channels is five things to keep in step; the payload types become a
shared package that both the main-process projection and the renderer depend on, which is a coupling
we are choosing deliberately so that S2 is checkable. Sandboxed renderers cannot read files, so every
file-touching capability the UI needs (attachment thumbnails per R16, the third-party licence bundle,
the diagnostics directory) must be routed through an explicit command with a path-validating handler.

**Revisit if.** Measurement shows structured-clone cost dominating the 250 ms p95 for large snapshots
— in which case the snapshot should be split by collection rather than the boundary being removed;
or if a fourth window type appears whose data is disjoint enough to want its own lane.

**Open question (design).** The channel list above is derived from the sync requirements, not from
the information architecture. If the approved design reference introduces a surface fed by data no
current requirement names, the snapshot type must grow rather than a sixth channel appearing —
S2 makes the snapshot the single carrier for non-transcript state.

---

### ADR-UI-03 — What paints the transcript

**Decision.** The rendering substrate for the transcript list: what a row is made of, how rows are
virtualised, and how the structural-count invariant of the benchmark is satisfied.

**This is the decision in my slice with the tightest constraint, and the one most likely to be got
wrong by defaulting to the obvious React answer.**

**Constraints that bear on it.** R1 (cost by visible and changed rows only), R2 (bounded residency
with paging), R3 (measurement and rendering caches with LRU and a precise reuse key), R6 (anchor-based
scroll restoration), R8 (fixed pixel metrics), R11 (Markdown, synchronous, character-exact pointer
selection over rendered bodies), R12 (full keyboard navigation, accessible names, hover styling),
**B1 (the live paintable element count must not change after `construct_window`)**, B4 (the same
rendering path under replay as live), B7/B8 (10 ms lag probe; an observable "finished showing"
signal), B9 (memory tripwire).

**The problem B1 creates.** A conventional keyed React list mounts and unmounts DOM elements as rows
enter and leave the window and as content changes. Under the benchmark's seven phases the transcript
is bulk-applied, cleared and re-appended event by event, streamed prefix by prefix, tail-replaced
1000 times, re-applied unchanged, and resized five times. Every one of those changes the number of
mounted elements. `widgets_stable_after_warmup` would be false for every iteration, and — more
seriously — REQ-UIBENCH-054 states the rule in MUST form: after the `construct_window` record is
taken, "the `widgets` value must not change". The invariant boolean is informational
(REQ-UIBENCH-088), but the rule it reports is not. A design that cannot hold the count steady does
not satisfy REQ-UIBENCH-054, whatever the report says.

**Alternative A — keyed React list with a standard virtualiser (react-window, TanStack Virtual).**

*For:* idiomatic; variable row heights are a solved problem; accessibility, selection and links come
free from the DOM; R11's character-exact selection over Markdown is native browser behaviour;
R12's keyboard navigation is ordinary focus management.
*Against:* fails B1. Rendered element count tracks visible row count and each row's internal content,
both of which change constantly. It also sits awkwardly with R3: React owns element identity, so "a
retained rendering is reused only while identity, content, laid-out width and expansion state are
unchanged" becomes a memoisation convention rather than an enforced cache with an observable
entries/chars occupancy (R4).

**Alternative B — canvas-painted transcript.** One canvas element per transcript, rows measured and
painted by our own code, with a retained-rendering cache of offscreen bitmaps.

*For:* B1 becomes trivial — one element, forever. R3, R4 and R8 map directly onto a measurement cache
and a painted-tile cache with real occupancy figures. Paint cost is exactly "visible rows", satisfying
R1 by construction. It is the closest analogue to what the specification's own vocabulary describes
("retained row measurements and retained row renderings", "re-measuring only it", "redrawn on every
repaint").
*Against:* it forfeits the DOM's accessibility and selection, and both are hard requirements. R11
demands pointer selection of exactly the characters covered, in every row category including rendered
Markdown; R12 demands keyboard navigation and per-row accessible names; A3 and A4 demand accessible
descriptions everywhere; REQ-CHAT-060 and REQ-CHAT-065 demand accessible descriptions on tool rows
and group headers. Meeting those over a canvas means building and maintaining a parallel
accessibility tree and a text-selection model by hand — a large, permanently load-bearing subsystem
whose failure mode is "a screen-reader user cannot read the conversation". That is too much risk to
take for a benchmark counter.

**Alternative C — a fixed-capacity recycled DOM row pool.** The transcript is a scroll container
holding a **constant** number of absolutely positioned row slots, allocated at window construction and
never added to or removed from. Scrolling and content changes rebind slots to row indices and mutate
their contents in place; a slot showing nothing is emptied rather than unmounted. Row *content* is
produced by a per-slot renderer that reuses a cached rendering when R3's four-part key matches.

*For:* B1 holds if the pool is fixed and content mutation does not change the element count within a
slot. Rows are DOM, so R11's selection, R12's keyboard navigation and accessibility, A4's tooltips
and descriptions, and A7's vector icons all remain native. R1 holds — work is proportional to visible
slots and changed slots. R6's anchor restoration is natural because slots are positioned from a
measured offset table rather than from document flow. R3's caches are explicit objects with real
occupancy, satisfying R4.
*Against:* it is a recycler, not a React list — the slot index must be the React key, never the row
identity, or React unmounts and remounts. Content mutation within a slot must also be count-stable,
which is the hard part: a Markdown body produces a different number of elements for different
content. Variable row heights need our own measurement pass. It is more code than alternative A, and
it is code that must be right.

**Recommendation: Alternative C, with the content-count problem solved explicitly.**

The pool gives B1's *outer* stability. The remaining question is what "live visual elements" means
inside a row. REQ-UIBENCH-050 is explicit that both structural counts are "defined against the
interface framework the product is built on", that their absolute values are comparable only between
two runs of one product revision, and that they are "deliberately not comparable between product
revisions or between implementations". That is licence to *define* the counting rule for a
DOM-based interface — but the definition must stay honest against the words "live visual elements of
the constructed window — those that occupy space in the window's layout and can be painted".

The honest and satisfiable definition:

- **`widgets`** = the count of live **structural elements the application's own layout owns**: the
  seven views' panes, the navigation rail, title bar, status strip, the fixed transcript slot pool,
  the fixed list-slot pools of the agents, todo, artifact and board surfaces, the composer and its
  chips. Every one of these is allocated at window construction and is count-stable thereafter. Each
  occupies space in the layout and can be painted, so the definition is met.
- **Content nodes inside a slot** — the spans, code blocks and links a Markdown body produces — are
  counted in `ui_objects`, which is explicitly informational and unbounded (B2). This is where the
  variance goes, and REQ-UIBENCH-109 has already said that no invariant reads it and no value it
  takes changes any outcome.

This split is what makes B1 achievable for a DOM interface without misreporting. It should be written
down once as the product's definition of both counters and cited from the benchmark's own code, so a
later reader does not conclude the counter was gamed.

Further specifics:

- **Pool size is a function of viewport height and the 30 px minimum row height of R8, fixed at
  construction and re-derived only during `construct_window`.** The resize sweep of the seventh phase
  moves between 1000×680, 1440×900 and 1180×760, so the pool must be sized at construction for the
  largest viewport the window can reach without growing. That is a design obligation, not an
  optimisation.
- **Every other list surface with unbounded content uses the same recycler** — agent tree, todo strip,
  artifact list, requirements board columns — because `apply_fixture` populates all of them *after*
  the `construct_window` record is taken.
- **Row heights are measured, not assumed.** A measurement cache keyed by (row identity, content,
  laid-out width, expansion state) — exactly R3's key — feeds a prefix-sum offset table, which is what
  makes R6's anchor restoration and R14's scroll-to-centre exact rather than approximate.
- **The "finished showing" signal B8 needs** is a paint-completion promise: after applying a state,
  resolve once layout has settled and a frame has been presented. This must be a first-class part of
  the apply pipeline rather than benchmark-only code, because B4 forbids a benchmark-specific
  rendering path. It is also what the 30 s settle bound of REQ-UIBENCH-119 is measured against.

**Consequences accepted.** We write and own a virtualiser rather than adopting one. The transcript
becomes the most intricate component in the product and needs its own test suite covering R1, R3, R5,
R6, R7 and B1. Contributors must know the transcript is a recycler and that ordinary React list
idioms are wrong inside it. The `widgets`/`ui_objects` split becomes a documented product definition.

**Revisit if.** A measured DOM recycler cannot hold R1's 200 ms budget at 1000+ rows with Markdown
bodies, in which case alternative B returns — but only together with a costed plan for the
accessibility tree, because R11, R12, A3 and A4 do not bend.

**Escalation.** None. This is a build-mechanism choice, invisible to the user except through the
performance and accessibility behaviour the specification already fixes.

---

### ADR-UI-04 — The transcript apply pipeline, and where determinism is enforced

**Decision.** How an incoming transcript state becomes what is on screen: who diffs, who decides an
increment is inapplicable, and where the six operation counters come from.

**Constraints that bear on it.** S4, S5, S9 (decline and re-read), S12 (trailer rows computed, not
recorded), R5 (expansion keyed by identity), R6 (anchor), R7 (follow state), R13 (folding), R14
(search over displayed rows), **B3 (six cumulative counters, classified by comparing incoming state
with displayed state, identical across fresh processes)**, B10 (only structural values must be
reproducible).

**Alternative A — let React's reconciler be the apply stage.** Push the new row array into the store
and let React work out what changed; derive the counters from render callbacks.

*For:* no second diff to write.
*Against:* B3 requires counters classified against *the state currently displayed*, with a distinction
between `refused` (a valid-shaped application the view declined) and `noop` (an accepted application
that changed nothing) that React has no notion of. It also requires the totals to be a pure function
of the sequence of states applied — React's scheduling is not something to hang a determinism claim
on. And S9's "decline the increment" is a decision that must be made *before* anything is applied,
which is upstream of any reconciler.

**Alternative B — an explicit, synchronous view-model stage in front of the renderer.** Incoming
state (increment or snapshot) enters a pure function together with the currently displayed view
model; it returns either a refusal, or a new view model plus a classified operation list. The
renderer then renders the new view model.

*For:* B3's counters are the natural output of that function. S9's decline is its first branch.
R13's folding, S12's trailer-row appending, R10's cap application and R14's search index all belong
in the same stage — they are all "what the displayed rows are", as distinct from "what the session
record holds". Being pure and synchronous makes it directly unit-testable and makes B3's
cross-process identity a property of the function rather than of the environment.
*Against:* a second model to keep in step with the session record; a class of bug where the view model
and the record disagree, which is precisely what S9's re-read exists to correct.

**Recommendation: Alternative B.** The pipeline, in order, on receipt of a transcript increment:

1. **Applicability check.** Is `fromIndex` within the rows this view holds, and does the increment
   preserve the order of rows already displayed? If not → classify `refused`, do nothing else, and
   request a whole read (S9). Refusal is an ordinary reported outcome and must not interrupt the user
   or blank the transcript (REQ-CHAT-052).
2. **Reset check.** `fromIndex = 0` on a shrunk transcript, or a snapshot after a session focus change
   → classify `reset`, discard the displayed rows, rebuild (S4, S11, REQ-MONITOR-229).
3. **Row-level classification.** Otherwise compare incoming with displayed from `fromIndex`: one
   `insert` per row added, one `remove` per row removed, one `update` per retained row whose content
   changed; if nothing changed at all, one `noop` and no row counters (B3's exact rule).
4. **Projection.** Apply the row-role → display-kind mapping (R9), duplicate-reasoning and
   dead-session hygiene (REQ-CHAT-048, REQ-CHAT-049), edit-diff row placement (REQ-CHAT-050), tool
   grouping (R13), display caps (R10), and finally append the computed trailer rows (S12).
5. **Present.** Hand the new displayed-row array to the recycler of ADR-UI-03 together with the
   preserved anchor (R6) and expansion map (R5), and resolve the paint-completion promise (B8).

Notes that follow from the constraints and are easy to get wrong:

- **The counters are cumulative for the life of the process and never reset between phases** (B3).
  They belong to the view-model stage, not to a component instance, and must survive a `reset`.
- **`refused` and `noop` both leave the view unchanged; only the reason differs.** The classification
  must be taken from the applicability decision, not from whether pixels changed.
- **Grouping is on by default and must apply increments correctly** by treating a row that cannot join
  a group as a group boundary; the agent-scoped filter is off by default and is allowed to decline
  (REQ-MONITOR-224). Both live in step 4, so both are covered by the same refusal path.
- **The search index is derived from displayed rows** (R14), which means it is invalidated by step 4
  and not by step 3 — a change that only alters a cap or a grouping setting still invalidates it.
- **Determinism has a concrete threat: iteration order.** Any use of object key order, `Set`/`Map`
  insertion order derived from asynchronous arrival, or a hash seeded per process would make B3's
  cross-process identity fail. The stage must sort by explicit keys wherever order matters and must
  not use randomness, wall-clock time, or locale-sensitive comparison (`localeCompare`) anywhere in
  its output path. `LANG=C`/`LC_ALL=C` in the benchmark environment (B5) will surface a locale
  dependency as a difference rather than hiding it, which is useful, but the code should not have one.

**Consequences accepted.** A view model distinct from the session record, with the drift risk that
implies; a decline path that must be tested deliberately, since in normal operation it never fires;
and a rule that no transformation with an environment-dependent result may live between the incoming
state and the presented rows.

**Revisit if.** The projection stage becomes the dominant cost in S6's 250 ms p95 at large session
sizes — in which case the fix is incrementalising step 4 (projecting only from `fromIndex`), not
removing the stage.

---
