---
reference: ROTARIS-CRW-001
domain: ui-performance-benchmark
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 21, UI Performance Benchmark


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 7** — "capture supports exactly the layouts the sessions domain defines". That disposition is the
>   right one and now points somewhere else: there is no layout, and capture reads the session's resumable
>   state plus three optional bulk parts on the precedence of REQ-SESSION-036 (REQ-UIBENCH-015). The
>   principle — capture follows the sessions domain and never defines a second route — is preserved
>   verbatim.
> - **OQ 16** — "a symbolic link beneath `SESSION_DIR` contributes nothing to `source_checksum`, whatever
>   it points at, and is never traversed". There is no directory to walk and no link to follow.
>   `source_checksum` is now taken over the canonical serialization of the session's own recorded state
>   (REQ-UIBENCH-019). Both properties the link rule bought are kept by construction: nothing outside the
>   session can enter the digest, and no cycle can be entered.
> - **ESC-13 is ruled and its amendment is not yet applied.** If OQ-28 resolves to the framework-neutral
>   reading, REQ-UIBENCH-054 is relaxed; the canvas is refused outright either way. The amendment is
>   drafted and deliberately withheld until OQ-28 is resolved.
>   >
>   > **Closed 2026-09-01. OQ-28 is resolved to the framework-neutral reading, and the withheld
>   > amendment is applied.** The resolution is recorded in REQ-UIBENCH-050 itself rather than left to be
>   > inferred from this record: the counting rule is operative and framework-neutral, `widgets` counts
>   > every element that occupies layout space and can be painted whatever produced it — including a
>   > rendered paragraph, code block or list item inside a transcript row — and the interface-framework
>   > clause explains only why absolute numbers do not travel between revisions. Rows 13 and 29 of the
>   > table below are the evidence that pointed one way, and they are now load-bearing rather than
>   > incidental.
>   >
>   > REQ-UIBENCH-054's element-count invariant is therefore relaxed, as option 2 of the ruling
>   > required. The withdrawn rule is quoted in place inside the requirement and marked **unsatisfiable
>   > by any admissible implementation** rather than merely unmet, because the only structure that
>   > satisfies it is the canvas the ruling refuses (REQ-CHAT-075, REQ-CHAT-077, REQ-CHAT-065,
>   > REQ-SHELL-144). What replaces it is a bound on the count's variation across two comparisons in
>   > which the displayed state is known not to change, plus one retained absolute — a later record
>   > below the `construct_window` figure means structure was destroyed rather than content drawn. Row
>   > 14's principle survives the relaxation: REQ-UIBENCH-054 stays canonical and REQ-UIBENCH-085
>   > reports it.
>   >
>   > **This record never carried draft text for the withheld amendment**, only the fact that one
>   > existed. A reader looking here for the wording the amendment was going to take will not find it,
>   > and should not conclude it was lost: the applied relaxation was written from the ruling, from rows
>   > 13, 14 and 29 below, from REQ-UIBENCH-050, and from spike 1's measurements.
>   >
>   > Three further defects in this domain were corrected in the same pass and are not consequences of
>   > ESC-13: `settle_timed_out` is now read by the invariants that depend on a settled interface
>   > (REQ-UIBENCH-087, REQ-UIBENCH-085, REQ-UIBENCH-119, REQ-UIBENCH-081); REQ-UIBENCH-118's and
>   > REQ-UIBENCH-099's claim to hold the only absolute threshold is withdrawn as untrue of the document;
>   > and REQ-UIBENCH-059's `unchanged_state` phase now applies the state actually displayed, so it
>   > measures an unchanged application as its name promises.
> - The benchmark's **own outputs** — `fixture.json`, `iteration-NNN.jsonl`, `summary.json`, `summary.md` —
>   are unaffected. They are material a developer reads with stock tools, which is exactly what SR-4 keeps
>   as files.


This record disposes of every open question raised in the draft of
[`../21-ui-performance-benchmark.md`](../21-ui-performance-benchmark.md) (requirement prefix
`REQ-UIBENCH`), and records the graphical-only sweep applied to that draft first.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** The rewrite owes no format, surface,
   exit code, or field name to any other implementation. Where a case was under-determined, this
   record chooses, and awkward or arbitrary behavior is never preserved for compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved to the reading more
   coherent with the rest of the document; where no coherent reading exists the behavior is omitted.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. Every requirement
   whose only surface was a shell invocation is withdrawn, and every capability such a requirement
   carried is rescued into a desktop-reachable requirement. See the "Graphical-only sweep" below.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (a JSON field name, an enum value, a parseable file format). Open
   questions asking for the exact phrasing of a human-readable message are resolved by fixing what
   the message must convey and leaving the wording to the implementation.

