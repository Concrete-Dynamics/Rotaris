---
reference: ROTARIS-CRW-001
domain: sessions-persistence
date: 2026-08-30
status: resolved
---

# Open-Question Resolutions — Session Persistence, Resume, and Background Sessions


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 1** — "the bound already stated is the whole contract… at most twelve debounced writes per
>   minute". The debounce is **withdrawn** (REQ-SESSION-067): a save is durable when requested, nothing is
>   deferred behind a timer, and there is no write-volume bound because none is needed. The reasoning here
>   is now historical.
> - **OQ 8** — the row bound, the page size of 50 and the 8000-character `full_detail` cap all stand;
>   `state/transcript_archive.jsonl` does not (REQ-SESSION-131, REQ-SESSION-192). The `full_detail` cap now
>   exists so a single tool row cannot grow a session's record without bound, not because every save
>   rewrote a whole transcript file.
> - **OQ 9** and the legacy-layout-removal table — "`state/resume.json` is the only resumable-state file"
>   is now "the stored resumable state is the only resumable state" (REQ-SESSION-037). The disposition
>   holds; its wording names files that no longer exist.
> - **OQ 12** — the three-way configuration-snapshot resolution is preserved exactly, but is stated in terms
>   of `state/resume.json`, `state/run_config.json` and diagnostics initialization. Read it against
>   REQ-SESSION-138's launch audit. One live inconsistency it does **not** settle: REQ-SESSION-016 says the
>   audit is recorded "at session start" and REQ-SESSION-138 says once by run startup after worktree
>   binding and the sandbox verdict. OQ 12 sides with 138; the two requirements still disagree.
>   >
>   > **Closed 2026-09-01. They no longer disagree, and OQ 12's disposition is what the specification
>   > implements.** REQ-SESSION-138 is the sole owner of *when* the launch audit is recorded;
>   > REQ-SESSION-016 cites it and holds only the two-place recording, the five facts, their defaults,
>   > the moments each is stamped on the session **state**, and the no-backfill rule. Reading both
>   > requirements did not merely break the tie, it removed it: "at session start" is unsatisfiable,
>   > because two of the five facts — the sandboxed flag and the sandbox backend name — are not
>   > knowable until the sandbox verdict of REQ-SESSION-086, and because REQ-SESSION-138 with
>   > REQ-SESSION-132 already establish that a session created but never run carries no launch audit at
>   > all. That argument is now recorded inside REQ-SESSION-016 so the question cannot be reopened on a
>   > reading of the words alone. REQ-SANDBOX-108's citation of the pair stays valid and is better
>   > supported than before.
> - **OQ 3** and **OQ 13** — the `host` field and the reap-equals-liveness identity survive, but the record
>   says "lock file" and "parses as JSON" (now: carries the three fields with their stated types). Its
>   reasoning that a foreign-host lock is the ordinary consequence of a shared filesystem is **superseded by
>   ESC-15**, which makes the store machine-local: a foreign-host lock is now evidence of a fault.
> - **OQ 23** and the graphical-only sweep row for **REQ-SESSION-099** — "the raw stored lines remain
>   obtainable byte-identical". Now: obtainable as the plain event stream, one event per line, every field
>   preserved, readable by a stock parser on a machine with none of this product's code (REQ-SESSION-189,
>   REQ-EVENTS-166). The guarantee is stronger, not weaker; it moved from the write path to the export.
> - **OQ 7**'s correction note says REQ-SESSION-196 "completes the snapshot from stored `transcript.row`
>   events". That completion step is **retired**, because no save is deferred and so no recorded row is
>   missing from persisted state. The entitlement list is unchanged.
> - The **Outcome** paragraph's claim that nothing remains outstanding for the product owner in this domain
>   is still true of the original open questions, but is no longer true of the domain: see the concerns
>   raised against SR-5's near-unreachable refusal path, the backup profile of a machine-local store, and
>   the loss-of-identifier case, none of which the original questions anticipated.
>   >
>   > **The backup concern is discharged as of 2026-09-01.** SR-9(b), re-affirmed by **ESC-19**, is
>   > applied as two new requirements. REQ-SESSION-200 owns the **disclosure**: the product itself states
>   > that backing up, copying, cloning or synchronising a workspace does not carry that workspace's
>   > session history, names what is outside such a backup and what is carried, says where the two
>   > remedies are, and may not be delivered only inside a failure or remediation message — a user who
>   > has already restored a workspace and found no history in it has been told too late. REQ-SESSION-201
>   > owns the **whole-store backup and restore**: one artifact covering the store and the per-session
>   > files held with it, valid while runs are live, restored only when explicitly asked for, never
>   > silently merged, refused while any session in the target store is live, and carrying the workspace
>   > identifier it was taken from. ESC-19 **refuses** the configurable store location, so ADR-0058's
>   > location decision does not reopen.
>   >
>   > Backups and exports are deliberately different artifacts and both requirements say so: an export
>   > is a record rendered so that software knowing nothing about this product can read it, and is what
>   > discharges REQ-EVENTS-166; a backup is the store rendered so that this product can put it back.
>   > REQ-SESSION-199 gained the matching clause from the export side, so a reader arriving there cannot
>   > conclude the exports already cover the gap. The SR-5 and identifier-loss concerns are unchanged
>   > and remain open.


