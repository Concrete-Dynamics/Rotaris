# Rotaris-crw — system architecture — 7. Index of decisions

Part 13 of 13 of [the architecture README](../README.md), which indexes every part.

## 7. Index of decisions

Numbered in dependency order: the earliest numbers carry the decisions everything else rests on. **Two
rows break that rule and both say so.** ADR-0057 was found missing after the others were numbered, and
ADR-0045, ADR-0046 and ADR-0056 all depend on it. ADR-0058 was added under SR-4 and is numbered after
everything it constrains — ADR-0003, ADR-0004 and ADR-0005 all now depend on it.

**Three filenames no longer match their titles, deliberately.**
`adr/0003-files-are-the-system-of-record.md` now holds an ADR titled *Where state lives: the line between
a file and a row*. The filename was left alone because the number and path are referenced from this index
and from an unknown number of the other records; renaming it is a repository-wide change and belongs to
whoever next sweeps the index, not to the pass that reversed the decision. The same is true of
`adr/0058-the-workspace-database.md`, whose title no longer says "database", and of
`adr/0024-evidence-and-audit-files.md`, whose subject is no longer files. **Two records also changed
scope without changing their titles, and both say so in a header note rather than in the index**:
ADR-0041 now owns the improvement store's export and only the export, and ADR-0056 now carries the
native-module Electron-ABI obligation. A README summary will not pick either up on its own, which is why
both are spelled out in the rows above.

**Two records in this index have not been swept against the specification as it now stands, and both are
reported here rather than repaired, because repairing either is a rewrite of an argument and not a
citation fix.** ADR-0037 states that `REQ-CONFIG-288` "has not been amended, and this record must not
pretend otherwise" and treats `REQ-CONFIG-423`'s second sentence as having lost its antecedent. Both
requirements have since been amended and both statements are now false. **ADR-0019's header describes a
"residual tension" with `REQ-SANDBOX-101`** that is materially narrower than the record still says:
`REQ-SANDBOX-101` has since been amended and now states the capability test in terms — "it is a test of
capability, not of registration: a presenter registered but which cannot actually put a prompt in front of
anyone does not make the run attended … a session with a presenter present but wedged is unattended under
both". That paragraph is now the stalest thing in a record that was otherwise rewritten in this round, and
it deserves its own pass rather than a drive-by edit inside a measurement pass.

**Three records also carry a claim about another record that a measurement has changed underneath them,
and the cross-references should be checked once, together.** ADR-0058's statements touch ADR-0005 (the
lock table, and the integration lock under ESC-21) and ADR-0056 (the Electron rebuild, and two newly
recorded binding disciplines); ADR-0054 hands ADR-0056 a compression requirement and a measured build
budget; and ADR-0055 consequence 15 now depends on ADR-0019 carrying an application-wide prohibition on
synchronous native dialogs. All of those landed in the same round, from different agents.

**Three further cross-record items were created by the restore measurement and should be swept with them.**
***ADR-0056's Electron-ABI statement is now false as written for the shipped binding version***: ADR-0058
says an ABI mismatch "aborts the load with a specific message naming the two `NODE_MODULE_VERSION` values"
in both directions, which was measured on `better-sqlite3@12.11.1` and does **not** hold for `13.0.3` —
that binding is Node-API, its prebuild loads under host Node and under Electron alike, and there is no
mismatch in either direction. The obligation is not discharged by that: the asar-unpack half is untouched,
a later move to a NAN-based binding reinstates the whole of it, and the rebuild the record budgets for
**reports success while compiling nothing**. ***ADR-0058 now states two obligations on ADR-0002
consequence 11 from ADR-0058's side only*** — that the refusal of new runs must be in force before liveness
is judged, and that the failure path must release the run host — and ADR-0002 does not say either.
***ADR-0058's spike citations point at step numbers the ADR no longer has***: the swap renumbered when the
refusal and both liveness evaluations moved into it, and the spike is a dated measurement of the prior
version, correct about what it measured. The spike was deliberately left alone; a reader moving between the
two should expect the offset.