**Does this domain survive?** It **survives reduced**. Its title named a command and its whole
invocation surface was a console program, but what that program did was not a terminal-interface
benchmark: it measured the *desktop* interface's own rendering path. That capability is real, is
worth keeping, and is now a built-in feature of the desktop application reachable from the Settings
view's About tab. Fourteen requirements — the entire command identity, grammar, standard-stream and
exit-code surface — are withdrawn; the measurement, fixture, replay, statistics, invariant, and
report machinery survives intact and gains one new invariant that reports the interface against the
product's own 100 ms responsiveness budget.

Cross-domain coherence was checked against `02-run-monitoring-steering.md` (presentation agent
states), `03-conversation-composer-transcript.md` (transcript row roles),
`04-model-providers-auth.md` (the money-arithmetic rule), `07-sessions-persistence.md` (session
on-disk layouts, schema-version refusal, `execution_status`), `12-desktop-shell-windows.md` (the
About tab and its diagnostics card, bundled fonts, built-in themes, the responsiveness budget,
accessibility floors), `14-library-artifacts-improvements.md` (artifact `kind` and `status`
vocabularies) and `15-settings-configuration.md` (settings categories). No other source was
consulted.

New requirements added by these resolutions: **REQ-UIBENCH-110** through **REQ-UIBENCH-119**. No
requirement identifier was renumbered, reused, or deleted.

## Graphical-only sweep

Fourteen requirements had no surface other than a command-line invocation, its argument grammar, its
standard streams, or its exit codes. Each is withdrawn in place, and every capability any of them
carried is now reachable from the desktop interface.

| Withdrawn | What it was | Capability rescued into |
| --- | --- | --- |
| REQ-UIBENCH-001 | A standalone console program installed alongside the desktop package by a package manager, absent from bundled installers. | **REQ-UIBENCH-110** (new) — the benchmark is a built-in capability of the desktop application, present in every installation without exception, started from a performance-benchmark card in the Settings view's About tab (REQ-SHELL-138) beside the diagnostics card of REQ-SHELL-163, every control keyboard-reachable, named, and usable at the minimum window size (REQ-SHELL-022). |
| REQ-UIBENCH-002 | The program-name token prefixing every usage, help, and argument-error message. | No capability: there is no usage or help text to identify. Failure identification is carried by **REQ-UIBENCH-114** (new), which names the operation, the cause, and the offending path or value. |
| REQ-UIBENCH-003 | "Purely non-interactive": no prompts, no progress output, no colour, no terminal detection, no window of its own. | **REQ-UIBENCH-112** (new) — iterations render offscreen; no benchmark window ever appears, takes focus, or disturbs the user's windows, and no iteration prompts. The suppression of progress output is deliberately *inverted*: **REQ-UIBENCH-116** (new) requires the interface to show progress and offer cancellation, which is right for a desktop surface and was only ever wrong for a pipe. |
| REQ-UIBENCH-004 | The published four-subcommand surface, the "no alias, no abbreviation" rule, and the exit-2 argument-error class. | **REQ-UIBENCH-111** (new) — exactly four operations (capture, replay, inspect, compare) are the whole benchmark surface; an operation with an unchosen input is a disabled control naming what is missing, so no argument error is reachable. |
| REQ-UIBENCH-005 | The subcommand grammar: `capture SESSION_DIR --output PATH`, `replay FIXTURE --output PATH [--iterations N]`, `inspect RUN_DIR`, `compare BASE_RUN CANDIDATE_RUN`. | **REQ-UIBENCH-111** (new) — the same four operations with their inputs chosen through the product's own session list and the platform file choosers. |
| REQ-UIBENCH-006 | `--output` mandatory for capture and replay. | **REQ-UIBENCH-111** (new) — capture and replay cannot start until a destination has been chosen. |
| REQ-UIBENCH-007 | `--iterations` parsing and its default of 3. | **REQ-UIBENCH-113** (new) — an integer control defaulting to 3; a non-integer value is unreachable. |
| REQ-UIBENCH-008 | The `--iterations must be at least 1` line, exit 1, and the no-filesystem-effect guarantee. | **REQ-UIBENCH-113** (new) — the control's smallest offerable value is 1, so a value below 1 is unreachable and the product defines no message for it. |
| REQ-UIBENCH-009 | Exit code 0 for every successful subcommand and healthy child. | **REQ-UIBENCH-114** (new) for the user-visible outcome; the child's zero termination status survives as an internal signal in REQ-UIBENCH-052 and REQ-UIBENCH-041. |
| REQ-UIBENCH-010 | Reports printed to stdout as 2-space-indented, sorted-key JSON and nothing else. | **REQ-UIBENCH-115** (new) — reports are presented in the interface showing every value, and exportable by clipboard copy or file save as exactly that JSON, byte-identical between the two routes and locale-independent. |
| REQ-UIBENCH-011 | Which subcommand may write what to stdout, and uncaptured child stream inheritance. | The capture privacy notice moves to the interface in the amended **REQ-UIBENCH-022**; child output handling becomes **REQ-UIBENCH-117** (new), which captures it, retains it as `iteration-NNN.log` for crashed iterations, and forbids it reaching the user unasked. Resolves OQ 3. |
| REQ-UIBENCH-094 | The exit-0 inventory. | **REQ-UIBENCH-114** (new) — the success outcome of each operation is reported in the interface. |
| REQ-UIBENCH-095 | The exit-2 argument-error class with usage text on stderr. | **REQ-UIBENCH-111** and **REQ-UIBENCH-113** (new) — no argument list exists to be wrong. |
| REQ-UIBENCH-096 | Exit 1 with one clean stderr line for an iteration count below 1. | **REQ-UIBENCH-113** (new) — unreachable through the control. |

