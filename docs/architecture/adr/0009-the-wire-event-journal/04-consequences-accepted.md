# ADR-0009 — The event history as a table, with the line-delimited form as an export — Consequences accepted

Part 4 of 7 of [ADR-0009](../0009-the-wire-event-journal.md), which indexes every part.

## Consequences accepted

1. **`REQ-EVENTS-166` is discharged by code that can be wrong.** Under a file the guarantee held even for
   a build with no exporter; now an export bug can break it. **The specification supplies two mitigations
   and this record relies on both rather than inventing one.** `REQ-EVENTS-162` makes the exported event
   list's equality with the emitted lines the conformance test for `REQ-EVENTS-166` by name, and
   `REQ-EVENTS-099` requires the same reader to read the store and the export, so the round trip is
   structural. Both must run on every build; the guarantee has moved from a property of the medium to a
   property that is tested.
2. **`REQ-EVENTS-029`'s per-event durability is free, not a cost this design absorbs. Measured
   2026-09-02; the conclusion is unchanged and the reason it rested on is withdrawn.**

   The previous text of this consequence read: *"Per-event commit is a real cost on the run host's loop,
   and it is still not measured. It is the reason ADR-0002 keeps the run host off the window layer."* It
   went on to price the file design's per-event durable write at 0.518 ms p50 with an `fsync`, to infer
   that an ordinary commit "should therefore cost less", and to say that no measurement of a commit on
   this path existed. **It does now** (`../spikes/commit-on-the-publish-path.md`), and the inference was
   right about the direction and wrong about the size of the thing being weighed.

   - **The event's own marginal cost is inside the noise: −4 to +31 µs at p50.** That is the step from a
     transaction inserting only the transcript row to the same transaction inserting the row *and* the
     event (spike §5.2, 3,000 commits per arm, at both 0 and 10,000 pre-existing rows). Making an event
     durable individually costs nothing once the row's commit is being paid for.
   - **The commit that carries it costs p50 185.4 µs / p95 362.8 µs** at `synchronous = NORMAL` for the
     three-statement publish-path transaction, 9,000 samples per arm, and **p50 182.2 µs / p95 329.0 µs**
     against a 10,000-row table — no growth term. With the periodic checkpointing commits removed (see
     consequence 11) the body of the distribution is **p50 179–220 µs, p95 301–386 µs**.
   - **End to end, commit then publish**, run host → main → renderer over ADR-0002's relay: **p95
     1.774 ms** at 0 recorded rows and **1.723 ms** at 10,000, against a no-commit control measured on the
     same harness in the same session at p95 1.161 / 1.220 ms. **Zero of 20,000 measured publications
     exceeded 250 ms.** The commit is ~39 % of the end-to-end p95 and **0.28 % of `REQ-MONITOR-222`'s
     budget**.

   **Which reason survives.** "Per-event commit is a real cost on the run host's loop" is disproved *as a
   statement about the event*. What the transaction costs is real but small, and this record withdraws its
   own contribution to ADR-0002's placement argument: **ADR-0002 keeps the run host off the window layer
   on its own reasons, and per-event commit cost is no longer one of them.** What replaces it as this
   record's reason for refusing group commit is simply that `REQ-EVENTS-029` forbids it and there is
   nothing to trade — the "whatever it costs" clause never has to be invoked, which is a stronger position
   than accepting a cost.

   **Three qualifications, because each of them could make the figure wrong later.**

   - **The −4 to +31 µs is the *paired* case.** It is the marginal cost of adding an event insert to a
     transaction that is already committing a durable record — `REQ-EVENTS-072`'s pairs, which this record
     puts in one transaction. An event raised with **no** paired durable record pays a whole transaction of
     its own. The nearest measured proxy is the single-insert shape at **p50 105–131 µs, p95 221–302 µs**,
     and it is a proxy: it inserts a transcript row (mean 2,234 JSON bytes) rather than an event row. Cited
     as an order of magnitude, not as the event's own figure.
   - **The measured schema is not this record's schema.** The harness's `event` table is a `WITHOUT ROWID`
     table keyed `(session_id, seq)` with no other index. This record's decision puts five **derived
     envelope columns** on the event row so that `REQ-EVENTS-117`'s four filter axes and `REQ-EVENTS-126`'s
     summary are queries rather than scans, and `REQ-EVENTS-175` puts a 100 ms budget on the filter. **Any
     index built to serve those is not in the measured shape**, and the spike states the mechanism
     plainly: every additional index adds WAL frames per insert, and therefore adds both commit cost and
     checkpoint frequency. The insert cost and the filter budget are one trade-off and nothing has measured
     it.
   - **`NORMAL` still buys no power-loss durability**, as stated under *Append*. `FULL` was measured at
     **4.4× the `NORMAL` p50** (812.1 µs), and the delta is one `fsync` on this device (559.3 µs p50). No
     append forces it, so the history never pays it — which is a consequence of the durability decision,
     not evidence for it. **Instrumented 2026-09-04** (`spikes/power-loss.md`): how much a `NORMAL` frame
     loses under a real cut — in commits and in milliseconds — is the number the harness's `verify` phase
     reports once the owner has performed the fault; a process death alone lost none, ten of ten.
