# Product-owner decisions on the architecture record — Escalations ESC-11 to ESC-18 — ruled 2026-08-31

Part 5 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Escalations ESC-11 to ESC-18 — ruled 2026-08-31

Delegated by the product owner to the clean-room manager. Where a ruling is contingent on a measurement
that has not been taken, the contingency is stated rather than hidden.

### ESC-11 — the Linux artifact's runtime

**Decided: ship on the stable line with the runtime pinned explicitly (option 2); if that line does not
permit pinning, ship on the pre-release line (option 1).** Options 3 and 4 are refused — option 3
contradicts `REQ-STARTUP-024` as written, and option 4 is forbidden by `REQ-STARTUP-031`'s closed
four-artifact set. Spike 12 establishes whether pinning is possible; it is a choice between 2 and 1, not a
reopening.

The deciding argument is not packaging convenience. The legacy image runtime **disables the shell's own
process sandbox unconditionally** on a distribution that restricts unprivileged user namespaces, where the
static runtime disables it only where namespaces are genuinely unavailable. ADR-0002 makes the sandboxed
renderer load-bearing: the transcript renders Markdown a model wrote and the terminal grid renders bytes an
arbitrary process wrote. "Linux users get that surface unsandboxed" is a **different product**, not a build
flag.

**Separately, and independent of which option is taken:** `REQ-STARTUP-156`'s release gate runs on a
machine the release owner controls, not on the unmodified baseline `REQ-STARTUP-024` names — so the gate
can pass while the requirement fails. That is a defect in the gate regardless of this ruling and must be
amended.

### ESC-12 — the tool-server protocol era floor

**Decided: the 2.x line with the pre-2026 offered-version entries retained (option 1).** This is ADR-0033's
own recommendation and it gives the widest server compatibility.

The stated cost — resting the product's tool story on a major release that is one month old — is real but
recoverable, and it decays with time. The alternatives are not: option 3 breaks every 2025-era server a
user already has, and option 2 makes current-era servers present as servers offering **no tools** rather
than as an error, which is the worst possible failure presentation. What a user observes differs under all
three and the choice is not cheaply reversible once configurations exist, so prefer the one that breaks
nothing.

### ESC-13 — the benchmark invariant against screen-reader access

**Decided: accessibility wins, and this is ruled now rather than left conditional on OQ-28.** If OQ-28
resolves to the framework-neutral reading, then `REQ-UIBENCH-054` is **relaxed** (option 2). The canvas
(option 3) is refused outright.

A canvas forfeits native text selection, keyboard navigation and per-row accessible names — all hard
requirements (`REQ-CHAT-075`, `REQ-CHAT-077`, `REQ-CHAT-065`, `REQ-SHELL-144`) — and its failure mode is
that a screen-reader user cannot read the conversation. `REQ-UIBENCH-088` makes the element-count
invariants **informational** under either reading. Trading a blind user's access to the product for an
informational benchmark number is not a trade this product makes, at any exchange rate.

**This ruling de-blocks OQ-28.** That question stops being existential for ADR-0045 and becomes what it
should have been: a definitional question about how a number is counted, whose answer changes a benchmark
field and nothing a user can see.

### ESC-14 — corrections to SR-4's own reasoning

**Decided: option 1, correct the paragraph. Already actioned** — see the correction block inside SR-4
above. The decision stands on the three arguments that hold; the OQ-41 claim is withdrawn and the
`REQ-CONFIG-192` phrasing tightened. Nothing about the storage decision changes.

### ESC-15 — a workspace on a network share or in a cloud-sync folder

**Decided: the workspace database is stored machine-locally and always, keyed by a workspace identifier
that travels with the workspace.** It does not live at `<workspace>/.rotaris/workspace.db`.

**This reverses ADR-0058's scope decision and that ADR must be rewritten accordingly.**

The problem is not slowness. A store on such a filesystem can fail in a way that leaves **no session in that
workspace able to start at all**, where under the file design the workspace worked, merely slowly. This is
the single most likely way a real user meets an SR-4 regression, and a corporate user may be in this
position by default without knowing it.

> **Correction, 2026-09-02 (GD-2). The reason this ruling originally gave is false, and the truth is worse
> than the claim it replaces. The ruling stands unchanged.**
>
> This section originally read: *"Write-ahead logging is unsupported on network filesystems, so the store
> opens read-only; acquiring a session lock is now a write; therefore no session in that workspace can start
> at all."* Spike 19 measured **both clauses false**. Write-ahead logging succeeded on a UNC path over SMB
> in 320 process-trials with zero errors: `PRAGMA journal_mode = WAL` returned `wal`, the read-back ADR-0058
> prescribes returned `wal`, and the 32 KiB shared-memory segment WAL requires was obtained over SMB. The
> store never opened read-only in any measured configuration — `db.readonly` was `false` in every network
> case.
>
> **What was measured instead, and why the conclusion is firmer rather than weaker.** Three failures, each
> worse than the one originally claimed. A store can report WAL enabled, read it back as WAL, own a valid
> shared-memory segment, and still fail its next write with a disk I/O error — with the failed write
> *silently absent* from the following read, so the store reports a row count that never included it.
> The condition is **path-spelling dependent**: the same share succeeds addressed as a UNC path and fails
> addressed through a mapped drive letter, which means whether a user's workspace works depends on how they
> happened to spell the path to it. And a store can open with `db.readonly` false and have its reads fail
> too. A failure that is loud, immediate and identical everywhere — which is what the original reason
> described — is a far easier thing to build against than one that reports success and loses the write.
>
> Always-local remains the answer for the reasons the rest of this section gives, and the measurement
> strengthens the one about detection being unreliable: a conditional path would now have to detect not
> "this is a network filesystem" but "this is a network filesystem addressed in a spelling that fails".

