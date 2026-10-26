# Open questions — Spikes, and the questions raised since (2 of 35)

Part 35 of 68 of the [open-questions record](../open-questions.md), which indexes every part.

1. ***Discharged 2026-09-01 — `spikes/renderer-invariance-and-benchmark-cadence.md`.*** Element-count
   invariance of a fixed slot-pool recycler through the benchmark's seven phases, under *both* counting
   rules, plus the tail-phase memory tripwire. **Answered on both halves, and the answer for the second
   rule is the one this entry named as the expected result.** Under reading 1, `widgets` was **629 at all
   384 observations**. Under reading 2 it moves at the `construct_window` → `apply_fixture` boundary in
   every run — **earlier than this entry predicted**, before any of the four phases it names — so the
   conflict is real in a running window and OQ-28 could not be de-escalated on the measurement. It was
   de-blocked by ESC-13 instead. The tripwire passes at 106,496–7,172,096 bytes against 64 MiB, worst case
   **10.7 %** of the threshold. **Three things it also established that were not asked for** and that are
   recorded above: the reachable viewport is not knowable at construction (OQ-40); ADR-0053's paint settle
   fails on exactly the phases with no visible damage and `invalidate()` is worse than the timeout (I-13);
   and a settle that expires destroys the meaning of the memory sample taken beside it (I-31).
   **The residue: its own section 10 states the element counts and timings are a floor** — no framework,
   no state store, no theming, no accessibility tree, no syntax highlighting, no tool rows, no live-row
   redraw path — so the real component is still owed (see spike 13).
2. **A Windows access-control mechanism** that can set an explicit list with inheritance disabled **and
   read it back**. *(ADR-0029.)* If none is acceptable, `REQ-PROVIDER-016` is unimplementable as written
   and this becomes an escalation.
3. ***Taken 2026-09-05 — `spikes/mcp-negotiation.md`.*** **Tool-server protocol version negotiation over
   our own transport.** *(ADR-0033, ESC-12.)* The sibling-probe policy is documented for the SDK's
   **standard** stdio transport, which ADR-0033 replaces with `OwnedStdioTransport`; establish what
   negotiation does over the custom transport before assuming a pin is needed there at all, then confirm
   that pinning to a mode which spawns no sibling probe process does not break servers speaking only the
   newer negotiation, against at least one modern and one legacy server. If the answer is that
   `REQ-MCP-067` is satisfied without pinning, ESC-12's balance changes. **Answered: no sibling is spawned
   over our transport under any mode; `REQ-MCP-067` holds without a pin; `'auto'` reaches every era; a
   strict legacy server that exits on the probe takes one sequential retry under `'legacy'`; ESC-12's
   balance changed as the entry predicted and option (a) was taken.**
4. ***Taken 2026-09-05 — `spikes/mcp-console-suppression.md`.*** **Console-window suppression verified on a
   packaged build spawning a console application** — that no window appears at any point. *(ADR-0033,
   `REQ-MCP-113`.)* **Answered:** on the packaged build, every process started after the launch (cmd, node, headless conhost) had window handle 0 and title N/A at every sample while the echo call succeeded; the reserved token's child fails at spawn (ENOENT), not with a window.
5. ***Taken 2026-09-06 — `spikes/code-intelligence-branch.md` (and `spikes/code-intelligence-bundle.md` beside it).***
   **The packaged binary's reserved-token branch** producing clean protocol output on standard output,
   nothing else on standard output, no window, and the correct exit status. *(ADR-0035.)* **Answered:** Electron's
   own main entry with the token first and `--` second (a scheme-looking positional followed by another positional
   exits the binary −1 before any JavaScript, measured on the development and the packaged binary); the runtime's
   JSON-RPC and nothing else after one CR LF Electron itself writes ~50 ms after start (tolerated by the transport as
   a blank line, not a message); no window handle on any process at any sample; the runtime's own exit status (0 on
   stdin's end, 2 from its argument parser, 1 when it is killed) observed by the parent every time. Re-run through the
   proof's own client on the development entry (`pnpm code-intel-proof` launch 1) and on the packaged artifact under
   `ROTARIS_CODE_INTEL_PACKAGED=1`.
6. **Responses-dialect model requests against a non-vendor base URL with custom headers.**
   *(ADR-0027.)* If it fails, the fallback is a hand-written dialect behind the same port.
7. **The board projection's serialisation cost across the workspace-service boundary** at
   `REQ-TRACE-300`'s scale. *(ADR-0002, ADR-0041, OQ-2.)* Unchanged by SR-4 — this measures the process
   crossing, not the store — but it now decides half of a question that has a second half in spike 18,
   and OQ-2 should be answered from both together rather than from either alone.