3. **Three branches of the specification are unreachable from our own store, and the specification now
   says so rather than this record reporting it for amendment.** `REQ-EVENTS-106` states it directly:
   its four damage cases "remain implemented in full, because the reader also reads line sequences the
   caller supplies … What they no longer describe is this product's own store: a history this product
   wrote holds no partial record". `REQ-EVENTS-126` states the corollary — "a listing therefore no longer
   differs from replay on any session" — and `REQ-EVENTS-088` states the third. The damage handling must
   still be built in full, for exported histories copied between machines, edited by hand or truncated in
   transit; it must not be built as dead code guarding our own reads.
4. **The trim/truncation-record crash window is closed, and this is a genuine improvement rather than a
   neutral re-homing.** The file design accepted under-reported drops after a crash between a completed
   trim and its marker write, and the window has since been measured: **p50 2.6–3.2 ms, p95 3.6–6.8 ms,
   max 99 ms** at realistic cadences and p50 95 ms under stress, plus a second, structural window
   because the marker and the history were two files read at two instants
   (`../spikes/windows-writer-handle-compaction.md`, §5). `REQ-EVENTS-092` now requires the record made
   durable in the same indivisible step as the trim, and one transaction gives that. **Recorded as an
   improvement so that a future reader does not reinstate the two-step form**, and so that the closure is
   attributed to the requirement that demands it rather than to a convenience of the store.
5. **One database per workspace is one corruption domain**, where per-session directories lost one
   session at a time. SR-4 requires this stated rather than assumed, and it is stated here for the store
   this record owns: a workspace store that becomes unreadable takes every session's history in that
   workspace with it, not one. Scoping per workspace is the bound. **The user's copy out is the export**,
   which is the second reason the export matters and not only `REQ-EVENTS-166`.

   ***Citation corrected 2026-09-02, and the correction matters because it changes what the export is
   for.*** This consequence went on to say: "under `REQ-SESSION-198`'s machine-local store the export is
   now also the only way a history travels with a backup of the workspace, which SR-9(b) mints a
   requirement for." **Both halves are false and must not be cited.** The requirement exists —
   `REQ-SESSION-200` states the disclosure — and it names a *different* remedy as the one that carries
   the store: `REQ-SESSION-201`'s whole-store backup, which is valid while runs are live and which
   restores. So the export is **not** the only way a history travels, and the specification insists the
   two are not interchangeable: "an **export** is a record rendered so that software knowing nothing
   about this product can read it … a **backup** is the store rendered so that this product can put it
   back", neither may be collapsed into the other, and no export may be offered as a way to restore one.
   The export's availability is a **transparency** property again rather than also a durability one,
   which is the division `REQ-SESSION-201` insists on.
6. **A store failure is workspace-wide, not per target.** ADR-0008 consequence 3's per-target isolation
   held because the targets were separate files. The per-*event* isolation of `REQ-EVENTS-032` is
   unaffected and the degrade-to-a-log-line rules of `REQ-EVENTS-078`, `REQ-SESSION-175` and
   `REQ-HOOKS-128` still hold, but a diagnostics failure and a history failure are no longer independent
   events.
