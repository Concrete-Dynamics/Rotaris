# ADR-0045 — What paints the transcript: a fixed-capacity recycled row pool

- **Status:** proposed — **no longer blocked.** `owner-decisions.md` **ESC-13** is ruled, and the
  `renderer-invariance-and-benchmark-cadence` spike measured everything this record said it could not
  yet demonstrate.
- **Date:** 2026-08-31
- **Revised:** 2026-09-01. **Two things changed and both are of the kind worth naming.** A **ruling**
  removed OQ-28's power to withdraw this record: ESC-13 decides that if OQ-28 resolves to the
  framework-neutral reading then `REQ-UIBENCH-054` is relaxed and the canvas is refused outright — so
  the answer to OQ-28 now changes a benchmark field and nothing a user can see. A **measurement**
  converted four of this record's open risks into settled facts and confirmed one of its predictions
  against a running window. One thing got worse: the settle signal this record owes the benchmark
  cannot be the offscreen paint event, and that is measured too.
- **Origin:** UI (ADR-UI-03)
- **Depends on:** ADR-0001, ADR-0043
- **This is the tightest constraint in the interface, and the one most likely to be got wrong by
  defaulting to the obvious answer.**

## Context

`REQ-CHAT-055`, `REQ-CHAT-154` and `REQ-CHAT-157`: paint and measure cost depends on **visible rows and
changed rows, never on total rows**. At a thousand rows or more, scrolling, expanding and searching each
stay inside the 200 ms budget, and appending costs no more than on an empty transcript.

`REQ-CHAT-165` and `REQ-SESSION-192`: bounded residency with **on-demand paging** — scrolling toward the
top loads the next older span, places it above, leaves the reader's position undisturbed and every
expansion state as set; loading happens off the interface thread; the oldest recorded row is
distinguishable from a failed load; a re-loaded row is *identical* to the row released.

`REQ-CHAT-058`: **two bounded caches with least-recently-used eviction** — retained row *measurements*
and retained row *renderings*. A rendering is reused only while **identity, content, laid-out width and
expansion state** are all unchanged. Live rows are redrawn every repaint and never reused. A theme
switch redraws every row and preserves every expansion state. `REQ-UIBENCH-063` and `REQ-UIBENCH-086`
give the rendered-body cache an **observable capacity**: 256 entries and two million characters, where
characters count the *source* text an item was rendered from, and hit and miss counts are running totals
over the life of the process.

`REQ-CHAT-059`: expansion state is keyed by **stable identity, not position**. `REQ-CHAT-053` and
`REQ-CHAT-071`: scroll preservation is **by anchor, never by stored pixel offset** — record the identity
and viewport offset of the top visible row and restore it after geometry settles; append, truncate,
in-place replacement and last-row extension must each preserve scroll position and expansion state
without a reset. `REQ-CHAT-057` fixes row layout metrics normatively, in pixels.

`REQ-CHAT-056`, `REQ-CHAT-075` and `REQ-CHAT-076`: Markdown rendering must be **synchronous**, must issue
**no network request**, and text selection must select exactly the characters the pointer covers **in
every row category, including rendered-Markdown bodies**. `REQ-CHAT-077`, `REQ-CHAT-065` and
`REQ-SHELL-144`: full keyboard navigation, per-row accessible names, and hover styling.

**`REQ-UIBENCH-054`, `REQ-UIBENCH-085` and `REQ-UIBENCH-050` are the hard part.** The count of live
paintable visual elements must be **invariant after window construction**: the window-construction phase
is "the only phase allowed to change the number of interface elements alive in the process: from the
moment this phase's record is taken until the iteration ends, the `widgets` value must not change". Six
later phases — a bulk apply, per-event appends, simulated streaming, a thousand tail replacements, an
idempotent re-apply, and a resize sweep — must all leave it unchanged. `widgets` is defined as "live
visual elements of the constructed window — those that occupy space in the window's layout and can be
painted". `ui_objects` — every live interface-framework object owned by the window, visual or not, never
smaller than `widgets` — is reported in every record but is **informational only**: no invariant reads
it and no value it takes changes any outcome.

`REQ-UIBENCH-051` and `REQ-UIBENCH-119`: each phase's timings cover its work **up to the point at which
the interface has finished showing that work's effect**, bounded at 30 s per settle. The architecture
must therefore expose an observable "the interface has finished showing this" signal.