8. **Store query latency for the session listing and the requirements board, against real indexes.**
   *(ADR-0058 consequence 6, ADR-0041, ESC-9; constraints Y-04, I-15.)* **Rewritten: this spike used to
   decide whether ADR-0003's derived read index was needed, and that index is withdrawn as unnecessary
   under SR-4 — a listing served by an indexed query over the same rows has no staleness question. The
   measurement it existed to take is not withdrawn; it got harder.** A directory layout gave the listing's
   cost away for free and a schema does not: indexes and query plans are now a design obligation. Measure
   `REQ-SESSION-042`'s listing against `REQ-SHELL-150`'s 100 ms gesture budget, and `REQ-TRACE-239`'s
   board against its own 100 ms budget with `REQ-TRACE-367`'s linear-growth clause in force, both at a
   realistic workspace size and at `REQ-TRACE-300`'s scale, **with the indexes actually declared rather
   than assumed**. Report the plan each query takes, because a plan that degrades on a larger store is the
   failure this spike exists to catch and it is invisible in a wall-clock figure taken once.
   **Two things are added by the amendment and by ESC-15, and both are cheap here because the harness
   already has a store.** `REQ-SESSION-042` as amended now states the cost clause itself — a listing's
   cost grows with the number of sessions "and with nothing else" — so this is a conformance measurement
   rather than a prudence one (constraint D-13). And the **startup path** needs the same treatment:
   identifier read, store open, write-ahead-log recovery after an unclean shutdown, and an integrity check
   at realistic store sizes, measured where ADR-0058 puts it — inside `REQ-STARTUP-043`'s **post-show**
   activation — to confirm it never touches first paint. `spikes/packaged-first-paint.md` leaves roughly
   3.4–4.4 s of the 5 s budget on the flavours that pass and states that its harness contains **no
   persistence and no native module at all**, so nothing yet establishes what the store costs there.
   **Also owed here:** long-path behaviour on Windows for the layout ESC-15 produces — per-user data root
   plus identifier plus session id plus artifact body name, where the body name is the part that varies
   without bound.
   *2026-10-21 (the Windows ARM64 session's E1): measured for the store and the identifier — the engine refuses a database
   path past 251 characters on Windows ARM64 as on x64, and the identifier file works at 328 through Node; a launch whose
   store crosses the limit opens no workspace and says nothing (ADR-0058 consequence 18). Still owed: the session directory's
   artifact bodies, the part that varies without bound.*
9. ***Withdrawn 2026-08-31 under SR-4, deliberately and not by oversight.*** This was **Windows trim
   under an open writer and a concurrent follower** — the one failure mode ADR-0004's own evidence
   predicted and did not measure, and the only evidence rule 3 of ADR-0004 ever rested on. **Rule 3 is
   deleted and constraint D-28 is withdrawn with it**, because every file the discipline governed is now a
   table: `events.jsonl` (`REQ-EVENTS-091`), `permissions.jsonl` (`REQ-TOOLS-078`), the verification-gate
   log (`REQ-TOOLS-190`) and the ring-capped evidence files (`REQ-SESSION-133`). The concurrent-follower
   half went earlier, with SR-2. Checked rather than assumed: the only file still opened in append mode
   anywhere in the product is **the session's log** (`REQ-SESSION-142`), and nothing compacts it — **so no
   file in the product is now replaced by rename over a handle its own writer holds.** *(Path corrected
   2026-09-02: this named `evidence/debug.log`, which is withdrawn with the session-directory layout
   domain 18 carried; `REQ-SESSION-002` fixes three kinds of per-session file and no filenames. The fact
   is unchanged — only the name was wrong.)* The number is
   retained because ADR-0004, ADR-0009 and ADR-0024 all cited it; it is not to be reused.

   ***It was nevertheless measured, after it was withdrawn, and the report is
   `spikes/windows-writer-handle-compaction.md`.*** That is worth reading rather than skipping, because
   two of its findings outlive the design it measured and **both correct claims this record was making
   about the platform**, not about the file layout. (a) An `unlink` **succeeds** against a runtime-held
   handle, from another process too, while both fail against a holder requesting read/write sharing
   without delete — so the runtime **does** request share-delete, and the record's stated cause for rule 1
   was wrong. What actually fails is the **replace-by-rename call**, which cannot replace a destination
   with any open handle whatever its share mode, and fails even where the holder explicitly permits
   delete. (b) A directory `fsync` fails **only on a read-only handle**; on a write-opened handle it
   returns success, 200/200, at ~0.115 ms — see OQ-12, whose premise this falsifies. And (c) the
   prescription this spike existed to validate **was right**: 0 of 115 trims completed under the naive
   shape, the cap was exceeded and growing, **no reader observed any symptom**, and append throughput
   collapsed roughly seventy-fold. The **diagnosis** is what generalises and is retained as a standing
   prohibition in constraint D-28; the number is still not to be reused.
10. ***Discharged 2026-09-01 — `spikes/ipc-hop-latency.md`.*** The update path across the process hop,
    against `REQ-MONITOR-222`, `REQ-MONITOR-223` and `REQ-ORCH-155`. **All three pass**, and the entry's
    stated interesting failure — that the empty-session denominator might be small enough for a fixed
    per-update overhead to blow the factor of two on its own — **did not occur**: the ratio is 1.14
    against a ceiling of 2, and 1.19 at `REQ-SESSION-192`'s actual 5,000-row cap. **It also closed three
    ADR clauses and overturned one**: ADR-0002's double-hop Revisit-if, ADR-0044's structured-clone
    trigger, ADR-0044's channel-isolation claim (overturned — a channel name is not a transport), and the
    question of whether the direct `MessagePort` is required (it is not, because SR-8 removed the only
    budget the relay failed).
    **Three things it did not measure and one of them is spike 21.** The commit `REQ-MONITOR-221` requires
    before publication is **outside the measured interval**, stated in the report's own section 8, so
    every figure is a lower bound on the interval the requirement bounds. Fan-out to several windows
    (`REQ-MONITOR-243`, `REQ-STARTUP-163`) multiplies main's per-message cost by the window count and was
    not measured. The reconcile path — a whole read plus an index-0 increment over the resident window,
    the one path that legitimately publishes from index 0 — has never been costed, because `refused = 0`
    in every run. Also not measured: the search panel open (`REQ-CHAT-074`), which remains this entry's
    one unaddressed sub-question and belongs to ADR-0046.
11. **Parse-cache behaviour through `streaming_updates` under the read-but-do-not-insert rule**, on the
    fixture the benchmark actually uses. *(ADR-0051; constraint I-05.)* Confirm that hits and misses both
    climb (`REQ-UIBENCH-063`), that entries and characters stay inside their bounds
    (`REQ-UIBENCH-086`) **for the stated reason rather than by continuous eviction**, and that
    `REQ-NOTIFY-243`'s settle-time insertion produces the correct final rendering. Cheap; it decides
    whether the insertion policy is right before it becomes a reported figure.
12. **The application image's runtime on an unmodified baseline installation.** *(ADR-0054, ESC-11,
    `REQ-STARTUP-024`, `REQ-STARTUP-159`.)* Launch the published image on a machine that has never had the
    legacy FUSE library installed, and record whether the shell's process sandbox is active.
    `REQ-STARTUP-156`'s release gate names a machine the release owner controls, which is **not** the
    machine the requirement names, so this is not covered by the existing gate. ESC-11 turns on it.
