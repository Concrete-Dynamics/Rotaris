---
reference: ROTARIS-CRW-001
domain: event-history-replay-export
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 20, Machine-Readable Event Stream, Replay, and Trajectory Export

This record disposes of every open question raised in the draft of
[`../20-event-history-replay-export.md`](../20-event-history-replay-export.md) (requirement prefix
`REQ-EVENTS`). The body of that specification has been amended so that each decision below is stated
normatively in place; the original open-question numbering is preserved here so the draft and the
resolved specification can be read against each other.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** No obligation to match any other
   implementation's formats, surface, exit codes, or event vocabulary. Under-determined cases are
   decided here on their merits, and awkward behavior is never preserved for compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   omitted rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent.
4. **The product is one Electron desktop application.** It has no command-line interface, no
   headless entry point, and no full-screen text-mode interface, and domains 17 and 18 are retired.
   This domain was drafted almost entirely around a shell surface — an output-format flag, an
   `events` command group, stdout as the event channel, stderr as the human channel, and a table of
   process exit codes — so the sweep below is the larger half of this record. Every capability those
   requirements carried is now reachable from the desktop interface.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (an event field value, an enum, a parseable output format). Open
   questions asking for the exact phrasing of a human-readable message are resolved by fixing what
   the message must convey and leaving the wording to the implementation.

Cross-domain coherence was checked against `01-run-orchestration.md` (terminal run statuses and stop
reasons REQ-ORCH-083, check statuses REQ-ORCH-123, gate decisions REQ-ORCH-116),
`05-tools-permissions-approvals.md` (approval resolver vocabulary REQ-TOOLS-061, permission audit
entry REQ-TOOLS-078 and REQ-TOOLS-079, verification-gate log REQ-TOOLS-190),
`06-git-worktrees-checkpoints.md` (checkpoint timeline entries REQ-GIT-048, REQ-GIT-062),
`07-sessions-persistence.md` (execution-status vocabulary REQ-SESSION-073, stop-reason mapping
REQ-SESSION-077, timeline and issue record shapes REQ-SESSION-134 and REQ-SESSION-135, history
attachment REQ-SESSION-089 and REQ-SESSION-174, follower row numbering REQ-SESSION-160),
`09-lifecycle-hooks.md` (hook events REQ-HOOKS-001, scopes REQ-HOOKS-020, trust gate REQ-HOOKS-090,
withheld-hook event REQ-HOOKS-126, lifecycle payload REQ-HOOKS-075),
`12-desktop-shell-windows.md` (action vocabulary REQ-SHELL-048, session browser REQ-SHELL-126,
colour-independence REQ-SHELL-149), `02-run-monitoring-steering.md` (tool-row statuses
REQ-MONITOR-105) and `19-notifications-errors-recovery.md` (notice recording REQ-NOTIFY-268). No
other source was consulted.

New requirements added by these resolutions: **REQ-EVENTS-168** through **REQ-EVENTS-177**. No
requirement identifier was renumbered, reused, or deleted.

## Graphical-only sweep

Twenty-six requirements had no surface other than a shell invocation, a byte stream on standard
output or standard error, or a process exit code. Each is withdrawn in place, and every capability
a user could reach through them is now carried by a desktop requirement.