## Alternatives considered

**A — A keyed list with a standard virtualiser.**

*For:* idiomatic; variable row heights are a solved problem; accessibility, selection and links come free
from the document model; character-exact selection over Markdown is native behaviour; keyboard
navigation is ordinary focus management.
*Against:* **it fails the element-count invariant, on a ground that survives whichever way the counting
rule below is settled.** A virtualiser mounts and unmounts row containers as the visible set moves, and a
row container is an application-owned structural element on *any* reading of `widgets`. So the count
changes whenever the number of mounted rows changes, and three of the six post-construction phases change
it: `ordered_appends` and `streaming_updates` each **clear the transcript** and refill it
(`REQ-UIBENCH-056`, `REQ-UIBENCH-057`), and the resize sweep moves the window through five sizes
(`REQ-UIBENCH-060`). `REQ-UIBENCH-054`'s "must not change" is broken in each. The objection deliberately
does **not** rest on the element count varying *inside* a row: the counting rule this record adopts
accounts that variance to `ui_objects`, so an argument resting on it would be void under the very
definition that saves option C, and an alternative must not be killed by a reason the Decision then
neutralises. Separately, A sits awkwardly with the cache rule: the framework owns element identity, so "a
retained rendering is reused only while identity, content, laid-out width and expansion state are
unchanged" becomes a memoisation convention rather than an enforced cache with an **observable entries
and characters occupancy**.

**B — A canvas-painted transcript.** One element per transcript, rows measured and painted by our own
code, with a retained-rendering cache of offscreen bitmaps.

*For:* the element-count invariant becomes trivial — one element, forever. The two caches and the fixed
metrics map directly onto a measurement cache and a painted-tile cache with real occupancy figures.
Paint cost is exactly "visible rows". It is the closest analogue to the specification's own vocabulary.
*Against:* **it forfeits the document model's accessibility and selection, and both are hard
requirements.** Pointer selection of exactly the characters covered, in every row category including
rendered Markdown; keyboard navigation and per-row accessible names; accessible descriptions everywhere;
accessible descriptions on tool rows and group headers. Meeting those over a canvas means building and
maintaining a parallel accessibility tree and a text-selection model by hand — a large, permanently
load-bearing subsystem whose failure mode is "a screen-reader user cannot read the conversation". **That
is too much risk to take for a benchmark counter.**

**C — A fixed-capacity recycled row pool.** The transcript is a scroll container holding a **constant**
number of absolutely positioned row slots, allocated at window construction and never added to or
removed from. Scrolling and content changes rebind slots to row indices and mutate their contents in
place; a slot showing nothing is emptied rather than unmounted. Row *content* is produced by a per-slot
renderer that reuses a cached rendering when the four-part key matches. Chosen.

*For:* the invariant holds if the pool is fixed and content mutation does not change the element count
within a slot. Rows remain document elements, so selection, keyboard navigation, accessibility,
tooltips and vector icons all remain native. Work is proportional to visible slots and changed slots.
Anchor restoration is natural because slots are positioned from a measured offset table rather than from
document flow. The caches are explicit objects with real occupancy.
*Against:* it is a recycler, not an ordinary list — the slot index must be the framework key, never the
row identity, or the framework unmounts and remounts. Content mutation within a slot must also be
count-stable, which is the hard part: a Markdown body produces a different number of elements for
different content. Variable row heights need our own measurement pass. It is more code than A, and it is
code that must be right.

## Decision

**Alternative C, with the content-count problem solved explicitly — proceeding on reading 1 below.
Reading 1 is still not confirmed, but under ESC-13 the answer no longer decides whether this record is
admissible.**

### What ESC-13 settled, and why it de-blocks this record

The product owner ruled ESC-13 on 2026-08-31, and ruled it **now rather than conditionally on OQ-28**:
*"accessibility wins… If OQ-28 resolves to the framework-neutral reading, then `REQ-UIBENCH-054` is
**relaxed** (option 2). The canvas (option 3) is refused outright."* The stated ground is the one this
record's alternative B already reached — a canvas forfeits native text selection, keyboard navigation
and per-row accessible names, all hard requirements (`REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065`,
`REQ-SHELL-144`), and `REQ-UIBENCH-088` makes the element-count invariants informational under either
reading — with the ruling adding the sentence that decides it: *"Trading a blind user's access to the
product for an informational benchmark number is not a trade this product makes, at any exchange
rate."*