13. **Forced synchronous commits at recycler-pool scale — *narrowed, and answered from one side already.***
    *(ADR-0057, ADR-0045, ADR-0053.)* Whether committing synchronously on every applied state holds
    `REQ-MONITOR-222`'s 250 ms p95 and `REQ-UIBENCH-118`'s sub-100 ms lag through the
    thousand-replacement tail phase. **Spike 1 answered the lag half against a mock shell**: a burst phase
    driver produces 588–2,752 ms of lag and a driver that yields after every update produces ≤74.8 ms, at
    the cost of multiplying phase wall times by 17×–26×. **What remains is the real component**, which
    spike 1's own section 10 says its numbers are a floor for: renderer framework, state store, theming,
    accessibility tree, icon set, bundled fonts, syntax highlighting, tool rows, group headers, verifier
    rows and the live-row redraw path. A 2,000-line tool output or a very wide table is the case most
    likely to move the 200 ms budget. **Two cheap follow-ons belong here rather than as new numbers**: the
    settle comparison ADR-0053 consequence 5 turns on — a rAF settle against a paint settle in the phases
    where **both** resolve, which either retires that consequence or sizes it — and ADR-0052's maintained
    session-store counters under the run host's actual write rate, to confirm that a counter incremented
    inside every insert transaction is genuinely free when diagnostics is off (`REQ-STARTUP-129`,
    `REQ-STARTUP-130`). It shares a harness with spike 1, so the marginal cost is small.
14. ***Measured 2026-09-02 — `spikes/presenter-liveness-and-instance-claim.md`. The mechanism is
    discharged; the window this spike exists to size is NOT, and OQ-39 stays open.*** The poll detected
    all nine blocked runs at **+386 to +468 ms** on a 500 ms threshold with **zero false lapses in 258 s**
    of unblocked running. Three findings it was not asked for and which are now in ADR-0019 and constraint
    T-31: the check **must be gap-based**, because a blocked main queues rather than drops and all 84
    outstanding replies arrived when the block ended, the last at **7,885 ms**; the exposure is **every
    synchronous native dialog**, not the approval dialog, which cost the poll nothing at a 266–267 ms
    maximum gap; and **no platform signal for an unresponsive main is usable from the run host**, the
    operating-system signals detecting a busy loop and never a native modal. **It also falsified an
    ADR-0019 mechanism**: the run host dies with main in **207–341 ms** and never observes the channel
    close, so the channel-close revocation is not what operates. **Why the window is still unsized is
    stated in the *Not discharged* paragraph below and has not changed.**
    **A presenter liveness lapse window that survives ordinary main-process load.** *(ADR-0019, OQ-39,
    constraint T-41.)* Measure the worst-case latency of a liveness poll answered by the desktop main
    process while it does the heaviest ordinary work it does — a large transcript render, a
    garbage-collection pause, a settings flush, a native dialog on the platform where one blocks — and
    confirm that a window exists comfortably above it that is still short enough that a wedged main does
    not read as attended for a user-noticeable time. **If no such window exists, ADR-0019's decision fails
    and OQ-39 becomes an escalation** between a hang at `runtime.approval_timeout_seconds: 0` and a
    specification change.
    ***Not discharged, and the reason is specific.*** `spikes/ipc-hop-latency.md` establishes a **floor**
    — a single `webContents.send` took 88.263 ms while main was otherwise **idle** — and confirms the
    wedged-main state occurs, at 22,777 ms of event-loop lag. **It never showed a dialog**, which is the
    one case this spike exists to measure, and a native modal is exactly the load the window must clear.
    The floor narrows the search; it does not size the window.
15. **Echo latency end to end against a real pseudo-terminal with the flush rule in force.** *(ADR-0021,
    OQ-38, `REQ-SHELL-166`.)* Measure key press to painted frame across both process hops with
    `runtime.terminal_stream_interval_ms` at its 100 ms default and at 2000, confirming that the
    ceiling-plus-flush reading actually lands inside `REQ-SHELL-150`'s 100 ms budget rather than merely
    removing the sampling term from the sum. If the two hops and the paint consume the budget on their
    own, the flush is necessary but not sufficient and OQ-38 becomes an escalation about the figures.
