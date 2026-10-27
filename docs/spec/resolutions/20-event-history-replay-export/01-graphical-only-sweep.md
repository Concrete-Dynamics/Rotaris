# Resolution Record — Domain 20, Machine-Readable Event Stream, Replay, and Trajectory Export — Graphical-only sweep

Part 1 of 8 of [domain 20's resolutions](../20-event-history-replay-export.md), which indexes every part.

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
  the history writer and the live channel rather than a pipe: per-event append and flush,
  per-consumer detachment rather than a broken pipe, recorded warnings rather than stderr warnings,
  and establishment of the channel and store before run start-up can fail. *Corrected under SR-2:*
  the per-event append and flush of REQ-EVENTS-029 was justified here as letting "a follower tailing
  the file see each event as it happens (REQ-SESSION-159)". There is no follower and REQ-SESSION-159
  no longer says that. The rule itself is not withdrawn and its justification is now stronger: the
  flush is what makes the durable record readable at the moment the event becomes observable, which
  is what the persist-before-publish binding of REQ-EVENTS-072 requires, and it is what leaves the
  journal more complete than the debounced state snapshot after a crash, which is what a reattach
  completes itself from (REQ-SESSION-196).
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