This record disposes of every open question raised in the draft of
[`../07-sessions-persistence.md`](../07-sessions-persistence.md) (domain 07, requirement prefix
`REQ-SESSION`), and records the graphical-only sweep applied to that draft before the questions were
answered. The body of that specification has been amended so that each decision below is stated
normatively in place; the numbering of the original open questions is preserved here so the draft
and the resolved specification can be read against each other.

The following product-owner decisions of 2026-08-30 governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, command surface, exit codes, or event vocabulary. Under-determined
   cases are decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   that is more coherent with the rest of the document; where no coherent reading exists, the
   behavior is withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent.
4. **The product is one Electron desktop application.** It has no command-line interface, no
   headless entry point, and no terminal user interface. Domains 17 and 18 are retired.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract (an event field value, an enum, or a parseable output
   format).

New requirements added by these resolutions: **REQ-SESSION-182** through **REQ-SESSION-196**. No
requirement identifier was renumbered, reused, or deleted.

## Graphical-only sweep

Every requirement whose only observable surface was a command line, a subcommand, a flag, a process
exit code, a script-oriented output stream, or a full-screen text-mode interface has been withdrawn.
No capability was lost with the surface: each row below names the desktop requirement that now
carries it.

| Withdrawn | What it was | Capability rescued into |
| --- | --- | --- |
| REQ-SESSION-075 | Terminal run-result status → process exit-code mapping | REQ-SESSION-187 — the terminal run-outcome vocabulary and its totality rule, with no exit codes |
| REQ-SESSION-097 | Two command-line front-ends and the headless subcommand inventory | REQ-SESSION-182 (session management), REQ-SESSION-184 (starting runs), REQ-SESSION-188 and REQ-SESSION-189 (event history, replay, export). `version`/`setup`/`login`/`logout`/`providers` belong to domains 15 and 04; `requirements` to domain 08; `checkpoints` to domain 06 |
| REQ-SESSION-098 | `run` command flags | REQ-SESSION-184, together with REQ-SHELL-125 (start-session dialog), REQ-GIT-005 and REQ-GIT-007 (worktree storage and branch defaults) |
| REQ-SESSION-099 | `--output-format stream-json` stdout contract | REQ-SESSION-189 — the raw stored event lines are obtainable as a file export, byte-identical to the history |
| REQ-SESSION-100 | Refusal of worktree options on an interactive invocation | REQ-SESSION-184 — worktree choices are collected only where a task is being started, so the refused combination is unreachable |
| REQ-SESSION-101 | Headless `run` task/session requirement and config-error output | REQ-SESSION-184 — a launch with neither a task nor a session to resume is refused before a session exists |
| REQ-SESSION-102 | `Created session <id>` / `Resuming session <id>` announce line | REQ-SESSION-185 — the session id is displayed as soon as the session exists, distinguishing created from resumed |
| REQ-SESSION-103 | Outcome printing and process exit code | REQ-SESSION-186 — one run outcome presented from the same derivation as the `result` event |
| REQ-SESSION-104 | Ctrl-C handling (first graceful, second forced) | REQ-SESSION-186 — the stop control: first activation requests a graceful stop, second forces cancellation |
| REQ-SESSION-105 | `sessions` listing and `sessions --repair` | REQ-SESSION-182 — the session list marks stale sessions and offers repair, per session and for all |
| REQ-SESSION-117 | Terminal-UI `/resume`, command-palette and cheatsheet entries | REQ-SESSION-182, opened through the session browser of REQ-SHELL-126 and the action vocabulary of REQ-SHELL-048 |
| REQ-SESSION-119 | Terminal-UI `/background` hand-off that did not detach | REQ-SESSION-190 — a real background hand-off that detaches the view and leaves the run and its lock alive |
| REQ-SESSION-152 | `events list` / `replay` / `export` command | REQ-SESSION-188 (browse and replay with filters) and REQ-SESSION-189 (export, warnings, destination, batch shape) |
| REQ-SESSION-165 | `checkpoints list` / `restore` command | REQ-GIT-096 and the desktop checkpoint browser of domain 06; the session-side refusal stays in REQ-SESSION-164 |

