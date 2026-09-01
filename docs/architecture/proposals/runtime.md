# RUNTIME slice — architecture proposals

Status: **proposal**. Nothing here is approved. Numbering is provisional (`ADR-RUNTIME-NN`); the
synthesis step assigns final numbers.

## Scope

This slice owns the process topology and the run engine:

- **01 Run orchestration** (`REQ-ORCH`) — the iteration loop, delegation, child scheduling, stop
  conditions, verification gating, cancellation.
- **02 Run monitoring and steering** (`REQ-MONITOR`) — the child state machine, run control surface,
  live update transport, crash reconciliation.
- **07 Session persistence and resume** (`REQ-SESSION`) — on-disk layout, atomic writes, locking,
  the shared run lifecycle, resume, cross-process following.
- **09 Lifecycle hooks** (`REQ-HOOKS`) — invoking user shell commands at named points without
  letting one stall a run.
- **20 Event history, replay, export** (`REQ-EVENTS`) — the wire event stream, the durable journal,
  replay and trajectory export.

Out of slice but load-bearing here and cited where it matters: domain 05 (the tool and terminal
execution path, the single waiting mechanism), domain 06 (worktrees, checkpoints, the lock file
shape), domain 11/12 (application entry point, window lifecycle, quit guards), domain 15
(configuration keys), domain 19 (presentation state vocabulary).

Two things are settled by product decision and are not reopened: the product is one Electron desktop
application, and the model layer sits behind an internal abstraction rather than a vendor SDK called
from feature code.

---

## Part 1 — Extracted constraints

Each constraint is labelled:

- **HARD** — the specification fixes an observable that only some designs can produce.
- **HINT** — not fixed, but one design makes several requirements natural and others awkward.
- **FREE** — genuinely an implementation choice; recorded so it is not mistaken for a constraint.

### C1. Where a run may execute, and how long it lives

| # | Constraint | Label | Requirements |
|---|---|---|---|
| C1.1 | A run must keep running with **every window that was watching it closed**: `updated_at` keeps advancing, transcript rows keep appearing, `evidence/events.jsonl` keeps growing, artifacts keep being produced, and the run reaches a terminal `execution_status` on its own. | HARD | REQ-SESSION-106, REQ-SESSION-096 |
| C1.2 | Detaching a run to the background **does not move it**: "the run itself continues in the same process holding the same session lock". Detach is a view operation plus a status write, not a process migration. | HARD | REQ-SESSION-190 |
| C1.3 | A run **never outlives the application process**. Quitting ends every run through the ordinary cancellation and teardown path, so no run is left holding a lock this machine cannot reclaim. | HARD | REQ-SESSION-106, REQ-MONITOR-131 |
| C1.4 | Opening another project **builds a new main window and closes the old one**; the workspace-open gate refuses outright while a run is active. So a window's lifetime is shorter than a workspace session's, and shorter than a run's. | HARD | REQ-SHELL-017, REQ-SHELL-021 |
| C1.5 | The run must own a **command-execution path with pty semantics**: verification checks run "through the same command-execution path the run uses for any other command", which enforces each check's deadline itself, applies the permission policy and applies sandboxing; skipping a check delivers the terminal interrupt to the **process group**, waits 5 s, then terminates and tears down the terminal session; terminal transcript rows carry `stream_id = "fg:<agent_name>"` so a rejoining view can locate the live buffer. | HARD | REQ-ORCH-123, REQ-ORCH-128, REQ-SESSION-126, REQ-SHELL-110 |
| C1.6 | The run must spawn OS processes for hooks with a **platform-fixed interpreter** (`/bin/sh -c`, or `ComSpec`/`cmd.exe` `/c`), write a JSON payload to stdin and close it, capture stdout and stderr separately, and terminate **only the started process, never its group**. | HARD | REQ-HOOKS-030, REQ-HOOKS-031, REQ-HOOKS-033, REQ-HOOKS-037 |
| C1.7 | Releasing a session lock **tears down session-scoped shared services holding long-lived subprocesses** (MCP servers, language servers) before the lock file is removed. Those subprocess lifetimes are bound to the lock, not to a window. | HARD | REQ-SESSION-049 |
| C1.8 | The state flush entry point must be **usable from a caller's context where no asynchronous runtime is active**, and must not return until the newest requested state is on disk; a terminal-status save must not return before that status is readable **by a separate process**. | HARD | REQ-SESSION-068, REQ-SESSION-070, REQ-SESSION-072 |
| C1.9 | Several locked background sessions may coexist in one workspace; at most one process may hold a given session's lock at any moment. | HARD | REQ-SESSION-050 |
| C1.10 | The specification explicitly contemplates a run executing **in a separate worker process** and requires the observable outcome to be identical to a run in the focused window's own process — same session-directory entries, same event kinds in the same order, same persisted status, same terminal result. It permits that topology; it does not mandate it. | HINT | REQ-MONITOR-299, REQ-MONITOR-003 |
| C1.11 | The application has exactly one graphical entry point, no argument vocabulary, no subcommand and no embedding surface; there is no library, package, plugin host or endpoint through which code the user did not launch may start or drive a run. | HARD | REQ-STARTUP-002, REQ-EVENTS-178 |
| C1.12 | Which OS process hosts the run engine, and whether it is one process, one per run, or a thread. | FREE (constrained by the above) | — |

**Reading.** C1.1 + C1.4 remove the renderer as a candidate: a run whose host is destroyed when the
window closes cannot satisfy REQ-SESSION-106, and REQ-SHELL-017 destroys the window on a workspace
change. C1.5 + C1.6 + C1.7 require the host to load native modules and spawn processes freely, which
a sandboxed renderer cannot. C1.2 + C1.3 bound the run's lifetime strictly between "longer than any
window" and "no longer than the application".

### C2. Cross-process observation and control

| # | Constraint | Label | Requirements |
|---|---|---|---|
| C2.1 | Every one of the twenty-one control operations must be **issuable against a run executing in a different process from the surface that issues it**, with the same arguments, result shape and acceptance/refusal semantics. Control arguments are therefore limited to text, numbers, booleans and simple collections of those, "so that a request survives a process boundary without losing meaning". | HARD | REQ-MONITOR-013, REQ-MONITOR-004 |
| C2.2 | The control result is a **boolean plus an optional string**; the string is populated for exactly two operations (queued-prompt creation, steering-prompt submission) and never on a `false` outcome. A `false` means the operation did not happen; a control must answer `false` rather than raise, and must be safe from concurrent callers. | HARD | REQ-MONITOR-005, REQ-MONITOR-006, REQ-MONITOR-007, REQ-MONITOR-011 |
| C2.3 | When a session runs in a process other than the one displaying it, **"the only channel to it is the filesystem"**. The live transcript is followed by tailing `evidence/events.jsonl` and turning `transcript.row` events into the same deltas a local run yields; everything else comes from whole-state reads. | HARD | REQ-SESSION-159, REQ-SESSION-161, REQ-MONITOR-246 |
| C2.4 | The follow protocol is fixed in detail: a returned byte offset lands immediately after a fully written line; a partial trailing line is held without warning and delivered once whole; the restart flag is set when the file is shorter than the offset, when the byte before the offset is not a newline, **or when the truncation marker's dropped count has risen since the follower's previous read**; a corrupt line is skipped with a warning and the offset still advances; warning line numbers count from the start of the read. | HARD | REQ-SESSION-149, REQ-EVENTS-108 – REQ-EVENTS-116 |
| C2.5 | A follower must reproduce the run's **own row numbering**: each row at exactly its index, gaps filled with the placeholder row `{"role":"system","content":"(this line was not recorded)"}`, a republished index replacing rather than appending, and a re-seed replacing displayed rows in a single step so the view is never observed empty. | HARD | REQ-SESSION-160, REQ-EVENTS-052 |
| C2.6 | A handle that is executing its own run must **refuse to follow another session**. | HARD | REQ-MONITOR-247 |
| C2.7 | Foreign poll cadence 750 ms; local reconcile poll 2000 ms; for a foreign session the poll interval *is* the observed latency, for a local run the poll is a correctness backstop only. | HARD | REQ-MONITOR-288, REQ-MONITOR-287 |
| C2.8 | Cross-process write discipline for the event store is **single-writer, and the right to write is exactly the right to hold the session lock**. A process that does not hold the lock must not open the store for writing. Reading is unrestricted and needs no lock. | HARD | REQ-EVENTS-098 |