Further requirements kept their capability but had shell-shaped text removed and are amended in
place: REQ-UIBENCH-012 to REQ-UIBENCH-017, REQ-UIBENCH-022 to REQ-UIBENCH-024 and REQ-UIBENCH-033
(exit codes and fixed diagnostic strings replaced by the failure reporting of REQ-UIBENCH-114 and by
stated information content); REQ-UIBENCH-035, REQ-UIBENCH-041, REQ-UIBENCH-043, REQ-UIBENCH-044,
REQ-UIBENCH-052, REQ-UIBENCH-092, REQ-UIBENCH-093, REQ-UIBENCH-097, REQ-UIBENCH-101,
REQ-UIBENCH-104, REQ-UIBENCH-105 and REQ-UIBENCH-109 (same). REQ-UIBENCH-037 now states that the
mechanism starting an iteration process is internal and not user-invocable. The document title, the
Overview, seven section headings (`Identity and desktop surface`, `Benchmark operations`,
`The capture operation`, `The replay operation — orchestration`, `The inspect operation`,
`The compare operation`, `Failure reporting and error inventory`) and the Data & Formats section were amended accordingly; Data & Formats gains a *Benchmark surface*
block stating that no command-line surface exists and where each capability lives, and its
*Environment contract* block no longer promises externally observable variable names.

Nothing in this domain touched the retired `REQ-TUI` or `REQ-CLI` series, and no requirement here
cites them.

## Open-question dispositions