Shell-surface clauses were struck from, and the requirement kept in, REQ-SESSION-001, 002, 003, 041,
055, 064, 066, 073, 080, 082, 087, 091, 092, 096, 106, 107, 109, 110, 120, 131, 151, 154, 159 and
181.

### Legacy-layout removal

Two further withdrawals are not about a shell surface but about compatibility with a predecessor
this product does not have. A clean-room product has no earlier on-disk version to fall back to, and
naming one would require a forbidden source (product-owner decision 1, and decision B on legacy
directories).

| Withdrawn | What it was | Replacement |
| --- | --- | --- |
| REQ-SESSION-005 | Legacy whole-state `snapshot.json` fallback file | None needed — `state/resume.json` is the only resumable-state file |
| REQ-SESSION-008 | `run.log` backward-compatible alias for `evidence/debug.log` | REQ-SESSION-191 — the session log and the session directory are opened from the desktop |

REQ-SESSION-037, REQ-SESSION-039 and REQ-SESSION-179 were narrowed accordingly; forward tolerance
for *absent optional keys* in directories written by other versions of this product (REQ-SESSION-015,
REQ-SESSION-030, REQ-SESSION-038) is unaffected and remains binding.

## Cross-domain schema reconciliation

Both additions decided in domain 06 are **adopted**:

- The session lock file gains a `host` field (REQ-GIT-020). REQ-SESSION-046 now fixes the lock
  content as `{"pid", "host", "acquired_at"}`; REQ-SESSION-047 reaps only a lock that parses, names
  this machine, and records a pid that is dead here; REQ-SESSION-056 counts a foreign-host or
  unreadable lock as live. This closes open questions 3 and 13 and removes the cross-machine
  limitation from REQ-SESSION-054.
- The session record gains `last_restored_sequence` (REQ-GIT-155). REQ-SESSION-195 states it on this
  domain's schema, and it is listed in the resumable-state key inventory with default null, so a
  drift check after a restore cannot demand a force.