16. ***Discharged for Windows 2026-09-02 — `spikes/presenter-liveness-and-instance-claim.md` — AND THE
    STATED RULE FIRED. Observation 2 does not hold: the platform primitive is refused and the claim is
    ours on every platform.*** Against a primary running but not pumping messages,
    `app.requestSingleInstanceLock()` blocked **20,004.6 / 20,010.9 ms** against a 5-second interval,
    returned false, performed **no reclaim and no retry**, and the hand-over never reached the primary —
    not even in the 25 s after it recovered, so it was **dropped rather than queued** — and the launch
    ended with **no window on screen**. It cannot be wrapped: the call is synchronous on the launching
    process's own main thread and takes no timeout. **Observations 1 and 3 passed and are carried forward
    as measured obligations on the replacement** — first-attempt reclaim at **+187 ms** after a force-kill
    with the window shown at +345/+373 ms and the release bracketed to a 67–69 ms window, and 69 probes
    with no observable effect — as is declared-field delivery, because `argv` really was mangled. The
    JS-blocked-but-pumping sub-case passed at 4.07/4.82 ms, and it passed in a way the record would not
    have chosen: the hand-over callback ran inside the dialog's nested message pump while the primary's own
    timers were dead, so a hand-over can be delivered into a process that is otherwise entirely stopped.
    ***Two thirds of the obligation is now UNMET RATHER THAN INHERITED, and this is the part that grew.***
    macOS and Linux were not measurable on this host, and adopting our own record **relocates** the
    verification rather than discharging it: a hand-over endpoint and a stale-record protocol we write
    ourselves must be verified on both, and on macOS must additionally compose with the convention that a
    second launch of a bundle produces no second process. **The cross-platform endpoint is the piece with
    no measurement anywhere behind it**, it sits on the critical path of every launch, and its failure mode
    is the same one that failed under the primitive — a launch that ends with no window.
    **The single-instance record's probe and reclaim, on all three platform keys.** *(ADR-0055, which
    records this as a verification obligation and names it a spike; constraint P-16; `REQ-STARTUP-164`,
    `REQ-STARTUP-030`.)* `REQ-STARTUP-164` fixes a 5-second hand-over interval, **at most one** reclaim,
    two claim attempts, no spin, no side effect on the probed process, and nothing written but the record.
    The platform primitive performs the probe and the reclaim **on its own schedule**, and the documented
    surface states no timeout and no reclaim rule — so whether the schedule matches the requirement's is a
    measurement the record does not have. Three observations decide it: **(a)** a record left by a process
    killed without cleanup must not make the application unlaunchable, and the next launch must reach a
    window inside `REQ-STARTUP-155`'s 5 seconds; **(b)** a recorded process that is running but not
    answering resolves within the stated interval, with at most one reclaim and no spin; **(c)** the probe
    leaves the probed process unaffected. **If any of the three fails, ADR-0055's alternative I is adopted
    on every platform — our own record file and our own discipline — and the primitive is dropped rather
    than wrapped in a timeout**, because one record resolved two different ways is worse than either. The
    failure mode is a product that will not start, and it is invisible until it happens.
17. ***Discharged for Windows 2026-09-01 — `spikes/packaged-first-paint.md`. Narrowed, not struck: the
    macOS `.dmg` and the Linux AppImage were not built and `REQ-STARTUP-155` binds both.*** Launch each
    of `REQ-STARTUP-031`'s four artifacts and measure launch to first painted frame, with **no
    per-flavour differential** permitted. **The Windows result triggered SR-7**: the portable produced by
    the packaging tool's own target reached first paint in 13,287–19,580 ms at four bundle weights
    including a zero-payload build — 92 % of it before any of our code starts — against 664–1,561 ms for
    the same payload installed. No setting inside the tool closes the gap.
    **ADR-0055's "Revisit if" fired exactly as written and named the wrong remedy**, which is recorded in
    that ADR as a reversal: it predicted the conversation would be "about the budget or about what is
    bundled", and SR-7 kept the budget, kept `REQ-STARTUP-013` and `REQ-STARTUP-031`, kept what is
    bundled, and changed the **launch mechanism**. The clause assumed only two variables existed.
    **One factual correction the record must carry:** the portable stub **deletes its extraction directory
    on exit**, so there was never a warm path and no design may assume a portable user gets a cheaper
    second launch, or that anything may be cached in that directory between launches.
    **Still owed:** the two remaining platform artifacts, on machines of their own platform key, which
    `REQ-STARTUP-156` now requires at the release gate anyway.