**The consequence for this record is precise and it is a reversal.** This record previously said that
under reading 2 it "does not survive amendment: it is replaced", and its *Revisit if* said it would be
**withdrawn rather than amended**. That is now wrong. Under reading 2 the only structure that could
satisfy `REQ-UIBENCH-054` is the canvas, the canvas is refused, and therefore the requirement moves
instead of the architecture. **This record survives either reading of OQ-28.** OQ-28 reverts to what it
should always have been — a definitional question about how a number is counted — and this record's
statement that it is "blocking its own ratification" is withdrawn. What still matters about the answer
is only which rule gets written down, and the obligation to write it down once is unchanged.

The two readings are set out below unaltered, because the counting rule still has to be chosen and
stated, and because the record must not lose the argument that produced the escalation.

The pool gives the *outer* stability. The remaining question is what "live visual elements" means inside
a row, and the approved material admits two readings. They are not two tunings of a number; they decide
whether this decision is admissible at all, so both are stated here rather than one being adopted
silently.

**Reading 1 — the counting rule is the product's to define.** `REQ-UIBENCH-050` says both structural
counts are "defined against the interface framework the product is built on", that their absolute values
are comparable only between two runs of one product revision, and that they are "deliberately not
comparable between product revisions or between implementations". If the counts are framework-relative
and cross-implementation comparison is disclaimed in the requirement itself, then the product says which
of its own elements are the structural ones, subject only to staying honest against the words "occupy
space in the window's layout and can be painted". On this reading the definition is:

- **`widgets`** = the count of live **structural elements the application's own layout owns**: the seven
  views' panes, the navigation rail, title bar, status strip, the fixed transcript slot pool, the fixed
  list-slot pools of the agents, todo, artifact and board surfaces, the composer and its chips. Every one
  of these is allocated at window construction and is count-stable thereafter. **Each occupies space in
  the layout and can be painted, so the definition is met.**
- **Content nodes inside a slot** — the spans, code blocks and links a Markdown body produces — are
  counted in **`ui_objects`**, which `REQ-UIBENCH-109` makes explicitly informational and unbounded: no
  invariant reads it and no value it takes changes any outcome.

**Reading 2 — the counting rule is already fixed, framework-neutrally, and the test is observable.**
`docs/spec/resolutions/21-ui-performance-benchmark.md` row 29 records the disposition as "Counting rules
are fixed in framework-neutral terms", and gives the test in observable words: `widgets` counts "live
**visual** elements of the constructed window — those that occupy space in its layout and can be
painted", against `ui_objects` as "every live interface-framework object owned by that window, visual or
not". Row 13 of the same record renames the second field to `ui_objects` **precisely because** the
previous name "leaks one GUI toolkit's vocabulary into a schema". Read with those two dispositions, the
framework clause in `REQ-UIBENCH-050` explains why the *absolute numbers* are not portable across
revisions and implementations; it is not a licence to choose which elements are visual. A rendered
Markdown paragraph, code block or list item occupies space in the window's layout and can be painted, so
on this reading it is a `widget`, and content variance enters the invariant directly.

**Under reading 2 no document-model transcript satisfies `REQ-UIBENCH-054`.** A Markdown body produces a
different number of paintable elements for different content, and `apply_fixture`, `ordered_appends`,
`streaming_updates` and `tail_replacements_1000` all change content, so option **C fails as surely as
option A**, and padding does not rescue it because a zero-size or absent element neither occupies space
nor is painted. The only structure that passes under reading 2 is the canvas of option B — one element,
forever — which `REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065` and `REQ-SHELL-144` rule out for exactly
the reasons given above. **That is a conflict between live requirements, not an implementation detail:
under reading 2, `REQ-UIBENCH-054` and the selection-and-accessibility requirements cannot both be
satisfied.** ESC-13 rules that conflict in accessibility's favour, so the consequence is that the
requirement is relaxed rather than that this record is withdrawn. Whichever reading is confirmed, the
rule must be **written down once as the product's definition of both counters and cited from the
benchmark's own code**, so a later reader does not conclude the counter was gamed.