## Dispositions

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | The bound already stated is the whole contract and no further coalescing is required: at most two state writes per debounce window per session, so at most twelve debounced writes per minute for a `running` or `idle` session, and a consumer may not assume fewer. Writes that must happen at once — status changes, explicit flushes, terminal statuses — sit outside the bound. | REQ-SESSION-071, Data & Formats (constants) |
| 2 | RESOLVED | Nothing more is required of the loser, and nothing more is permitted: acquisition makes at most one reap attempt and never waits, never retries in a loop, and never blocks, so a lock file another party keeps recreating cannot make acquisition spin. The failure reports the session id together with the pid and host the existing lock records, says that nothing was started, and leaves the lock file exactly as found. The same rule governs creation and resume. | REQ-SESSION-047, REQ-SESSION-048, REQ-SESSION-083 |
| 3 | RESOLVED | Yes, a disambiguator is added — the `host` field the git domain fixed for this same file (REQ-GIT-020), not a process start time. It makes the cross-machine case detectable and resolves it toward "live": a foreign-host lock is never reclaimed automatically, and that case therefore leaves the accepted-limitations list. Pid recycling and Windows handle retention stay accepted, because both already resolve toward "live". | REQ-SESSION-046, REQ-SESSION-047, REQ-SESSION-054, REQ-SESSION-056, REQ-SESSION-183 (new), Data & Formats |
| 4 | RESOLVED — **superseded by SR-2, the single-instance ruling** | *The question this answered no longer arises.* It asked what a surface should show while a resumable tail read of `evidence/events.jsonl` might be misaligned, and every term in the answer — the tail read, the restart test, the re-seed — belonged to a protocol by which a surface followed a session executing in a process this application does not own. No such session exists (REQ-SESSION-159), so there is no read to be misaligned, no re-seed, and no briefly-shown row to accept. Both requirements it touched are withdrawn: REQ-SESSION-149 (the resumable byte-offset tail) and REQ-SESSION-160 (follower row numbering, the placeholder row and the re-seed). What replaces it, for the one failure that survives — an update lost in delivery on the internal channel — is not a defence at all but a recovery: the surface detects the loss immediately from the sequence gap (REQ-MONITOR-214, REQ-MONITOR-226) and reconciles from a whole-session read (REQ-SESSION-161), which recovers the real rows instead of tolerating provisional ones. *The original disposition is kept below because it records why the old design was what it was.* — "Briefly showing rows that are then discarded is acceptable, with one strengthening: the restart test is evaluated over the whole of a tail read before any event from that read reaches a consumer, so no row is ever derived from bytes the same read could tell were misaligned. Rows from an earlier read are discarded when the consumer re-seeds, and the re-seed replaces the displayed rows in a single step so the view is never observed empty. Withholding every event until a later read confirms alignment is rejected: it would cost a whole read interval on every read to defend against a case that arises only when the cap trims a history someone is watching." | REQ-SESSION-149 (withdrawn), REQ-SESSION-160 (withdrawn), REQ-SESSION-159, REQ-SESSION-161, REQ-MONITOR-214, REQ-MONITOR-226 |
| 5 | RESOLVED | The vocabulary is closed at exactly the values listed here — twelve when this was decided; there are no other hosts to keep it open for. Two later rounds extended the list rather than opening it, exactly as the requirement provides for a domain that needs a status of its own: `waiting` for a run parked on a provider quota wait (REQ-MONITOR-195) and `awaiting_plan_decision` for a run blocked at the plan gate (REQ-ORCH-153), so REQ-SESSION-073 now closes at fourteen. No part of the product may persist anything else, so a value outside the set can only reach a reader from a directory written by another version of this product: it counts as non-active, is displayed verbatim rather than replaced by a guess, and maps to an error run result. | REQ-SESSION-073, REQ-SESSION-076, REQ-SESSION-154, Data & Formats |
| 6 | RESOLVED | Degrade the same way. A `state/ui_transcript.json`, `state/ui_edit_diffs.json` or `state/run_config.json` that is present but unparseable, or that lacks its expected key, leaves the corresponding field empty exactly as absence does; the load succeeds and a warning plus a recorded issue names the file and the reason. Only `state/resume.json` failing to parse fails a load — the other three hold recoverable bulk data whose loss degrades a reopened session rather than invalidating it. | REQ-SESSION-036, REQ-SESSION-179 |
| 7 | RESOLVED | Enumerated as an entitlement. Restored from persisted state: every transcript row at its own index with statuses settled and archived pages reachable, todo state, the child-agent tree, metric aggregates, report artifacts, pending questions and approvals as trailer rows, the verifier summary and any gate warning, the worktree binding and branch, the checkpoint list, and the session-scoped model override. Deliberately not restored: streaming animation and partially streamed text, live terminal buffers, elapsed-time counters for activity that is no longer running, and scroll position. Everything restored comes from one derivation and never from a second one. *Corrected under SR-2:* that derivation was written here as "the read-only snapshot read plus the event tail". There is no tail; the entitlement itself is unaffected. REQ-SESSION-196 now reads the snapshot of REQ-SESSION-040 and completes it — for any row a debounced save had not yet written — from that session's own stored `transcript.row` events applied at their own index (REQ-EVENTS-052), which is a plain read of stored lines and needs no read position. | REQ-SESSION-196 (new), REQ-SESSION-156, REQ-SESSION-106, REQ-SESSION-040 |
| 8 | RESOLVED | Yes — a row bound rather than a byte bound. `state/ui_transcript.json` holds at most the 5000 most recent rows; older rows are evicted in whole pages of 50 into `state/transcript_archive.jsonl`, which becomes a general facility of the product rather than a terminal-UI one, so save cost is bounded while history stays complete. Eviction never changes a row's index, and archived rows are served on demand. `full_detail`, the one unbounded transcript field, gains an 8000-character cap cut at a line boundary keeping the newest output. | REQ-SESSION-192 (new), REQ-SESSION-122, REQ-SESSION-131, REQ-SESSION-003, Data & Formats |
| 9 | OMITTED | None: the legacy fallback is withdrawn outright rather than being specified. A clean-room product has no predecessor on-disk layout, and naming one would require a forbidden source. `state/resume.json` is the only resumable-state file and its absence is a not-found failure; no whole-state file is ever read or written. Tolerance for *absent optional keys* in directories written by other versions of this product is a different mechanism and is unaffected. | REQ-SESSION-005 (withdrawn), REQ-SESSION-039 (withdrawn), REQ-SESSION-037, REQ-SESSION-179, REQ-SESSION-002, Data & Formats |
| 10 | RESOLVED | `interrupted` is added to the mapping, and so is `stopped`; both yield the interrupted outcome. The mapping is now total: `completed` → completed, `failed` → failed, `paused`/`paused_message_limit`/`stopped`/`interrupted` → interrupted, and every other persisted status — the active values (five when this was decided, six since `waiting` joined them under REQ-SESSION-055), `idle`, `awaiting_plan_decision`, or anything outside the closed vocabulary — yields an error result conveying that the run ended without a terminal status. The mapping stays total over the vocabulary as it grows, which is what REQ-SESSION-187 requires of every derivation. A repaired session therefore reports an interrupted run rather than a generic error. | REQ-SESSION-076, REQ-SESSION-187 (new) |
| 11 | RESOLVED | Yes, and no new badge is invented for it. The status is rendered from the stored value as text and never by colour alone (REQ-SHELL-149), so `interrupted` and `idle` are already distinguishable and the status word itself carries the information; a stale session additionally carries the stale marking beside its status. | REQ-SESSION-154, REQ-SESSION-182 (new) |
| 12 | RESOLVED | All three requirements are kept; the order of writes is what resolves them. `state/resume.json` never carries `config_snapshot`; `state/run_config.json` is its one durable copy and is what a load rehydrates from; and that audit is written by run startup *after* worktree binding and after the sandbox verdict, so it records the rebound configuration and never the pre-binding one. It remains write-once per session and is never rewritten, not even by a run that resumes the session. Diagnostics initialization no longer creates it, because a placeholder written at session creation would freeze the pre-binding configuration in place. | REQ-SESSION-085, REQ-SESSION-138, REQ-SESSION-132, REQ-SESSION-087, REQ-SESSION-003, REQ-SESSION-029 |
| 13 | RESOLVED | Report live; the git domain's rule is adopted verbatim. A lock is reaped only when it parses, its `host` names this machine, and its pid probes dead here; in every other case the lock is respected and left byte-identical — so the reap test and the liveness test are literally the same test and can never disagree. The unremovable-lock gap the question names is closed by a new explicit, user-confirmed release action which states the recorded pid, host and acquisition time and the risk of releasing a live lock, removes only the lock file, leaves the execution status alone, and never runs automatically. | REQ-SESSION-047, REQ-SESSION-056, REQ-SESSION-054, REQ-SESSION-183 (new) |
| 14 | RESOLVED | The arms are evaluated in order and the first match wins, and a new arm covers the case directly: a run that produced no tasks at all completes, at information severity, with text conveying that it finished without producing any task. Nothing about such a run went wrong, so it is not a failure; the explicit ordering also makes every other overlap single-valued. | REQ-SESSION-074 |
| 15 | MOOT | Both requirements were command-line surfaces and were withdrawn in the graphical-only sweep: REQ-SESSION-099 (`--output-format stream-json`) and REQ-SESSION-101 (headless `run`). There are no process exit codes anywhere in the product — REQ-SESSION-075 is withdrawn and REQ-SESSION-187 states outcomes as words. The one surviving obligation, refusing a launch that names neither a task nor a session to resume, is now stated exactly once. | REQ-SESSION-099 (withdrawn), REQ-SESSION-101 (withdrawn), REQ-SESSION-184 (new) |
| 16 | RESOLVED | Never cleared automatically — not on a timer, not on resume, and not by a provider quota window the product cannot observe, so an untouched session never silently resumes calling a model that refused it. The exclusion binds automatic selection and automatic retry only: a model the user chooses explicitly is always usable, and choosing it removes exactly that entry, the user's choice being the evidence that the quota returned. | REQ-SESSION-024 |
| 17 | RESOLVED | This domain fixes no timeout of its own. The expiry is the approval wait of REQ-TOOLS-055 — the configuration key `runtime.approval_timeout_seconds`, a float of at least 0 defaulting to 300.0 seconds, where 0 means the wait never expires by itself. REQ-SESSION-025 now cites that requirement instead of asserting an unspecified "times out". | REQ-SESSION-025 |
| 18 | RESOLVED (exit code MOOT) | There is no code to fix — there are no exit codes. The refusal must convey the session id, the status the record claims, that nothing was restored and the working tree is unchanged, and, when the session is stale rather than live, that repairing it makes the restore available; it is presented as an error on the surface that asked for the restore (REQ-GIT-096), with wording left to the implementation. | REQ-SESSION-164, REQ-SESSION-066, REQ-SESSION-187 (new) |
| 19 | RESOLVED | The resolution rule is not this domain's to invent: REQ-GIT-010's deterministic `-2`, `-3`, … suffixes, up to 50 attempts, govern, and the losing launch takes the first free suffix. What produces a collision at all: with ids never reused, a generated name collides only against a branch left behind by a session whose directory was deleted, or against a branch the user created by hand; a name supplied with the request collides whenever a user reuses one. | REQ-SESSION-084 |
| 20 | RESOLVED | Key names are fixed, because they are a machine-readable contract and a consumer cannot be written against a list of figures. `session.start` carries `session_id`, `task`, `workspace_root`, `persona`, `permission_mode`, `sandbox` (`{enabled, backend}`) and `max_iterations`, with value types stated. `metrics.json` and the trajectory document name each figure their own requirement lists, by the same words joined with underscores in lower snake case, and the trajectory document's top-level inventory is fixed exactly. Every inventory is exhaustive; key order is not significant. | REQ-SESSION-193 (new), REQ-SESSION-090, REQ-SESSION-139, REQ-SESSION-153 |
| 21 | RESOLVED | One rule for the whole domain: text cut to a character cap is marked by appending `...`, counted inside the cap, so a stored value never exceeds its cap and a shortened value is always distinguishable from a complete one. It applies to the transcript fields, the continuation-payload budgets, the summary task line, error-path tool arguments and results, and replay payload renderings. Two deliberate exceptions: the todo elision marker line, because entries rather than a string end are dropped; and the thinking `chars` counter, which measures what was produced and not what was stored. And yes, `full_detail` is capped — at 8000 characters, cut at a line boundary, keeping the newest output. | REQ-SESSION-194 (new), REQ-SESSION-122, REQ-SESSION-115, REQ-SESSION-140, REQ-SESSION-136 |
| 22 | RESOLVED | `failed`. The tool-row status vocabulary is REQ-MONITOR-105 — `running`, `ok`, `failed`, `blocked` — which has no `cancelled` value, and in which `blocked` denotes a call refused or skipped before it ran. A call that was under way and produced no result is a failure whatever became of the agent that made it; the child's own record still moves to `cancelled` under REQ-SESSION-065, the two records differing because they describe different things. | REQ-SESSION-129 |
| 23 | RESOLVED (two parts MOOT) — **batch shape superseded** | The stderr notice and the `-o` default are moot: there is no command. The substantive part is decided — export writes to a file the user chooses through the platform's save dialog, with no implicit destination and nothing written before a destination is chosen; one session exports as one trajectory document, and several export as one JSON document in selection order, whose wrapper is closed so a consumer that understands one document understands a batch. The resumed-session and capped-history conditions survive as warnings that do not stop the export, and the raw stored lines remain obtainable byte-identical. **Superseded in one part:** this row fixed the wrapper as `{"trajectory_version": 1, "sessions": [<document>, …]}` carrying no field of its own, which could not be satisfied together with REQ-EVENTS-144's requirement that the wrapper carry the count of documents. The wrapper is now REQ-EVENTS-144's alone — `trajectory_version`, `count`, `trajectories`, closed at three — and REQ-SESSION-189 cites it. Nothing else in this row changes. | REQ-SESSION-189 (follower), REQ-EVENTS-144 (owner), REQ-SESSION-188 (new), REQ-SESSION-152 (withdrawn), REQ-SESSION-153 |
| 24 | RESOLVED | The empty session id is the return value only and never the whole report. A refused board launch is additionally reported through the notification surface of domain 19, conveying which requirement unit could not be started and why, and the unit's row on the requirement board shows it as not started with that reason attached — so a refusal that produced no session is never indistinguishable from a unit nobody has run yet. | REQ-SESSION-158 |
| 25 | RESOLVED | A declared capability, read from the model-capability metadata the product ships with (REQ-PROVIDER-137) — never an observed failure and never a hard-coded list of model identifiers. When that metadata does not declare the property for the session's default-persona model, the repair does not run at all, because rewriting stored conversation files on suspicion is worse than a request the provider might refuse. | REQ-SESSION-170 |

## Outcome

25 open questions: 22 resolved, 1 omitted (OQ 9 — the legacy on-disk fallback is withdrawn rather
than specified), 1 moot (OQ 15 — both requirements were command-line surfaces), and among the
resolved, OQ 18 and OQ 23 each carried a component that ceased to exist with the command line. Two
requirements were withdrawn for legacy-compatibility reasons and fourteen for shell-surface reasons,
with every capability rescued as recorded above. Nothing was escalated and nothing remains
outstanding for the product owner in this domain.