**Why relocate always rather than only on detection.** Detecting "this directory is inside a sync client's
tree" is unreliable — OneDrive and Dropbox folders look like ordinary directories, and detection would have
to be maintained against every client. A conditional path also means two storage layouts to build, test and
support. Always-local is one layout that is always correct.

**Why this is coherent rather than a workaround.** SR-5 already established that sessions are effectively
machine-bound: a session held by another machine is refused because its liveness cannot be established. A
machine-local session store is the honest expression of a property the product already has. Meanwhile the
user's own material — the repository, the requirement documents, the configuration — stays exactly where
they put it and synchronises perfectly well, because syncing a git repository is ordinary and syncing a
live database file is not.

**The cost, and its mitigation.** A machine-local store does not travel with the workspace, so moving or
renaming a workspace folder would orphan its sessions. Mitigated by writing a small, stable, human-readable
**workspace identifier** into `.rotaris/`, which *does* travel with the workspace and synchronise. The
database is located by that identifier, not by path. Moving the folder keeps the sessions; two machines
holding the same synchronised workspace each keep their own local session history, which is correct under
SR-5 rather than a compromise.

Spike 19 is retained, but its question changes: it no longer asks whether a synced workspace is usable, but
whether anything *else* the product writes into `.rotaris/` misbehaves on synchronised storage.

### ESC-16 — a store that will not open means no run at all

**Decided: accept the refusal.** The session refuses to start, with a stated reason naming the store and
the engine's own error. `REQ-SESSION-089` and `REQ-EVENTS-084` are amended.

`REQ-SESSION-089` requires a run to proceed with a logged warning when the durable event store cannot
open. That partial-failure mode no longer exists, because the event store, the session state and the lock
are now one object — there is no longer a coherent state in which the run has somewhere to record itself
but not somewhere to be recorded. Running while quietly unable to persist anything, and reporting that as
a warning, is a worse outcome for a user than not starting: it produces work whose record cannot be
recovered.

### ESC-18 — ESC-3 has been overtaken

**Decided: accept the improvement.** Under a transaction, `REQ-LIBRARY-042`'s read-modify-write becomes
atomic and two genuinely interleaved review decisions can no longer lose one another.

ESC-3 was ruled "match the specification: silent loss on the ordinary write path". Every guarantee
`REQ-LIBRARY-042` states still holds; what has become unreachable is the *defect* the requirement
accepted. Reintroducing a race in order to remain bug-compatible is not a thing this product does, and the
compatibility ruling recorded in the Specification Gate does not ask for it. `REQ-LIBRARY-042`'s closing
concession is amended to record that the store now makes the interleaving impossible.

### SR-7 — the onefile portable extracts once to a cache

**Decided: the single-file Windows portable extracts to a cache on first run and launches from that cache
thereafter.** `REQ-STARTUP-013`'s single-executable observable and `REQ-STARTUP-031`'s closed artifact set
are **unchanged**. `REQ-STARTUP-155` gains a stated first-run exemption for onefile artifacts.

**The evidence.** Spike 17 measured first paint on the portable at **13,287–19,580 ms** against a 5,000 ms
budget, at every bundle weight tested **including a zero-payload build**, with no packaging setting that
closes the gap (deflate 7,433 ms; uncompressed 5,307 ms). The same payload installed as a directory tree
paints in **664–1,561 ms**, and 1,232–1,593 ms with a cold cache from a path never launched before. The
Electron runtime is not the problem; re-extracting an archive on every launch is.

**Why this option.** The alternatives each surrender something the specification deliberately fixes.
Amending the budget needs at least **17.5 s**, which is not a product anyone wants. Amending
`REQ-STARTUP-013` and `REQ-STARTUP-031` gives up "a single executable file that runs with no support tree
beside it", which is the whole observable a portable exists to provide. Extract-once keeps both and pays
the cost exactly once, which is also what users already expect from portable applications.

**What must be decided with it, and is:**

- **The cache lives in the per-user local application data directory, never beside the executable.** A
  portable artifact must run from read-only or removable media — that is its purpose — so a cache beside
  the executable defeats the artifact. This is consistent with ESC-15's ruling that machine-local state
  belongs in machine-local storage.