18. **Cross-process write contention on the one workspace store.** *(ADR-0058 consequences 2 and 6,
    ADR-0002, OQ-2; constraints W-01, W-02, W-05, U-03, D-16.)* The run host and the workspace service
    both open the store read-write, so they share one write lock — a coupling that did not exist when they
    wrote different files. Measure the delay a run host's publish commit suffers while the workspace
    service is committing, at `REQ-TRACE-300`'s scale, with W-05's short `IMMEDIATE` transactions in force
    and with the ban on holding a write transaction across `REQ-TRACE-073`'s regexes and
    `REQ-TRACE-225`'s unbounded read **deliberately violated in one arm**, so the cost of getting that rule
    wrong is a number rather than a warning. `REQ-MONITOR-218` forbids a delay floor **of any size** before
    publishing an unseen row and D-16 requires it committed first, so any contention lands exactly there.
    **If it is real, ADR-0058's alternative G — one store written only by the run host and one only by
    the workspace service — removes it entirely and no requirement can observe the split**; SR-4 ruled one
    store per workspace, so taking alternative G would need the ruling revisited, which is why the number
    matters before implementation rather than after. **Run this with spike 21**, which needs the same
    harness and the same contending writer, and whose figure is meaningless without this one's.
19. ***Discharged on its own question 2026-09-02 — `spikes/remote-and-synchronised-storage.md`. It could
    NOT decide ESC-21's strength, and it said so rather than inventing a result.*** **What it settled:**
    exclusive create is a genuine primitive over a network share — 2,500 races across five pairings
    including two that mix I/O stacks, **exactly one winner in 2,500, more than one in 0, none in 0**; the
    atomic document primitive holds on a share **only with the retry ladder**, 6.2 % of first attempts
    failing with no other opener present (OQ-44); `REQ-STARTUP-166`'s direct classification is real,
    precise and cheap, correct at every depth inside a live third-party sync root and correctly negative
    one level above it, p50 0.10–1.83 ms; and `REQ-GIT-124`'s ordering of the storage check ahead of the
    lock check is confirmed by measurement, both halves independently. **What it disproved:** ESC-15's
    stated mechanism, in two of its three links (constraint W-04) — the conclusion survives on three worse
    measured failures. **What it exposed:** the `REQ-EVENTS-084`/`REQ-EVENTS-088` gap, now closed by
    `REQ-EVENTS-179`; and a same-machine two-spellings hazard now carried as constraint W-27.
    ***What it could not do, and this is the part that stays owed:*** ESC-21's **second** premise needs a
    second machine and a synchronisation account. The report states the closing experiment precisely — two
    machines, one synced folder, an exclusive-create race against the same lock name with a wall-clock
    barrier — and calls it one afternoon's work; **the single number that matters is races in which both
    machines' exclusive create returned success.** Until it is taken, the refusal-versus-warning strength
    of ESC-21 rests on reasoning rather than on measurement. **Also unmeasured and worth naming:** the
    classification's blind spot is any client that registers no platform sync root, and the most widely
    deployed such client was present on the measuring machine and registered **none**; exclusive create
    against a **dehydrated cloud placeholder** was not exercised; and the replace path was tested against
    only one of the four destinations ADR-0004 names — the spike declined to write into the machine's live
    sync roots because they hold the user's own material, which was the right call.
    **What ELSE the product writes into `.rotaris/` on synchronised storage.** *(Same number, **new
    question**, changed by ESC-15 exactly as that ruling said it would be. ADR-0058, ADR-0005;
    constraints D-29, W-20, W-04, W-27, B-24; ESC-21.)*

    **The old question is answered by a requirement and is withdrawn.** It asked which of three things
    happens to a store on a share or in a sync folder. `REQ-SESSION-198` puts the store on the machine's
    own storage always, and requires such a workspace to be **fully usable** — so no store is ever there
    to refuse, degrade or corrupt.

    **What replaces it is narrower and touches a safety property rather than a usability one.** Two things
    the product writes into `<workspace>/.rotaris/` now travel with the workspace and are reached by
    exclusive create (constraint D-29): the **workspace identifier**, and `REQ-GIT-128`'s
    **`integration.lock`**. Establish, on a mapped network drive, on an SMB share and inside at least two
    cloud-sync clients: whether exclusive create is honoured as a primitive or reconciled after the fact;
    whether two machines can each successfully create `integration.lock` and both proceed; and whether the
    identifier file can be duplicated, conflict-renamed or resurrected by a sync client. **The integration
    lock is the sharp part**, because `REQ-GIT-128` states a cross-machine obligation and its failure mode
    is two machines merging into one base branch at once, silently. A cloud-sync folder is a **local**
    filesystem with a daemon on top and must be measured separately from a true network share rather than
    assumed to share the verdict. **ESC-21 turns on this.**