**The prediction was tested against a running window and it held, on both sides.** The
`renderer-invariance-and-benchmark-cadence` spike drove a hand-written recycler of exactly this shape —
a fixed 80-slot pool, index-keyed, emptied rather than unmounted — through the seven phases of
`REQ-UIBENCH-053` twelve times, in two scroll variants, onscreen and offscreen, with real Markdown
bodies in six shapes so the element count a body produces genuinely varies row to row.

- **Reading 1: invariant, and invariant strictly.** The application-owned structural count was **629 at
  every one of 384 observations** — 84 phase records, 130 intra-phase probes, 110 samples taken inside
  the tail-replacement loops, and all 60 steps of the twelve resize sweeps. Including the moment
  immediately after the transcript is cleared, and at 0, 1, 601 and 1,200 rows. The three phases that
  break a mount-and-unmount virtualiser — the two clear-and-refills of `REQ-UIBENCH-056` and
  `REQ-UIBENCH-057`, and `REQ-UIBENCH-060`'s resize sweep — left it untouched. **The count did not move
  at all**, which is a stronger result than passing at the benchmark's sampling points.
- **Reading 2: not invariant, in any run, under either variant.** The count went **630 → 777** with the
  reader at the top and **630 → 715** with the reader following the tail, at the *first* post-construction
  record, in every run — a break at the `construct_window` → `apply_fixture` boundary, before any of the
  phases OQ-28 discusses. In the follow variant three distinct values appear among the six
  non-construction records, so `REQ-UIBENCH-085`'s boolean is additionally false. The gap between the
  readings is the content of the visible rows: confined to the transcript pane, reading 2 moves from 320
  to 467, **an average of 4.3 Markdown content elements per visible row** across 34 bound slots.
- **Reading 2 also stops being a property of the transcript.** 777 with the reader at the top, 668 at
  the bottom, 747 at the minimum window size — same product, same fixture, same iteration. That is worth
  more than the invariance result for deciding OQ-28, because a count that depends on where the reader
  scrolled is not measuring the interface's structure.

Two honest qualifications carried from the spike rather than left in it. The harness's empty slots keep
a non-zero box, which makes the reading-2 figures a **best case** for reading 2; an implementation that
collapsed an empty slot would swing further. And the harness is not the product — 629 plain elements
with no framework, no theming, no accessibility tree, no icon set, no tool rows — so **the numbers are a
floor and only the mechanism transfers.**

Further specifics:

- **Pool capacity is a declared product constant, not a function of the window as constructed.** Capacity
  is `ceil(H_max ÷ 30 px)` plus overscan, where 30 px is the minimum row height `REQ-CHAT-057` fixes and
  `H_max` is a **declared maximum supported transcript viewport height** written down once as a product
  constant. It is derived from the *window's* content height, not from the transcript pane's, so a
  divider drag (`REQ-SHELL-069`) cannot force growth either. The earlier formulation — size at
  construction for "the largest viewport the window can reach" — is not determinable in the live
  application, where a user can maximise onto a larger display or attach a monitor after the window
  exists. **That was an argument and it is now a measurement.** On a machine whose two displays are both
  1,080 px tall, so that the tallest figure any host enumeration could offer is 1,080, the spike
  requested a window content height of **20,000 CSS pixels, and Windows granted it** — the renderer
  reported a real laid-out viewport of 20,000 px and did not clamp. That viewport calls for **671 slots
  against a pool of 80**, and the remainder of the transcript pane would be blank until the pool grew.
  So "the largest viewport the window can reach" has **no referent** on this platform, the gap is 18.4×
  the tallest display present rather than marginal, and a declared constant is not merely the tidier
  formulation — it is the only thing there is to write down. This is a Windows answer; the spike did not
  probe another window manager, a display attached at run time, or a `scaleFactor` other than 1. Three
  things follow, and the record states them rather than leaving them to be discovered.
  - **The benchmark cannot force growth by resizing.** The window is constructed at the opening canonical
    size, 1440×900 (`REQ-UIBENCH-054`, `REQ-UIBENCH-048`, `REQ-SHELL-022`), and the sweep visits
    1000×680 → 1440×900 → 1180×760 → 1000×680 → 1440×900 (`REQ-UIBENCH-060`): **no size in the sweep
    exceeds the construction size in either dimension.** The sweep alone therefore needs nothing more than
    a pool sized for the construction viewport. **Confirmed by measurement rather than by argument:**
    across every phase record and every one of the sixty resize steps in all twelve spike runs, the
    largest slot count any viewport called for was **34**, against a pool of 80, and the "pool growth
    wanted" watermark was **0** in every run.
  - **`H_max` rather than the attached display is what keeps `widgets` off the host.** Deriving capacity
    from the display present at construction would make the reported figure vary with the machine, and
    `REQ-UIBENCH-098` requires every input that shapes a measurement to be fixed by the benchmark rather
    than taken from the host. A declared constant is host-independent by construction; an enumerated
    display is not.
  - **The memory tripwire does not object to over-allocation, and is not the reason for `H_max`.**
    `REQ-UIBENCH-087` reads `rss_second_half_growth_bytes`, which `REQ-UIBENCH-058` defines as RSS at
    tail replacement 999 minus RSS at replacement 500, so an allocation made at construction appears in
    both samples and cancels; `REQ-UIBENCH-099` fixes no absolute memory figure anywhere. Nor is the
    quantity large: the 30 px floor caps slots at roughly 144 for a 4320 px viewport, so covering every
    display the product supports costs a few hundred empty containers. The reason not to simply size for
    "the largest conceivable display" is that **no such figure exists to write down** — which is why
    `H_max` is declared and reviewable rather than imagined. **The tripwire itself is now measured and
    holds with room to spare:** eleven clean spike runs produced second-half growth of 106,496 to
    7,172,096 bytes against `REQ-UIBENCH-087`'s 67,108,864-byte limit, a worst case of **10.7 % of the
    tripwire**, with no forced collection at any point. Two caveats the spike attaches and this record
    carries: RSS grew monotonically through the tail phase in the top variant, about 14 KB per
    replacement, so **a phase ten times longer would trip it** and nothing establishes whether that
    growth is a leak or unreclaimed allocation; and on Windows `rss` is the working set, which the
    operating system trims for an idle process — one run whose settles all expired produced a
    *negative* growth figure of −109,273,088 bytes that "passes" while measuring nothing. **A settle
    that times out does not merely inflate `wall_ms`; it destroys the memory sample taken beside it**,
    which is why the settle signal below is this record's problem and not only the harness's.