| Withdrawn | What it was | Capability rescued into |
| --- | --- | --- |
| REQ-EVENTS-001 | Two command-line surfaces (primary and headless) held to observable equality — same flags, stdout bytes, stderr semantics, exit codes. | No user capability. The equality worth keeping — every run leaving the same stored history whatever observes it — is REQ-EVENTS-081, which was widened to name the run paths explicitly (OQ 3). |
| REQ-EVENTS-002 | `run --output-format text\|stream-json`, defaulting to `text`, with a fixed help ordering. | **REQ-EVENTS-081** (amended) — the machine-readable stream is not an alternative to human output but is produced and recorded by every run unconditionally; there is nothing to select. |
| REQ-EVENTS-003 | Rejecting an unknown output-format value with exit `2` and a stderr diagnostic. | None. No flag exists to carry a rejected value. |
| REQ-EVENTS-004 | `stream-json` with no task exits `2` because it cannot start the interactive UI. | None. No invocation exists that could pair an output format with a missing task. |
| REQ-EVENTS-005 | `stream-json` forces the non-interactive execution path so no UI writes to stdout. | None. Every run executes inside the desktop application; there is no standard output to contend for. |
| REQ-EVENTS-006 | The `events` command group: `list`, `replay <session>`, `export <session>...`. | **REQ-EVENTS-168** (list), **REQ-EVENTS-170** / **REQ-EVENTS-171** / **REQ-EVENTS-172** (replay and filtering), **REQ-EVENTS-173** (export) — one session-history surface in the desktop interface. |
| REQ-EVENTS-007 | `--workspace` / `-w PATH`, defaulting to the working directory, resolved to absolute. | **REQ-EVENTS-168** — the surface reads the workspace its window has open and no other; there is no path to type and no working directory to default to. |
| REQ-EVENTS-008 | `events replay` flags: positional session id, `-t/--type`, `-i/--iteration`, `--since`, `--until`, `--json`. | **REQ-EVENTS-171** (the four filter axes as controls, unknown types selectable) and **REQ-EVENTS-172** (the JSON-lines form of the selection). |
| REQ-EVENTS-009 | `events export` positional ids and `-o/--output PATH`. | **REQ-EVENTS-173** — several sessions selected in the surface export as one batch, with the destination chosen through the platform file chooser. |
| REQ-EVENTS-010 | `events list` accepting only `--workspace`. | **REQ-EVENTS-168**. |
| REQ-EVENTS-011 | Headless `events` with no subcommand: help output, exit `1`. | None. There is no command group to invoke without a subcommand. |
| REQ-EVENTS-012 | Headless first-run setup keeping stdout byte-identical between a fresh and an initialized workspace, setup messages on stderr, exit code unchanged. | None. First-run setup is the desktop application's own start-up concern (domain 11) and this domain's stdout-purity obligation has no subject. Resolves OQ 11 as moot. |
| REQ-EVENTS-014 | `--output-format text`: stdout carries only human text, no line parses as an event. | None as a channel rule. The human presentation of a run is the desktop interface, fed by the same events; the durable-history guarantee it pointed at is REQ-EVENTS-081. |
| REQ-EVENTS-025 | The status → process exit code table (`0`, `1`, `1`, `2`, `130`). | None. The application does not exit when a run ends, so the terminal status is the whole machine-readable outcome (REQ-ORCH-083, whose own resolution record left this mapping for domain 20 to withdraw). The status vocabulary is untouched and stays citable as REQ-EVENTS-026. |
| REQ-EVENTS-033 | Resolving the output destination at write time so post-startup redirection is honored; closing cleanly when no console exists. | None. The durable history has one fixed destination (REQ-EVENTS-079) and its attachment failure is governed by REQ-EVENTS-084. |
| REQ-EVENTS-146 | The `events` group exit-code contract (`0` / `2`). | **REQ-EVENTS-174** (no such stored session) and **REQ-EVENTS-171** (unreadable time bound), each reported in place; an empty result stays an ordinary success under REQ-EVENTS-118. |
| REQ-EVENTS-147 | `events list` rows: id padded to column width, right-aligned count, time span with an arrow glyph, trailing dropped-count element. | **REQ-EVENTS-168** — the same seven facts of REQ-EVENTS-129 in the same order, presented as a table; character-cell padding and an arrow glyph have no meaning in a rendered one, and truncation is required to be non-colour-only. |
| REQ-EVENTS-148 | Empty listing: nothing on stdout, a stderr message naming the workspace path, exit `0`. | **REQ-EVENTS-169** — the surface's empty condition naming the absolute sessions-root path, explicitly not an error. |
| REQ-EVENTS-149 | `events replay` human rows: timestamp, type, `(unknown)` marker, 110-char detail. | **REQ-EVENTS-170** — the same four elements per row, with the unknown marker required to be textual rather than colour-only, and the 110-character clip fixed (OQ 23). |
| REQ-EVENTS-150 | `events replay --json` reproducing stored lines byte-for-byte. | **REQ-EVENTS-172** — the surface hands over the selected events as JSON lines byte-identical to the stored lines, by copy or by file. |
| REQ-EVENTS-151 | Damaged-line warnings to stderr even under `--json`, so a pipe carries only events. | **REQ-EVENTS-170** (warnings presented beside the events, with position and reason) and **REQ-EVENTS-172** (the machine-readable output carries events and nothing else). |
| REQ-EVENTS-152 | Not-found: nothing on stdout, stderr naming the id and the workspace, exit `2`, no disclosure for an escaping id. | **REQ-EVENTS-174** — the same report in place, the same distinction from an empty result, and the same non-disclosure for an identity that tries to escape the workspace. |
| REQ-EVENTS-153 | Unparseable `--since` / `--until`: stderr message naming the flag and quoting the value, exit `2`, refuse before reading. | **REQ-EVENTS-171** — date-and-time controls make an unreadable bound unreachable, and a bound supplied as text is rejected in place naming the bound and quoting the value with no store read. |
| REQ-EVENTS-154 | `events export -o PATH`: atomic write, parents created, stderr confirmation, exit `0`. | **REQ-EVENTS-173** — destination through the platform file chooser, atomic write with parents created (REQ-EVENTS-145), and a confirmation stating the count and the absolute path. |
| REQ-EVENTS-155 | `events export` without `--output` writing the pretty-printed document to stdout. | **REQ-EVENTS-173** — a document reaches the user as a file; there is no standard output. |
| REQ-EVENTS-156 | Export warnings on stderr for a multi-run session and a truncated store, exit `0` regardless. | **REQ-EVENTS-173** — both disclosures are required, carry the same two figures (`summary.runs`, `dropped_events`), and neither is a failure. |
| REQ-EVENTS-158 | Byte-identical replay output across both command-line surfaces. | None. There is one surface, so there is no second one to hold it to. |