- **Keyed by artifact version and content digest**, so a new version extracts fresh rather than running
  stale code, and a superseded cache is identifiable for reclamation.
- **A partial, corrupt or unreadable cache re-extracts** rather than failing. Extraction is the recovery
  path, so it must never be the failure path.
- **"First run" means first run of a given artifact version**, and the exemption `REQ-STARTUP-155` gains
  must say so, or a reader will take it to mean first run ever.

> **Correction, 2026-09-02 (GD-2). The evidence above stands unchanged. One mechanism this ruling relies on
> does not exist, and is replaced.**
>
> This ruling depends on a launch being able to identify the artifact it started from, and the record
> assumed the packaging tool's own portable-executable environment variable would carry it. Spike 20
> measured that variable **null in 0 of 157 launches** through our launcher — all three of its spellings.
> The tool sets it only when the tool's own portable stub is the thing that runs, and under extract-once it
> is not: our launcher is. The variable was confirmed present and correct when the tool's stub *does* run,
> so this is a consequence of the ruling rather than a fault in the tool.
>
> **The replacement was measured in the same run.** The launcher's own declared variable carried the correct
> absolute artifact path in **149 of 149** launches that painted, and `process.execPath` reported a location
> inside the cached preparation in the same 149 of 149. Identification is therefore by our own declared
> variable, which we set and can rely on, and never by the packaging tool's.
>
> Nothing about the decision moves: the timing evidence that chose extract-once is untouched, and so is
> every bullet above. What moves is which mechanism `REQ-STARTUP-165`(e) and `REQ-STARTUP-106` are satisfied
> by.
- **Self-update is unaffected in intent but not in mechanism.** `REQ-STARTUP-106` and `REQ-STARTUP-125`
  target the running executable file. Spike 15 already established that under the portable flavour
  `process.execPath` points into the extraction directory rather than at the artifact; under a cache it
  points into the cache. The artifact is identified by the packaging tool's own portable-executable
  environment variable, not by `execPath`. This must be stated in ADR-0054 rather than discovered.

**Spike 20 is required before the gate:** the cached-launch figure, the cost of the version check on the
fast path, and cache invalidation across an update. The 0.7 s file-copy baseline says the target is
reachable; it has not been measured on this mechanism.

### SR-8 — REQ-ORCH-155's 100 ms is a percentile, not an absolute bound

**Decided: read as a p95, and amend the requirement to say so.**

Spike 10 measured the whole-session-update path at **p95 5.95 ms** unloaded and 7.81 ms under 65.5 MB/s of
terminal frames — 8× to 40× inside the budget. Read as an *absolute* bound the same data fails: 24 of
9,000 samples exceeded 100 ms, worst 125 ms unloaded. The requirement states no percentile, so the spike
reported both readings and declined to choose.

The absolute reading is not merely expensive, it is **unsatisfiable in principle**. No userspace program on
a preemptive multitasking operating system can bound the latency of every sample over an unbounded run:
scheduler preemption, garbage collection and paging are all outside the application's control. A
requirement that cannot be met by any implementation is not a requirement, it is a defect. The percentile
reading is therefore the only coherent one, and it is met with a wide margin.

The amendment must state the percentile explicitly rather than leave it inferred, since `REQ-MONITOR-222`
already states one and the silence in `REQ-ORCH-155` reads as deliberate contrast.

### SR-9 — two gaps the specification pass exposed in SR-4 and SR-6

Both were found by tracing guarantees rather than requirements, and neither is covered by an earlier
ruling.

**(a) The export list was too short by SR-6's own reasoning. Extended.** Improvement artifacts were
readable JSON under `.rotaris/improvement_artifacts/`, and delivery records were readable files under
`.rotaris/requirements/`. SR-4 makes both rows, and neither had an export. SR-6's argument — that moving
records a user could previously read for themselves into rows is a straight reduction in what a user owns
about their own runs — reaches these two exactly as it reaches the permission audit. The improvement store
additionally carries the recorded version history `REQ-LIBRARY-168` calls "the audit trail the write path
keeps", which is the same phrase that made the permission audit SR-6's strongest case.

**Both gain an export on the same terms as the four in SR-6.** This is an extension of SR-6 to cases its
reasoning already covered, not a new decision.

**(b) A machine-local store changes what a backup protects, and nothing tells the user. New requirement.**
Under the file design, backing up or synchronising a workspace backed up its session history. Under
ESC-15 it does not: the workspace travels, the sessions stay on the machine. The exports are now the only
way a user carries history anywhere durable.

This was never stated as a requirement, so nothing was strictly lost — but it is a **new user-visible
property that nobody owns**, and the failure mode is a user who backs up their workspace, restores it, and
discovers their session history was never in it. A requirement is minted so the product states the
property rather than letting a user infer it from an absence.

**This is the minimum honest fix and it is deliberately not the only option.** If the product owner would
rather solve it structurally — a configurable store location, or an explicit backup action covering the
whole store rather than per-record exports — that is a larger decision and this ruling does not foreclose
it. Recorded as reversible.

---