- **One growth branch exists, in one code path, and the benchmark cannot reach it.** A viewport taller
  than `H_max` grows the pool, and that is the only event permitted to change the slot count after
  construction. The branch lives in the product's own rendering path and is **not conditioned on being
  under measurement**, so `REQ-UIBENCH-112` and the domain's own framing — the fixture is replayed
  "through the desktop application's own rendering path" — both hold: the benchmark runs the same code
  and simply never takes the branch, because its window never exceeds its construction size
  (`REQ-UIBENCH-060`) and `REQ-UIBENCH-098` pins the display environment for the life of an iteration.
  **The residual is named rather than hidden:** under this design `REQ-UIBENCH-054`'s "must not change"
  holds by *unreachability*, not by construction. Were a viewport change ever to occur inside an
  iteration, `widgets` would change and `REQ-UIBENCH-085` would report false — informational under
  `REQ-UIBENCH-088`, but a real deviation from `REQ-UIBENCH-054`. **We do not buy the invariant by giving
  the benchmark a fixed pool the live application does not have**; that would be precisely the
  benchmark-specific rendering path `REQ-UIBENCH-112` forbids.
- **Every other list surface with unbounded content uses the same recycler** — agent tree, todo strip,
  artifact list, board columns — because the benchmark populates all of them *after* the construction
  record is taken. The board's own virtualisation rules (`REQ-TRACE-358` to `REQ-TRACE-366`) are the
  same shape and are satisfied by the same recycler: an overscan margin of five cards above and below, a
  released-widget pool capped per column, a height estimate until at least one card has genuinely
  completed layout, an explicit "realise this named card" operation that does not realise everything on
  the way, and the explicit refusal of the obvious cheat — spreading construction across successive
  turns of the event loop does not satisfy it, since it leaves the total work unchanged.
- **Row heights are measured, not assumed.** A measurement cache keyed by the four-part key feeds a
  prefix-sum offset table, which is what makes anchor restoration and scroll-to-centre exact rather than
  approximate.