Requirements that kept their capability but had shell-shaped clauses struck:

- **REQ-EVENTS-013** no longer defines a stdout/stderr split. It now states what the live event
  channel carries (one JSON object per event, nothing a component other than this product
  constructed) and where human-readable text goes instead (notice channel, transcript, durable
  diagnostics). It also states that no arrival frequency is fixed, which absorbs OQ 1.
- **REQ-EVENTS-015** compared two invocations differing only in an output-format flag; it now
  compares a run observed by an attached consumer against one observed by none, and its last clause
  compares terminal statuses rather than exit codes.
- **REQ-EVENTS-017**, **REQ-EVENTS-069**, **REQ-EVENTS-071**, **REQ-EVENTS-076** and
  **REQ-EVENTS-059** no longer judge anything by "position on stdout"; they judge by delivery order
  on the live channel and by line position in the stored history.
- **REQ-EVENTS-018** and **REQ-EVENTS-019** no longer fix literal lines on a stream (`Created
  session {id}`, `Done.`, `Interrupted.`, `Error: {message}`) or the channel they are printed on.
  Each now fixes the information the report must convey and leaves the wording to the
  implementation, per decision 5.
- **REQ-EVENTS-020** to **REQ-EVENTS-024** dropped every exit code and every "on stderr" clause.
  REQ-EVENTS-021's trigger changed from a pre-run *argument* error to any condition detected before
  the run loop exists, which is the class that still occurs; REQ-EVENTS-023's trigger changed from
  an interrupt signal to the user stopping or cancelling a run.
- **REQ-EVENTS-029** to **REQ-EVENTS-032**, **REQ-EVENTS-034** and **REQ-EVENTS-035** now describe
  the history writer and the live channel rather than a pipe: per-event append and flush so a
  follower tailing the file sees each event as it happens (REQ-SESSION-159), per-consumer detachment
  rather than a broken pipe, recorded warnings rather than stderr warnings, and establishment of the
  channel and store before run start-up can fail.
- **REQ-EVENTS-082** cited the withdrawn exit-code mapping; it now cites REQ-EVENTS-027.
- **REQ-EVENTS-085**, **REQ-EVENTS-105**, **REQ-EVENTS-106**, **REQ-EVENTS-118**, **REQ-EVENTS-120**,
  **REQ-EVENTS-130**, **REQ-EVENTS-131** and **REQ-EVENTS-159** no longer name `events` subcommands,
  flags, "the command line", or stderr; they name the reading surfaces and the query's bounds.
- **REQ-EVENTS-157** survived rather than being withdrawn: "no partial export when one of several
  sessions cannot be resolved" is a real obligation on the desktop export action, and only its exit
  code and stdout clause were struck.