7. **The degraded read-only branch for a workspace on shared storage is withdrawn, not narrowed.** The
   previous form of this record said that where write-ahead logging cannot be enabled — a network share,
   some cloud-sync folders — the workspace store opens read-only and degraded, and the history with it.
   **ESC-15 removes the premise**: `REQ-SESSION-198` requires the store to be machine-local always, held
   in this machine's own per-user storage, never inside the workspace and never anywhere the workspace's
   location may be synchronised from, and requires a workspace on a share or in a sync folder to be
   **fully usable**. There is therefore no ordinary configuration in which the history opens degraded, and
   ADR-0058 as rewritten reaches the same place from the store's side: a failure to enable write-ahead
   logging is now a fault reported on `REQ-SESSION-089`'s terms rather than a mode.

   ***Correction, 2026-09-02, and it is a correction to the paragraph above rather than to the
   conclusion.*** The mechanism quoted in the first sentence — *write-ahead logging cannot be enabled, so
   the store opens read-only and degraded* — has since been **measured and found false in both clauses**,
   and ADR-0058 now carries a per-link verdict table in place of the chain. Logging worked over a UNC path
   in 320 process-trials with no failures and no rows lost, while failing on a mapped drive letter to the
   same share, so the behaviour depends on the **path spelling**; and the store never reported itself
   read-only in any network configuration measured — the real failure opens read-**write** and fails reads
   as well as writes, which is larger than read-only rather than smaller. **This record's withdrawal of the
   branch stands and is now over-determined**: the branch is withdrawn because ESC-15 removed the premise,
   *and* the state it described was never observed. **Do not cite the quoted mechanism as a fact about the
   platform** — it is quoted here only as what this record used to say. See
   `spikes/remote-and-synchronised-storage.md` §4.1–4.4 and ADR-0058 alternative J.

   ***One consequence of that measurement does land on this record and is not covered above.*** A
   successful open is **not** evidence of a working store: measured, a store opened, reported and read
   back its journal mode, created its shared-memory companion at the expected size, and threw on the first
   statement, 30 times out of 30. `REQ-EVENTS-179` now requires the store to be **exercised** — a write
   made and then undone — before the run starts, resolving a failure there into `REQ-EVENTS-084` and
   refusing on exactly its terms, with **exactly one attempt and no retry**. `REQ-EVENTS-087`'s
   initialization step is where such a failure will actually appear in this record's own sequence.

   **The history's read-side guarantee is not weakened by any of that**; `REQ-EVENTS-098`'s "a reader must
   not be able to delay or block the writer" is met by the journal mode, and where the journal mode cannot
   be established there is no store and therefore no run (`REQ-EVENTS-084`). *Read that clause on the
   **blocking** reading this record takes in consequence 12: a compliant reader measurably raises the
   writer's commit latency while never blocking it, so the literal reading is unsatisfiable by any store.*
8. **OQ-8 survives untouched.** Journal volume against the cap for `usage.update` is a question about how
   many events a run raises, which the store does not change.

   ***Answered, 2026-09-06, and the answer is compatible with this consequence.*** OQ-8 closed on the
   **completed provider request** as the emission trigger (`REQ-EVENTS-053`): one event per request that
   contributes new usage, the usage a failed or partial request reported counted, identical cumulative
   totals skipped. This record's point stands as written — the store still does not decide how many events
   a run raises — and the number is now bounded by something nameable: a run raises at most one
   `usage.update` per provider request it makes. `REQ-MONITOR-166`'s sampling keeps its separate cadence
   and does not enter this journal.
9. **The trim is two commits where a shared transaction would have been one, and that cost is accepted
   without a measurement.** Separating the trim from the append adds one transaction per `cap ÷ 8`
   appends — one in every 2,500 at the cap `REQ-CONFIG-473` registers — so the amortised cost is small by
   construction and the argument does not rest on a number. What is *not* established by inference is the
   trim's own latency: a delete of up to `cap ÷ 8` rows runs on the writer's queue and therefore ahead of
   the next event's commit, and `REQ-EVENTS-091` requires it "before any further event is recorded", so it
   cannot be moved off the path. Against the file design this is the direction of improvement — an O(rows
   deleted) delete replacing an O(file) rewrite that measured **0 of 115 trims completed** — but the
   magnitude on the store is unmeasured and is named in *Revisit if* rather than asserted.
