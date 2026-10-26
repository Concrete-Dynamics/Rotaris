# ADR-0045 — What paints the transcript: a fixed-capacity recycled row pool — Decision

Part 3 of 7 of [ADR-0045](../0045-what-paints-the-transcript.md), which indexes every part.

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
  is `ceil(H_max ÷ 20 px)` plus overscan, where 20 px is the shortest a row can draw and
  `H_max` is a **declared maximum supported transcript viewport height** written down once as a product
  constant. **Falsified 2026-10-01, kept beside its replacement: "`ceil(H_max ÷ 30 px)` plus overscan, where 30 px is
  the minimum row height `REQ-CHAT-057` fixes".** `PD-CHAT-003` lifted that minimum off the row's box, and a one-line
  system notice inside a block drew 23.8 px, so a viewport inside `H_max` could show more rows than the pool bound. The
  rule is unchanged — the declared maximum over the minimum row height — and the minimum is now what the stylesheet can
  draw: `.row`'s 4 px top margin, its border and the 14 px continuation bar (see the report of that date below). It is derived from the *window's* content height, not from the transcript pane's, so a
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