- The Overview paragraph, the *Line format* note, the *On-disk layout* block and the
  *Run status vocabulary and exit codes* table were amended accordingly; that table is now
  *Run status vocabulary* and states that no process exit code is fixed by this document or any
  other.

## Dispositions

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | Two halves, decided separately. Cadence: no arrival frequency is fixed, deliberately — REQ-EVENTS-076's relative ordering is the whole timing contract, and a consumer is now forbidden to derive anything from event spacing, so a faster model backend or a burst of concurrent tool calls can never violate a stated guarantee. Channel purity: the third-party-output half is answered by construction rather than by discipline, because the event channel is in-process and carries only objects this product built — nothing a library writes to a console can reach it — and human-readable text reaches the user through the notice channel, the transcript and the durable diagnostics instead. | REQ-EVENTS-013 |
| 2 | RESOLVED | Single-writer, and the right to write is exactly the right to hold the session lock REQ-SESSION-056 already defines, so no second locking concept is invented. A process that does not hold the lock must not open the store for writing and degrades under REQ-EVENTS-084 (a logged warning, the run continues) rather than appending beside the holder — which makes interleaved lines, racing trims and racing markers unreachable rather than merely undefined. Reading is deliberately left unrestricted and lock-free: any number of processes may read or follow a history concurrently with its writer, which is what REQ-SESSION-159's cross-process transcript following depends on, and reading never writes (REQ-EVENTS-100). | REQ-EVENTS-098 |
| 3 | RESOLVED | No exclusion. The guarantee spans every run that goes through the shared run lifecycle (REQ-SESSION-089, REQ-SESSION-174) — a run driven from the Workspace view, one continuing in the background, one belonging to a session opened in a second window, and one driven by a programmatic embedding of the engine alike. An excluded front end would produce sessions that cannot be replayed or exported and would make the "same evidence file names" test conditional on which surface started the run, which is exactly the property the requirement exists to assert. | REQ-EVENTS-081 |
| 4 | RESOLVED | Both halves fixed. A write that fails, or that reports fewer bytes written than the line holds, marks the store failed for the rest of the run: no further append is attempted and one warning states that the history is incomplete from that point. A partial trailing line may therefore exist; it reads as a damaged line and is skipped with a warning under REQ-EVENTS-106, exactly like the truncated tail of a killed run, and no reader repairs it (REQ-EVENTS-100). Refusing further appends after the first failure is what stops a full volume accumulating a run of partial lines. A trim that runs out of space leaves the previous contents in force, records a warning, and is not reflected in the marker — the history then exceeds its cap, a bounded and visible cost, rather than losing lines to a failed rewrite. | REQ-EVENTS-088, REQ-EVENTS-091 |
| 5 | MOOT | The question was entirely about the console boundary of a command-line process, and there is no console: REQ-EVENTS-012, REQ-EVENTS-014 and REQ-EVENTS-033 are withdrawn. What survives is unchanged and sufficient — stored bytes are ASCII-escaped UTF-8 with a single line-feed terminator (REQ-EVENTS-064, REQ-EVENTS-090), so a history is byte-stable regardless of any host's display encoding, and human-readable text is rendered by the desktop interface rather than written to a stream. | REQ-EVENTS-012, REQ-EVENTS-014, REQ-EVENTS-033 (all withdrawn) |
| 6 | RESOLVED | Comparison is on the stamp alone and nothing else is inferred. Every event bearing an instant equal to a bound is selected (both bounds inclusive); ties are neither broken nor reordered but returned in stored order, which REQ-EVENTS-117 now states is the order the history holds them in; and a clock that moved backwards mid-run may make a bounded query select a set that is not contiguous in the history. That outcome is explicitly permitted and never an error, and no reader is obliged to detect or correct it. Inventing a tie-break or a monotonic sequence number was rejected: it would add a field to every event to fix a case that only misleads if a reader assumes an ordering the timestamps never promised. | REQ-EVENTS-117, REQ-EVENTS-120 |
| 7 | RESOLVED | The restart flag is guaranteed, by making detection depend on the truncation marker rather than on whether the file happened to get shorter. Each resumable read also reads `events.meta.json` and raises restart whenever the cumulative dropped-event count has risen since that follower's previous read. Combined with the atomic replacement REQ-EVENTS-091 already requires — a follower sees either the whole old file or the whole new one, never a half-rewritten one — this makes a trim always observable, including the case where the trimmed file is still longer than the follower's offset and the preceding byte is still a terminator, which the length heuristic alone would have missed silently. | REQ-EVENTS-111 |
| 8 | MOOT | Terminal legibility was only ever a question about rows printed to a text-mode display, and REQ-EVENTS-147 and REQ-EVENTS-149 are withdrawn. The rescued surfaces answer the underlying concern on the desktop's own terms: REQ-EVENTS-168 and REQ-EVENTS-170 present tables, and REQ-SHELL-022 already binds every view to full label rendering and no horizontal scrolling at the 1000×680 minimum window size, so no separate wrap-or-elide rule is needed here. | REQ-EVENTS-147, REQ-EVENTS-149 (both withdrawn); REQ-EVENTS-168, REQ-EVENTS-170 (new) |
| 9 | RESOLVED | Normalise, and the free-form reading was the defect. `session.end.status` carries exactly one value of REQ-EVENTS-026's five, or `""` meaning unknown, which a consumer must never read as failure. This is forced by coherence: REQ-HOOKS-075 already declares that the `status` in a hook's `session_end` payload carries one of those five or `""`, and the payload is derived from this event — one word cannot mean an enumeration in a hook payload and anything at all on the wire it came from. A value outside the vocabulary must not be emitted. | REQ-EVENTS-058, Data & Formats (event catalog) |
| 10 | RESOLVED | Under decision 5, none of the listed strings is fixed and none needs to be. Column spacing, padding and the arrow glyph vanished with REQ-EVENTS-147 and REQ-EVENTS-149. For the messages that survive, the information content is now normative and the wording is the implementation's: the empty listing names the absolute sessions-root path and is not an error (REQ-EVENTS-169); the not-found report names the identity as supplied and the path searched (REQ-EVENTS-174); the export confirmation states the number of documents and the absolute path, and the two export disclosures state `summary.runs` and `dropped_events` respectively (REQ-EVENTS-173); the unserializable-event warning names the event type and the reason (REQ-EVENTS-032); and the `verifier.result` summary must identify which of three outcomes occurred, naming each failed check or the skip reason (REQ-EVENTS-055). | REQ-EVENTS-032, REQ-EVENTS-055, REQ-EVENTS-169, REQ-EVENTS-173, REQ-EVENTS-174 |
| 11 | MOOT | The question was about a headless entry point's first-run setup and the spelling of a version command exempt from it. REQ-EVENTS-012 is withdrawn: there is no headless surface, no stdout whose byte-equality between a fresh and an initialized workspace could be asserted, and no exit code. Application start-up belongs to the startup and distribution domain, and this domain states nothing about it. | REQ-EVENTS-012 (withdrawn) |
| 12 | RESOLVED | No literal fallback strings for any status, and none for the two the question asked about. The outcome report must state the terminal status in words, carry the run summary where it is neither empty nor whitespace, carry the `error` field where the status is `error`, and — where the summary is empty — still convey the status rather than reporting nothing. The status is therefore always recoverable from the report and is never inferred from whether a summary was present, which is what the draft's `Done.` / `Interrupted.` pair had made it. Wording is the implementation's, per decision 5. | REQ-EVENTS-019 |
| 13 | MOOT | The question asked which non-zero exit code an unmapped status must produce; REQ-EVENTS-025 is withdrawn and no process exit code exists. The substantive half was kept and strengthened rather than dropped: REQ-EVENTS-026's vocabulary is now closed for the `status` of a terminal `result`, a value outside it must not be emitted, and a derivation that produced one makes the run report `error` — never a success — and record a diagnostic quoting the unrecognized value, so the defect is evidenced instead of being silently rewritten. | REQ-EVENTS-025 (withdrawn), REQ-EVENTS-026 |
| 14 | RESOLVED (stop-reason half superseded) | Both vocabularies are cited, not invented, and both are already fixed elsewhere. As decided here, stop reasons were the exact strings of REQ-ORCH-083 and REQ-SESSION-077, compared case-sensitively: `stopped by user`, `interrupted by user`, `user cancelled at message limit` → `interrupted`; `agent session aborted` → `failed`; `iteration limit reached` → `max_iterations`; and `all tasks completed`, `time limit reached`, `no pending tasks` select nothing by this rule. **That reading is superseded.** The prose stop reasons were replaced by the closed snake_case set of REQ-MONITOR-301, which also owns the total mapping onto the terminal run-result vocabulary REQ-ORCH-083 closes; REQ-SESSION-077 and REQ-EVENTS-027 now cite that set and hold no mapping of their own. Read the row's arrow list as `user_cancelled`, `application_shutdown` and `message_limit_reached` → `interrupted`; `agent_session_aborted` and `repetition_detected` → `failed`; `iteration_limit_reached` **and `time_limit_reached`** → `max_iterations`; `tasks_complete` and `no_pending_tasks` → `completed`. Nothing selects nothing: the mapping is total, and a recorded stop reason outside the closed set is a defect that yields `error`. The fallback reads the persisted `execution_status` of REQ-SESSION-073: `completed`, `failed`, and then `paused`, `paused_message_limit`, `stopped` and `interrupted` (the status stale repair writes, REQ-SESSION-061) all → `interrupted`; every other member, and any the vocabulary gains later, → `error`. `paused_message_limit` is a status of its own, not `paused` qualified by something else — the question's second half answered directly from REQ-SESSION-073. That half stands. | REQ-EVENTS-027, Data & Formats (run status vocabulary); stop-reason set now REQ-MONITOR-301 |
| 15 | RESOLVED | Both halves come from domain 9 rather than from a parallel vocabulary here. `skip_reason` has exactly one defined value, `untrusted_workspace` (REQ-HOOKS-126). A workspace counts as untrusted exactly on REQ-HOOKS-090's terms — a workspace-scoped hook for which no stored approval matches the current hook-set fingerprint, or a hook carrying a scope outside REQ-HOOKS-020's trusted set. Two further details were fixed while the requirement was open: the withheld hook's `hook_name` carries its stable id and never its configured display name (REQ-HOOKS-102, so no text the repository wrote leaves the gate), and `exit_code` stays `null` on the wire even though the durable timeline records that same state as `-1` (REQ-HOOKS-119) — the two representations are deliberate and now stated, so neither reads as a defect against the other. | REQ-EVENTS-047, Data & Formats (event catalog) |
| 16 | RESOLVED | `lifecycle_point` carries exactly one of the seven hook events of REQ-HOOKS-001 — `pre_tool`, `post_tool`, `session_start`, `session_end`, `iteration_end`, `child_completed`, `verifier_finished` — and no other value. The pre-tool point is spelled `pre_tool`, and `blocked` may be true only there, which keeps the consumer inference the requirement already licensed. The `scope` field was aligned at the same time: it carries a REQ-HOOKS-020 scope value, which includes the external-agent scope `external:claude-code` the draft's three-value list would have made unrepresentable. | REQ-EVENTS-048, Data & Formats (event catalog) |
| 17 | RESOLVED | `resolver` is exactly `brokered` or `headless`, the two values REQ-TOOLS-061 fixes. `brokered` waits and carries `timeout_seconds` (default `300.0`, REQ-EVENTS-167); `headless` never waits and carries null — so "which resolvers wait" is answered as a biconditional rather than a list that could drift. The draft's `headless_policy` was corrected to `headless-policy`, the spelling domain 5 owns, and `unattended_reason` is non-empty exactly on the requests whose resolver is `headless`. Two spellings of one machine-readable value was the kind of arbitrary difference decision 1 exists to remove. | REQ-EVENTS-049, Data & Formats (event catalog) |
| 18 | RESOLVED | Both halves. A row already final on first appearance yields exactly one event: there is no settling state to announce, and a second event carrying an identical row would be indistinguishable from a genuine revision, so one or two events per index is the whole contract and never more. Recovery after a gap reuses the mechanism domain 7 already fixed rather than inventing a rewind the live stream cannot offer: the consumer fills every skipped index with REQ-SESSION-160's placeholder row and continues, so later rows still sit at their own indices, and the events actually missed are recovered — if at all — by reading the stored history, which REQ-EVENTS-083 guarantees is complete. | REQ-EVENTS-052 |
| 19 | RESOLVED | Three answers. `status` on a finished check carries one of the five statuses REQ-ORCH-123 fixes — `passed`, `failed`, `timeout`, `skipped`, `invalid` — and is the empty string on the other two phases. A `checks` entry carries exactly `name` (`:subdir`-qualified per REQ-ORCH-122), `command` (now a masked field, see below), `status`, `severity` (`blocking` or `advisory`), `exit_code`, `duration_ms`, `skip_reason` and `output_path` under `evidence/verifier/`. And `passed` is defined as *blocks completion*, not *verification occurred*: it is false exactly when a blocking check ended in a status that gates under REQ-ORCH-116, so a skipped suite reports `passed` true with an empty `checks` list, and the authoritative signal that nothing was verified is the gate's own `exempt` decision. Reporting a skipped suite as `passed` false would have made every no-op iteration look like a verification failure. | REQ-EVENTS-054, REQ-EVENTS-055, REQ-EVENTS-059, Data & Formats (event catalog) |
| 20 | RESOLVED | Three answers, all from the record shapes domain 7 already fixes. Severity is the four-member vocabulary of REQ-SESSION-134 — `debug`, `info`, `warning`, `error` — of which only `error` reaches the wire, so the draft's "informational" now covers `info` and `debug` explicitly. `error_class` carries the issue's `kind` verbatim; that vocabulary is open-ended and owned by whichever domain records the issue (`hook_failure`, `hook_trust`, `permission_denied`, and others), and a consumer must treat an unfamiliar kind as opaque text rather than reject the event — closing it here would have required this document to hold a list that every other domain can extend. `detail` carries a locator of the form `<session-relative file>#<issue id>`, in practice `issues.json#` followed by the issue's 12 hexadecimal characters, so a consumer finds the record without searching. | REQ-EVENTS-056 |
| 21 | RESOLVED | The key list is closed at exactly the six normalized fragments, so masking is deterministic and two builds mask an argument identically; a producer may neither extend nor narrow it. Credential-shaped substrings are defined by four explicit shapes and no others: an in-text assignment whose key normalizes to one of the six (value masked); an `Authorization` header or bearer credential (everything after the scheme word masked); the userinfo password of a `scheme://user:password@host` URL (password alone masked); and the body of a PEM private-key block. Entropy and length heuristics are forbidden outright, because they mask hashes, identifiers and paths at random and make the same argument mask differently between builds — the opposite of REQ-EVENTS-062's idempotence and REQ-EVENTS-064's byte-stability. | REQ-EVENTS-060 |
| 22 | RESOLVED | The dividing line is whether the event's identity survives. Coerce, and emit, wherever the declared type can be reached by a total conversion: a wrongly typed scalar rendered as its string form for a string field, an absent or irreconcilable value replaced by the declared default, a number truncated toward zero for an integer field, a non-string mapping key converted per REQ-EVENTS-066. Drop, with a recorded warning, only where the event cannot be identified or rendered at all: the type is missing or outside the catalog, the payload is not a mapping, a value has no textual form (a self-referential structure among them), or a string still carries a record separator after escaping, which REQ-EVENTS-065 forbids emitting. Both branches leave the iteration, its `iteration.end`, and the run's terminal status exactly as they would have been. | REQ-EVENTS-073 |
| 23 | RESOLVED | The 110 excludes the ellipsis and the ellipsis is `…`, so a clipped detail is 111 characters and is distinguishable from one that fitted. This makes the row detail follow the identical counting rule as REQ-EVENTS-061 (240 + 1) and REQ-EVENTS-063 (16,000 + 1), so the document has one clipping convention rather than three, and the constant table now states the 111 explicitly. The rule moved with the capability into the rescued desktop row. | REQ-EVENTS-170 (new), REQ-EVENTS-149 (withdrawn), Data & Formats (bounds and constants) |
| 24 | RESOLVED | Readable at any time, during iteration as well as after it, monotonically non-decreasing, and not reset by being read. A count readable only after iteration ends tells a caller about a backlog at the one moment nothing can be done about it; a live figure lets a caller slow its own consumption or re-read the stored history while the run is still going. Monotonicity and non-resetting-on-read make two successive reads comparable, which is what makes the figure usable as a backlog signal at all. | REQ-EVENTS-164 |
| 25 | RESOLVED | A bound is enforced, not advisory: delivery of one event to one consumer is bounded at 5 seconds, after which that consumer is treated exactly as one that went away under REQ-EVENTS-031 — delivery to it stops permanently, a warning naming the session and the outstanding event type is recorded, and the run proceeds. Other consumers and the stored history are unaffected. Leaving it advisory was incoherent with the rest of the document: REQ-EVENTS-074 already refuses to let a consumer that *fails* affect the run, and an unbounded wait would let a consumer that merely *hangs* do what a failing one cannot. Reusing the detachment path of REQ-EVENTS-031 rather than inventing a second one means a hung consumer and a departed consumer leave the run in the same state. | REQ-EVENTS-165 |
| 26 | RESOLVED | The set is enumerated and closed. `tool.start` / `tool.finish` against `evidence/tool-calls.jsonl`; `permission.decision` against `evidence/permissions.jsonl` (REQ-TOOLS-078); `error` against the `issues.json` record its `detail` locates (REQ-SESSION-135); `gate.decision` and `gate.repair` against the `completion_gate_decision`, `repair_attempt_scheduled` and `repair_escalation` entries of `timeline.jsonl` they are bridged from (REQ-SESSION-134); `checkpoint.created` and `checkpoint.restored` against that timeline's `checkpoint_created` and `checkpoint_restored` entries (REQ-GIT-048, REQ-GIT-062); and `hook.finish` against the `hook_run` entry (REQ-HOOKS-119). `hook.start` is explicitly excluded, because the invocation record is only written once the invocation completes — so the durable-first rule would be unsatisfiable for it. The diagnostics timeline is not a new file: it is `<session_dir>/timeline.jsonl` and `<session_dir>/issues.json`, both already fixed by REQ-SESSION-002 and REQ-SESSION-132. | REQ-EVENTS-072 |