10. **A failed trim is now a state the product can be in, and something must notice it.** This is the price
    of reading `REQ-EVENTS-091` correctly rather than a defect in doing so: a history may sit above its cap
    behind a warning, indefinitely, while the run carries on recording normally. The requirement calls that
    "a bounded and visible cost" — **bounded** because the headroom means a trim is retried on the next
    overflow rather than abandoned, and **visible** because a warning is required. Visible in a log is the
    weakest reading of visible, and no requirement asks for more, so no more is built here; but a
    persistently failing trim on a long run is a growing table with a single warning behind it, which is
    the shape of the silent failure ADR-0024's alternative A had to name. It is recorded so that a
    diagnostics surface has somewhere to look, not because the requirement is defective.
11. **One commit in 136 costs 9–11 ms, deterministically, and this record is where that lands, because
    the history is the store's highest-volume writer.** Measured
    (`../spikes/commit-on-the-publish-path.md`, §6): with SQLite's default `wal_autocheckpoint = 1000`,
    the publish-path transaction writes **7.44 WAL frames**, so the automatic checkpoint fires every
    **135–136 commits** — an observed period so regular that it is what identifies the spikes as the
    checkpoint rather than as scheduler noise. Those commits cost **p50 9,066–10,994 µs, p95
    11,463–14,428 µs, max 53,102 µs**; the other 99.27 % cost **179–220 µs at p50**. On the end-to-end
    path the same period is visible at **6.5–9.2 ms p50** and a worst observed 24.66 ms.

    - **Nothing about it threatens a budget.** A typical checkpointing commit is 3.6 % of
      `REQ-MONITOR-222`'s 250 ms and the worst observed end to end is 9.9 %.
    - **What it does change is what "normal" looks like.** Without the commit the end-to-end interval had
      a maximum of 2.426 ms over 4,000 samples; with it, 63 of 6,000 exceed 5 ms and 29 exceed 10 ms. **Any
      conformance test, diagnostic threshold or alarm built on "an event append takes about two hundred
      microseconds" will see routine excursions of fifty times that, on a fixed period, and must not treat
      them as faults.** That is this record's to state because it is this record's writer that will absorb
      most of them.
    - **Do not turn the autocheckpoint off, and do not make it configurable.** Measured: disabling it
      makes the ordinary commit **31 % slower at p50 and 87 % slower at p95**, because every commit then
      searches a WAL that never resets; grows the WAL to **91 MB in 3,000 commits**; and converts the
      periodic 9 ms spike into a single **155 ms** stall the moment anything checkpoints. The tuning knob
      that looks available here is a trap, and the evidence is on record.
    - **The period moves with the transaction.** 7.44 frames is the *measured* shape — one transcript row,
      one event, one narrow session update. A wider publish-path transaction, or an added index (see
      consequence 2), checkpoints proportionally more often and the tail follows.
12. **A concurrent reader does not block this writer, and the honest reading of `REQ-EVENTS-098` has to be
    stated rather than assumed.** The requirement says "a reader must not be able to delay or block the
    writer". Measured across two OS processes on one store (spike §8): a reader doing whole-session reads
    back to back — 147–1,603 ms per pass, 47,695–82,405 rows over the run — took the writer's commit from
    **p50 163.6 → 345.9 µs and p95 271.7 → 898.9 µs**, with **zero errors and zero `SQLITE_BUSY`**.

    **So a compliant reader measurably raises the writer's latency while never blocking it.** The reading
    this record takes — and it is a reading — is that the requirement's own following sentence fixes its
    sense: *"a store in which one blocks the other does not satisfy this requirement"*. The prohibition is
    on blocking, not on having no measurable effect on scheduling, which no store could offer. On the
    literal reading a doubled median commit is a "delay" and the requirement is unsatisfiable by
    construction. **Named as a reading so that a conformance test is not written against the literal one.**

    Two measured hazards attach. Both are ADR-0058's rules rather than this record's, and they are
    recorded here because this record's writer is what suffers them. A reader that holds a **write**
    transaction — which ADR-0058 rule 4 forbids — produced a single commit of **205.4 ms** for a 200 ms
    hold, and, with no gap between holds, starved the writer indefinitely. And with `busy_timeout = 0`,
    **2,967 of 3,000 commits raised `SQLITE_BUSY`**. The second is this record's worst case rather than a
    slow path: under `REQ-EVENTS-088` the *first* such failure marks the session's history failed for the
    remainder of the run and no further event may be recorded, with one warning. **A contention setting
    therefore turns into a permanently truncated history rather than into a delay**, and the sticky rule is
    what puts the two outcomes so far apart.