20. ***Discharged 2026-09-02 — `spikes/cached-portable-launch.md`. SR-7's gate condition is met and the
    remaining options SR-7 held in reserve are not needed.*** **The three figures it was raised for.**
    Cached first paint **575.5–624.2 ms warm and 897.3–1,242.5 ms cold** (n = 6 each), replicated
    independently at 581.3–723.1 / 964.0–1,414.6 ms, against 5,000 ms; the exempt **preparing** run lands
    inside the bound it is exempt from at **1,634.7–2,091.3 ms** warm and 3,798.8–3,909.8 ms
    single-threaded. The **fast-path check** costs **0.14–0.49 ms warm, 0.37 ms on a cold first touch**,
    against 709.6–845.0 ms for the fastest launch-time digest of the artifact, 1.48–1.95 s for a
    pure-Rust one, and 4.43–5.50 s for a digest of the prepared tree. **Cache invalidation across an
    update did not fail** — a one-line change produced a different token and prepared afresh, the previous
    version's preparation stayed intact and was still used at 591.3 ms, and two token-named directories
    coexisted, each with its own marker. **Two defects were found in ADR-0054's own mechanism, both fixed
    there, and neither is visible in a build that never meets a damaged preparation**: the commit step
    could not commit (a directory cannot be renamed onto an existing directory on Windows), and the
    completeness check returned a **hit** on a preparation that launched and produced **no window**.
    **One correction the record must carry:** `REQ-STARTUP-125` is not merely preserved by SR-7's ruling,
    it is **rescued** by it — under the packaging tool's portable target the artifact was locked for the
    entire run, 79 consecutive failures with the first rename succeeding only at 16,837 ms as its own
    process exited, so "the replacement SHALL succeed while the application being replaced is still
    running" **was not satisfiable on that target at all**; under the preparation the rename succeeded on
    the first attempt at 189 ms with the application alive. **And one figure this register mis-attributed:
    the 13,287–19,580 ms is the packaging tool's extraction cost, not this mechanism's** — the launcher
    writes the same tree in 410.7–565.7 ms, so anywhere the price of a preparing run is quoted in tens of
    seconds it is the wrong number.
    ***What it did not do, and one item is a listed gap rather than a footnote:*** clause (c)'s **no
    usable preparation at all** branch and its notice were **not attempted**, and clause (d)'s "issues no
    network request and raises no elevation prompt" is true only by construction of the spike's own
    launcher — no network capture, no privilege trace. Also unmeasured: a real read-only volume rather than
    an access-control approximation; the commit's durability discipline, so a power loss could leave a torn
    tree behind a valid marker, which is the one damage class the per-file manifest does **not** catch; a
    real download carrying the platform's mark-of-the-web, which lands exactly where the release gate now
    looks; and a materially larger bundle or fewer cores, which is the figure that stops being comfortable
    first.
    **The prepared portable's steady-state launch. *`owner-decisions.md` SR-7 named this as required
    before the gate.*** *(ADR-0054, ADR-0055, ADR-0056; constraint B-23, `REQ-STARTUP-165`,
    `REQ-STARTUP-155`.)* Three figures, in order of what they decide. **The cached-launch first paint**,
    which is the whole point: SR-7 keeps `REQ-STARTUP-155`'s 5 s bound for every run after the one that
    prepares, and the only evidence it is reachable is the §6.1 file-copy baseline of **0.7 s for the same
    508 MB tree**, which is a baseline and **not a result**. **The cost of the identity check on the fast
    path**, which ADR-0054 designs as one directory probe and one small marker read against a build-time
    token, deliberately not a launch-time digest of a 100–500 MB artifact. **Cache invalidation across an
    update**, where `REQ-STARTUP-125` lands the replacement on the artifact and leaves the preparation to
    be superseded on the next launch, so the next launch must notice.
    **ADR-0054's and ADR-0055's *Revisit if* clauses both turn on this**, and `REQ-STARTUP-156` now
    requires the release gate to observe **two runs** of a self-preparing artifact on the same machine —
    the one that prepares, and a later one where the bound is actually observed — so this is a release
    obligation as well as an architecture one.
    ***Corrected 2026-09-02: this entry said "One case has no stated outcome and should be exercised
    here". The outcome is now stated and the case should still be exercised — as specified behaviour to
    verify rather than as a gap to characterise.*** `REQ-STARTUP-165`(c)'s third paragraph covers a run
    that can produce **no** usable preparation at all: it "SHALL still start the artifact", is exempt
    from the first-paint bound, and — uniquely among the five preparation outcomes — **is reported**,
    once per such run, after the window is painted, on the persistent notice surface at warning severity,
    conveying that the artifact could not prepare itself, which storage it could not prepare into, and
    that every launch will cost what this one cost until that storage accepts a preparation. So the
    silent 13–19 s degradation this entry described is no longer the specified behaviour. What to
    exercise: that the notice actually fires, that it names the per-user data location and never the
    placement within it, and that the four silent outcomes stay silent — ADR-0054 names
    "implementing four-silent-one-loud from a habit of *the-preparation-is-silent*" as the specific error
    to prevent.
    **One reading question rides on this and should be settled before, not after** (see the specification
    defects the gate verdict lists): clause (c) requires such a run to start the artifact and clause (d)
    requires preparing to "write nothing outside the per-user directories of `REQ-STARTUP-145`", and the
    payload cannot run without existing as files — so where that root refuses **every** write the two
    clauses are jointly unsatisfiable on the conservative reading. ADR-0054 designs for the conservative
    reading, covers the reachable failures by placing an ephemeral tree under the same root, and records
    the residue.
    ***Also on this spike's harness, and cheap there:*** the cost of the store open after the show, which
    ADR-0055 keeps off the critical path by construction and nothing has measured. `PRAGMA quick_check`
    on a large store is bounded rather than fast, and the post-show pipeline is where the window becomes
    *useful*.