| # | Decision | Evidence |
|---|---|---|
| 0001 | Implementation language and runtime baseline | |
| 0002 | Process topology *(topology **confirmed** by measurement; **workspace identity settled** — the service is keyed by resolved path and the store by identifier, and the specification fixes both; **not reopened by the commit**, which takes the whole interval to 0.71 % of budget. **Two topology facts it does not yet carry**: the run host does not outlive main, so nothing that must happen on the way down may be placed there; and the run-host-to-renderer direct port is the only transport that survives a blocked main, which is a robustness argument for it independent of throughput)* | ipc-hop-latency, commit-on-the-publish-path, presenter-liveness-and-instance-claim |
| 0003 | Where state lives: the line between a file and a row *(reverses in part; depends on 0058)* | |
| 0004 | One document primitive, **three** write shapes, and a guarded read side *(file surface re-derived as a table of targets; trim generalisation withdrawn; **the retry ladder is now evidence-backed and the cause is not the one the record inherited** — 6.2 % first-attempt failure on shared storage with no other opener present; **and a factual error about ADR-0058's backup mechanism is corrected with the error visible**)* | windows-writer-handle-compaction, remote-and-synchronised-storage |
| 0005 | The session lock as the single capability token, **and the one lock that is not a row** *(**ESC-21 carried**: the integration refuses on replicated storage and the lock is never created. **ESC-21's first premise is now measured — 2,500 races over a network share, exactly one winner in 2,500 — and its second is not**, so the refusal-versus-warning strength still rests on reasoning; `REQ-GIT-124`'s ordering of the storage check ahead of the lock check is confirmed by measurement. **Consequence 11 is now CONFIRMED by the case it was written for, against its own measured counterfactual** — with the correction, sessions live at backup time arrive reachable and the ordinary repair settles them; without it they arrive naming a dead machine, live, not repairable, and releasable only one at a time. The subjunctive is now indicative. **One non-coverage clause is added**: it governs foreign-host rows arriving from the artifact, not foreign-host rows already in the target, which is §6 list A item 1)* | remote-and-synchronised-storage, backup-restore-mechanism |
| 0006 | Two clock ports and a budget primitive; no bare timers | |
| 0007 | Secret redaction: one module, two output forms | |
| 0008 | One ordered session writer per session, owning that session's transactions | |
| 0009 | The event history as a table, with the line-delimited form as an export *(**the transaction-boundary disagreement with 0004 is settled**, in this record's favour, on `REQ-EVENTS-088`'s sticky-failure rule; **per-event commit is now measured free rather than a cost the design absorbs, and this record withdraws its own contribution to ADR-0002's placement argument**; the checkpoint period is recorded as a design input)* | windows-writer-handle-compaction, commit-on-the-publish-path |
| 0010 | Three channels between the run host and its surfaces | ipc-hop-latency |
| 0011 | Following a session this process does not own *(**withdrawn in place** under SR-1 and SR-2)* | |
| 0012 | The delegated-child scheduler: a persisted ledger, not a promise graph | |
| 0013 | The run registry: addressing by session id | |
| 0014 | Cancellation, teardown and the quit choreography | |
| 0015 | Lifecycle hook invocation *(cross-slice tension recorded)* | |
| 0016 | The tool registry and its direction-aware accessor | |
| 0017 | The permission policy as an immutable compiled value | |
| 0018 | A purpose-built shell scanner | |
| 0019 | Approvals: wait registry with the gate; the presenter is a revocable capability *(slice conflict OQ-4 remains; the **requirement** conflict is dissolved by the amended `REQ-TOOLS-053`; **the channel-close revocation is measured not to be the mechanism that operates**; obligation 3 is restated application-wide as the synchronous-dialog prohibition; a fourth obligation is added — the lapse check must be gap-based; **the `REQ-SANDBOX-101` paragraph in its header is stale — see above**)* | presenter-liveness-and-instance-claim |
| 0020 | Terminal execution *(escalation ruled — ESC-5)* | |
| 0021 | The terminal screen model and stream fan-out *(**load-bearing for `REQ-MONITOR-222`**; conflict recorded)* | ipc-hop-latency |
| 0022 | OS-level confinement *(escalation ruled — ESC-6, provisionally revisited)* | |
| 0023 | Network egress and the `fetch` tool | |
| 0024 | Evidence and audit as append-only tables behind one writer, what the audit's export must prove, **and which record may never be exported** *(its "a 5,000-entry read should not delay the writer at all" is measured false and the conclusion survives on the blocking reading of `REQ-EVENTS-098`; a successful store open is now stated not to be evidence of a working store, which for a **best-effort** audit means a run whose permission decisions were all taken and none recorded — so the failure counter is load-bearing rather than diagnostic)* | commit-on-the-publish-path, remote-and-synchronised-storage |
| 0025 | Custom tool plugins *(escalation ruled — ESC-7)* | |
| 0026 | The internal model boundary: two ports | |
| 0027 | The AI SDK behind `ModelClient`, scoped tightly | |
| 0028 | Providers as frozen data plus capability registries | |
| 0029 | Credentials stay individual protected files | |
| 0030 | Sign-in flows and credential leasing | |
| 0031 | Money as an exact-decimal type *(accepted, narrowed, 2026-09-23 — OQ-21 ruled; the library question is left to the balance alone)* | |
| 0032 | Discovery, snapshot and effective configuration | |
| 0033 | The tool-server client: the official SDK's protocol layer, our own stdio transport *(escalation ruled — ESC-12)* | |
| 0034 | Tool-server connections and configuration resolution | |
| 0035 | The bundled code-intelligence runtime | |
| 0036 | Configuration stays YAML files, loaded through the document tree over a tri-state model *(the boundary is now `REQ-CONFIG-477`, not an architecture position)* | |
| 0037 | When a configuration change takes effect *(**ESC-1 ruled and both requirements since amended**; `REQ-CONFIG-288` now takes the decision itself and `REQ-CONFIG-423`'s antecedent is restored — **this record has not been swept against that and is stale in two places**)* | |
| 0038 | Version control by spawning the executable | |
| 0039 | Checkpoints as ordinary commits through a private Git **file** index; the checkpoint list is a table | |
| 0040 | The traceability engine: a stateless streaming library over files, with a single I/O owner *(the boundary is now `REQ-TRACE-513`; **an index is permitted** on `REQ-TRACE-089`'s terms — shape fixed, deliberately not built)* | |
| 0041 | The delivery store: per-requirement rows behind a capability-split handle *(**also owns the improvement store's export, and only the export** — carried as a scope note in the record's header, not in its title)* | |
| 0042 | The desktop preference store: a closed typed registry over an explicitly rooted per-user **file** | |
| 0043 | Authoritative interface state and the replica | |
| 0044 | The IPC contract *(**corrected by measurement**: a channel name is not a transport)* | ipc-hop-latency |
| 0045 | What paints the transcript *(**unblocked and now unconditional** — ESC-13 ruled, both readings measured, and `REQ-UIBENCH-050`/`-054` amended so OQ-28 is closed)* | renderer-invariance |
| 0046 | The transcript apply pipeline | |
| 0047 | The terminal grid surface | |
| 0048 | Windows, views and the three modality levels | |
| 0049 | Notices and acknowledgements | |
| 0050 | Theming and the accessibility floors | |
| 0051 | Markdown rendering and the bounded render cache | |
| 0052 | One passive instrumentation registry *(two new counters and one clock correction)* | ipc-hop-latency |
| 0053 | The benchmark harness *(**settle mechanism replaced** by measurement; phase driver decided)* | renderer-invariance |
| 0054 | Packaging, the four artifacts, and self-update *(**reopened and re-decided** under SR-7; ESC-8 and ESC-11 ruled; **ESC-8's signature mechanism reversed by amendment** — a detached asset, rotation held in the build; **SR-7's gate clause discharged on measurement**; **two defects in its own commit step and completeness check found and fixed**; the specification-defect block it designed around is **retired** because the requirement was amended; and the artifact is identified by **our own** declared variable, not the packaging tool's)* | packaged-first-paint, cached-portable-launch |
| 0055 | Startup sequencing, the instance claim, and the first-paint budget *(gains phase −1; **the chosen alternative for the claim changed from the platform primitive to our own record file, on measurement, on every platform** — the primitive is marked refused rather than not considered; the update-restart hand-over now meets `REQ-STARTUP-121` by construction and the concession is withdrawn rather than relocated)* | packaged-first-paint, cached-portable-launch, presenter-liveness-and-instance-claim |
| 0056 | The build toolchain *(gains a fifth output, the portable's launcher stub, **and the native-module Electron-ABI obligation with a build-time load proof** — the only check in the record that catches an unloadable store binding)* | packaged-first-paint |
| 0057 | The renderer framework and the renderer state store *(numbered out of dependency order — see above)* | |
| 0058 | The workspace store: **machine-local, found by a workspace identifier, and how it is backed up** *(numbered after everything it constrains — see above; **carries ESC-19's backup and restore — BOTH halves are now measured, and the restore as this record wrote it failed 0 of 30**; revised a third time against spike 22 and **a fourth time, then re-measured, against IC-1**, gaining a staging-close step, both liveness evaluations and the refusal of new runs inside the swap, an abandonment path that releases the run host, a displace-then-rename reversal, and **consequence 17, the four-for-four finding**; **the spike found ELEVEN defects, three were corrected here and EIGHT were not; **the four that were in the build-wrong class are all CLOSED as of 2026-09-02 and the corrections were MEASURED as IC-1 on the same day**, leaving D5, D8 and D11 open and none of them build-wrong; see §6 list A**; **the machine-local argument is now about path spelling rather than about network filesystems, and ESC-15's chain is replaced by a per-link verdict table**; gains a **write probe**, a **canonical-spelling rule**, ESC-26's confirmed-establishment restore path, and the re-grounding of terminal-save durability on power loss)* | remote-and-synchronised-storage, commit-on-the-publish-path, backup-restore-mechanism |

The five slice proposals these were consolidated from are retained in [`proposals/`](../proposals/). Where a
proposal argued a case that the consolidated decision reverses or qualifies, the argument is preserved in
the ADR rather than replaced by the conclusion. The same rule now applies to the measurements: where a
spike overturned a claim, the claim is preserved beside what replaced it, so a reader can see that the
record changed its mind and why.