- **The "finished showing" signal is a paint-completion promise**: after applying a state, resolve once
  layout has settled and a frame has been presented. This must be **a first-class part of the apply
  pipeline rather than benchmark-only code**, because `REQ-UIBENCH-112` forbids a benchmark-specific
  rendering path. It is also what the 30 s settle bound of `REQ-UIBENCH-119` is measured against.
  **It cannot be defined as "wait for the next platform paint event", and that is now measured.**
  ADR-0053 chose the offscreen paint event because it "is a real signal rather than a proxy". The spike
  probed it directly. Offscreen rendering is neither slow nor throttled — with damage it delivers **59.4
  frames per second** against 60 requested — but **with no damage it delivers about one frame every five
  seconds**, which is correct engine behaviour and exactly what breaks a settle built on waiting for a
  paint. Driven through the seven phases, **3 of 7 phase records carried `settle_timed_out` true in the
  top variant and 1 of 7 in the follow variant**; `tail_replacements_1000` ran **360,438.7 ms of which
  360 s is expired 30 s bounds**, with zero paints observed across each entire bounded wait. Which phases
  expire depends on **where the reader is scrolled**, not on the phase — the same phase resolves in
  27.8 ms in one variant and expires in the other. Forcing a paint is worse than the timeout: across 40
  trials, **0 of 40 invalidate-driven paints carried the frame just committed**; all 40 were exactly one
  frame stale, returned in 0.189 ms, and would have been recorded with `settle_timed_out` **false**. A
  renderer double `requestAnimationFrame` resolved everywhere it was tried offscreen (2.6–30.9 ms, no
  timeouts) but is a proxy — it says a frame boundary passed after the change was committed, not that a
  frame containing the change was presented — and the spike explicitly did not establish that the two
  signals measure the same thing where both resolve. **The obligation this record takes from that is
  narrow and it is ours rather than ADR-0053's:** the promise the apply pipeline exposes must resolve
  **whether or not the change it applied is inside the viewport**, because a transcript legitimately
  changes rows the reader cannot see, and a signal that only fires on visible damage silently converts
  "nothing to paint" into "the interface never finished". Which primitive delivers that is the benchmark
  harness's choice and ADR-0053's to make; the property is stated here because the pipeline is stated
  here.

## Consequences accepted

1. **We write and own a virtualiser rather than adopting one.** The transcript becomes the most intricate
   component in the product and needs its own test suite covering cost-by-visible-rows, the caches,
   identity-keyed expansion, anchor restoration, follow state and the element-count invariant.
2. Contributors must know the transcript is a recycler and that ordinary list idioms are wrong inside
   it.
3. The `widgets` and `ui_objects` split becomes a **documented product definition**, not an
   implementation detail — and, until OQ-28 is answered, a **documented product definition that may not
   be the one the specification meant**. The earlier form of this consequence went further: "If reading
   2 is confirmed, this record does not survive amendment: it is replaced." **ESC-13 reverses that.**
   Under reading 2 the only structure that satisfies `REQ-UIBENCH-054` is the canvas, the canvas is
   refused, so `REQ-UIBENCH-054` is relaxed instead. The residual cost of reading 2 is therefore a
   specification amendment in a domain whose whole point is determinism, plus a `widgets_stable_after_warmup`
   that reports false — informational under `REQ-UIBENCH-088` — and **not** the replacement of this
   record.
4. **`H_max` is a product constant somebody must choose**, and choosing it fixes the behaviour on a
   display taller than it — the one case in which the slot count changes after construction. The spike
   makes the consequence concrete rather than theoretical: at a 20,000 px viewport, 671 slots are called
   for and 80 exist, so the choice decides how much of the transcript pane is blank in that state.
5. **The two invariants this record could not demonstrate are now demonstrated, and the result is
   reported here rather than left in the spike.** Element-count invariance holds under reading 1 at 629
   across 384 observations and fails under reading 2 at the first post-construction record, exactly as
   this record predicted; the tail-phase memory tripwire passes at a worst case of 10.7 % of its limit.
   Both were run against **both** counting rules, which is what the earlier form of this consequence
   asked for. Three incidental results are carried because an implementer will meet them: the operation
   counters were **byte-identical across all twelve fresh processes**, so `REQ-UIBENCH-083`'s
   determinism claim survives a real recycler; rendered-body cache occupancy stayed inside
   `REQ-UIBENCH-063`'s bounds in all 84 records, at most 256 entries and 78,592 source characters
   against the 2,000,000 limit; and `REQ-UIBENCH-059`'s `unchanged_state` phase does **not** re-apply a
   state "identical to the state already displayed" once `tail_replacements_1000` has run before it, so
   it counts as one `update` rather than one `noop`. That last is a reading question about the
   requirement, not a finding about this decision, and is reported as such.