21. ***Discharged 2026-09-02 — `spikes/commit-on-the-publish-path.md`. The lower bound is gone and the
    margin survives at two thirds of its old size.*** Commit **then** publish, end to end over the relay:
    **p95 1.774 ms at 0 rows and 1.723 ms at 10,000**, against 250 ms — the quoted margin falls from ~221×
    to **~141×**. `REQ-MONITOR-223`'s ratio is **0.971** against a ceiling of 2; zero of 20,000
    publications exceeded 250 ms; the commit alone is **0.28 %** of the budget and the whole interval
    **0.71 %**. Persist-before-publish costs **0.396 ms p50 / 0.700 ms p95** and it is work, not a wait.
    Making each event durable individually is **free** — marginal cost −4 to +31 µs at p50 — so
    `REQ-EVENTS-029` is not a cost the design absorbs. **ADR-0058's own open item is closed** and its
    commit-cost Revisit-if is **not triggered, on evidence**.
    ***Three things it changed that were not the question.*** **(a) The shape of the distribution matters
    more than the percentile**: the automatic checkpoint fires every **135–136 commits** — arithmetic, from
    7.44 log frames per publish-path commit against a threshold of 1,000 — at **9–11 ms p50, worst observed
    53 ms**, while the other 99.27 % cost 179–220 µs. Nothing threatens 250 ms, but any threshold built on
    "about a millisecond" will see routine fifty-fold excursions on a fixed period, and **the checkpoint
    period is a design input**: widening the publish-path transaction shortens it proportionally.
    **(b) ADR-0058's stated ground for forcing the stronger durability setting on a terminal save is
    false** — a separate process using a different binding read a terminal status back immediately at the
    weaker setting — and the decision is re-grounded on power loss, which nothing has tested (constraint
    W-06, OQ-12). **(c) `REQ-MONITOR-218`'s no-delay-floor rule can be broken from outside this record**:
    a second process holding a 200 ms write transaction produced a **205.4 ms** commit, and held back to
    back the writer starved indefinitely, which makes constraint W-05 a conformance obligation with a
    number attached rather than hygiene.
    ***What it did not measure*** is listed in the group (a) note above and in the table: a real schema, two
    run hosts, any failure path at all, packaging, power loss, and any machine but one.
    **The commit on the publish path.** *(ADR-0058, ADR-0008, ADR-0009, ADR-0010;
    constraints D-16, U-03, U-04, W-05, W-06, W-21, W-28.)* `spikes/ipc-hop-latency.md` states in its own
    section 8 that "the database commit `REQ-MONITOR-221` requires before publication" is **outside** its
    measured interval, so every transport figure in this record is a **lower bound** on `REQ-MONITOR-222`'s
    and `REQ-ORCH-155`'s own intervals. `REQ-MONITOR-218` forbids a delay floor **of any size** before
    publishing an unseen row and D-16 requires it committed first, so any cost lands exactly there.
    Measure: commit cost at the weaker durability setting under write-ahead logging, for **one transcript
    row plus its event** in one transaction and for **one whole-session update**, at `REQ-MONITOR-219`'s
    20-per-second tick, **with a second writer process contending on `BEGIN IMMEDIATE`** (which is spike
    18's subject and shares this harness), plus the `fsync` cost of a terminal-status save
    (`REQ-SESSION-070`) on each platform's per-user data volume.
    **One input to this measurement does not exist yet and must be counted first.** With
    `REQ-SESSION-067`'s window withdrawn, the **save-request rate** is set by the run loop's call sites
    and by nothing this record controls, and `REQ-SESSION-071` states no bound. Nobody has counted it.
    **A related figure is owed on the same path**: the summary rewrite at that rate, including
    `REQ-SESSION-033`'s ladder under anti-malware, which the writer-handle spike showed is load-bearing
    rather than defensive at realistic reader cadences and which was never exercised against that file.
    *For calibration rather than as a claim: the file design's per-event durable write measured 0.518 ms
    p50 with an `fsync` and 0.0135 ms without one. An ordinary commit performs no `fsync` and should cost
    less — that is inference, and it is exactly what this spike exists to replace with a number.*
22. **The whole-store backup and its restore, end to end. *DISCHARGED 2026-09-02 —
    `spikes/backup-restore-mechanism.md`. BOTH halves are now measured and the restore as ADR-0058 wrote
    it FAILED 0 of 30.*** *(ADR-0058, ADR-0005, ADR-0002, ADR-0056; constraints W-24, W-29, W-30, W-31;
    `REQ-SESSION-201`, `REQ-SESSION-202`.)*

    ***What discharged it, and what a reader must not take from the discharge.*** The restore was built
    and run — three real processes, an Electron confirmation run, a fault injector at every point the
    record names a failure, thirty repetitions per verdict on a fresh world each time. **It found three
    defects, all three now corrected, and eight more it did not fix.** The three: the staging connection
    that no step closed, so the install rename was refused `EPERM` in 30 of 30; the liveness gate evaluated
    before runs were refused, which destroyed a live session and every row it had written; and the reversal
    that fails identically to the step it exists to undo. **The eight uncorrected are enumerated in the gate
    verdict in [`README.md`](../README.md) §6 and are defects with owners rather than measurements owed.**
    **A spike is discharged when its question is answered, not when the answer is comfortable** — and this
    one's answer is that the mechanism did not work. *Two sub-cases it could not reach are carried in group
    (d) above: the re-run of the corrected mechanism, and the kill-in-the-gap case.* **Everything below that
    the measurement did not reach is marked in place rather than deleted, because what a spike leaves owed
    is as much a part of its result as what it settled.**

    ***What spike 19 settled incidentally, on 2026-09-02, and it settled the alternative rather than the
    mechanism.*** A **naive file copy of a live store is unopenable 625 times in 627** — 150 of 152 under
    write-ahead logging and **475 of 475** under a rollback journal, so the rollback case is worse rather
    than a safe fallback — while `VACUUM INTO` produced **8 valid snapshots out of 8** during 108,525
    concurrent commits, integrity-clean, checksum-clean and monotonic, at a **median 1,077 ms per 41 MB**
    on local storage. That is the mechanism `REQ-SESSION-201`'s "valid while runs are live" needs and it
    now has a number. **And the trap is recorded so nobody falls into it twice:** the gentle version of the
    same experiment — a realistic 20 commits per second against a small store — returns **0 bad copies in
    40**, so the obvious test gives a false all-clear and makes the choice look arbitrary to whoever runs
    it next.

    ***"Everything below is still owed. Every step of the restore is individually justified from the
    requirement; nothing has been run" — WITHDRAWN 2026-09-02.*** It has been run. What follows is kept
    with each item marked, because four of the five things this entry asked for are answered and one is
    not, and collapsing them would hide which.

    **A documentation check comes first, costs nothing, and decides one alternative against another on
    its own.** ADR-0058 chooses `VACUUM INTO` over the engine's stepped online-backup API on a
    *documented* property — that the stepped API restarts the copy when the source is written through a
    connection other than the one driving it — and says explicitly that it read this rather than measured
    it. ADR-0002 puts **two** writer processes on this store, and `REQ-SESSION-201` forbids refusing a
    backup because a session is live, so under `REQ-MONITOR-219`'s tick every run-host commit is an
    external write and termination is not obvious. **Confirm the property against the binding's own
    documentation before measuring anything.** If it does not hold as stated, the stepped API is the
    better mechanism and `VACUUM INTO` should be dropped. A reader skimming ADR-0058's *Decision* could
    take this as established; it is not. ***STILL OWED after spike 22.*** The spike modelled ADR-0058's
    chosen mechanism and states in terms that **alternative U is untouched**, so this check is exactly as
    open as it was and it is still the cheapest thing on this list.

    **Then four figures, in the order of what they decide.** (1) `VACUUM INTO` cost on a live store —
    time, destination space, and the one that is not obvious: **how much the write-ahead log grows while
    the read transaction pins it**, on a store large enough to matter, with a run committing at
    `REQ-MONITOR-219`'s tick. ***Half of this is now answered and half is not, and the split is the whole
    point.*** The **correctness** is settled — 8 valid snapshots in 8 under concurrent load — and the
    **time** has a figure at one size, a median 1,077 ms per 41 MB. **The log growth is not measured**, and
    it is the only input the mid-copy-checkpoint question and the progress-reporting question turn on. So
    the question is now "at what size does this stop being comfortable", not "seconds or minutes". This
    decides whether progress reporting, cancellation and a mid-copy checkpoint strategy are needed at all. ESC-19's own survey cites a comparable product's session logs
    reaching 700 MB to 2 GB, and ESC-9 leaves retention unbounded, so "large enough to matter" is not
    hypothetical. ***STILL OWED: spike 22 measured the restore, not the backup's log growth.*** (2) **The
    restore's connection-close handshake**, which had no timing figure anywhere. ***ANSWERED.*** The
    handshake itself is **1.2–1.5 ms** at every store size with the run host answering at once; the
    workspace service's own close is **1.0 ms**; each re-open is **3.4–5 ms**; and the figure this item was
    really about — **how long a user stares at a workspace whose store is deliberately absent** — is
    **64 ms at 68 KB, 144 ms at 11.8 MB and 1.45 s at 313 MB**, with the whole action reaching 2.67 s at
    that size. *Two things the measurement added that this item did not anticipate: the wait has **no bound
    at all** and does not terminate against a run host that never answers, which is now a defect rather than
    a figure; and the state the user sees during the gap is no longer only an empty list, because
    `REQ-SESSION-202` reclassifies the durable form of it as a store that could not be opened.* (3) The two
    renames, which ADR-0058 does **not** claim atomic, on the filesystems the writer-handle spike did not
    cover — network shares, ReFS, removable media and cloud-sync folders, all of which the destination
    may be. ***STILL OWED.*** Spike 22 ran on `C:` NTFS on local NVMe only, and states so. What it did add
    is the **local** semantics in full, which nothing had: a rename onto a name that does not exist succeeds
    30 of 30; onto an existing directory it fails **even when that directory is empty**, so there is no
    "replace if empty" on this platform; onto an existing **file** it succeeds and destroys the file; and a
    single held handle anywhere inside the directory is fatal from **any** process. (4) Whether an export
    holding a long read transaction can delay a transition commit, which `REQ-EVENTS-098` forbids
    **outright** rather than budgeting for; ADR-0024's and ADR-0041's export mechanisms both infer from the
    journal mode that it cannot, and inference is not what that requirement asks for. ***STILL OWED, and
    partly reframed rather than answered:*** spike 21 measured a *compliant* reader costing the writer
    163.6 → 345.9 µs p50 with zero lock contention, and `REQ-EVENTS-098` has since been amended into three
    clauses in which a measurable scheduling cost is expressly not a violation — so what is left to measure
    is the export's own reader, not the requirement's meaning.

    ***"This deserves running before the Architecture Gate rather than after" — DISCHARGED. It was run
    before the gate, and it was right that it should be.*** The requirement it implements is one of the two
    the owner minted in this pass, the mechanism is entirely architecture's, and running it found three
    defects that no reading of the record had caught in the months it stood.
