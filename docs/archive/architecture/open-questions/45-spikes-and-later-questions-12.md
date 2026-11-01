# Archived open questions — Spikes, and the questions raised since (12 of 35)

The ruled, closed, resolved and withdrawn entries of [part 45](../../../architecture/open-questions/45-spikes-and-later-questions-12.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-206"></a>

**OQ-206 — Which closes of a main window ask REQ-STARTUP-046's active-run confirmation, now that the instance holds several
main windows and a quit can start outside any window?** *(REQ-STARTUP-046, "When a run is active, a confirmation SHALL be
presented before anything is torn down", its text conveying "that closing the window ends it"; REQ-SHELL-119's third guard,
"with runs active, a user-initiated close asks 'Quit while a run is active?'"; REQ-STARTUP-161, several main windows in one
instance; REQ-STARTUP-047 with REQ-SHELL-018, the switch's close; `PD-ORCH-005` clause 3, a quit leaves unfinished agents
`paused`. Raised 2026-10-06 by the repair of
[`closing-a-window-while-a-run-is-active-asks-no-confirmation.md`](../../../defects/fixed/closing-a-window-while-a-run-is-active-asks-no-confirmation.md)
(fin22, bundle `fin22-window-strip-config`), which stayed open on it. Raised on that branch as OQ-205 and renumbered
OQ-206 at its landing, OQ-205 being the `swarm` question `fin22-record-tidy` raised first on main. ~~Open.~~ **Ruled
2026-10-07.**)*

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** closing a main window ends the
active runs of the project open in it, and asks REQ-STARTUP-046's confirmation first. The close of the last main window asks,
as built, while the run host counts any run active in the instance ("Quit while a run is active?"). The close of one of
several windows asks while that window's own workspace has a run active ("Close this window while a run is active?",
"…while {n} runs are active?"); its Yes stops those runs as the stop control does before the window closes (PD-ORCH-005
clauses 3, 9, 10 and 21: agents rest `paused` by `stop`, Continue resumes them, and approvals are withdrawn), and the stopped
runs' later notices are held back from the window that stays (REQ-STARTUP-046's last sentence). A window with no active run
of its own closes without asking. REQ-SHELL-021's gate 3 counts only the requesting window's workspace. A quit that starts
outside any window (a signal, the end of the desktop session, the driver's or the capture's quit) asks no active-run
confirmation, as built. Recorded as [`PD-SHELL-009`](../../../product/directives/pd-shell-009.md#pd-shell-009), which narrows REQ-STARTUP-046,
REQ-SHELL-119 and REQ-SHELL-122; the ruling also named REQ-SHELL-021, which PD-SHELL-001 already narrows and the symbol
generator admits one narrowing directive per requirement, so gate 3's change is carried through REQ-SHELL-122, whose test
the gate applies (found while building, 2026-10-07). *Reversed 2026-10-13 by [OQ-237](51-spikes-and-later-questions-18.md#oq-237) (GV1): `PD-SHELL-009` now narrows
REQ-SHELL-021 itself, as this ruling named it, beside `PD-SHELL-001`'s disjoint case; its REQ-SHELL-122 narrowing stays.
The reason in the sentence before no longer holds.*

**The two recommendations weighed.** *Advocate A (the user's lens)*: ask at the close of a window whose own workspace has a
run active, with its own title, and have its Yes stop those runs, so that every active run always has a window and the box
is true wherever it is shown; leave a quit outside any window unasked. *Advocate B (the system's lens)*: confirm as built —
ask only at the last window's close, where "closing the window ends it" is true — and record that as a directive narrowing
REQ-STARTUP-046 and REQ-SHELL-119. **The ruling followed A**: B's own risks (a run left executing where no window shows it,
its approvals opening over another project, the other window's switch refused about a run it never showed) are not the
product working under PD-SHELL-002, and PD-ORCH-005 makes the stop resumable. From B it kept: no question at a quit outside
any window, the corrected logout claim (on Windows, Electron emits no `before-quit` at a logout or shutdown —
[`a-windows-logout-skips-the-orderly-shutdown.md`](../../../defects/fixed/a-windows-logout-skips-the-orderly-shutdown.md), recorded, not
repaired by this ruling; built on a main window's `session-end` by fin29 the same day), a separate defect note for that, and the test of two windows closed in one gesture. macOS Dock Quit is a
person's quit outside any window and is to be reopened when a macOS release is authorized (IC-3, PD-STARTUP-001).
[`closing-a-window-while-a-run-is-active-asks-no-confirmation.md`](../../../defects/fixed/closing-a-window-while-a-run-is-active-asks-no-confirmation.md)
closes with it.

Both requirements were written when the instance held one main window and its close was the quit. Since REQ-STARTUP-161
the run host keeps executing while any main window stays, and the run host's count of active runs is instance-wide
(sessions are not keyed by workspace; REQ-SHELL-021's gate 3 and OQ-86 read it the same way). Closing one of two windows
ends no run, so REQ-STARTUP-046's sentence "closing the window ends it" would be untrue there; and the switch's outgoing
window closes while its replacement is shown, behind REQ-SHELL-021's gate 3, which already declines a switch while any run
is active. A quit Electron starts on its own account (SIGTERM, the desktop's logout, `app.quit()`, the driver's quit) closes
every window at once and is not a person's close of a window; REQ-SHELL-119 asks its third guard on "a user-initiated close".

**What the build proceeds under** (`confirmActiveRunClose`, `apps/desktop/src/main/close-confirmation.ts`; `guardClose`,
`apps/desktop/src/main/main-windows.ts`). A person's close of a main window — its close control, the title bar's Close
(PD-SHELL-003), the window manager's close — asks the confirmation after the renderer's unsaved-settings guard allows,
when no other main window stays open and the run host counts a run active (a count that cannot be read asks). The box
asks REQ-SHELL-119's question with Cancel and Yes, Cancel first, the default, and Escape's and the close control's answer
(REQ-SHELL-055); its detail conveys REQ-STARTUP-046's three things with REQ-SHELL-119's statement that shutdown is
requested and in-flight work may not finish. Only Yes closes; Cancel changes nothing, and a box that cannot be shown is
Cancel. With another main window staying, the close asks nothing, and the run keeps executing. A quit started outside any
window is not asked; its shutdown leaves the run as `PD-ORCH-005` clause 3 says.

**What a ruling decides.** Whether the confirmation is asked on every close of a main window while any run is active
(and then what it says where the close ends nothing), only on a close that ends a run (as built), or on a close of the
window whose own workspace has a run active (which needs the run host's count keyed by workspace); and whether a quit
started outside any window — the desktop's logout above all — asks it.

<a id="oq-207"></a>

**OQ-207 — What is a "mostly-elided artifact" in `summary.md`'s Warnings, and what record counts one?** *(REQ-SESSION-140's
Warnings section, which covers "stale-input drops, mostly-elided artifacts, report downgrades, permission denials …, tool
errors, and terminal failures, suspicious successes and timeouts"; REQ-SESSION-139, REQ-SESSION-133. Raised 2026-10-06 by
fin22 (bundle `fin22-summary-and-counts`) while repairing
[`summary-md-carries-none-of-the-sections-its-requirement-lists.md`](../../../defects/fixed/summary-md-carries-none-of-the-sections-its-requirement-lists.md);
the one gap it leaves stayed open in
[`summary-md-counts-no-mostly-elided-artifacts-until-oq-207-is-ruled.md`](../../../defects/fixed/summary-md-counts-no-mostly-elided-artifacts-until-oq-207-is-ruled.md)
until this was ruled. Raised on the branch as OQ-205 and renumbered twice as `origin/main` was merged in: OQ-206, since
main's OQ-205 (a `swarm` run on a granted intent) took that number first, then OQ-207, since main's OQ-206 (which closes of a main
window ask the active-run confirmation) took that one. ~~Open, the owner's.~~ Ruled 2026-10-07.)*

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** a mostly-elided artifact is an
artifact that a delegating agent attached to a delegated agent (`attach_artifacts`) and that the agent's
`PRIOR AGENT CONTEXT (FULL)` block left out because it did not fit the budget. The record that counts one is REQ-LIBRARY-098's
context-selection diagnostic, which the build writes as the timeline's `context_selection` entry, and each agent-and-artifact
pair counts once. `summary.md`'s Warnings line shows that count (`0` when nothing was left out) and says what it counts and
where it is counted from. [`PD-SESSION-002`](../../../product/directives/pd-session-002.md#pd-session-002) extends REQ-SESSION-140 with this
definition and leaves out the sibling index's dropped entries and the continuation handoff's 6,000-character cut. The ruling
weighed two recommendations and **followed A**: advocate A (the user's lens) recommended defining the warning as an
attached artifact left out of the child's full-context block and counting it from `attached_elided`, as a directive;
advocate B (the system's lens) recommended confirming the `n/a` line as built, reading the warning as REQ-SESSION-133's
context-selection record that this store keeps no ring of. The diagnostic itself is kept, whole, on the uncapped timeline,
so B's `n/a` would hide a fact the store holds. A was corrected twice: the count is of distinct agent-and-artifact pairs, since
~~a REQ-ORCH-088 retry rebuilds a child's payload and writes a second entry~~ another execution of the same child (a resumed
child's REQ-ORCH-088 retry in a later run, or a follow-up of a child that never started) assembles its payload again and writes
a second entry, while a retry within one execution reuses the blocks it built (narrowed by fin30); and the conflict A noticed is wider than its wording,
recorded in [`the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md`](../../../defects/fixed/the-attached-artifact-budget-is-48000-characters-where-req-tools-152-sets-100000-and-drops-every-later-one.md).
"Mostly" here means "wholly", a cost the directive states. Built by fin28 (`elidedAttachmentsOf` and `warningLines` in
`packages/engine/src/run/summary.ts`, `StoreDal.elidedAttachmentRowsOf`); the note
[`summary-md-counts-no-mostly-elided-artifacts-until-oq-207-is-ruled.md`](../../../defects/fixed/summary-md-counts-no-mostly-elided-artifacts-until-oq-207-is-ruled.md)
is repaired.

Every other kind the Warnings section names has a definition and a record: a permission denial is an audit entry
(REQ-SESSION-137), a tool error and the three terminal outcomes are tool-call outcomes and issues (REQ-SESSION-136), and a
stale-input drop and a report downgrade are counts REQ-SESSION-139 takes over the model-input and report-validation records
(which this store does not keep: ADR-0024, the metrics document's `records_kept`). "Mostly-elided artifacts" appears in
REQ-SESSION-140 and nowhere else: no requirement says what eliding an artifact is, what share of it makes it "mostly"
elided, or which record would count one. The nearest thing the build has is a delegated child's payload, whose sibling
index and attached artifacts can be elided to fit its budget (`sibling_index_elided`, `attached_elided` in the
`context_selection` timeline entry, REQ-TOOLS-152 / REQ-LIBRARY-098; corrected 2026-10-07 from "`context_injected` timeline
metadata", a name the build never wrote); that is an artifact left out of a payload, not an
artifact mostly elided, and reading it as the warning would be inventing the definition.

**What the build proceeded under until the ruling** (superseded; kept as the record of it). The line is written and reads `n/a`, never `0` (REQ-SESSION-140's rule for an unavailable
value): `- Mostly-elided artifacts: n/a (no record measures how much of an artifact was elided)`, beside the stale-input
drops and report downgrades, which read `n/a` for the records the store does not keep (`warningLines` in
`packages/engine/src/run/summary.ts`).

**What a ruling decides.** What makes an artifact "mostly elided" (a share of its body cut from a payload or a view, and
which), which record counts it, and whether the warning is then built or withdrawn from REQ-SESSION-140.

<a id="oq-208"></a>

**OQ-208 — Does an MCP tool call's record carry an `outcome_kind`, and is `mcp` one?** *(REQ-SESSION-136's record fields,
"`outcome_kind` … only when applicable"; REQ-SESSION-139's tool-outcomes histogram, "`outcome_kind` when the record carries
one, otherwise derived from `status` and `is_error` into rejected, tool-error, success or unknown"; REQ-TOOLS-112's
`outcome_kind` vocabulary, which names terminal observations only. Raised 2026-10-06 by fin23 (bundle
`fin23-summary-and-live-checks`) while repairing
[`summary-md-tool-errors-line-counts-one-outcome-bucket-not-every-tool-error.md`](../../../defects/fixed/summary-md-tool-errors-line-counts-one-outcome-bucket-not-every-tool-error.md),
at the orchestrator's question whether a bucket named `mcp` belongs among the tool outcomes. ~~Open, the owner's.~~ Ruled
2026-10-07.)*

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** an `outcome_kind` names how a
call ended. A record carries one only when the specification gives its tool outcome words: the terminal's REQ-TOOLS-112
set, and the questions tool's REQ-TOOLS-158 outcomes together with PD-ORCH-005's `withdrawn`. `mcp` names a tool family, so
it is no outcome: an MCP tool call's record carries no `outcome_kind` and keeps its `failure_kind` (`tool_error`, `timeout`,
`execution_error`), and REQ-SESSION-139 derives its histogram bucket from `status` and `is_error` as `success` or
`tool_error`. The fetch tool's record falls under the same reading of REQ-SESSION-136's "only when applicable" and drops
`outcome_kind: 'fetch'`. Records already stored keep what they hold, and no directive, migration or reader shim is owed.
The ruling weighed two recommendations and **followed both** where they agree: advocate A (the user's lens) recommended
dropping `mcp` so the histogram stops hiding a failed MCP call (the c2a9444 duress run's `edit_memory` call inside
`mcp 17`), with fetch recorded as a defect; advocate B (the system's lens) recommended the same for MCP, since one tool's
failures landed in two buckets (a schema refusal in `tool_error`, a server failure in `mcp`), and ruling fetch with it.
On fetch it followed B. The terminal-worded timeout issue an MCP or fetch timeout files is recorded separately, in
[`an-mcp-or-fetch-timeout-files-a-terminal-timeout-issue-that-names-a-terminal-command.md`](../../../defects/fixed/an-mcp-or-fetch-timeout-files-a-terminal-timeout-issue-that-names-a-terminal-command.md)
(repaired by fin30: the message names the call that ran out of time).
Built by fin28 (`apps/desktop/src/run-host/mcp.ts`, `packages/agent-tools/src/tools/fetch.ts`); the fetch half is
[`a-fetch-calls-record-carries-its-tools-name-as-outcome-kind.md`](../../../defects/fixed/a-fetch-calls-record-carries-its-tools-name-as-outcome-kind.md).
*Beside this ruling since 2026-10-13 ([OQ-238](51-spikes-and-later-questions-18.md#oq-238), `PD-TOOLS-013` revision 2):* a fetch, an MCP call or any call its
run cancels carries failure kind `interrupted`, and REQ-SESSION-139 derives such a record, which still carries no
`outcome_kind`, into the bucket `interrupted` rather than `tool_error`. This ruling's reading of `outcome_kind` is unchanged:
no record gains one.

Until the 2026-10-07 ruling, every MCP tool call's record carried `outcome_kind: 'mcp'`, the call succeeding or failing alike
(`apps/desktop/src/run-host/mcp.ts`, the `execute` of each MCP tool executor the run host builds). The histogram followed REQ-SESSION-139's letter and
filed each under the bucket its record named, so `summary.md`'s Tool outcomes line and the metrics document read
`mcp <n>` beside `success`, `tool_error`, `invalid_request`: in the c2a9444 default live run's pack
(`.live-run/runs/2026-10-06T17-41-48-175Z/workspace.db`) the edit, requirements and terminal sessions each have such a
bucket. `mcp` names the tool's family, not how the call ended; a reader of the histogram could not tell an MCP call that
succeeded from one that failed. The specification does not say whether REQ-SESSION-136's "only when applicable" makes an
`outcome_kind` applicable to an MCP call at all, and gives an MCP call no outcome vocabulary of its own: REQ-TOOLS-112's
set (`success`, `shell_failure`, …) is the terminal's.

**What the build proceeded under until the ruling** (superseded; kept as the record of it). The record is left as it is and the histogram keeps REQ-SESSION-139's letter, `mcp`
bucket included. Nothing else depends on the answer since fin23: `summary.md`'s `- Tool errors:` line counts the issues
record's `tool_error` entries, which REQ-SESSION-136 files for a failed MCP call whatever its `outcome_kind`, and the
terminal counts read their own outcomes and issues.

**What a ruling decides.** Whether an MCP call's record carries no `outcome_kind` (the histogram then derives `success` or
`tool_error` from `status` and `is_error`), carries one from a vocabulary the specification would name, or keeps `mcp` as a
bucket of its own.

**Recommendation** (added 2026-10-06 by fin25; for the owner, not a ruling): REQ-TOOLS-112's `outcome_kind` vocabulary is
the terminal's, the only vocabulary the specification gives the field, so under REQ-SESSION-136's "only when applicable"
an `outcome_kind` applies to a record whose tool has one, and an MCP call's record would carry none. REQ-SESSION-139 then
derives its bucket from `status` and `is_error`, `success` or `tool_error`, and the histogram tells an MCP call that failed
from one that succeeded. The build was not changed by this recommendation: it proceeded as stated above until the 2026-10-07 ruling.

**First live execution with MCP failures present, 2026-10-07** (the final duress live run at `a68f121`, pack
`2026-10-07T07-09-30-708Z` of the live worktree, session `e6747bd0`): as ruled. wave3b's two failed code-intelligence
`replace_content` calls, #377 and #378, carry `failure_kind: tool_error` and no `outcome_kind`; `summary.md`'s Tool outcomes
read "success 387, tool_error 16, rejected 0, unknown 0, suspicious_success 1", 404 calls in all with no `mcp` bucket, and its
Tool errors line, 16, equals the issues record's 16 `tool_error` entries — the first live run in which an MCP failure is
counted under the ruling. The row is in [`first-executions.md`](../../../architecture/first-executions.md).

<a id="oq-209"></a>

**OQ-209 — An error-path tool record's arguments are "truncated to 2000 characters", and paths and identifiers are "never
truncated": which governs, and what do the 2,000 characters measure?** *(REQ-SESSION-136, "On error, recorded args/result
are truncated to 2000 characters"; REQ-SESSION-194, which names "the truncated arguments and results of an error-path tool
record" among the cuts its marker governs and ends "Counts, identifiers, paths and timestamps are never truncated"; the
domain's resolution 21. Raised 2026-10-06 by fin23 (bundle `fin23-terminal-and-records`) on its verifier's finding against
the repair of
[`an-error-path-tool-record-cuts-its-arguments-and-result-without-the-cut-marker.md`](../../../defects/fixed/an-error-path-tool-record-cuts-its-arguments-and-result-without-the-cut-marker.md).
Raised on the branch as OQ-208 and renumbered OQ-209 when the branch was rebased onto `origin/main`, main's OQ-208 (an MCP
call's `outcome_kind`) having taken that number first. ~~Open, the owner's.~~ Ruled 2026-10-07 under the owner's delegation
([R-072](../../../product/requests.md#r-072)).)*

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** confirmed as built and minted as
[`PD-SESSION-003`](../../../product/directives/pd-session-003.md#pd-session-003), which narrows REQ-SESSION-136 and REQ-SESSION-194. The
error-path 2,000 characters measure the arguments' JSON text. The arguments keep their shape, and only free-text values are
cut, longest first, each ending with `...` inside its own length. A path, identifier, count or timestamp is never cut, and
when those values alone pass 2,000 the record goes over the cap. The key name decides which values are kept whole, and this
product's `delegate` keys `inherited_context` and `attach_artifacts` join the keys kept whole, repaired as a defect
([`a-delegate-calls-sibling-and-artifact-ids-can-be-cut-in-an-error-path-record.md`](../../../defects/fixed/a-delegate-calls-sibling-and-artifact-ids-can-be-cut-in-an-error-path-record.md)).
The ruling weighed two recommendations and **followed both**, which agree: advocate A (the user's lens) recommended
confirming the reading, a directive, the two keys and a first-executions row — a path or an id cut short gives a false account
to the person reading the record after a failure; advocate B (the system's lens) recommended confirming the reading, a
directive and the two keys with no row — nothing in the product relies on 2,000 as a bound, and the key name is the only
test that reaches an MCP tool. Where they differ it follows B: no first-executions row is owed, the mechanism having run
before the ruling (`PD-SESSION-001`'s precedent). It adds one guard of its own: `cut.test.ts` classifies every argument key
of every built-in tool, and the seams view's tool path names `WHOLE_KEYS`. The ruling names the directive PD-SESSION-002;
it is `PD-SESSION-003` by the number the orchestrator assigned, OQ-207's directive taking PD-SESSION-002. Built by fin28.

A tool call's arguments are a JSON object whose key order the model chooses. REQ-SESSION-136 caps them at 2,000 characters
without saying what is counted (the object's JSON text, or each value), and REQ-SESSION-194 forbids truncating a count, an
identifier, a path or a timestamp. The two meet in two places. A cut of the JSON text from its head drops or cuts through
whatever the model serialised after a long value — a `path` after a 1,990-character `content` — which the first repair did
and the verifier found. And where a value that is a path or an identifier is itself longer than the cap (a deep path, a
long list of ids), no cut can meet both: the cap is exceeded or the path is cut.

**What the build proceeded under until the ruling, and confirmed by it** (`cutArguments`, `packages/engine/src/run/cut.ts`; `SessionWriter.settleToolCall`). The
2,000 characters measure the arguments' JSON text. The arguments keep their shape: an object stays an object with every key,
and only free-text string values are cut, longest first, each ending with REQ-SESSION-194's `...` inside its own length,
until the text fits. A value is a path, an identifier or a timestamp by its key — the key's last word is one of `path`,
`file`, `dir`, `cwd`, `url`, `uri`, `id`, `slug`, `ref`, `hash`, `name`, `at`, `timestamp`, `time`, `date`, `since`,
`until` (or their plurals), or the key is one of this product's own `persona`, `supersedes`, `depends_on`,
`continuation_of`, `write_scope` — and it is never cut, nor anything beneath it; a number, a boolean and null are never cut.
Where what is kept whole cannot fit on its own, every free-text value is cut to the marker alone and the record exceeds
2,000 characters: "never truncated" is read as governing over the cap. A value that only mentions a path (a command
line, a free-text result) is free text and is cut; the result, a single text, is cut from its head as before.

**What a ruling decides.** Whether the 2,000 characters measure the JSON text or each value; whether the cap or "never
truncated" yields when a path or an identifier is longer than the cap; and whether a key-name reading of "path, identifier,
timestamp" is the test, or the tool's declared schema should say which arguments are which.

<a id="oq-210"></a>

**OQ-210 — Is a published artifact's `body_markdown` the submitted body or the rendered document, and may the submitted body
be stored twice?** *(REQ-LIBRARY-087, which keeps each artifact's Markdown document "on disk as a file the record references
and never holds inside itself"; REQ-LIBRARY-090, that document's rendering; REQ-LIBRARY-093, "whose `body_markdown` is the
submitted body unchanged, whose `key_findings` is that same body"; REQ-LIBRARY-094, REQ-LIBRARY-099 and REQ-LIBRARY-134, which
read and write the one or the other; REQ-SESSION-002, the per-session files. Raised 2026-10-06 by finacc3's acceptance round 1
(finding F16), repairing
[`records-and-code-comments-describe-ruled-questions-as-open-and-cite-questions-never-raised.md`](../../../defects/fixed/records-and-code-comments-describe-ruled-questions-as-open-and-cite-questions-never-raised.md):
the artifact store's first execution (Part U) said it raised this tension, in `packages/engine/src/artifacts/sidecar.ts` and in
[ADR-0003](../../../architecture/adr/0003-files-are-the-system-of-record.md)'s execution note ("Open question, not a settled reading"), and no entry
was ever written, so the owner was never asked. ~~Open, the owner's.~~ **Ruled 2026-10-07 under the owner's delegation.**)*

REQ-LIBRARY-087 fixes the on-disk document as REQ-LIBRARY-090's rendering and forbids the record holding it; REQ-LIBRARY-093 says
a publish's `body_markdown` is the submitted body unchanged. Both cannot be literally true of one stored thing without a second
place to store the submitted body, which neither requirement provides.

**What the build proceeds under** (`packages/engine/src/artifacts/store.ts` `publish`, `sidecar.ts` `renderSidecar`). The
record's `body_markdown` is the document: the file the record names (`body_file`) holds REQ-LIBRARY-090's rendering, and the
submitted body survives unchanged inside it as the Key Findings section and in the record's `key_findings` column, so the
submitted body is stored twice, once in the column and once in the file. REQ-LIBRARY-099's section filter reads the record's
columns and never parses the document; REQ-LIBRARY-094's edit overwrites the document and nothing else, so after an edit the
column keeps the body as published; REQ-LIBRARY-134's fallback for an empty stored body is the same rendering.

**What a ruling decides.** Whether `body_markdown` is the rendered document (as built) or the submitted body, with the
rendering derived; whether the submitted body may be kept both in `key_findings` and in the document; and whether an edit of
the document should also reach `key_findings`.

**Ruled 2026-10-07 under the owner's delegation ([R-072](../../../product/requests.md#r-072)):** the body is the document, as
built, and a person's edit of it survives and travels. An artifact's `body_markdown` is its document on disk, created as
REQ-LIBRARY-090's rendering. A publish keeps the submitted body unchanged in two places, `key_findings` and the document's Key
Findings section (which now drops only the blank lines around it, where it was trimmed, so a first line's indentation
survives), and a person's edit changes only the document: `key_findings` and every other column keep their published values
(REQ-LIBRARY-094). A saved edit survives every later re-render, which rewrites only the document's leading frontmatter, and it
is what the product passes on: the follow-up handoff carries an edited artifact's document marked `edited`, and the inspector's
Preview shows every document starting below its frontmatter. Minted as
[`PD-LIBRARY-003`](../../../product/directives/pd-library-003.md#pd-library-003), which narrows REQ-LIBRARY-093 and REQ-LIBRARY-095 and extends
REQ-SESSION-115 and REQ-LIBRARY-132. **The two recommendations weighed:** advocate A (the user's lens) recommended a change of
behaviour, confirming the first two points and making the edit survive a re-render and reach the handoff, without a
directive; advocate B (the system's lens) recommended confirming as built with a directive that narrows REQ-LIBRARY-093's
`body_markdown` clause, and repairing the re-render that overwrites an edit. The ruling **followed both**: B's directive and
re-render repair, A's handoff, read-failure rule and indentation catch, and it added the Preview's start below the
frontmatter; it left out A's optional notice on a section-filtered read. The defect both found,
[`a-re-render-writes-over-a-persons-saved-artifact-edit.md`](../../../defects/fixed/a-re-render-writes-over-a-persons-saved-artifact-edit.md),
was repaired by bundle `fin28-artifacts` the same day (`ArtifactStore.rerender`, `latestArtifactText`, the inspector's
`previewSource`).