6. **The 200 ms budget is measured and held, with one qualification that is a reading question.**
   `REQ-CHAT-055` and `REQ-CHAT-157` were exercised at 0, 100, 1,000, 2,000, 5,000 and 10,000 total rows
   in both scroll variants, 60 repetitions per operation. The worst single apply-to-paint observation
   anywhere, across **2,520 apply-to-paint measurements**, was **34.2 ms — 17 % of the budget**. The
   apply-to-paint p50 was **13.8–13.9 ms at every total-row count in both variants without exception**,
   a floor set by the frame cadence and not by the transcript, which is `REQ-CHAT-055`'s
   cost-by-visible-and-changed-rows claim showing up directly. Ordinary-least-squares slopes of sync
   cost against total rows ran 0.0024–0.274 µs/row with **two of five negative**, which is the clearest
   available statement that what is left is noise rather than dependence. The qualification:
   `REQ-CHAT-055`'s "appending a row MUST cost no more than it does on an empty transcript" is **not met
   as a synchronous figure** — 1.4 ms on an empty transcript against 2.7 ms at 10,000 rows in the follow
   variant — while being met exactly to paint, 13.9 ms at both. The 1.3 ms residue is the O(n) scan a
   **whole-transcript assignment** forces at the view boundary, which `REQ-UIBENCH-055`,
   `REQ-UIBENCH-057` and `REQ-UIBENCH-058` all mandate: they hand the view the entire transcript on
   every update, so some per-row work is unavoidable however the view is built. **This record does not
   claim the requirement is met on the strict reading**, and whether "cost" means the synchronous call
   or the time to paint is a question for the specification.
7. **The settle signal is a shared obligation with ADR-0053 and the evidence says the obvious primitive
   fails.** See the Decision. The consequence worth stating separately is that a settle which expires
   also invalidates `REQ-UIBENCH-087`'s memory sample taken beside it, so the two invariants this record
   is responsible for are coupled through a mechanism neither of them mentions.
8. **`REQ-UIBENCH-118`'s interface-lag invariant is decided by how a phase is driven, not by the
   recycler.** The spike measured maximum `event_loop_lag_ms` at 581.7–2,752.4 ms with a burst driver and
   **≤ 74.8 ms with a driver that yields after every update** — false against the 100 ms threshold by up
   to 27× in the first case and true in the second — with the widget counts and operation counters
   identical either way. Yielding costs an order of magnitude in phase wall time. That is ADR-0053's
   choice to make; it is recorded here because the apply pipeline is what a yielding driver yields
   between, and because whichever way it is settled, one of `REQ-UIBENCH-118`'s boolean and the phase
   wall times will look very different from the other reading and the two are not separately tunable.

## Revisit if

A measured recycler cannot hold the 200 ms budget at a thousand-plus rows with Markdown bodies, in which
case alternative B returns — **but only together with a costed plan for the accessibility tree**,
because the selection, keyboard and accessible-name requirements do not bend. **This condition has now
been tested once and did not fire** (consequence 6), against a harness whose timings are explicitly a
floor: no framework, no state store, no theming layer, no syntax highlighting, no tool rows, no live-row
redraw path, and a fixture whose bodies are 80–900 characters. It should be re-run against the real
component before the budget is treated as banked, and a 2,000-line tool output or a very wide table is
the case most likely to move it.

**The clause that stood here — "Or OQ-28 is answered as reading 2, in which case this record is
withdrawn rather than amended" — is withdrawn.** ESC-13 refuses the canvas outright and relaxes
`REQ-UIBENCH-054` instead, so reading 2 no longer removes the only structure that satisfies both sets of
requirements; it removes the requirement that has no satisfiable structure. **A ruling caused this
reversal, not a measurement**, and the measurement that arrived alongside it went the other way —
reading 2's count moves in every run — which is precisely why the ruling mattered.

Two triggers replace it. **If `H_max` is chosen at a value a supported display can exceed**, the growth
branch stops being unreachable and `REQ-UIBENCH-054` acquires a real deviation rather than an
unreachable one. **Or if a settle primitive is adopted that resolves only on visible damage**, in which
case the memory tripwire and the phase timings both stop measuring what they name.
