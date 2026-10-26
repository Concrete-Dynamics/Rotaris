# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 9. What a surface does with a publication (ADR-0046, ADR-0045; Part Z)

Part 16 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

## 9. What a surface does with a publication (ADR-0046, ADR-0045; Part Z)

The run host publishes; this is the other end of the same numbered stream, in the renderer, and it is where the
reader's place is kept. An increment carries its earliest-changed index and **every row from it onward**
(REQ-MONITOR-214), and step 3 replaces everything the replica holds from that index with what it carries; so the
projection owner publishes a committed row alone only when it is the last row held, and a row committed below the last
— one agent's row settling after another agent appended behind it, the coordinator's `wait_for_tasks` settling under
its child's whole run — with the rows after it (`ProjectionOwner.rowsFrom`, 2026-10-06; the first form published it
alone and the view dropped every row behind it, H5 of the final duress run:
`docs/defects/fixed/a-row-settled-below-the-last-is-published-without-the-rows-after-it.md`). Six steps, in order, on
every publication:

| step | where | what it does |
|---|---|---|
| 0 sequence check | `ui-core/replica.ts` | the number equals the one expected, or the surface has missed a publication: **`refused`**, apply nothing, stop consuming, request a whole read with **no timer**. An expectation is created by a whole-session update and by nothing else; a number at or below it is a superseded publication, discarded uncounted |
| 1 applicability | `replica.ts` | an earliest-changed index before the oldest row held is **declined** — one further whole read, the rows on display unchanged (REQ-SESSION-161) |
| 2 reset | `replica.ts` | a whole-session update sets the expectation and classifies **`reset`** |
| 3 row classification | `replica.ts` (`classifyRows`) | one `insert` per row added, one `remove` per row removed, one `update` per changed retained row; **one `noop` and no row counters** when nothing changed. Six cumulative counters, pure, byte-identical across two replays (REQ-UIBENCH-064/083) |
| 4 projection | `ui/transcript/project.ts`, through `ui/transcript/projector.ts` | role-to-kind mapping, duplicate-reasoning and dead-session hygiene, edit-diff placement, folding, display caps, then the computed trailer rows — **one question trailer** reading `pendingQuestions[0]`'s own steps ("N step(s) — first title", the wording written once here, REQ-CHAT-168) and one per approval. **Bounded by what changed**: from the earliest-changed index back to the nearest group boundary, never over the resident window. **Run once per change of its inputs, not once per render** (2026-09-28, the R-048 measurement round): the pane holds one projector, keyed on every input step 4 reads, so the three or four renders one increment causes — its own, the measurement pass's, the tail pin's scroll event, a whole-session update's — project the window once; the bounded form is taken only for an append or a row replaced at its own index (a removal, an insertion — REQ-CHAT-069's scope switched — or a run member that no longer joins its run projects the window: R-062's fix round 1), and its clean cut reads runs on the rows hygiene keeps — REQ-CHAT-048's dropped reasoning skipped, REQ-CHAT-049's settle applied — with the reused prefix never reaching past the changed index (fix round 2). REQ-CHAT-048 compares an unstamped thinking row with **its own agent's** immediately previous thinking row (2026-09-28, OQ-91's reading): the walk keeps one per agent, and the bounded form looks an agent's up below the cut only when that agent's unstamped reasoning is in the suffix. **No pass over the window an increment** (2026-09-29, the CPU-profile round of R-048's order, REQ-CHAT-055): the reusable prefix is found by bisection over the previous display's *reach* (the highest row index any displayed row up to a position covers), carried forward by each bounded projection; a run beginning or ending (`running`) is bounded from the first row that settles with it (`settlesWithRunning`) rather than projecting the window; and the places REQ-CHAT-057/067 draw from (`placementsFrom`) ride with the projection, built from the previous one's |
| 5 present | `ui/transcript/TranscriptPane.tsx` | the displayed array, the preserved anchor and the expansion map to ADR-0045's recycler; the offset table is rebuilt only where it changed (`pool.ts`'s `reuseOffsets`, 2026-09-29) — a row that is the same object at the same position, and whose identity the measurement pass has not re-measured since the committed table (the pane's `MeasureLedger`, which the two measurement caches also tell of their evictions), keeps its height and its offset — and the update shape compares keys only past the rows both arrays share, reading one row's content besides — the last row before the update, which tells REQ-CHAT-053's `extend` from `append` where the keys agree (2026-09-29) |

**During a recovery episode** the surface is *reconciling* and the subscription handler **drops** further
publications for that session rather than queueing them, so exactly one `refused` and one `reset` are counted per
episode however many arrive — an arrival-timing dependency would break the benchmark's determinism claim outright.

**What paints it (ADR-0045).** A scroll container of **226 absolutely positioned slots** — `ceil(H_max ÷ 20 px) + 10`
with `H_max` a declared product constant of 4,320 px and 20 px the shortest a row's slot holds (`SHORTEST_ROW_HEIGHT`:
the 4 px row gap, the border and the 14 px continuation bar; 30 px until 2026-10-01, taller than a row PD-CHAT-003 draws)
— allocated at window construction, **emptied rather than unmounted** when a row leaves it, and rendered whether or not the transcript holds any rows. The pool's size follows the viewport (`capacityFor`): a viewport taller than `H_max` grows it and a shorter one shrinks it again, and only then are slots mounted or unmounted. **Corrected 2026-10-02, kept beside its replacement: "never added to or removed from".** Since the capacity growth of 2026-10-01 that was no longer so. The slot index is
the framework key, never the row identity. Heights are **measured** by a `ResizeObserver` into a bounded cache and fed
to a prefix-sum offset table — rebuilt from the first height that changed, not from the top (REQ-CHAT-055) — which is
what makes the anchor of REQ-CHAT-071 exact. A row not yet measured is positioned by `estimateHeight`, built from
the parts of its box the stylesheet draws — the 4 px row gap or 12 px block gap (the pane reads the row's block start
from `places` at its position, `readHeight`), the border, a user row's padding, a Markdown body's block margins, one
19.5 px line per drawn line — so that for every row kind measured it is not short of what the row draws, because a row
appended at the tail while the pane follows is inside the viewport for the frames before its first measurement. A slot
a scroll rebinds is observed again (`observeAgain`), since an observer reports only a size that changed. And a bound
slot whose key has no measurement yet — a row first bound, or one whose content changed — is read at the commit, before
the paint (`measureAtCommit`), the pane rendering again inside the commit when it draws other than what placed it; until
2026-10-01 a row that grew was painted through the row beneath it for the frame before the observer's delivery rendered.
A size that changes under an unchanged key — an image attachment's `<details>` opened, the image loading, a block start's
margin — runs no commit, so the observer's delivery renders it synchronously (`flushSync`), after layout and before the
paint, where it used to render a frame later. One observer serves the pane's life: it is made at mount, never again on a
displayed change, so no render inside a delivery can disconnect it and observe every slot afresh; a slot whose node
unmounts (a capacity that shrank) is unobserved and forgotten (`slotRef`), so a node mounted later in it is observed
again. The scroller also holds
its scrollbar gutter (`scrollbar-gutter: stable`), so a bar that appears inside a delivery narrows no row. Until
2026-10-01 either could leave the slots' sizes to the next frame, with Chromium's "ResizeObserver loop" error in the
renderer console. And a delivery's synchronous render binds the span of rows the pool last committed (`bindRange`), so it
moves rows and rebinds no slot: slots are bound by position, and a corrected height above the viewport used to move the
span, rebinding every slot inside the delivery — the same error, at the end of a run that appends while the pane follows.
The span is released by an ordinary render after the frame. A span wider
than the pool sheds its overscan, below and then above, before it cuts a visible row (`visibleRange`). The anchor is
the identity and viewport offset
of the top visible row, restored by finding that row again, never by re-applying a stored pixel offset. A retained
rendering is reused only while identity, content, laid-out width and expansion state are all unchanged; a live row is
redrawn on every repaint. Expansion state lives in the pane, keyed by stable identity, because a slot rebind would
otherwise carry one row's state onto another.

**Older rows** are fetched by `session.pageOlder` when the reader scrolls toward the top and placed above by the
replica's `prependOlder`, off the interface thread, with the anchor holding the reader still; a failed load says so
and is re-attemptable, and reaching the oldest recorded row is a different state from a failure (REQ-CHAT-165).