**Reading, and a live tension.** C2.1 and C2.3 pull in opposite directions: controls must cross a
process boundary, but the only channel to a foreign session is the filesystem, and no filesystem
control channel is specified anywhere. The reading that makes them consistent is that the "different
process" of REQ-MONITOR-013 is the run host versus the renderer *within one application* — which is
also what REQ-EVENTS-178 says the consumer contracts describe ("this application consuming its own
runs in its own process"). Under that reading, a second *application instance* opened on the same
workspace can observe a session but cannot control it. That case is not covered by any requirement;
see Open Question OQ-1.

### C3. Durable state: format, atomicity, ordering

| # | Constraint | Label | Requirements |
|---|---|---|---|
| C3.1 | The on-disk layout is fixed by name: `<base_workspace>/.rotaris/sessions/<session_id>/` with `lock`, `metadata.json`, `summary.md`, `metrics.json`, `issues.json`, `timeline.jsonl`, `state/{resume,ui_transcript,ui_edit_diffs,run_config}.json`, `state/transcript_archive.jsonl`, `evidence/{debug.log,tool-calls,model-input,context-selection,report-validation,memory,permissions}.jsonl`, `evidence/{events.jsonl,events.meta.json}`, `evidence/conversations/…`, `artifacts/`, `improvement_artifacts/`, `.message_limit_paused`. **No other name is written at the session-directory root.** Which names must exist after the first save, and which appear only once the matching activity occurred, is fixed. | HARD | REQ-SESSION-001 – REQ-SESSION-004 |
| C3.2 | The session directory anchor stays beneath the **invoking workspace** even when the run executes in a worktree; the state's `workspace_root` is the worktree path. Exactly two kinds of session-derived data are written outside it. | HARD | REQ-SESSION-001, REQ-SESSION-085 |
| C3.3 | **Every state file is written atomically**: temp file in the destination directory, atomic rename; on Windows a transient access-denied on the rename is retried up to 5 times with backoff 0.05, 0.1, 0.2, 0.4, 0.8 s; the temp file is always removed. | HARD | REQ-SESSION-033 |
| C3.4 | A save writes the split layout in a **fixed order**, `metadata.json` last. No whole-state `snapshot.json` may be written. | HARD | REQ-SESSION-028, REQ-SESSION-005 |
| C3.5 | Saves for `running`/`idle` are **debounced at 10.0 s** — first write immediate, one deferred write closing the window, at most two per window, at most twelve per minute. Every other status flushes immediately and flushes any parked pending state first. An explicit flush writes immediately and cancels a pending one. The window is not configurable. | HARD | REQ-SESSION-067, REQ-SESSION-068, REQ-SESSION-071 |
| C3.6 | A save **captures the state at the instant of the request**, so later changes cannot alter bytes of a write under way or mix two states; and the file left on disk corresponds to the **last requested** save, not the last write to finish. An abandoned write is reported with the exact log line `Dropped a stale session write for <id>: generation <g> lost to <c> (state '<status>' would have overwritten a newer save).` This ordering is per session only. | HARD | REQ-SESSION-068, REQ-SESSION-069, REQ-SESSION-173 |
| C3.7 | A crash must lose **at most the un-flushed debounce window plus one partial trailing JSON line**. High-volume history goes to append-only JSON-lines files; the resumable core is one small file; derived sidecars are regenerated. | HARD | REQ-SESSION-034 |
| C3.8 | Schema version is `1`; a newer version is refused rather than lossily restored; absent optional keys load as documented defaults; serialization round-trips loss-free (field-level equality after save/reload, and after a release-lock / re-acquire / mutate / save / reload cycle). | HARD | REQ-SESSION-013, REQ-SESSION-015, REQ-SESSION-027, REQ-SESSION-038, REQ-SESSION-112 |
| C3.9 | `metadata.json` carries **exactly** twelve keys, with fixed reader-side defaults, and is the only file a listing may read besides that session's `lock`. Every list-visible attribute is denormalized into it at save time. | HARD | REQ-SESSION-030, REQ-SESSION-042, REQ-SESSION-178 |
| C3.10 | The live transcript file is **bounded at 5000 rows**; overflow evicts oldest rows in whole pages of **50** to an append-only `state/transcript_archive.jsonl` before the file is written; eviction must not change any row's index; a row older than the live window is served from the archive. Reason given: every state save rewrites the file whole. | HARD | REQ-SESSION-192, REQ-SESSION-131 |
| C3.11 | Evidence files are **ring-capped** (issues 500; tool calls 5000; model inputs 5000; context selections 2000; permissions 5000; report validations 2000; memory 2000). A capped append rewrites the file atomically keeping only the newest entries; uncapped files append one line; appends within one process are serialized. | HARD | REQ-SESSION-133 |
| C3.12 | **Persist before publish**: every change is persisted before it is published to any view, because a view could otherwise display something a resume would not restore. | HARD | REQ-MONITOR-221, REQ-MONITOR-292 |
| C3.13 | **Durable record before wire event**, for an enumerated set of pairs: `tool.start`/`tool.finish` ↔ `tool-calls.jsonl`; `permission.decision` ↔ `permissions.jsonl`; `error` ↔ the issue in `issues.json` its `detail` locates; `gate.decision`/`gate.repair`, `checkpoint.created`/`checkpoint.restored` and `hook.finish` ↔ their `timeline.jsonl` entries. A run killed between the two must leave a record with no event, never an event with no record. `hook.start` deliberately has no counterpart. | HARD | REQ-EVENTS-072, REQ-SESSION-134, REQ-HOOKS-121 |
| C3.14 | `state/run_config.json` is **written exactly once per session**, by run startup, after the worktree bind and the sandbox verdict, before the first iteration; a resume must not rewrite it; diagnostics initialization must not create a placeholder for it. | HARD | REQ-SESSION-138, REQ-SESSION-132, REQ-SESSION-085 |
| C3.15 | Data written by another version is honored but never repaired in place. There is no predecessor layout and no whole-state fallback file. | HARD | REQ-SESSION-179 |
| C3.16 | The in-memory representation of session state, and whether it is immutable, structurally shared, or copied. | FREE | — |

### C4. The event journal

| # | Constraint | Label | Requirements |
|---|---|---|---|
| C4.1 | The journal is **`<session_dir>/evidence/events.jsonl`**, one wire event per line, byte-for-byte what the live stream emitted — same field names, same schema version, same key ordering — so replaying from disk and subscribing to a running session are interchangeable inputs to one consumer. | HARD | REQ-EVENTS-079, REQ-EVENTS-080, REQ-SESSION-143 |
| C4.2 | Serialization is **compact JSON, object keys sorted, non-ASCII escaped**, terminated by a **single line feed on every platform** (for appended lines and for lines rewritten during a trim alike). Two equal events serialize to byte-identical lines. A line containing CR or LF is refused rather than appended. | HARD | REQ-EVENTS-064, REQ-EVENTS-089, REQ-EVENTS-090, REQ-EVENTS-065, REQ-SESSION-145 |
| C4.3 | Each event is appended as **one write followed by an immediate flush**, so a follower observes each event as it happens rather than in buffer-sized batches. Delivery to a live consumer is likewise per event, never batched. | HARD | REQ-EVENTS-029 |
| C4.4 | Concurrently raised events **must not interleave within a line**. In-process writers are serialized; across processes the rule is single-writer under the session lock. | HARD | REQ-EVENTS-030, REQ-EVENTS-098 |
| C4.5 | Appending **never raises**. A serialization failure drops that one event with a warning and lets later events land (the history then holds exactly one line fewer). A write failure, or a short write, **marks the store failed for the remainder of the run** — no further append is attempted, one warning is recorded, and a partial last line is left in place and never repaired by a reader. | HARD | REQ-EVENTS-088, REQ-EVENTS-032, REQ-EVENTS-100 |
| C4.6 | The channel and the store are **established before any part of run start-up can fail**, and closed unconditionally after the run. The history file exists from the start of a run; the truncation marker exists only after a trim actually dropped lines. Closing flushes, is idempotent, drops later events, and must not damage the file. | HARD | REQ-EVENTS-035, REQ-EVENTS-087, REQ-EVENTS-034 |
| C4.7 | Retention: cap = `runtime.event_retention_per_session` (int ≥ 0, default **20000**; `0` means never trim; negative rejected at load). Headroom is **cap ÷ 8**, so the default trims once the file exceeds 22,500 lines. A trim keeps the newest `cap` lines, counts from the file's **current contents**, and **replaces the file in one atomic step**; a trim that did not complete leaves the previous contents in force, records a warning, and is not reflected in the marker. | HARD | REQ-EVENTS-091, REQ-CONFIG-473 |
| C4.8 | The truncation marker `events.meta.json` is written atomically, sorted keys, trailing newline, and carries `truncated`, `dropped_events`, `max_events`, `last_trimmed_at`. Dropped counts **accumulate across store instances and processes** for one session id, seeded from the marker; a resumed session must not reset to zero. An absent marker means zero drops; a corrupt marker reads as untruncated. | HARD | REQ-EVENTS-092, REQ-EVENTS-094 |
| C4.9 | A resumed session **appends to the same file**: one file may hold several `session.start … result` sequences. | HARD | REQ-EVENTS-097 |
| C4.10 | Ordering within a run: `session.start` first; `session.end` immediately before `result`; exactly one `result`; nothing bearing that session id after the `result`; `iteration.start` before its `iteration.end`; `child.spawn` before every other event naming that child; `tool.start` before the `tool.finish` sharing its `call_id`; and within one iteration the fixed relative order `hook.start`, `hook.finish`, `checkpoint.created`, `approval.requested`, `permission.decision`, `gate.decision`, `gate.repair`. Judged alike by live delivery order and by line position. | HARD | REQ-EVENTS-016, REQ-EVENTS-020, REQ-EVENTS-069 – REQ-EVENTS-071, REQ-EVENTS-076, REQ-EVENTS-083 |
| C4.11 | A run **refused before it starts** emits exactly one `result` with status `error`, no `session.start`, delivered by a *direct* path; a run that started delivers its terminal pair over the bus while the sink is still attached. The two paths are mutually exclusive. | HARD | REQ-EVENTS-021, REQ-EVENTS-070, REQ-SESSION-177, REQ-SESSION-082 |
| C4.12 | **Masking is a property of the event definition**, re-applied when a field is assigned after construction; the store applies no second pass, and the exporter applies none either. A credential can reach the stored file only if it was on the wire. | HARD | REQ-EVENTS-040, REQ-EVENTS-059, REQ-EVENTS-095, REQ-EVENTS-134 |
| C4.13 | Every event carries the four envelope fields, an `event` from the closed 23-type catalog, and **every payload field listed for its type — a field may be null or empty but must not be absent**. A validating consumer must reject none of a completed run's events. | HARD | REQ-EVENTS-017, REQ-EVENTS-036, REQ-EVENTS-041 |
| C4.14 | Event schema version is `1` and is versioned **independently** of the session snapshot version; the two may differ. Adding a field or a type leaves it at `1`. | HARD | REQ-EVENTS-038, REQ-EVENTS-039 |
| C4.15 | Reading is streaming, lazy, read-only, and forward-compatible: an unknown `event` value is returned with its raw payload intact and a flag, never dropped and never raised; the recognized set is derived from the catalog itself, never a second list. Damaged lines are skipped with exactly one warning each carrying position, reason and a 200-character excerpt. Blank lines are skipped silently. | HARD | REQ-EVENTS-099 – REQ-EVENTS-107 |
| C4.16 | A stored record must be able to **re-render itself byte-identically** from its stored payload, so a type outside this build's catalog reproduces exactly as well. | HARD | REQ-EVENTS-104, REQ-EVENTS-172 |
| C4.17 | The catalog is closed at 23 types and is **deliberately not extended** for the verification-gate log, whose detail stays in its own evidence file. | HARD | REQ-EVENTS-041, REQ-EVENTS-177 |
| C4.18 | The concrete JSON serializer, the buffering strategy behind the "one write then flush" rule, and the file-handle lifetime. | FREE | — |

### C5. Projections and the live update transport

| # | Constraint | Label | Requirements |
|---|---|---|---|
| C5.1 | A local run publishes on **two channels**: an incremental transcript update carrying the lowest row index whose content may still change, the rows from there on, new diffs and the persona set; and one whole-session update carrying the session record with unbounded collections emptied and bounded collections carried in full. | HARD | REQ-MONITOR-214, REQ-MONITOR-216 |
| C5.2 | The whole-session update carries **every field of the session record that any surface is able to display**, not a curated subset; a surface may display a field only if the update carries it. | HARD | REQ-MONITOR-217 |
| C5.3 | A row a view has not yet seen is published **immediately — no minimum wait, debounce or delay floor of any size, on any platform**. Growth of an already-visible row is coalesced into a trailing **50 ms** tick. Coalescing must lose nothing, and pending publications are flushed at run end. | HARD | REQ-MONITOR-218, REQ-MONITOR-219, REQ-MONITOR-220, REQ-MONITOR-294 |
| C5.4 | Run activity appears on live surfaces within **250 ms at the 95th percentile**, at zero pre-existing rows and at thousands alike. The cost of one update is set by how much changed, not by how much accumulated: at ≥ 10,000 rows an update must cost no more than **2×** the same update to an empty session, measured run-to-surface. A session with nothing happening does no work beyond the liveness poll. | HARD | REQ-MONITOR-222, REQ-MONITOR-223 |
| C5.5 | Each run surface must reflect a state change **within 100 ms of the run recording it**. | HARD | REQ-ORCH-155 |
| C5.6 | A stage that cannot correctly apply an increment must **decline it and re-render from a whole read**, and must never render a result differing from what a whole read would produce. | HARD | REQ-MONITOR-224, REQ-MONITOR-226 |
| C5.7 | **No view may hold a run open, slow it down, or change its outcome.** A run observed by nothing, by a healthy view, or by a broken one must reach the same terminal result, the same persisted record, the same event sequence and the same timing. Anything a host supplies that raises must not change the outcome. | HARD | REQ-MONITOR-232, REQ-MONITOR-226, REQ-MONITOR-293, REQ-ORCH-138, REQ-EVENTS-015, REQ-EVENTS-081, REQ-EVENTS-082 |
| C5.8 | **The in-process event-bus consumer contract is the opposite**: delivery of one event to one consumer must complete before the run proceeds past the operation that raised it — "a slow consumer delays the run rather than losing or reordering events" — bounded at **5 seconds**, after which that consumer is detached permanently with a warning and the run proceeds. | HARD | REQ-EVENTS-165, REQ-EVENTS-031 |
| C5.9 | The asynchronous programmatic consumer buffers up to **1024** pending events, discards rather than blocking beyond that, exposes a discard count that only rises and is readable during iteration, ends iteration once `result` has been yielded, and carries its own version string `"1"`. | HARD | REQ-EVENTS-164 |
| C5.10 | Delivery is **addressed per session**; there is no fallback across sessions; registering for an empty session id is rejected; publishing with no consumer does nothing. Per-session bindings bind late by session id and are discarded at teardown, so a straggling event has no destination and cannot reach a later run in the same process. | HARD | REQ-EVENTS-075, REQ-SESSION-146, REQ-SESSION-176 |
| C5.11 | Following a foreign session and reopening it afterwards must produce **identical transcripts**, which is why one derivation is shared. The live view must never contradict what a resume would restore; the persisted record is authoritative. | HARD | REQ-SESSION-159, REQ-MONITOR-242, REQ-MONITOR-292 |
| C5.12 | Approval and question rows are **not recorded history**: they are computed from what is pending now, always sit after every recorded row, and are appended identically by the whole-state and incremental paths. | HARD | REQ-MONITOR-230, REQ-SESSION-157 |
| C5.13 | Once a run is terminal, the displayed transcript must equal the persisted record **including the corrections only a terminal state determines**: an unsettled tool row takes status `blocked` and conveys that the run ended before the tool reported; an unstamped reasoning row gets a duration. | HARD | REQ-MONITOR-228, REQ-SESSION-079 |
| C5.14 | A display tick must not alter a row, write session state, or cause a transcript publication. A session whose only activity is clocks ticking produces no new persisted data and no update traffic. | HARD | REQ-MONITOR-108, REQ-MONITOR-110 |
| C5.15 | Re-reading persisted state on a timer is **not a supported way to follow a run** and must not be relied on for refresh latency; a surface that shows a run as it progresses takes its updates from the event history. | HARD | REQ-SESSION-071 |
| C5.16 | The renderer-side state container, memoization strategy, and component structure. | FREE (but see C5.2/C5.6) | — |

**Reading.** C5.7 and C5.8 are not in conflict but they cannot be the same channel. The event bus is
a *bounded-blocking* channel whose consumer is the application itself; the view update channel is a
*non-blocking* channel. C5.15 and C2.7 are likewise reconciled by subject: the transcript is never
followed by re-reading state on a timer, while non-transcript state for a *foreign* session
legitimately is (REQ-MONITOR-246).

### C6. Child scheduling and the child state machine

| # | Constraint | Label | Requirements |
|---|---|---|---|
| C6.1 | The child state set is exactly `queued`, `starting`, `running`, `summarizing`, `waiting_on_dependencies`, `waiting_on_model_slot`, `succeeded`, `failed`, `cancelled`, `blocked`; the last four are terminal and **absorbing**. The legal-transition table is fixed in full, including that `blocked` is reachable from exactly three pre-start states, plus two settling paths (cancellation, run reconciliation) legal from every non-terminal state. This is designated the **single definition** of the machine. | HARD | REQ-MONITOR-014, REQ-MONITOR-300, REQ-ORCH-040, REQ-ORCH-041 |
| C6.2 | An attempt to move a child into a state not reachable from its current one must be **rejected with an error naming both states and must leave the record untouched** — same state, no completion timestamp, and **no state-change event delivered to any surface**. Entering a terminal state stamps a UTC completion timestamp. | HARD | REQ-MONITOR-016, REQ-MONITOR-017 |
| C6.3 | Spawn admission runs **five checks in a fixed order**, first failure rejecting with no child record and no task id: depth (default max 3) → total children (20) → active children (6) → every `depends_on` names an existing child of the same parent → the new edges close no cycle. Budget clamps from the playbook cell **only narrow**. | HARD | REQ-ORCH-046, REQ-ORCH-038, REQ-ORCH-024 |
| C6.4 | A child is started **at most once, however many scheduling passes are in flight**. Over the whole run, `child_start` events per task id must be exactly one for a child that started and zero for one that did not. A suppressed start must be **recorded**, as a `child_launch_suppressed` timeline event plus a `stale_child_launch_claim` issue naming the child. | HARD | REQ-ORCH-049 |
| C6.5 | Per-model concurrency: a child over the cap is **created and held**, reported `waiting_on_model_slot`, never rejected; held children are released **in the order they were held**, exactly one per terminal transition of a child on the same model key; a held child that has itself gone terminal is dropped. A child in `waiting_on_model_slot` consumes no active-child allowance. The cap comes from the user's setting, else the provider catalogue entry's declaration (2 where declared), else uncapped. | HARD | REQ-ORCH-050, REQ-MONITOR-015, REQ-MONITOR-020, REQ-MONITOR-021 |
| C6.6 | A dependent starts only when **all** dependencies reached `succeeded` **and** stored their report artifact; the prior-agent-context block is prepended **exactly once**, never re-prefixed on a later state hop. | HARD | REQ-ORCH-047 |
| C6.7 | On a dependency reaching `failed` or `cancelled`, every dependent still in a pre-start state moves to `blocked`, **transitively**; a dependent already under way is left to run; blocked children are never started automatically; terminal callbacks fire for cascaded records exactly as for direct ones. | HARD | REQ-ORCH-048 |
| C6.8 | Scheduling on a parent's behalf continues until **three conditions hold simultaneously** — no outstanding wait, no undelivered completion notification, every startable child started at least once — and must then leave the parent idle. A parent whose remaining children are all waiting on unmet dependencies must not be resumed on that account: **the loop must not be able to alternate indefinitely without some child changing state.** | HARD | REQ-ORCH-056 |
| C6.9 | There is **one** waiting mechanism in the product. A parent has at most one wait outstanding; an outstanding wait does not survive the end of the parent's conversation; a wait carries **no deadline of its own**, because the child timeout and the sweeps already bound it — imposing one is explicitly forbidden. `delegate` never suspends the parent's conversation. | HARD | REQ-ORCH-062, REQ-ORCH-037, REQ-TOOLS-156, REQ-TOOLS-153 |
| C6.10 | An idempotent finalize-incomplete sweep closes every non-terminal child as `cancelled` through the normal terminal path, **re-checking per record because closing one can cascade-block another**. Every exit path from an iteration must leave the iteration record and every child record terminal. | HARD | REQ-ORCH-052 |
| C6.11 | On session continue, a run that has just acquired the lock settles every non-terminal child record read back from disk to `cancelled` **before its first iteration**, and **must not probe process liveness** while doing so — holding the lock is itself proof the previous owner exited. Idempotent; reports how many it moved. | HARD | REQ-ORCH-053, REQ-SESSION-065 |
| C6.12 | Hard per-child timeout 1200 s; stall watchdog is visibility-only and polls at `max(1, min(threshold/6, 5))` s with threshold default 90 s and never cancels; unresponsive-model fallback applies only before any model event and only when its threshold is below the child timeout. | HARD | REQ-ORCH-088, REQ-ORCH-089, REQ-ORCH-090, REQ-MONITOR-117, REQ-MONITOR-121 |
| C6.13 | Every ledger, counter, budget, supervisor state, artifact store and snapshot is **scoped to one session id** and never read or written by another run; a run's stop reason, terminal status and its children's state sequence must not depend on how many other runs are in flight or how they interleave. | HARD | REQ-ORCH-151 |
| C6.14 | Whether the scheduler is a tick loop, a reactive graph or an actor system; how the ledger is held in memory. | FREE (constrained by C6.1–C6.11) | — |

### C7. Cancellation, shutdown, and unclean exit

| # | Constraint | Label | Requirements |
|---|---|---|---|
| C7.1 | Cancellation **first releases anything blocked on a person** — pending questions, then pending approvals, approvals failing safe as **denied** — and only then stops the run. | HARD | REQ-MONITOR-012, REQ-ORCH-132 |
| C7.2 | A cancel is a **graceful stop first**; if the loop has not reached a stop check within **30.0 s** a hard cancel follows. A forced stop performs a **second sweep** for work created during the first. | HARD | REQ-SESSION-092, REQ-MONITOR-129, REQ-ORCH-132 |
| C7.3 | The stop request is **sticky**: a cancel arriving before the loop's callbacks are wired replays when they are. A caller that requested cancellation receives an `interrupted` outcome even when the loop finished first; reporting both an effective cancellation and a successful run is forbidden. A cancellation raised from inside the run must still release the lock and emit the terminal result. | HARD | REQ-SESSION-092, REQ-EVENTS-028 |
| C7.4 | Teardown is an **ordered pipeline that runs even on any exception**: `run_end` timeline entry → logging cleanup → **lock release** → construct one run result → publish `session.end` then exactly one `result`, both over the bus while the sink is still attached → final notice about disabled hooks → remove every per-session binding. | HARD | REQ-SESSION-094 |
| C7.5 | Teardown must not cost the run its responsiveness: an interrupt requested **while a child is being torn down** must still take effect. | HARD | REQ-ORCH-098 |
| C7.6 | Application shutdown produces, in checkable order: polling stops; the run is cancelled with human blocks released first; queued follow-up jobs cleared; **the process does not exit until the run has reported its terminal result and finished writing session state**. Force-exit backstop is **30 s from the quit request**, the same allowance as the cancellation grace and composing exactly with it. A second quit request during that allowance force-exits immediately. A force exit is the **only** case in which the ordered effects may be left incomplete, **and it must be reported as such on the next start**. | HARD | REQ-MONITOR-131, REQ-MONITOR-283, REQ-SHELL-121 |
| C7.7 | Shutdown requests **every** run handle to stop **before waiting on any** of them. | HARD | REQ-MONITOR-255 |
| C7.8 | Stale detection reads **only** `metadata.json` and `lock`, **writes nothing to disk** (verifiable by fingerprinting the tree before and after), never raises, and reports an empty result over a broken store. | HARD | REQ-SESSION-058 |
| C7.9 | Repair is **explicit and never triggered from a read path**. Its order is mandatory: re-check liveness → read state → require an active status → set `execution_status = "interrupted"` → **flush immediately, bypassing the debounce** → best-effort remove the lock → write the diagnostics entry. Status first, lock second. It is idempotent and never raises. | HARD | REQ-SESSION-060, REQ-SESSION-061, REQ-SESSION-063 |
| C7.10 | Liveness **resolves toward "alive"** in every uncertain case. On Windows the probe **must not deliver any signal or console control event** to the target — implementing it as a null signal is called out as a defect there — and only an OS-level "no such process / invalid parameter" proves absence. `pid ≤ 0` is dead. Permission-denied is alive. | HARD | REQ-SESSION-051 – REQ-SESSION-054, REQ-MONITOR-208 |
| C7.11 | **One verdict**: lock reaping, liveness reporting, stale detection and the worktree-integration precondition must never disagree about one pid at one moment. | HARD | REQ-SESSION-171, REQ-SESSION-056, REQ-SESSION-047 |
| C7.12 | The lock is a file named `lock` at the session-directory root, created by **atomic exclusive create**, containing `{"pid","host","acquired_at"}`. On collision **at most one** stale-reap attempt is made (two create attempts total) and only when the content parses, `host` names this machine and `pid` probes dead here. **No waiting, no retry loop, no second reap** — a lock another party keeps recreating can never make acquisition spin. | HARD | REQ-SESSION-046, REQ-SESSION-047, REQ-GIT-020 |
| C7.13 | A lock this machine cannot prove dead is **never reclaimed automatically**; exactly one explicit, user-confirmed action removes it, stating pid, host and acquisition time first, and it removes the lock file and nothing else. | HARD | REQ-SESSION-183 |
| C7.14 | A display surface must **settle** the child tree and running tool rows against the session's status on every read, so a snapshot from a killed process is never rendered as a finished run whose agents still appear active. `idle` is exempt from reconciliation. | HARD | REQ-SESSION-078, REQ-SESSION-079, REQ-MONITOR-211, REQ-MONITOR-212, REQ-MONITOR-213 |

### C8. Lifecycle hooks

| # | Constraint | Label | Requirements |
|---|---|---|---|
| C8.1 | The interpreter is fixed by platform and **must not vary with the content of `command`**. The working directory is the tree the run is changing (worktree, else workspace), while the payload's `workspace` reports the base workspace. | HARD | REQ-HOOKS-030, REQ-HOOKS-084 |
| C8.2 | The payload is delivered as **exactly one UTF-8 JSON object on stdin, which is then closed**; the last byte is the closing brace, with **no trailing newline**. No part of the payload may be placed on the command line or in the environment. A hook writing to stdout/stderr before or while reading must not stall the invocation. | HARD | REQ-HOOKS-031, REQ-HOOKS-067 |
| C8.3 | An invocation returns no later than `timeout_seconds` + **5.0 s** grace + the time to start one process. Termination reaches **only the started process and must not be widened to its process group**; descendants may outlive the hook and the run, and the run must neither wait for, track, nor report them. **Collecting output must not block on a stream a surviving descendant still holds open** — the grace period bounds that collection, and expiring it yields empty output. | HARD | REQ-HOOKS-033 |
| C8.4 | Every applicable hook for an occurrence **runs, in declaration order, one after another, even after one has decided to stop the call**; the decision that takes effect is the first stopping outcome, determined once all have finished. Dispatch must not stop early, and the difference is observable (later hooks' tree effects, event pairs, timeline entries and failure tallies all occur). | HARD | REQ-HOOKS-040 |
| C8.5 | With several tool calls outstanding at once: a hook consuming its entire budget on one call **must not delay the hooks of any other outstanding call**; the failure tally is per stable id **for the whole session** whichever call produced it; one switch-off warning however many calls met the failing hook at once; one event pair and one timeline entry per invocation. These are invariants at every degree of concurrency, and no maximum concurrency is fixed. | HARD | REQ-HOOKS-042, REQ-HOOKS-055 |
| C8.6 | Lifecycle hooks **run in line with the run loop** — a hook that consumes its whole budget holds the run up for that long, and `timeout_seconds` is the user's means of controlling it. The `iteration_end` hook for iteration N finishes **before iteration N+1 begins** and **before that iteration's checkpoint is taken**, so an edit it makes to the tree is captured by that checkpoint. `session_end` runs on every exit path, after the final status has been decided, and before shutdown. | HARD | REQ-HOOKS-080, REQ-HOOKS-082, REQ-HOOKS-081, REQ-SESSION-088 |
| C8.7 | The `session_end` status string is **derived once per run and used for both destinations**, so the value a hook reads on stdin is character-for-character the value on the `session.end` wire event. | HARD | REQ-HOOKS-081 |
| C8.8 | The durable diagnostics entry is written **before** the corresponding completion event is published. Where diagnostics cannot be written, the entry degrades to a log line, with no warning and no change to the outcome. | HARD | REQ-HOOKS-121, REQ-HOOKS-039 |
| C8.9 | The hook set is **fixed when the run starts**; configuration edited on disk mid-run changes neither which hooks run, nor the `run_config.json` snapshot, nor the fingerprint the trust decision was checked against. Exactly two within-session changes exist: a full replacement of a session's attachment (effective from the next tool call) and the failure-budget switch-off. | HARD | REQ-HOOKS-131, REQ-HOOKS-069 |
| C8.10 | Hooks are **exempt from the tool permission policy and from any sandbox**; the diagnostics of REQ-HOOKS-118–121 are the *sole* evidence that a hook executed. | HARD | REQ-HOOKS-122 |
| C8.11 | **No hook-related condition may end a run, alter its terminal status, or leave it waiting beyond the per-hook bound.** The only hook outcome that changes what the run does is a `pre_tool` stopping verdict, which refuses one tool call and nothing further. A failure to assemble the run's hook set at start-up does not end the run. | HARD | REQ-HOOKS-129, REQ-HOOKS-072, REQ-HOOKS-085 |
| C8.12 | Where a session has no eligible hook for an event, **nothing observable happens**: no process, no `hook.start`/`hook.finish`, no timeline or issues entry, no file read or written on account of hooks. The once-per-session withheld-hook announcement is the only exception, and it must be observable **no later than the session's first hook-related event**. | HARD | REQ-HOOKS-041, REQ-HOOKS-127 |
| C8.13 | Numeric bounds: resolving the hook set, validating configuration, computing the workspace fingerprint and applying the trust gate each within **50 ms** at 100 entries, growing no worse than linearly; building one payload within **10 ms** at 100 KB; deciding an occurrence has no applicable hook under **1 ms**. Nothing bounds time inside the hook process itself. | HARD | REQ-HOOKS-139, REQ-HOOKS-135 |
| C8.14 | The spawn mechanics, the payload-building implementation, and whether a process pool is used (subject to C8.3's "newly started process"). | FREE | — |

**Note on kill discipline.** C8.3 (never widen to the process group) and C1.5 (a verification-check
skip *must* signal the process group and tear down the terminal session) are opposite disciplines.
They are two different execution paths and must not share a kill implementation.

### C9. Time, clocks and budgets

| # | Constraint | Label | Requirements |
|---|---|---|---|
| C9.1 | Every duration in domain 01 is a wall-clock duration **measured against a monotonic clock** from the start point its requirement names, and **conformance to every one of them must be demonstrable with a controlled clock** — no conformance claim may depend on real provider latency or on the wall-clock cost of a live model call. | HARD | REQ-ORCH-156 |
| C9.2 | A budget fixes **when the run takes its stated action, not the total elapsed time**: where the action can only be taken at a boundary it is taken at the first boundary at or after expiry, so a long iteration legitimately overshoots the time limit. Where two budgets bound the same activity the smaller governs, and expiry of the smaller **never resets** the larger. | HARD | REQ-ORCH-156, REQ-ORCH-124, REQ-ORCH-069 |
| C9.3 | Event timestamps are ISO-8601 UTC with an explicit `+00:00` offset; they are **wall-clock and carry no monotonic guarantee**; a clock that moved backwards mid-run may make a bounded query select a non-contiguous set, which is a permitted outcome and never an error. | HARD | REQ-EVENTS-037, REQ-EVENTS-120 |
| C9.4 | Session timestamps are UTC with a `Z` suffix; transcript rows carry `ts` in **local** wall-clock `HH:MM:SS`. Three timestamp conventions coexist deliberately. | HARD | REQ-SESSION-014, REQ-SESSION-121 |
| C9.5 | The persisted verification deadline is a **duration in whole seconds from a recorded start**, never an absolute instant, so it stays meaningful after a resume and to a viewer in another process that cannot interpret a clock it did not read. | HARD | REQ-MONITOR-155 |
| C9.6 | Fixed timing constants owned by this slice: growth tick 50 ms; foreign poll 750 ms; local reconcile poll 2000 ms; final refresh 3 retries at 100 ms; worker join cap 5 s on restart, unbounded at shutdown; live-row repaint ≈1 s; verification clock 1 s; visibility budget 250 ms p95; force-exit backstop 30 s; token-history sample 10 s; cloud-credit timer 120 s. | HARD | REQ-MONITOR-287, REQ-MONITOR-166 |
| C9.7 | Which monotonic source is used (`performance.now`, `process.hrtime.bigint`), and how timers are scheduled. | FREE (subject to C9.1) | — |

### C10. Parallel runs, isolation, and routing

| # | Constraint | Label | Requirements |
|---|---|---|---|
| C10.1 | More than one run may be in flight at once, in the same workspace or different ones, and each is fully isolated (see C6.13). | HARD | REQ-ORCH-151 |
| C10.2 | Concurrent runs each get their **own run handle** while views keep a single-run interface; every control a view issues routes to the **focused** run. Session-aware notifications must cover every run, not only the focused one. | HARD | REQ-MONITOR-249 |
| C10.3 | Background handles keep refreshing their own session but publish **only a summary** (session id, execution status, branch); they must never publish into the shared transcript, agent tree, metrics or prompt queue. | HARD | REQ-MONITOR-250 |
| C10.4 | Switching focus changes which session is projected **without touching any background run's lifecycle**; cancelling or failing one run affects only that run's handle. Notices carry their session id so cross-session news survives a focus change. | HARD | REQ-MONITOR-252, REQ-MONITOR-257 |
| C10.5 | An approval request must reach the run that asked for it **even when that run is not focused**; an answer for which no run is waiting must be reported back as undeliverable. A permission-mode change reaches **only** the focused run. | HARD | REQ-MONITOR-253, REQ-MONITOR-254 |
| C10.6 | The second and any subsequent concurrent launch **must be placed in a worktree**. | HARD | REQ-MONITOR-251 |
| C10.7 | The operations gated on a run being active are **exactly five and the list is closed**; any operation not on it stays available while a run is active. | HARD | REQ-MONITOR-258 |
| C10.8 | Queued prompts are **owned by a session**: a run may consume only prompts queued for its own session. | HARD | REQ-MONITOR-139, REQ-ORCH-071 |

### C11. Failure containment (the run's blast-radius rules)

| # | Constraint | Label | Requirements |
|---|---|---|---|
| C11.1 | An exception raised by anything a host supplies must not change the run's outcome, stop the run, or be reported as a run failure. | HARD | REQ-ORCH-138 |
| C11.2 | History and diagnostics writing **never fails a run**: the event history, transcript publication, change callbacks, diagnostics writers and the timeline-to-wire bridge all degrade to logged warnings. Publishing never propagates a failure outward. | HARD | REQ-SESSION-175, REQ-EVENTS-078, REQ-EVENTS-074, REQ-HOOKS-128 |
| C11.3 | A store that cannot be attached degrades to a logged warning saying no durable history will exist (and therefore no replay and no export); the run continues and completes, and no exception reaches the caller. | HARD | REQ-EVENTS-084, REQ-SESSION-089 |
| C11.4 | Malformed source data behind a derived event follows a **coerce-or-skip** rule decided by whether the event's identity survives; either way the iteration continues, its `iteration.end` is still emitted, and the terminal status is what it would have been. | HARD | REQ-EVENTS-073 |
| C11.5 | The run's own durable transcripts are written under `<session_dir>/conversations/event_logs/` and are **not dependent on any host**: a run observed by nobody and a run whose observer raises must leave the same complete transcripts on disk. | HARD | REQ-ORCH-140 |
| C11.6 | Terminal-result construction **must never raise**; a value outside the closed set must raise rather than be presented as a guessed result, and `failed` and `error` must never be collapsed. | HARD | REQ-MONITOR-028, REQ-MONITOR-032, REQ-ORCH-083 |

---

## Part 2 — ADR proposals

### ADR-RUNTIME-01 — Where the run engine executes

**Decision to be made.** Which OS process hosts the run engine: the Electron main process, the
renderer, a Node worker thread inside main, one Electron `utilityProcess` shared by all runs, or one
`utilityProcess` per run.

**Constraints that bear on it.** C1.1 (survives every window closing), C1.2 (detach is not a
migration), C1.3 (never outlives the app), C1.4 (windows are destroyed on workspace change), C1.5
(pty-capable command path, process-group signalling), C1.6 (spawns hook processes), C1.7 (owns
long-lived MCP/LSP subprocesses tied to the lock), C1.8 (synchronous durable flush from an arbitrary
caller context), C1.9 (one process per session lock), C1.10 (a separate worker process is an
explicitly supported venue), C2.8 (write right = lock right), C3.5/C3.10 (whole-file rewrites of a
5000-row transcript), C4.3 (per-event write and flush), C5.4/C5.5 (250 ms p95, 100 ms surface
reflection) together with REQ-SHELL-150 (100 ms gesture acknowledgement, 120 ms repaint under
sustained load) and REQ-MONITOR-225 (controls stay operable during a read or projection).

**Alternatives.**

*A — Renderer process.* Eliminated by hard constraints, recorded so the elimination is traceable. A
renderer is destroyed when its window closes, which contradicts C1.1 directly and is made worse by
REQ-SHELL-017 destroying the window on a workspace change (C1.4). A sandboxed renderer cannot load
the native modules the pty path and the hook path require (C1.5, C1.6). And a per-window run host
would make C1.9 (one process per lock) depend on how many windows the user happened to open. Not a
genuine alternative.

*B — Electron main process, in-process.* Genuinely arguable and the cheapest to build. The session
lock, the run registry, the quit choreography (C7.6, C7.7) and the window lifecycle all live in one
place with no boundary to cross; C1.8's synchronous flush is trivially available; the teardown
ordering of C7.4 is under direct control. The cost is that the run engine's synchronous and
I/O-heavy work lands on the process that also serves every window's IPC and lifecycle: a whole-file
rewrite of `state/ui_transcript.json` at up to 5000 rows (C3.10 exists precisely because that
rewrite is whole), a synchronous flush that must not return until the bytes are durable (C1.8), the
Windows rename-retry loop (C3.3), and a write-plus-flush **per event** (C4.3). Any one of these
blocking the main process's loop directly threatens REQ-SHELL-150's 100 ms gesture budget and
REQ-MONITOR-225's "controls stay operable". The argument *for* B is that C3.5 bounds debounced state
writes to twelve per minute per running session, so the whole-transcript rewrite is not continuous;
the argument against is that the per-event flush is, and that a hook process spawn, a pty spawn, or
an MCP server handshake stalling would stall the window layer too.

*C — Node `worker_threads` inside main.* Moves the blocking work off the main thread while keeping
one process. But it keeps one *crash domain*: a native fault in the pty layer, or an OOM, still
takes the windows down with it. It also does not simplify anything B does not already simplify, and
Electron's own guidance is to prefer `utilityProcess` over `child_process.fork` when forking from
main (Electron documentation, `tutorial/process-model` and `api/utility-process`, current
documentation set on electronjs.org, checked via Context7). Worker threads buy the smaller half of
the benefit and none of the isolation.

*D — One `utilityProcess` shared by all runs (the "run host").* `utilityProcess.fork` gives a Node
context with native-module support, its own crash domain reported to main through the `exit` event
and `child-process-gone`, and — uniquely among these options — the ability to hand a `MessagePort`
**directly to a renderer**, so the transcript delta channel need not hop through main. It can only
be forked after `app.ready`, and its own `stdin` cannot be configured to anything but `ignore`
(which does not matter: the run host writes to *its children's* stdin, not its own). The blocking
work of C1.8, C3.3, C3.10 and C4.3 becomes free to be synchronous, because the process it blocks is
not the one drawing windows. The costs are real: the quit choreography of C7.6 now spans a boundary
and main must supervise the run host's teardown under a 30 s backstop; every control operation
crosses a boundary (though C2.1 demands that shape anyway); and a run-host crash loses **every**
in-flight run at once rather than one.

*E — One `utilityProcess` per run.* Best isolation: C6.13 and C10.1 become structural rather than
disciplinary, one lock per process is trivially true (C1.9), and a crash costs one run. The costs
are per-process overhead, and that the app-level obligations — the run registry (C10.2), "ask every
handle to stop before waiting on any" (C7.7), the ordered shutdown effects (C7.6) — become a
distributed protocol rather than local calls. Note that per-run isolation is already required to be
*logical*: REQ-ORCH-151 enumerates exactly which state must be scoped per session id, so process
isolation buys robustness, not correctness.

**Recommendation.** **D — one `utilityProcess` "run host", forked after `app.ready`, hosting the run
registry and every run.** Main keeps window lifecycle, the quit guards, file choosers and the update
path; the run host keeps the engine, the session writer, the event journal, the pty and hook child
processes, and the MCP/LSP subprocess lifetimes bound to the session lock.

The reasoning turns on three things. First, C1.8's synchronous durable flush is not negotiable and
is not something to apologise for — the specification *wants* a call that blocks until bytes are on
disk — and the only clean way to have both that and REQ-SHELL-150's 100 ms gesture budget is for the
blocking to happen somewhere other than the window layer. Second, C2.1 already forces every control
to be expressible as serializable data; putting a real boundary there makes that testable rather
than aspirational, and it is the difference between a requirement that is satisfied and one that is
merely not violated. Third, the recovery machinery for a crashed run host **already has to exist**:
an abandoned lock plus an active `execution_status` is exactly the stale-session case C7.8–C7.13
require to be detectable and repairable. A crashable run host therefore costs no new concepts, and
its crash is announced through the repair notice REQ-SESSION-062 and REQ-SHELL-155 already specify.

**Consequences accepted.**

1. A run-host crash loses every in-flight run at once. All of them become stale sessions repairable
   to `interrupted`; none loses durable history beyond the C3.7 bound. This is user-visible and is
   the main thing E would improve — see "revisit".
2. `utilityProcess.fork` requires `app.ready`, so no run can be started before then. Nothing in
   domains 01, 02, 07, 09 or 20 asks for one.
3. C7.6's "the process does not exit until the run has reported its terminal result and finished
   writing session state" becomes a two-process handshake: main asks the run host to stop, the run
   host runs C7.4's teardown pipeline and exits, main exits after observing that — with the 30 s
   force-exit backstop and the "second quit force-exits immediately" rule applying to the pair.
4. The run host, not main, holds the session lock, and therefore under C2.8 is the only party
   entitled to write a session's event store. Main must never write into a session directory.
5. Any part of the engine needing a main-only Electron API must go through a narrow request back to
   main. In this slice that is only the file chooser for export (REQ-EVENTS-173, REQ-SESSION-189)
   and the reveal-in-file-manager action (REQ-SESSION-191) — both user-gesture-driven and both
   outside the run's critical path.

**Revisit if.** (a) Measurement shows the extra hop cannot meet C5.4's 250 ms p95 or C5.5's 100 ms —
in which case take the `MessagePort`-direct-to-renderer path before reconsidering B. (b) Users
routinely hold more than two concurrent runs and a single crash losing all of them is judged
unacceptable — move to E; the session-lock and stale-repair machinery already makes that safe, and
the run registry becomes a supervisor of N processes rather than a map. (c) A requirement appears
that needs the engine to call a main-only Electron API synchronously and frequently.

---

### ADR-RUNTIME-02 — The run/UI boundary: one control channel, two distinct update channels

**Decision to be made.** How many channels exist between the run engine and everything watching it,
and what each guarantees.

**Constraints.** C2.1/C2.2 (serializable control request/response with a fixed result shape), C5.1
(two update payload shapes), C5.2 (whole-session update carries every displayable field), C5.3 (no
debounce on an unseen row; 50 ms coalescing on growth), C5.6 (decline-and-re-render), C5.7 (no view
may slow or change a run), **C5.8 (the event-bus consumer contract is bounded-blocking at 5 s and a
slow consumer delays the run)**, C5.9 (1024-buffer async consumer that drops rather than blocks),
C5.10 (per-session addressing, late binding, discarded at teardown), C5.11 (one derivation shared by
following and reopening), C4.17 (the catalog is closed at 23 types and deliberately excludes the
verification-gate log).

**Alternatives.**

*A — One channel: publish wire events to the UI and project everything from them.* This is the
"event sourcing" reading of the candidate stack, and it fails on evidence. The catalog is closed at
23 types (C4.13) and REQ-EVENTS-177 explicitly refuses to add a type for a decision that *is*
durably recorded — so the event stream is provably not a complete description of session state.
Meanwhile C5.2 requires the whole-session update to carry **every field any surface can display**,
and C5.11 requires the non-transcript state a foreign viewer sees to come from the same whole-state
read a reopen uses. A single event channel cannot satisfy both.

*B — Two channels: fold the wire-event bus and the view channel together.* Attractive, and wrong for
a specific reason: the two have **incompatible failure contracts**. C5.8 says a slow consumer delays
the run (bounded at 5 s, then detached); C5.7 says no view may slow the run at all. One channel
cannot have both properties, and the specification is deliberate about each — the event bus is the
mechanism that makes persist-before-forward and strict ordering checkable, while the view channel is
the mechanism that makes a broken view harmless.

*C — Three channels (recommended).*

1. **Control** — request/response, arguments restricted to text, numbers, booleans and simple
   collections (C2.1), answering `{ok, value?}` with `value` populated for exactly two operations
   (C2.2), never raising, safe under concurrency, refusing when the run cannot honour it.
2. **Wire events** — the ordered, bounded-blocking bus. Every event is persisted to the journal
   *before* being forwarded to any consumer (the persist-before-forward tee of REQ-SESSION-147), so
   an event a failing consumer never receives is nevertheless on disk (C4.5, C11.2). Delivery to one
   consumer is bounded at 5 s, after which that consumer is treated exactly as one that went away
   (C5.8). Recording is independent of consumption (C5.7).
3. **View updates** — the transcript delta and the whole-session snapshot (C5.1), non-blocking,
   best-effort, per-session addressed, with the 50 ms growth tick and immediate publication of an
   unseen row (C5.3).

**Recommendation.** C, plus one rule that falls out of C5.11 and C2.5: **the transcript projector
must be a pure function** — `(rows, delta) -> rows` — fed by either the local delta channel or the
foreign tail of `transcript.row` events, with the placeholder-fill and upsert-by-index rules
implemented once. Sharing the *projector* while keeping the *transports* different is what makes
REQ-MONITOR-242 ("the transcript a user watched and the transcript restored must be equal") and
REQ-SESSION-159's own justification hold by construction rather than by testing two code paths
against each other.

**Consequences accepted.** Three delivery mechanisms to build, document and test, each with a
different failure contract, and a standing temptation to unify them that must be resisted with the
citations above. The whole-session snapshot must be regenerated whenever *any* displayable field
changes (C5.2), which makes adding a field to the session record a change to the update payload by
definition — that is the failure REQ-MONITOR-217 exists to rule out, and it should be enforced by
deriving the payload type from the record type rather than writing it out by hand.

**Revisit if.** The whole-session snapshot at the maximum supported agent count with full bounded
collections proves too expensive at the reconcile cadence — the answer is then field-level diffing
of that same payload, not folding it into the event stream.

---

### ADR-RUNTIME-03 — Durable store: files as the source of truth; no database in this slice

**Decision to be made.** Whether session state, the event journal and the diagnostics are stored in
files exactly as the specification names them or in a database with the files derived — and where,
if anywhere, SQLite/Drizzle/better-sqlite3 belongs in the runtime.

**Constraints.** C3.1 (the file names *are* the contract, and "no other name is written at the
session-directory root"), C3.3/C3.4 (atomic replace with a fixed write order), C3.6 (last-requested
wins, with a fixed log line for the loser), C3.9 (a listing may read only `metadata.json` and
`lock`), C3.10/C3.11 (bounded live files with atomic compaction), C4.1/C4.2 (byte-identical JSONL),
C2.4 (tailing by byte offset), C2.8 (reads are lock-free and unrestricted), C7.8 (stale detection
must write **nothing**, verifiable by fingerprinting the tree), plus REQ-EVENTS-166 (a stored
history or an exported document must yield every field when read on another machine with a stock
JSON parser and none of this product's code present) and REQ-SESSION-191 (the user can open the
session directory in the platform file manager and the log in a reader).

**Alternatives.**

*A — Files as the source of truth.* Everything named in C3.1 is written directly: state files as
whole-file atomic replaces, append-only files appended, capped files appended and periodically
compacted atomically.

*B — A database as the source of truth, with the files derived.* Fails on a structural point, not a
performance one. The files are compared *as files* by conformance requirements: REQ-EVENTS-015 and
REQ-EVENTS-081 compare the **set of file names** two runs leave behind, and REQ-MONITOR-299 compares
two session directories **entry by entry**. So the files must be written anyway, on the run's own
path, at the run's own moments. A database would therefore be a second copy that can disagree with
the contract copy — and REQ-SESSION-006 already establishes the principle that a loader takes its
facts from state and never from a derived sidecar. Worse, a foreign follower must read a session a
*different process* is writing, lock-free (C2.8); a write-locked database directory is exactly the
coupling C2.8 rules out.

*C — Files as the contract, a database as a derived read index.* The genuinely arguable one. Session
listing is O(sessions) `metadata.json` reads per refresh (C3.9); the event-history listing decodes
the first and last line of every session's journal (REQ-EVENTS-126); both must meet REQ-SHELL-150's
100 ms gesture budget, and in a workspace that has accumulated hundreds of sessions this is real I/O
on every open of the session browser. An index would fix it. Two things push back. First, C3.9 says
building the list "reads no file other than each entry's `metadata.json`" — a reader is entitled to
that behaviour, so an index must be a cache *checked against* those files, not a substitute for
them. Second, C7.8 requires stale detection to write nothing into the session tree, verifiable by
fingerprinting — so any cache must live **outside** `<workspace>/.rotaris/sessions/`, which also
keeps C3.1's "no other name at the session-directory root" intact.

**Recommendation.** **A for v1, with C as the named escape hatch.** Build the file store directly.
If and when session-browser or history-surface latency is measured against REQ-SHELL-150 and fails,
add a read-only index **outside the sessions tree**, keyed by session id, validated against each
`metadata.json`'s `updated_at`, and never consulted by any correctness path (resume, repair,
locking, following).

**The stack finding, stated plainly.** *In this slice, SQLite, Drizzle and better-sqlite3 carry no
requirement.* Every durable artefact domains 01, 02, 07, 09 and 20 define is a file whose name,
encoding, atomicity and byte content are fixed by the specification. Using a database as the source
of truth for any of them would violate C3.1, C3.3, C4.1 and C4.2. That is not an argument against a
database elsewhere in the product — domains 08 and 14 are not mine to judge — but the runtime must
not be designed around one, a shared "persistence layer" that assumes a database would be a poor fit
here, and better-sqlite3 must not become the reason the run host needs a native module it would not
otherwise need.

**Consequences accepted.** More hand-written I/O than an ORM would need, all of it with explicit
atomicity and ordering rules. Session listing is linear in session count. There is no transaction
spanning two files, so the cross-file ordering guarantees (C3.4, C3.12, C3.13) must be enforced by a
single writer — which is ADR-RUNTIME-04.

**Revisit if.** Listing or history-surface latency fails REQ-SHELL-150 at a realistic workspace size
(then add alternative C's index), or a future domain establishes a genuine relational query need
over runtime data that files cannot serve.

---

### ADR-RUNTIME-04 — One ordered session writer per session

**Decision to be made.** How the four separate ordering guarantees over durable writes and published
events are enforced.

**Constraints.** C3.4 (fixed write order within a save, `metadata.json` last), C3.5 (debounce with
immediate flush on any non-`running`/`idle` status), C3.6 (snapshot at request instant; last
requested wins; a fixed log line for the abandoned write), C1.8 (a synchronous flush callable where
no async runtime is active, not returning until durable, and durable enough for a *separate process*
to read a terminal status), C3.12 (persist before publish), C3.13 (durable record before wire event
over an enumerated pair list), C4.4 (writers serialized, no interleaved lines), C4.5 (append never
raises; store marked failed after a write failure), C3.11 (capped appends rewrite atomically), C11.2
(diagnostics writing never fails a run).

**Alternatives.**

*A — Each producer writes its own file and publishes its own event.* Rejected. There are four
distinct ordering rules — the intra-save order (C3.4), persist-before-publish (C3.12),
durable-before-wire over seven enumerated pairs (C3.13), and persist-before-forward for the journal
tee — and enforcing each at every producer makes them unverifiable. The specification names them as
invariants precisely because they are what a killed process must not be able to violate.

*B — An asynchronous write queue with promises.* The natural Node answer, and it fails on C1.8: a
promise-based queue cannot offer a flush that is "usable from any caller's context, including one
where no asynchronous runtime is active" and that "MUST NOT return until the newest requested state
is on disk". REQ-SESSION-070's second guarantee — a terminal status readable by a separate process
before the call returns — makes this unambiguous.

*C — A synchronous-capable serialized writer with an asynchronous fast path (recommended).* One
`SessionWriter` per session id owns the pending-state slot, the debounce timer, a monotonically
increasing **generation** counter, and the handles for the append-only files. `save(state)` captures
a snapshot at the instant of the call (C3.6), stamps a generation, and either writes now or parks.
`flush()` cancels any parked write and drains synchronously with `writeFileSync` + `renameSync` and
the C3.3 Windows retry ladder. A parked write whose generation has been superseded is abandoned with
the exact log line REQ-SESSION-069 fixes. The same object owns the event append, so C4.4's
serialization and C3.13's ordering are local facts rather than conventions.

**Recommendation.** C.

**Consequences accepted.**

1. A synchronous flush blocks the run host's event loop for the duration of one whole-transcript
   write. Bounded by C3.10 at 5000 rows and by C3.5 at twelve debounced writes per minute per
   running session. Acceptable **because ADR-RUNTIME-01 puts the run host off the window layer**;
   if ADR-RUNTIME-01 is revisited toward the main process, this consequence becomes a defect.
2. Two write disciplines coexist per session and must not be confused: whole-file atomic replace
   (`state/*.json`, `metadata.json`, `metrics.json`, `summary.md`, `events.meta.json`) and
   append-plus-periodic-atomic-compaction (`events.jsonl` under C4.7, the ring-capped evidence files
   under C3.11) — with `timeline.jsonl` and `transcript_archive.jsonl` append-only and never
   compacted, the latter explicitly so (REQ-SESSION-131).
3. Failure isolation is per target: a failed journal append marks the journal failed for the run
   (C4.5) without affecting the state writer, and a diagnostics write failure degrades to a log line
   (C8.8, C11.2). The writer must therefore report per-target failure rather than one boolean.
4. The generation mechanism is per session and must not couple two sessions (C3.6's closing rule).

**Revisit if.** Profiling shows the whole-transcript rewrite dominating. The specification's own
answer is already in place — the 5000-row cap of C3.10 exists for exactly this reason — so the next
lever is the size of the live window, not the writer.

---

### ADR-RUNTIME-05 — Following a session the current process does not own

**Decision to be made.** How a viewer follows a session owned by another process, and how that path
relates to the local one.

**Constraints.** C2.3 (the filesystem is the only channel), C2.4 (byte-offset tail with a fully
specified restart rule that includes comparing the truncation marker's dropped count on every read),
C2.5 (row-index reproduction with placeholder fill and single-step re-seed), C2.6 (an executing
handle refuses to follow), C2.7 (750 ms foreign, 2000 ms local), C5.3 (no debounce on an unseen row,
locally), C5.11 (one derivation shared).

**Alternatives.**

*A — Interval-driven resumable reads (recommended).* Each read seeks to the stored offset, reads
what was appended, and **also reads `events.meta.json`** to compare the cumulative dropped count —
C2.4 makes that comparison the thing that turns trim detection from incidental into guaranteed.
Non-transcript state comes from a whole-state read on the same 750 ms tick (REQ-MONITOR-246).

*B — Filesystem watching driving the tail.* Genuinely tempting: lower latency than 750 ms and less
idle work. Two things weigh against it. The restart detection of C2.4 requires reading the truncation
marker on **every read**, so a change notification cannot replace a read; and REQ-MONITOR-288 fixes
750 ms as the *observed latency* for a foreign session, so lower latency is not a requirement being
missed. Platform watcher semantics around atomic renames are also the case watchers handle worst,
and the journal is replaced by rename on every trim (C4.7). A defensible middle position — keep the
interval as the contract and allow a watcher purely as an extra wake-up that never replaces a
scheduled read — is permitted but buys little.

*C — Push over IPC from the writing process.* Rejected by C2.3, and more importantly it does not
serve the case that motivates the requirement: a session owned by a **second instance of the
application**, which has no IPC path to this one at all. REQ-SESSION-159's own reasoning — that
sharing one derivation is what guarantees following and reopening produce identical transcripts — is
lost if the two paths differ in origin.

**Recommendation.** A, plus a structural rule: **implement the local path as the foreign path with a
low-latency transport in front of it.** One projector (ADR-RUNTIME-02) consumes `transcript.row`
events from either source; the local transport is the direct delta channel with no debounce for an
unseen row (C5.3) and the 50 ms growth tick, the foreign transport is the 750 ms tail. They may not
share a transport — C5.3 forbids a 750 ms floor locally — but they must share the projector, the
index rules and the settling rules.

The additional reason is exercise. Under ADR-RUNTIME-01 all of one application's runs live in one
run host, so the only genuinely foreign case is a second application instance opened on the same
workspace — a rare path that would otherwise be barely tested while carrying the trickiest logic in
the slice (C2.4's restart rule, C2.5's placeholder fill). Sharing the projector puts the local
path's traffic through the same code.

**Consequences accepted.** A 750 ms floor on foreign-session latency, which the specification sets.
Two transports to maintain. The offset, the last-seen dropped count and the derived row set are
per-viewer state that must be discarded and re-seeded atomically on a restart flag (C2.5); rows
briefly shown from a superseded read are explicitly accepted rather than defended against
(REQ-SESSION-149 says so and gives the reason).

**Revisit if.** A future requirement lowers foreign-session latency below what a 750 ms poll can
serve — then add a watcher as an extra wake-up while keeping the marker comparison on every read.

---

### ADR-RUNTIME-06 — The delegated-child scheduler: an explicit ledger, not a promise graph

**Decision to be made.** What represents a delegated child and drives its progress.

**Constraints.** C6.1 (a closed state set with a fixed transition table, designated the single
definition), C6.2 (**an illegal transition must be rejected with an error naming both states, leave
the record untouched, and deliver no event**), C6.3 (five admission checks in a fixed order), C6.4
(**a suppressed duplicate start must be recorded, not merely prevented**), C6.5 (FIFO per-model hold
queue with one promotion per terminal transition), C6.6/C6.7 (dependency release and transitive
blocking cascade that must settle pre-start dependents while leaving started ones running), C6.8 (a
three-condition quiescence rule with an explicit no-livelock clause), C6.9 (exactly one waiting
mechanism, at most one wait per parent, no deadline on a wait), C6.10/C6.11 (idempotent sweeps over
records **read back from disk** after a crash, one of which must not probe liveness), C6.13
(per-session isolation).

**Alternatives.**

*A — A promise graph.* Each delegation is an async function; dependents `await` their dependencies;
concurrency is a semaphore (`p-limit` or equivalent). Idiomatic, small, and the first thing a Node
developer reaches for. It fails on four counts, each of which is a hard constraint rather than a
preference:

- C6.2 requires an *attempted illegal move* to be rejected with a specific error and to leave no
  trace. Implicit control flow has no representation of a move that was attempted and refused.
- C6.4 requires the duplicate-start race to be **observable** — a `child_launch_suppressed` timeline
  event and a `stale_child_launch_claim` issue. A promise that has already been awaited simply
  resolves again; the race is prevented and invisible, which is not what is asked for.
- C6.10 and C6.11 sweep non-terminal records **read back from a previous process's disk state**. A
  promise graph has no representation of a child that exists only as a record.
- C6.7 requires the cascade to settle dependents that have not started while leaving started ones
  running. An await-graph cannot distinguish "not yet started" from "started"; a rejected dependency
  propagates to every dependent uniformly.

*B — An actor or queue per child.* Adds machinery — a mailbox, a supervisor — without addressing the
ledger requirement, since the ledger still has to exist to satisfy C6.10/C6.11 and C6.2. The actor
model would be a way of *driving* the ledger, not a replacement for it.

*C — A persisted child ledger with a scheduler run to quiescence (recommended).* The ledger is the
primary representation: one record per child carrying the fields REQ-ORCH-043 and REQ-MONITOR-022
enumerate, persisted in `state/resume.json` under `child_states`. All state change goes through one
`transition(childId, to, reason)` function, which is the **sole** implementation of REQ-MONITOR-300,
validates the move, stamps the completion timestamp on a terminal state (C6.2), and emits
`child.transition`. Scheduling is a pass over the ledger triggered by a state change, not a timer:
each pass admits ready children (C6.3's five checks in order), promotes at most one held child per
model key per freed slot (C6.5), applies the dependency cascade (C6.7), and repeats until the
three-condition quiescence of C6.8 holds. A start is a **compare-and-set on the record** — claim the
`queued -> starting` transition, and if the claim loses, record the suppression (C6.4) rather than
retrying. Promises live only *inside* `starting -> running -> (summarizing) -> terminal` for one
child's execution, which is where they belong.

**Recommendation.** C.

**Consequences accepted.**

1. Every state change is a function call that can fail, and callers must handle the refusal. This is
   the cost of C6.2 being observable, and it is the point.
2. The scheduler runs to a fixed point rather than on a tick. C6.8's no-livelock clause becomes a
   termination proof obligation: each pass must either change some child's state or reach
   quiescence, so a pass that changes nothing must not schedule another.
3. The ledger is written through the C3.5 debounce like any other state, so a crash may lose up to
   10 s of ledger movement — which is exactly why C6.11's settle-on-continue exists, and why it must
   not probe liveness (holding the lock is already proof).
4. The per-model hold queue is FIFO and per model key, scoped per run (C6.13) — so two concurrent
   runs cannot starve each other of slots, which REQ-ORCH-050 states explicitly.
5. Because `transition` is the single definition, every other domain that names a child state cites
   REQ-MONITOR-300 rather than restating it, and the code must mirror that: no second table.

**Revisit if.** A requirement appears that needs children to be scheduled across runs (it currently
must not be — C6.13), or the ledger's size at the maximum supported agent count makes the debounced
write dominate.

---

### ADR-RUNTIME-07 — Resume, locking and recovery: the lock as the single capability token

**Decision to be made.** What authorizes a process to write a session, how liveness is probed, and
how the four call sites that ask "is this session live?" are kept in agreement.

**Constraints.** C7.11 (**one verdict** across lock reaping, liveness reporting, stale detection and
the worktree-integration precondition), C7.12 (exclusive create, at most one reap, no spinning),
C7.10 (resolve toward alive; on Windows the probe must deliver no signal or console control event),
C7.8 (stale detection writes nothing, verifiable), C7.9 (repair is explicit, never from a read path,
with a mandatory step order), C7.13 (a lock this machine cannot prove dead is never reclaimed
automatically), C2.8 (the right to write the event store *is* the right to hold the lock), C6.11
(settling orphaned children needs no liveness probe), C1.7 (releasing the lock tears down long-lived
subprocesses first), REQ-SESSION-048 (create persists state first, then acquires; a failure at
creation raises naming pid and host), REQ-SESSION-083/084/086/167 (the resume and create paths, and
the one situation in which a session directory is deleted).

**Alternatives for the liveness probe.**

*A — `process.kill(pid, 0)`, guarded.* **Spike run for this proposal** (Node v24.11.0, Windows 11,
26200): a child was spawned to sleep 3 s and exit with code 7; at t+500 ms the parent called
`process.kill(childPid, 0)`, `process.kill(999999, 0)`, `process.kill(0, 0)` and
`process.kill(-1, 0)`. Result: `{live: {ok: true}, dead: {err: "ESRCH"}, zero: {ok: true}, neg:
{err: "ESRCH"}}`, and the child then **exited normally, printing its own message and exiting 7**.
So on Windows, Node's implementation is inspection-only and does **not** deliver the console
interrupt REQ-SESSION-053 calls out as a defect. Two guards are non-optional and are already
required by C7.10 rather than being a workaround: `pid <= 0` must answer *dead* before the call
(the spike shows `pid 0` returns truthy, and on POSIX `kill(-1, …)` addresses every process the
caller may signal), and the error code must be mapped — `ESRCH` to *dead*, `EPERM` and everything
else to *alive*.

*B — A platform-native probe* (`OpenProcess` + `GetExitCodeProcess` on Windows, `/proc` on Linux,
`kill(pid, 0)` on macOS) via a native addon or `koffi`/`ffi`. More literally faithful to
REQ-SESSION-053's wording, and it would let the Windows case distinguish "exited but a handle keeps
it reported" — which REQ-SESSION-054 nevertheless *accepts* as a documented limitation resolving
toward alive, so the extra fidelity buys nothing the specification asks for. It also adds a native
dependency to the run host purely for a behaviour the runtime already provides.

**Recommendation.** **A with the two guards**, recorded together with the spike as the evidence that
Node's Windows implementation is inspection-only. Keep B as the fallback if a supported platform or
runtime version is found where that is not true — the probe must therefore be one module behind one
interface, not an inline call at four sites.

**The rest of the decision.**

- **One predicate, four call sites.** C7.11 names them: reaping (REQ-SESSION-047), liveness
  reporting (REQ-SESSION-056), stale detection (REQ-SESSION-057) and the worktree-integration
  precondition (REQ-SESSION-064). Implement `isSessionLive(sessionDir)` once, over the lock file
  content and the guarded probe, and have all four consume it. Any second implementation is a defect
  by REQ-SESSION-171.
- **Read paths and repair paths are different objects.** C7.9 forbids repair from a read path and
  C7.8 requires detection to be provably write-free, so the detector takes a read-only filesystem
  port and the repairer is a separate, explicitly invoked service. This is what makes the
  "fingerprint the tree before and after" test possible.
- **The lock is the capability.** Holding it authorizes writing state, opening the event store for
  writing (C2.8), and settling orphaned children (C6.11). Releasing it first tears down session-scoped
  subprocesses (C1.7), then removes the file. The run host must not hold two locks for one session
  and must not write a session directory it does not hold the lock for.
- **Acquisition never spins.** Exclusive create, one reap attempt under the three conditions of
  REQ-SESSION-047, one retry, then fail. No bounded retry loop.

**Consequences accepted.**

1. A lock held by another machine across a shared filesystem, or an unreadable lock, is never
   reclaimed automatically and requires the explicit user-confirmed action of C7.13. That is the
   specification's choice and it is the safe direction.
2. Pid recycling can make a dead session report alive until the recycling process exits
   (REQ-SESSION-054); accepted, documented, and must not be "fixed" in a way that breaks the
   resolve-toward-alive rule.
3. Under ADR-RUNTIME-01, a run-host crash leaves live-looking locks for every session it held; every
   one becomes stale and is repairable individually or all at once (REQ-SESSION-063), and the
   repair announcement is how C7.6's "reported as such on the next start" is satisfied.

**Revisit if.** A supported platform is found where the runtime's null-signal probe is not
inspection-only (then take alternative B), or a requirement appears for reclaiming a lock held by a
different machine (which C7.13 currently forbids).

---

### ADR-RUNTIME-08 — Hook invocation: per-occurrence sequential, cross-occurrence concurrent, resolved on exit rather than close

**Decision to be made.** How hook processes are started, bounded, terminated and collected, and where
in the run loop they sit.

**Constraints.** C8.1 (platform-fixed interpreter, run-tree cwd), C8.2 (one JSON object on stdin,
stdin closed, no trailing byte after the closing brace), C8.3 (bound = timeout + 5 s grace + one
process start; **kill only the started process, never its group**; descendants may outlive; **output
collection must not block on a stream a surviving descendant holds open**), C8.4 (all applicable
hooks run in declaration order, sequentially, even after one has decided to stop), C8.5 (concurrent
occurrences must not delay each other; per-stable-id session-wide failure tally; one switch-off
warning), C8.6 (hooks run in line with the loop; `iteration_end` before iteration N+1 and before
that iteration's checkpoint; `session_end` on every exit path before shutdown), C8.7 (the status
string derived once and shared with the wire event), C8.8 (durable entry before the completion
event), C8.9 (the set is fixed at run start), C8.10 (exempt from permission policy and sandbox),
C8.11 (nothing hook-related ends a run), C8.12 (with no eligible hook, nothing observable happens),
C8.13 (50 ms / 10 ms / 1 ms bounds).

**Alternatives.**

*A — Run lifecycle hooks off the run loop, fire-and-forget, so a slow hook never holds the run.* This
is what a reviewer will propose, and it is explicitly refused: REQ-HOOKS-080 says "a hook that
consumes its whole budget holds the run up for that long, and `timeout_seconds` is the user's means
of controlling this". More concretely it would break C8.6's checkpoint guarantee — an `iteration_end`
hook that reformats sources must have finished before the checkpoint is taken (REQ-SESSION-088), and
a detached hook cannot promise that. Rejected on the requirement, not on taste.

*B — A persistent shell process per hook, fed commands.* Cheaper per invocation and would help C8.13.
Rejected: C8.1 requires a **newly started process** handed to the interpreter, and C8.3/REQ-HOOKS-036
require a per-invocation, platform-independent "no exit status" state that a persistent shell cannot
produce.

*C — A fresh process per invocation, with a two-level runner (recommended).* Per *occurrence* (one
`pre_tool` for one tool call, one `iteration_end`, …) hooks run strictly one after another in
declaration order, each finishing before the next starts, with the stopping verdict decided only
after all have finished (C8.4). Occurrences run concurrently with one another (C8.5). The shared,
session-scoped state is the failure tally and the switched-off set, keyed by stable hook id, and it
must be safe against concurrent occurrences with exactly-once switch-off semantics.

**Recommendation.** C, together with three mechanics the constraints fix and which are easy to get
wrong in Node:

1. **Resolve on `exit`, not on `close`.** Node's `close` event waits for all stdio streams to end,
   and a surviving grandchild that inherited the pipe can hold them open indefinitely.
   REQ-HOOKS-033 forbids waiting on exactly that ("collecting the terminated process's output SHALL
   NOT block on a stream a surviving descendant still holds open; the grace period bounds that
   collection and expiring it yields empty output"). The runner therefore resolves on `exit` plus a
   grace timer and treats whatever was collected as final.
2. **Do not spawn `detached` and do not kill a negative pid.** C8.3 forbids widening termination to
   the process group. This is the opposite of C1.5, where a verification-check skip *must* signal
   the process group and tear down the terminal session. **The two paths must not share a kill
   implementation** — the hook runner kills a process, the command-execution path kills a group.
3. **Write the exact payload bytes and end the stream.** C8.2 fixes the last byte as the closing
   brace, with no trailing newline, so the payload is serialized once and written with a single
   `write` followed by `end()`; nothing may append a separator.

**Consequences accepted.**

1. A hook can hold an iteration boundary for `timeout_seconds + 5 s`, by design, and the user
   controls it. The run's own budgets (C9.2) are unaffected because they are boundary-evaluated.
2. Hook descendants may outlive the run. The specification says so, forbids tracking them, and
   forbids reporting them beyond a log line. Accepted without mitigation.
3. Hooks bypass the permission policy and the sandbox entirely (C8.10), so the hook diagnostics are
   the only evidence a hook ran. That makes C8.8's durable-before-event ordering load-bearing and
   not merely tidy.
4. C8.12's "nothing observable happens" for a session with no hooks, and C8.13's sub-millisecond
   bound for that case, mean the eligibility check must be a precomputed per-event lookup built at
   run start (C8.9 makes the set immutable for the run, so it can be indexed by event once).

**Revisit if.** C8.13's 50 ms bound cannot be met at 100 entries with a fresh process per invocation
— but note that bound covers *resolving and validating* the set, not invoking, so process-per-
invocation is not in tension with it.

---

### ADR-RUNTIME-09 — Two clock ports and a budget primitive; no bare timers in engine code

**Decision to be made.** How durations, deadlines and timestamps are obtained, so that every duration
in the slice is testable.

**Constraints.** C9.1 (**every duration measured against a monotonic clock, and conformance to every
one of them demonstrable with a controlled clock; no conformance claim may depend on real provider
latency**), C9.2 (boundary-taken actions; smaller budget governs; expiry of the smaller never resets
the larger), C9.3 (event stamps are wall-clock, may move backwards, and that is not an error), C9.4
(three timestamp conventions coexist), C9.5 (the persisted verification deadline is a duration, never
an instant), C9.6 (the fixed timing constants).

**Alternatives.**

*A — `Date.now()` and `setTimeout` directly, tested with fake timers.* The default. It fails C9.1 in
two ways. First, `Date.now` is wall-clock, and C9.3 explicitly permits it to move backwards mid-run
— a budget built on it can expire early or never. Second, "conformance to every duration MUST be
demonstrable with a controlled clock" is a requirement on the *product's* structure, not on the test
harness: fake timers patch a global, which works until one library or one native call reads the real
clock, and that failure is silent.

*B — One injected clock.* Better, but conflates two things the specification deliberately separates:
budgets need monotonicity and must be immune to clock adjustment (C9.1, C9.2), while event and
session timestamps must be wall-clock and are explicitly allowed to be non-monotonic (C9.3). One
port would force one guarantee onto both.

*C — Two ports plus a budget value type (recommended).*
- `MonotonicClock` — `now(): Millis` over `performance.now()` / `process.hrtime.bigint()`. Every
  duration, deadline, watchdog cadence, coalescing tick and backoff reads from it.
- `WallClock` — `instant(): Instant` for the three timestamp conventions of C9.4 (UTC `+00:00` on
  the wire, UTC `Z` in session state, local `HH:MM:SS` on transcript rows) — three formatters, one
  source.
- `Budget` — a value carrying a start reading and a duration, answering `expired()`, `remaining()`
  and `min(other)`, with the composition rules of C9.2 built in: `min` governs, and expiring the
  smaller does not reset the larger. Persisted verification deadlines are stored as the *duration*
  (C9.5) and rehydrated against a fresh start reading, which is what makes them meaningful after a
  resume and to a viewer in another process.
- Timers (`setTimeout`, `setInterval`) are obtained from the `MonotonicClock` port too, so a
  controlled clock drives the stall-watchdog cadence (C6.12), the 50 ms growth tick (C5.3), the
  750 ms and 2000 ms polls (C2.7) and the 10 s debounce (C3.5) without patching globals.

**Recommendation.** C. No `Date.now()`, `performance.now()`, `setTimeout` or `setInterval` appears
in engine code; a lint rule enforces it.

**Consequences accepted.** Every engine component takes a clock, which shows up in every constructor
and every test. In exchange, the whole of C9.6's constant table plus every budget in domain 01
becomes deterministically testable in milliseconds of wall time, which is precisely what
REQ-ORCH-156 asks to be demonstrable. Budgets are *values checked at boundaries*, not interrupts —
consistent with C9.2 and with REQ-ORCH-069's stated overshoot, and it means a long iteration
legitimately runs past a time limit rather than being aborted mid-flight.

**Revisit if.** A dependency proves impossible to drive from an injected clock (a provider SDK with
its own internal timeout, for instance) — in which case that timeout must be surfaced as a
configurable value the port can set, not left to the library.

---

### ADR-RUNTIME-10 — Cancellation and shutdown: one sticky stop request, one ordered teardown, one shared deadline

**Decision to be made.** How a stop is represented, propagated and completed, and how run teardown
composes with application quit.

**Constraints.** C7.1 (release human blocks first; approvals fail safe as **denied**), C7.2 (graceful
then hard at 30 s; forced stop performs a second sweep for work created during the first), C7.3
(sticky before callbacks are wired; interrupted wins over an apparently completed outcome; a
cancellation raised inside still releases the lock and emits the terminal result), C7.4 (the
eight-step teardown, in order, even on any exception), C7.5 (an interrupt during child teardown still
takes effect), C7.6 (the ordered shutdown effects, the 30 s force-exit backstop shared with the
cancellation grace, the second-quit rule, and the obligation to report an incomplete force exit on
the next start), C7.7 (ask every handle before waiting on any), C6.10 (the finalize-incomplete
sweep), C4.11 (which delivery path the terminal result takes).

**Alternatives.**

*A — `AbortController` alone.* A fine primitive, an insufficient decision. It gives no ordering
(C7.1 fixes one), no fail-safe semantics for suspended approvals (C7.1 requires denial), no
stickiness before listeners exist (C7.3), and no second sweep (C7.2). It would end up wrapped
anyway.

*B — Cancellation by exception, unwinding the loop.* Attractive because the teardown lands naturally
in a `finally`. But C7.5 requires an interrupt raised *during* teardown to still take effect, and
C7.4's step order must hold "even on any exception" — so the teardown cannot itself be the exception
path. And C6.10's sweep must re-check per record because closing one cascade-blocks another, which
an unwinding stack does not express.

*C — An explicit `StopRequest` plus an ordered teardown pipeline (recommended).* A per-run
`StopRequest {requested, forced, reason}` is set by the control channel or by shutdown; it is
observable rather than thrown, and it is **sticky** — setting it before the loop's callbacks are
wired replays when they are (C7.3). Stopping proceeds: cancel pending questions → cancel pending
approvals, resolving each as *denied* → request the loop's graceful stop → arm a 30 s deadline from
the `MonotonicClock` → on expiry, hard cancel and run the second sweep (C7.2). Teardown is a fixed
pipeline of the eight steps of C7.4 executed under a guard that cannot be skipped by an exception,
each step's failure logged and the pipeline continuing.

**Recommendation.** C, with two composition rules.

1. **One deadline object serves both 30 s allowances.** C7.6 says the force-exit backstop and the
   cancellation grace "fall due together"; making them one `Budget` (ADR-RUNTIME-09) rather than two
   timers is what makes that true by construction rather than by two constants that could drift.
2. **The quit path is main-driven, run-host-executed.** Main evaluates the window-close guards
   (REQ-SHELL-119), asks the run host to stop **every** run before waiting on any (C7.7), and holds
   process exit until the run host reports teardown complete or the shared 30 s deadline expires. A
   second quit request during that window force-exits immediately (C7.6). An incomplete force exit
   leaves live-looking locks, which the next start surfaces through stale detection and the repair
   announcement — that is how "must be reported as such on the next start" is satisfied without a
   separate mechanism.

**Consequences accepted.**

1. Approvals suspended at quit are resolved as denied, not left pending. That is the specified
   fail-safe direction (C7.1) and it means a user who quits mid-approval loses that tool call rather
   than having it silently permitted.
2. A force exit can leave the ordered effects incomplete — the only case in which that is permitted
   — and therefore can leave a partial trailing JSON line and up to a debounce window of unwritten
   state (C3.7). Both are already within the specified crash-loss bound.
3. The teardown pipeline runs in the run host, so main cannot observe its intermediate steps; it
   observes completion or the deadline. That is enough for C7.6, which fixes what must have happened
   before exit, not what main must see happening.

**Revisit if.** Measurement shows real runs routinely need more than 30 s to reach a stop check,
making the hard cancel the normal path rather than the backstop. The figure is fixed by
REQ-SESSION-092 and REQ-MONITOR-129, so this would be a specification change, not a design change.

---

### ADR-RUNTIME-11 — The run registry: runs are addressed by session id; focus is a UI concept

**Decision to be made.** How concurrent runs are held and addressed, and where "focus" lives.

**Constraints.** C10.1/C6.13 (full isolation; outcome independent of other runs and of interleaving),
C10.2 (one handle per run; controls route to the focused run; notifications cover every run), C10.3
(background handles publish only a summary), C10.4 (focus change touches no run's lifecycle), C10.5
(an approval reaches the run that asked even when unfocused; a permission-mode change reaches only
the focused run), C10.6 (the second concurrent launch goes in a worktree), C10.7 (the closed
five-item list of run-active gates), C10.8 (queued prompts are session-owned), C5.10 (per-session
addressing, late binding, discarded at teardown).

**Alternatives.**

*A — The engine knows which run is focused.* Rejected on three requirements: C10.4 (a focus change
must touch no run's lifecycle), C6.13 (a run's outcome must not depend on other runs or on
interleaving), and C10.3 (a background handle must publish only a summary — a rule about what the
*shell* subscribes to, not about what the run does). If the engine knew about focus, a focus change
would be an engine event, and the isolation claim would become a matter of care rather than of
structure.

*B — A registry keyed by session id, with focus entirely in the shell (recommended).* The run host
holds `Map<sessionId, RunHandle>`. Every control names its session id; the shell resolves "focused"
to a session id before sending. Notifications are published per session id and the shell decides
which to surface. Approval requests carry a `request_id`, and the answer is routed by looking that up
in the registry — which is exactly what C10.5's "an answer for which no run is waiting must be
reported back as undeliverable" describes.

**Recommendation.** B.

**Consequences accepted.**

1. C10.5's asymmetry becomes a shell rule rather than an engine one: a permission-mode change is
   addressed to one session id (the focused one), an approval answer is addressed by request id to
   whichever session is waiting. The engine implements neither policy; it implements addressing.
2. C10.6 (second launch in a worktree) is a launch-path rule owned by domains 06 and 07, not a
   scheduler rule; the registry does not enforce it.
3. C10.7's closed list of five run-active gates lives in the shell and the launch path. The registry
   supplies the predicate ("is a run active for this session / this workspace") and nothing else,
   drawing on the single busy test of REQ-NOTIFY-050 rather than a second one.
4. Bindings (event sink, event history, transcript recording, hook running, approval handling,
   audit) are late-bound by session id and discarded at teardown (C5.10), so a straggling event
   after teardown has no destination and cannot reach the next run in the same process — which
   matters more under ADR-RUNTIME-01, where many runs share one process.

**Revisit if.** ADR-RUNTIME-01 moves to one process per run, in which case the registry becomes a
supervisor of child processes and the addressing above becomes the wire protocol rather than a map
lookup — the shape does not change, only the transport.

---

## Part 3 — Candidate stack, assessed against this slice only

| Candidate element | Verdict for RUNTIME | Evidence |
|---|---|---|
| **Electron** | Settled by product decision, and a good fit. C1.5–C1.7 need native modules and free process spawning; C1.3 needs a single application process lifetime; REQ-STARTUP-002 fixes one graphical entry point. | C1.3, C1.5, C1.6, C1.7, REQ-STARTUP-002 |
| **electron-vite** | No requirement in this slice bears on it. **FREE.** One note: the run host is a Node entry point, not a renderer bundle, and must keep native modules external. | — |
| **React + TypeScript** | Renderer-side; outside this slice. Two constraints reach into it: C5.2 (the store must accept a whole-session replacement carrying every displayable field) and C5.6 (a stage that cannot apply an increment must decline and re-render whole rather than approximating). | C5.2, C5.6 |
| **Zustand** | Outside this slice. Compatible with C5.1's two payload shapes. The one thing to avoid is deriving displayed state that a whole read would not produce (C5.6). | C5.1, C5.6 |
| **Vercel AI SDK Core behind an internal `LLM` abstraction** | The abstraction is settled by product decision. What this slice needs *from* the port is listed below and is unusually demanding — in particular REQ-ORCH-146. | see below |
| **Official MCP TypeScript SDK** | Fits. One runtime obligation: MCP server subprocesses are **session-scoped and torn down at lock release, before the lock file is removed** (C1.7). They are not application-scoped. | C1.7, REQ-SESSION-049 |
| **xterm.js + node-pty** | node-pty must load in the run host, which is one more reason a renderer cannot host the engine (C1.5). The check-skip path needs process-group signalling with a 5 s grace and terminal-session teardown (C1.5) — a discipline that must **not** be shared with the hook path (C8.3). | C1.5, C8.3 |
| **SQLite + Drizzle + better-sqlite3** | **No requirement in this slice needs it, and using it as the source of truth would violate the file contract.** See ADR-RUNTIME-03. | C3.1, C3.3, C4.1, C4.2, C7.8 |
| **A separate runtime process for run execution** | **Recommended** (ADR-RUNTIME-01), but for reasons other than the usual ones: not to parallelise, but because C1.8's synchronous durable flush and C4.3's per-event flush must not land on the window layer, and because C2.1 already requires a serializable control surface. | C1.8, C4.3, C2.1 |
| **"An event journal with projections"** | **Half true, and taking it literally would be a mistake.** The journal is fixed as JSONL, byte-identical to the wire (C4.1, C4.2). But only the *transcript* is projected from events; every other displayed field comes from a whole-state snapshot (C5.1, C5.2), and the catalog is closed at 23 types and deliberately excludes a decision that is durably recorded elsewhere (C4.17). Full event sourcing of session state is ruled out. | C4.1, C4.2, C4.17, C5.1, C5.2 |

### What the `LLM` port must provide, for this slice to be implementable

These are requirements on the *shape* of the model abstraction, raised here because they were
discovered from runtime requirements and belong to the model-providers slice to answer:

1. **Cancellation must propagate into an in-flight request**, and a graceful pause must await
   in-flight tool calls up to a 30 s deadline before force-closing — REQ-ORCH-132, REQ-ORCH-134.
2. **A structured-output degradation ladder of three rungs**, with a rung a given model has rejected
   remembered *per model for the session* — REQ-ORCH-010.
3. **Failure classification into transient / validation-class / neither**, with an exhaustive
   definition of each and rate-limit and context-window failures explicitly routed elsewhere first —
   REQ-ORCH-092.
4. **Retry-After surfacing** from the provider, and a distinction between generic rate limiting and
   structured quota exhaustion — REQ-ORCH-091.
5. **Context-window rejection detected as its own class**, recoverable by condensation and retry at
   most twice — REQ-ORCH-093.
6. **The ability to *not* drive the loop.** REQ-ORCH-146: for a provider that ships its own native
   agentic loop, children run under that loop by default, and disabling it degrades to single-shot
   with tool use and streaming discarded. An abstraction that only exposes "one call, streamed
   deltas, tools I dispatch" cannot express this. This is the single most shape-determining
   requirement on the port and should be resolved before the port is designed.

Correspondingly, REQ-ORCH-134 states explicitly that **the threading model, the shape of streamed
model events, and any retry below the classification of REQ-ORCH-092 are not constrained** and no
conformance claim depends on them. That is genuine freedom and should be used.

---

## Part 4 — Escalations

**ESCALATE-1 — Session retention.** Nothing in domains 01, 02, 07, 09 or 20 prunes *sessions*. There
is retention within a session (the 20,000-event journal cap of C4.7, the 5000-row transcript window
of C3.10, the ring caps of C3.11) but a workspace accumulates session directories without bound, and
deletion is only ever an explicit user action (REQ-SESSION-166, REQ-SESSION-182). Every session
listing is O(sessions) file reads (C3.9) and every history listing decodes two lines per session
(REQ-EVENTS-126), both against REQ-SHELL-150's 100 ms gesture budget. Options for the product owner:
(a) leave it unbounded and accept that the session browser degrades in long-lived workspaces; (b)
add a user-visible retention preference (keep N sessions, or N days) with explicit deletion
semantics; (c) leave it unbounded but add the derived read index of ADR-RUNTIME-03 alternative C so
the surfaces stay fast while nothing is deleted. This changes what the product *is* for a user with
a year-old workspace, so it is not mine to decide. Note that (c) is purely an architecture decision
and can be taken later without foreclosing (a) or (b).

**ESCALATE-2 — Controlling a run owned by a second application instance.** C2.1 requires every
control operation to be issuable against a run in a different process. C2.3 says the only channel to
a foreign session is the filesystem, and no filesystem control channel is specified. If the user
opens a second instance of the application on the same workspace and presses Stop on a session the
first instance owns, one of three things must happen, and the choice is product-visible: (a) the
control is **refused with a reason naming the owning process** — consistent with C2.2's "a `false`
outcome states the operation did not happen" and with REQ-SESSION-183's existing "another process
holds this" vocabulary, and requiring no new mechanism; (b) a **filesystem control mailbox** is
introduced under the session directory — which C3.1 forbids at the session-directory root, so it
would need a new specified location and a new set of ordering rules; (c) an **OS-level channel
between instances**, which REQ-EVENTS-178's refusal of any programmatic driving surface makes
awkward to justify. My reading is that (a) is what the specification already implies, and that C2.1's
"different process" means the run host versus the renderer within one application (REQ-EVENTS-178
says the consumer contracts describe "this application consuming its own runs in its own process").
But the specification does not say so, and the difference is visible to a user with two windows open
from two launches. See also OQ-1.

---

## Part 5 — Open questions (specification genuinely silent)

**OQ-1 — Is a second application instance on the same workspace a supported configuration?** C2.3,
C2.6 and REQ-MONITOR-243 all describe following a session owned by another process, and C7.12/C7.13
handle a lock this machine cannot prove dead. But nothing states whether opening the application
twice on one workspace is supported, discouraged or prevented (there is no single-instance
requirement anywhere in domains 11 or 12 that I found). The answer decides whether the foreign-follow
path of ADR-RUNTIME-05 is a routine path or a defensive one, and it is the premise of ESCALATE-2.

**OQ-2 — What happens if the run host process crashes while the application stays up?** C7.6 covers
force exit and requires it to be "reported as such on the next start", and C7.8–C7.13 cover a stale
session after a process death. Nothing covers the case where the engine's host dies but the windows
survive. Candidate behaviours, none specified: the shell reports every affected session as needing
recovery (which the existing stale machinery already produces), and either respawns the run host
lazily on the next launch or immediately. This is only a question because ADR-RUNTIME-01 recommends
a separate host; under alternative B it collapses into an application crash.

**OQ-3 — What happens when `<workspace>/.rotaris` cannot be written at run start?** REQ-EVENTS-084
covers the *event store* specifically (degrade to a warning, run continues). REQ-SESSION-048 has
session creation persist initial state then acquire the lock, and REQ-SESSION-086/167 delete a
just-created session on a sandbox or worktree-bind failure. But nothing states the outcome when the
state write itself fails — whether the run is refused before start on the REQ-EVENTS-021 path (one
`result` with status `error`, no `session.start`) or attempts to proceed. Refusing before start is
the only reading consistent with C3.12 (persist before publish), but it is inferred rather than
stated.

**OQ-4 — At what granularity is `usage.update` emitted?** REQ-EVENTS-053 fixes only that it must not
be emitted with no figures and that it carries run-to-date cumulative totals. REQ-MONITOR-166 fixes
a *sampling* cadence of 10 s for the token-history sparkline, which is a different thing. Whether a
`usage.update` accompanies every model turn, or follows the 10 s sample, or both, is unstated and
affects journal volume against the 20,000-event cap of C4.7.

**OQ-5 — Is the run host permitted to hold locks for sessions in more than one workspace at once?**
C1.9 says several locked background sessions may coexist *within a single workspace*, and C10.1 says
runs may be in flight "in the same workspace or in different ones". Under ADR-RUNTIME-01 one run
host would hold locks across workspaces, which appears to be intended but is never stated as such.

---

## Part 6 — Reconciliations recorded (apparent conflicts that are not)

These are pairs an implementer will read as contradictory. Each is recorded with the reading that
resolves it, so the resolution is not re-litigated per component.

1. **C5.7 vs C5.8** — "no view may slow a run" (REQ-MONITOR-232) versus "a slow consumer delays the
   run, bounded at 5 s" (REQ-EVENTS-165). Different channels, resolved by ADR-RUNTIME-02: the event
   bus is bounded-blocking, the view channel is non-blocking, and REQ-EVENTS-178 confirms the
   event-bus consumer is the application consuming its own runs.
2. **C5.15 vs C2.7** — "re-reading persisted state on a timer is not a supported way to follow a
   run" (REQ-SESSION-071) versus "everything other than the transcript reaches an out-of-process
   viewer by a whole-state read every 750 ms" (REQ-MONITOR-246). Resolved by subject: the
   *transcript* is never followed by timed state reads; non-transcript state legitimately is.
3. **C1.5 vs C8.3** — a verification-check skip signals the **process group** and tears down the
   terminal session (REQ-ORCH-128); a hook timeout terminates **only the started process** and must
   not widen to the group (REQ-HOOKS-033). Both are deliberate; they are two execution paths and
   must not share a kill implementation.
4. **C1.2 vs C1.10** — "a backgrounded run continues in the same process" (REQ-SESSION-190) versus
   "a background run" listed among the separate-worker-process venues (REQ-MONITOR-299,
   REQ-SESSION-159). Resolved by reading REQ-MONITOR-299 as *permitting* a topology and
   REQ-SESSION-190 as *fixing* the observable: detaching changes which views follow the run and
   writes `background` to the status; it does not migrate the run.
5. **REQ-ORCH-039 vs REQ-ORCH-116** — a delegation to the acceptance role is refused only on a
   `failed` blocking check, while the completion gate is also left unsatisfied by `timeout` and
   `skipped`. The specification states the asymmetry is deliberate and must be preserved; recorded
   here so it is not "fixed".

---

## Part 7 — Summary of what these proposals commit to

If all eleven are approved, the runtime is:

- One Electron main process for windows, guards and choosers; **one `utilityProcess` run host** for
  every run in the application, forked after `app.ready` (ADR-01).
- **Three channels** between them: a serializable control request/response, a bounded-blocking
  ordered event bus, and a non-blocking view-update channel carrying a transcript delta plus a
  whole-session snapshot (ADR-02).
- **Files as the only source of truth** for session state, the event journal and the diagnostics,
  with no database in the runtime (ADR-03), written through **one ordered writer per session** that
  owns the debounce, the generation ordering and the synchronous flush (ADR-04).
- Foreign sessions followed **from the filesystem** by resumable offset reads plus a 750 ms
  whole-state poll, sharing one transcript projector with the local path (ADR-05).
- Delegated children driven by a **persisted ledger** with one `transition` function that is the
  sole implementation of REQ-MONITOR-300, a five-check admission gate, a per-model FIFO hold queue,
  and a scheduler run to quiescence (ADR-06).
- The **session lock as the single capability token**, one liveness predicate shared by four call
  sites, a guarded `process.kill(pid, 0)` probe verified by spike to be inspection-only on Windows,
  and repair strictly separated from every read path (ADR-07).
- Hooks invoked as fresh processes, **sequential within an occurrence and concurrent across
  occurrences**, resolved on `exit` plus a 5 s grace rather than on `close`, killed as a process and
  never as a group (ADR-08).
- **Two clock ports and a `Budget` value type**, with no bare `Date.now` or timer in engine code, so
  every duration in domain 01 is testable against a controlled clock (ADR-09).
- One **sticky `StopRequest`**, an ordered eight-step teardown that runs even on exception, and a
  single 30 s deadline shared by the cancellation grace and the force-exit backstop (ADR-10).
- A **registry keyed by session id** with focus held entirely in the shell (ADR-11).

The two findings most worth the reviewer's attention are ADR-RUNTIME-03 (the persistence half of the
candidate stack does not apply to this slice) and the note under Part 3 that "an event journal with
projections" describes only the transcript, not session state.