## Entries other domains expected this one to carry

- **REQ-NOTIFY-268** (every `warning` and `error` notice is recorded to the session timeline before
  being rendered). Decided deliberately as *not* an event-stream entry: new **REQ-EVENTS-176** states
  that recording a notice publishes no event of its own. A `warning` notice produces nothing, which
  matches REQ-EVENTS-056's rule that only error-severity issues reach the wire; an `error` notice
  produces an event only by way of the error-severity issue the underlying condition was recorded as,
  so one failure reaches the stream exactly once whether or not it was also shown to anyone, and a
  consumer counting `error` events counts failures rather than renderings. The timeline entry remains
  the durable record of what the user was told.
- **`evidence/verification-gate.jsonl`** (REQ-TOOLS-190). Decided deliberately as *not* a new event
  type: new **REQ-EVENTS-177** keeps the catalog at the 23 types of REQ-EVENTS-041 and records why.
  Every gate write and decline is an attempt an agent made through a tool, so it is already visible
  on the stream as that call's `tool.start` / `tool.finish` pair, with a decline carried as the
  call's failure; the gate's own `outcome`, `decline_case`, `reason`, `checks` and `detail` stay
  durable in the evidence file and its timeline entry. A consumer needing that detail reads the file
  and must not read the absence of an event as evidence that no gate decision was taken. The file is
  named in the on-disk layout and in REQ-EVENTS-163's list of distinct contracts.
- **`session_end.status` and the hooks payload vocabularies** (REQ-HOOKS-075, fixed against
  REQ-EVENTS-026). Carried, and the draft's conflict resolved in domain 9's favour: REQ-EVENTS-058 no
  longer calls the field free-form (OQ 9). The hook `skip_reason` (REQ-HOOKS-126), `lifecycle_point`
  (REQ-HOOKS-001), `scope` (REQ-HOOKS-020) and no-exit-status representation (REQ-HOOKS-119) are now
  cited rather than left open (OQ 15, OQ 16).

## Escalations

None. All twenty-six open questions were decided here: twenty-two RESOLVED, none OMITTED, four MOOT
(OQ 5, OQ 8, OQ 11, OQ 13 — each about a console, a text-mode row, a headless entry point, or a
process exit code that no longer exists), none ESCALATED. The specification's "Open Questions"
section now records that nothing is outstanding.