Dispositions: **RESOLVED** (decided here and written normatively into the spec), **OMITTED**
(withdrawn or narrowed), **MOOT** (only ever about a surface that no longer exists), **ESCALATED**
(left to the product owner). Nothing in this domain was escalated or omitted.

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | For wall-clock, CPU and memory the benchmark stays purely comparative: no absolute figure is fixed for any phase on any named reference hardware, because such a figure would be a hardware statement rather than a product one and would go stale. But the product already owns one absolute responsiveness number, and the benchmark now reports against it: a seventh invariant `interface_lag_within_budget` is true exactly when every record's `event_loop_lag_ms` is strictly below **100 ms**, the interface responsiveness budget of REQ-SHELL-150. It is informational like the other six. Replay stays unbounded in run time but can no longer hang (OQ 27) and can be cancelled (REQ-UIBENCH-116). | REQ-UIBENCH-118 (new), REQ-UIBENCH-081, REQ-UIBENCH-088, REQ-UIBENCH-099, REQ-UIBENCH-040, REQ-UIBENCH-109, Data & Formats (run summary) |
| 2 | RESOLVED | Yes, and by construction rather than by promise: an iteration rebuilds every transcript entry — nested `diff` payloads included — through the same rendering path the live application uses, and the benchmark defines no rendering path of its own. A `diff` entry therefore cannot render differently under replay than it renders live; if it did, the live application would render it that way too, which is the whole point of measuring through the product's own path. | REQ-UIBENCH-027 |
| 3 | RESOLVED | Iteration diagnostic output is captured by the process that started it and never reaches a surface the user did not ask for. For a crashed iteration it is retained as `<output>/iteration-NNN.log` and made reachable from that run's failure reporting; for a completed iteration it may be discarded. Framework chatter during offscreen rendering is expected and is never on its own treated as a failure: only the child's termination status and the presence of its record file decide that. | REQ-UIBENCH-117 (new), REQ-UIBENCH-011 (withdrawn), REQ-UIBENCH-041, REQ-UIBENCH-044, REQ-UIBENCH-052, REQ-UIBENCH-114 (new), REQ-UIBENCH-033, Data & Formats (run directory) |
| 4 | RESOLVED | Every environment variable the product itself reads — as configuration, as a diagnostics setting, or in any other role — is removed from an iteration's environment before the pinned overrides are applied. This is stated as a class rather than as a list, so it cannot go stale as the product gains variables. Consequence, stated testably: setting any product environment variable on the host and replaying the same fixture leaves the structural counters and all seven invariants unchanged. | REQ-UIBENCH-039, REQ-UIBENCH-098, Data & Formats (environment contract) |
| 5 | RESOLVED | Per-iteration isolation is required; sharing was a defect. One temporary settings directory is created per iteration, used by that iteration alone, and destroyed with it. Sharing is rejected because it lets iteration 0 change what iteration 1 does, which directly contradicts this domain's core claim that fresh processes replaying one fixture apply identical update sequences (REQ-UIBENCH-083, REQ-UIBENCH-099); the isolating reading is the only one coherent with the rest of the document. | REQ-UIBENCH-038, REQ-UIBENCH-039, REQ-UIBENCH-046, REQ-UIBENCH-098 |
| 6 | RESOLVED | `handles` may be null on **any** platform, and for exactly two reasons: the platform exposes no such counter, or the count could not be obtained at that moment. Null is the only permitted substitute, it is reported in `handles_raw` and nowhere else, and no invariant reads `handles` — so a null costs a data point and never a verdict. | REQ-UIBENCH-050, REQ-UIBENCH-076 |
| 7 | RESOLVED (second layout since superseded) | No. Capture supports exactly the layouts the sessions domain defines — when this was decided, the split layout of REQ-SESSION-036 and the whole-state `snapshot.json` fallback of REQ-SESSION-037/REQ-SESSION-005 — and no third. Supporting a further layout is a change to REQ-SESSION-036, not to this document; the benchmark deliberately owns no session-reading rule of its own. The fallback has since gone: REQ-SESSION-005 is withdrawn under the no-legacy-layout decision, `state/resume.json` is the only resumable-state file, and REQ-UIBENCH-015 now states the split layout as the only supported one and relies on REQ-SESSION-037 for there being nothing to try after it. The decision itself — no layout of this document's own — is what stands. | REQ-UIBENCH-015, Data & Formats (session input layout); REQ-SESSION-005 since withdrawn |
| 8 | RESOLVED | Prohibited, and stated as a requirement. A healthy child writes all seven records, closes the window, and only then terminates with a zero status. A child that terminates with a zero status having written no record file is a defect; the parent treats it exactly as a crash and writes the crash marker with the observed status, so a missing record file is always explained by a marker and `iterations` can never fall silently. | REQ-UIBENCH-052, REQ-UIBENCH-041 |
| 9 | RESOLVED | Reject a too-new version on **both** layouts. REQ-SESSION-038 already binds every loader on either load path, so the legacy-only check was the defect and the both-paths reading is the only one coherent with the sessions domain. The refusal REQ-SESSION-038 fixes is cited rather than restated, so the two documents cannot drift. With the legacy layout since withdrawn (OQ 7), there is one load path and the check applies on it; the decision to cite REQ-SESSION-038 rather than restate a check of this document's own is what carries. | REQ-UIBENCH-016, REQ-UIBENCH-015, Data & Formats (session input layout) |
| 10 | RESOLVED | The strictness is intended and stays confined to `wall_ms` and `cpu_ms`, because they are the only values a reader cannot substitute for without inventing a measurement — every other substitution loses information without fabricating any. It is deliberately **not** extended to `phase` or `iteration`: a record with no `phase` joins no phase block and a record with no `iteration` joins the single default bucket, both of which degrade honestly. | REQ-UIBENCH-076 |
| 11 | MOOT | The question asked whether the argument form starting a single iteration is part of a compatibility surface. There is no such surface: REQ-UIBENCH-004, which defined it, is withdrawn in the sweep above. REQ-UIBENCH-037 now states that an iteration process is started by the desktop application, that no user or external program can start one, and that no argument form, flag, or invocation grammar for it is fixed by this document or any other. A third party running one iteration directly is not a capability the product offers. | REQ-UIBENCH-037, REQ-UIBENCH-004 (withdrawn) |
| 12 | RESOLVED | The override variable names other than `LANG`, `LC_ALL` and `XDG_CONFIG_HOME` stay unnamed and are declared implementation-private, because the premise of the question — that external tooling might have to set, override or observe them — is now false: nothing outside the product can start an iteration. What is fixed instead is their *effect*: offscreen rendering, one platform-independent widget style, display scale factor 1, C locale, and an isolated per-iteration settings home. | REQ-UIBENCH-039, Data & Formats (environment contract) |
| 13 | RESOLVED | Renamed to the framework-neutral `ui_objects`. The rewrite owes output compatibility to nothing, so a field name that leaks one GUI toolkit's vocabulary into a schema is not worth keeping; run schema version 2 is this document's own and the rename costs nothing. Every occurrence is renamed together, in the record schema, the invariant text, the environment consequence, and the Data & Formats blocks. | REQ-UIBENCH-050, REQ-UIBENCH-062, REQ-UIBENCH-109, REQ-UIBENCH-039, REQ-UIBENCH-098, Data & Formats (record file) |
| 14 | RESOLVED | REQ-UIBENCH-054's stronger rule is canonical, and REQ-UIBENCH-085 is rewritten to report exactly it: the boolean is true when, within each iteration taken on its own, every record other than a `construct_window` record reports one and the same `widgets` value. The weaker per-phase reading is discarded because it could not detect the very leak the requirement exists to catch — widgets accumulating between phases. The two now agree even for a hand-assembled run directory. | REQ-UIBENCH-085, REQ-UIBENCH-054 |
| 15 | RESOLVED | Capture reads no configuration file of its own and mandates none. It projects the session against the effective layered configuration the desktop application has already resolved for the workspace root of REQ-UIBENCH-014. Naming individual files here would duplicate the settings domain and go stale; capture fails only when no effective configuration is available for that workspace at all, and then shows no privacy notice and leaves no output file. | REQ-UIBENCH-017, REQ-UIBENCH-097 |
| 16 | RESOLVED | A symbolic link beneath `SESSION_DIR` contributes nothing to `source_checksum`, whatever it points at, and is never traversed — only regular files reached without following a link participate. This is the only reading that keeps the digest a function of the session's own bytes: following links would let content outside the session directory enter the digest and would admit link cycles. | REQ-UIBENCH-019 |
| 17 | RESOLVED | Full type-and-default table written into the requirement. `role` is required and is a non-empty string drawn from the open transcript row-role vocabulary of the conversation domain (`user`, `system`, `tool`, `thinking`, `verifier`, or an agent name), treated as opaque display text with no enumeration check. Optional keys: `kind` string default `"message"`; `tool`, `detail`, `persona`, `event_key`, `status`, `stream_id` strings default `""` (`status` opaque, no enumeration); `full_text` defaulting to `text`; `full_detail` defaulting to `detail`; `diff` object-or-null default null; `duration` a number of seconds ≥ 0 default null; `started_at` a string timestamp default null; `char_count` a non-negative integer defaulting to the character count of `full_text`. A wrong-typed optional value fails the iteration, as an unaccepted key already did. | REQ-UIBENCH-027, REQ-UIBENCH-033, Data & Formats (fixture file) |
| 18 | RESOLVED | `state` is optional. An absent `state` is treated as `queued` — the same value REQ-MONITOR-046 assigns to an engine state it cannot map, so the benchmark's default and the product's fallback agree instead of forming a second convention. The six permitted values remain exactly the presentation states REQ-MONITOR-046 fixes. | REQ-UIBENCH-028 |
| 19 | RESOLVED | Yes, closed, and taken from the domain that owns artifacts rather than invented here: `kind` is one of `child_report`, `agent_published`, `system` (REQ-LIBRARY-088), default `child_report`. The related `status` key is likewise the closed five-value vocabulary of REQ-LIBRARY-088 — `succeeded`, `failed`, `blocked`, `partial`, `published` — default `succeeded`, and `importance` is `high` or `normal`, default `normal`. | REQ-UIBENCH-030, Data & Formats (fixture file) |
| 20 | RESOLVED | Types and defaults fixed for all seven keys: `cumulative_tokens` non-negative integer default 0; `cumulative_cost_label` a string the product has already rendered as money, on which the benchmark performs no arithmetic (REQ-PROVIDER-121), default `""`; `token_history` a list of non-negative integers default `[]`; `tool_calls` non-negative integer default 0; `tool_call_breakdown` an object mapping tool name to non-negative integer default `{}`; `files_touched` non-negative integer default 0; `uncommitted` a non-negative integer count of uncommitted changes default 0. | REQ-UIBENCH-031 |
| 21 | RESOLVED | All four keys are optional, so `{}` is a valid `run_state` and the fixture block no longer implies otherwise. Defaults: `session_name` `""`; `session_status` `""`; `run_state` `idle`; `active_model` `""`. `session_status` holds a persisted `execution_status` value, and the benchmark treats it as opaque display text and applies no enumeration check — inventing a set here would contradict the domain that owns one. The stated reason was that REQ-SESSION-073 leaves its vocabulary open; that reason is superseded — REQ-SESSION-073 closes the vocabulary at fourteen values and is the single definition of it — but the disposition is unchanged and its reason is now the better one: a fixture may have been captured from another version of the product and may carry a value from outside that closed set, which this document neither restates nor polices. The inner `run_state` key keeps its closed set, whose membership is the normalised presentation vocabulary REQ-NOTIFY-048 closes. | REQ-UIBENCH-032, Data & Formats (fixture file) |
| 22 | RESOLVED | Fixed-point decimal with exactly three digits after the point, `.` as the decimal separator whatever the host locale, no thousands separator, never exponent notation; a p50 of null renders as the literal `null`. Three decimals matches the rounding already required of `wall_ms` and `cpu_ms`, so the digest neither adds nor loses precision. | REQ-UIBENCH-043 |
| 23 | RESOLVED | Cross-referenced rather than restated: an iteration loads the three bundled font families of REQ-SHELL-008 from the product package and applies the product's default built-in theme `rotaris-dim` (REQ-SHELL-128). One addition of substance — the host-font fallback REQ-SHELL-008 permits the application at startup does **not** apply during measurement: an iteration whose bundled family fails to load terminates non-zero and counts as a crash, because a silent fallback to host fonts would break determinism without appearing anywhere in the report. | REQ-UIBENCH-047, REQ-UIBENCH-098 |
| 24 | RESOLVED | `chars` counts characters of the **source text** the cached items were rendered from, never of the rendered output, so occupancy is comparable with `max_chars` whatever a rendered form costs. `hits` and `misses` are cumulative over the life of the child process exactly as drafted — never reset between phases, growing monotonically through an iteration's seven records — and are deliberately not per-phase or per-iteration figures; a consumer wanting a per-phase delta subtracts. | REQ-UIBENCH-063 |
| 25 | RESOLVED | The classification rule is fixed, so REQ-UIBENCH-083 becomes testable as correctness and not only as agreement. Each application of a transcript state is compared with the displayed state: `reset` counts one per application that discards the transcript wholesale and rebuilds it (every clear, and every application the view cannot reconcile row by row); `refused` counts one per application the view declines without changing anything because the incoming state is not a valid successor — it addresses a row the view does not hold, or would reorder displayed rows; `noop` counts one per accepted application whose state is identical to the displayed one; every other accepted application contributes one `insert` per row added, one `remove` per row removed, and one `update` per retained row whose content changed. `refused` and `noop` are distinguished by whether the application was valid, not by whether anything visibly changed. | REQ-UIBENCH-064 |
| 26 | RESOLVED | An absent `rss_bytes`, `threads`, `widgets`, `ui_objects` or `handles` contributes **nothing at all** — no null, no placeholder — so a `*_raw` list may legitimately be shorter than `records`, and the spec now says so and requires consumers to read each list by its own length rather than aligning lists positionally. Padding with nulls was rejected because it would put non-numbers into lists that percentile and slope statistics consume. The single exception is a `handles` that is present and null, which is appended as null because null is a value that key may legitimately take. | REQ-UIBENCH-076, REQ-UIBENCH-050 |
| 27 | RESOLVED | The wait is bounded. Every wait for the interface to finish showing a phase's effect is bounded at **30 s** from the moment that phase's work was submitted. On expiry the phase's timing closes at that instant and its record is written with a new boolean `settle_timed_out` true; the iteration continues with the next phase and is never ended merely for reaching the bound. The key appears in every record, is informational, and no invariant reads it — but a record carrying it true under-reports that phase's cost and the spec says so, so a comparison cannot be misled silently. | REQ-UIBENCH-119 (new), REQ-UIBENCH-040, REQ-UIBENCH-051, REQ-UIBENCH-062, REQ-UIBENCH-076, REQ-UIBENCH-097 |
| 28 | RESOLVED | The observation interval is fixed at **10 ms**: responsiveness is observed by a probe scheduled every 10 ms, and `event_loop_lag_ms` is the largest amount by which one probe ran later than the instant it was scheduled for. Fixing it is what makes the figure comparable in magnitude between conformant implementations, which matters now that a threshold is applied to it (OQ 1); 10 ms is fine enough to resolve a breach of the 100 ms budget by an order of magnitude and coarse enough not to distort what it measures. | REQ-UIBENCH-049, REQ-UIBENCH-118 (new) |
| 29 | RESOLVED | Counting rules are fixed in framework-neutral terms: `widgets` counts live **visual** elements of the constructed window — those that occupy space in its layout and can be painted — and `ui_objects` counts every live interface-framework object owned by that window, visual or not, so `ui_objects` is never smaller than `widgets` and both are 0 while no window exists. Their absolute values remain comparable only between two runs of one product revision — which is all REQ-UIBENCH-054 and REQ-UIBENCH-085 rely on — and the spec now says so explicitly rather than leaving it to be inferred. | REQ-UIBENCH-050, REQ-UIBENCH-085 |
| 30 | RESOLVED | Each of the 11 samples is read **after** the replacement at its index has been applied and the interface has finished showing it, never before. Sampling after is the only reading under which the phase measures what it exists to measure — memory retained by work already done — and it makes the index-999 sample the true end state of the phase. | REQ-UIBENCH-058 |
| 31 | RESOLVED | Yes, the loader rejects them. The prohibition becomes the third of four ordered load-time checks: a fixture carrying a top-level `config`, `credentials`, `environment` or `workspace` key fails to load, and the report names the offending key. The capture-only asymmetry is a defect — it let a fixture built elsewhere carry exactly the content the prohibition exists to keep out, and then replay it. The four load failures must be distinguishable from one another; their wording is left to the implementation, per decision 5. | REQ-UIBENCH-024, REQ-UIBENCH-018, REQ-UIBENCH-023, REQ-UIBENCH-026, REQ-UIBENCH-097, Data & Formats (fixture file) |
| 32 | RESOLVED | The accepted key sets are enumerated here, closing "carries an unaccepted key" against the specification alone. `agents`: the required `id`, `name`, `persona` plus `state`, `model`, `task_title`, `depth`, `tool_call_count`, `token_count`, `cost_label`, `elapsed_s`, `error_text`. `artifacts`: the required `id`, `slug`, `title` plus `kind`, `status`, `importance`, `summary`, `source_persona`, `created_at`. Each carries a type and an absent-default, and the fixture block in Data & Formats lists them rather than saying "further accepted display fields". | REQ-UIBENCH-028, REQ-UIBENCH-030, REQ-UIBENCH-033, Data & Formats (fixture file) |

## Escalated to the product owner

None. Every open question was decided here, and the spec's Open Questions section now records that.
