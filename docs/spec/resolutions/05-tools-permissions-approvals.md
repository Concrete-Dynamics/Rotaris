---
reference: ROTARIS-CRW-001
domain: tools-permissions-approvals
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 05, Agent Tooling, Terminal Execution, Permissions, and Approvals


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 30** resolves the verification-gate evidence as "a new per-session evidence file,
>   `<workspace>/.rotaris/sessions/<session_id>/evidence/verification-gate.jsonl`, one JSON object per
>   line". Under **SR-4** it is a durable record, not a file, and REQ-TOOLS-190 now fixes its content and
>   ordering and no path. Everything the disposition decided stands: one entry per attempt, a decline
>   exactly as durable as a write, never altered, never reordered, capped at 5000.
> - Any disposition locating the **permission audit** at `evidence/permissions.jsonl` is superseded by
>   REQ-TOOLS-078 and REQ-SESSION-137. The audit's integrity properties are unchanged, and under **SR-6**
>   they are now also obligations on its **export**: order preserved, nothing omitted, and a statement of
>   how many entries the retention cap dropped (REQ-SESSION-199). This is the record SR-6 cared about most,
>   because it is the one a user reads when they do not trust the interface's own rendering.
>
> ## Also superseded, by the rulings applied 2026-09-01
>
> **ESC-5, ESC-7 and ESC-20** (`../../architecture/owner-decisions.md`) reach this record. As above,
> each disposition's **outcome** stands unless stated otherwise; what changed is the reasoning or the
> vocabulary it leaned on.
>
> - **Row 10 (REQ-TOOLS-187) is invalidated in its reasoning, not in its outcome.** Its decision —
>   that at-most-one-foreground-command is a property of the **shell session** rather than of the
>   backend — survives ESC-5 intact and is strengthened by it. What is gone is the two-backend
>   comparison the row leaned on: only one terminal backend ships, `tmux-pool` and its two
>   `kill_status` values are withdrawn (REQ-TOOLS-099, REQ-TOOLS-100), and a comparison between two
>   shipped backends is now vacuous. REQ-TOOLS-187 restates the guarantee forward instead: because the
>   rule attaches to the session and not to the backend, a backend added in a later release cannot
>   change foreground concurrency, and the backend name stays the only thing about an observation a
>   backend gets to decide. The row's parallel with REQ-TOOLS-141's search guarantee still holds.
> - **Row 3 (REQ-TOOLS-161, REQ-TOOLS-165) keeps every part of its outcome** — explicit per-persona
>   loading is canonical, the folder never auto-loads, and each Plugins row states in text whether the
>   file is loaded and by which personas. Under **ESC-7** the `*.py` extension the inventory filtered
>   on is withdrawn. It was doing one job, deciding what the tab lists, and it is replaced by a
>   stronger and technology-neutral rule: the tab lists exactly the set `custom_tools:` can load, so it
>   never advertises a file the loader would reject nor hides one it would accept. REQ-TOOLS-161 now
>   owns what a plugin file *is* — a module the host process can load and call directly — and states
>   that no language, runtime, packaging form or file extension is fixed anywhere.
> - **The OQ 30 note above is now incomplete on one point.** Under **ESC-20** the verification-gate
>   record additionally **gains an export**, on the terms REQ-SESSION-199 fixes and REQ-EVENTS-166
>   states in full. REQ-TOOLS-190's old *readership* argument for withholding it — "that only this
>   application reads it is why it is a record rather than a file the user is offered" — is withdrawn
>   as the wrong test, and the requirement now owns the right one: a record gains an export when it
>   carries no unredacted user or tool content, and does not gain one when it does. The same
>   requirement states, and must keep stating, that REQ-SESSION-136's tool-call evidence record never
>   qualifies and must never gain an export under any later widening.

> ## Amendment, 2026-09-02 — a permission-audit entry gains an identifier
>
> **No disposition below is reversed; one of them is completed.** The denial side effect of
> REQ-TOOLS-081 has always required a `permission_denied` issue to carry an evidence reference locating
> the decision "in the permission audit". Nothing ever said what that reference *resolved against*:
> REQ-EVENTS-056 fixed the locator's form but a record-kind token for issues only, and REQ-TOOLS-079's
> field inventory gave an audit entry no identifier at all. A reader holding the exported issues record
> therefore held a pointer no requirement made resolvable — an architecture record had filled the gap
> and said in terms that a later specification governs instead.
>
> **What is now fixed.** REQ-EVENTS-056 is the single definition of the locator and closes the
> record-kind token set at three, `permission_audit` among them. REQ-TOOLS-079 is named there as the
> **only** place the identifier of an audit entry may be fixed, and now states the obligation: every
> decision entry has an identifier that distinguishes it from every other entry the audit holds for that
> session, does not change once recorded, and is not reused after retention has displaced the entry that
> held it. REQ-TOOLS-081 cites REQ-EVENTS-056 for the form and the token and spells neither a second
> time, because a token that drifts between the record emitting a reference and the record it points
> into breaks documents already in users' hands.
>
> **What is deliberately not fixed, and why it is not a defect.** Whether the identifier is a further
> field of the entry or travels beside the entry wherever the audit is rendered and exported is left
> open in REQ-TOOLS-079, in the record-shape sketch of the domain's Data & Formats section, and in
> REQ-SESSION-199. The two readings are observably different in the exported audit file, so the choice
> is a product decision (ESC-31) rather than an editor's. Both satisfy the obligation, so a conformant
> build can be made today under either. **Neither reading may disturb REQ-TOOLS-079's no-argument-values
> property**, which is what makes the audit exportable at all under REQ-TOOLS-190's redaction-safety
> test — the requirement says so itself, and the identifier is forbidden to be derived from or to
> disclose any argument of the call the entry decided.


This record disposes of every open question raised in the draft of
[`../05-tools-permissions-approvals.md`](../05-tools-permissions-approvals.md) (domain 05,
requirement prefix `REQ-TOOLS`). The body of that specification has been amended so that each
decision below is stated normatively in place; the numbering of the original open questions is
preserved here so the draft and the resolved specification can be read against each other.

The product-owner decisions of 2026-08-30 that governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, surface, exit codes, or event vocabulary. Under-determined cases are
   decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. What is emphatically
   *not* removed is this domain's subject matter: the `terminal` tool, foreground and background
   command execution, the OS-level sandbox that wraps those commands, tool servers on the stdio
   transport, and the local commit tool all remain fully in scope, because they are programs the
   application runs, not ways a user drives the application. What is removed is every way a *user*
   reached this product from a shell or a text-mode screen.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract (an event field value, an enum, a parseable output format).

Cross-domain vocabulary was taken from `01-run-orchestration.md` (the role vocabulary and the
acceptance role, REQ-ORCH-028; child payload composition, REQ-ORCH-035; the verification-evidence
block, REQ-ORCH-129; gate-authoring authority, REQ-ORCH-126), `10-sandbox-network-egress.md`
(the sandbox mode vocabulary, REQ-SANDBOX-048), `12-desktop-shell-windows.md` (logical pixels and
minimum-window reachability, REQ-SHELL-022; state never conveyed by colour alone, REQ-SHELL-149) and
`15-settings-configuration.md` (the thirteen settings category identifiers, REQ-CONFIG-269). No
other specification was consulted, and no identifier, name, or phrasing was taken from any other
implementation.

New requirements added by this pass: **REQ-TOOLS-187** through **REQ-TOOLS-192**. No requirement
identifier was renumbered, reused, or deleted. Of the 32 open questions raised in the draft, all 32
are resolved: none omitted, none moot, and none escalated.

## Graphical-only sweep

Domain 05 is almost entirely about what an *agent* may do, so the sweep touched few requirements:
no requirement in this domain existed solely to describe a shell entry point, and none was withdrawn
outright. Four requirements carried a shell-surface clause inside otherwise in-scope behavior; each
clause was struck and, where it was the only route to a capability, that capability was rescued into
a new desktop requirement. One section heading and one configuration-table note were corrected to
match.

| Shell surface struck | Where it was | Capability now carried by |
| --- | --- | --- |
| The `--unsafe-outside-workspace` launch flag "on both CLI front ends", the only non-file way to enable `runtime.allow_outside_workspace` | REQ-TOOLS-130 | **REQ-TOOLS-191** (new) — a confirmed toggle in the `runtime` settings category under the Save/Discard flow of REQ-TOOLS-186, plus the existing status-strip flag REQ-TOOLS-131 |
| "Before **a surface** starts an unattended run it computes an advisory string" — an advisory whose only reader was text a shell front end printed at launch | REQ-TOOLS-072 | **REQ-TOOLS-192** (new) — the advisory is shown in the desktop interface at run start with the effective mode and sandbox status, is dismissible, and never blocks the launch |
| "including the text-mode interface, which registers no approval capability" as the exemplar of a host with no approval UI | REQ-TOOLS-064 | Restated surface-neutrally: a session for which no approval presenter is registered, i.e. one for which the dialog of REQ-TOOLS-063 cannot be shown. No capability lost — the headless approval policy of REQ-TOOLS-065 is unchanged |
| "Runs launched in the background from the CLI, headless runs, and runs driven from the text-mode interface cannot prompt anyone" as the definition of an unattended run | REQ-TOOLS-069 | Restated: an unattended run is a desktop-started run whose session never gained, or has lost, an approval presenter. The downgrade machinery of REQ-TOOLS-067/068 and the advisory of REQ-TOOLS-072 are unchanged and now reach the user through REQ-TOOLS-192 |
| "the headless CLI is configuration-driven only (no launch flag)" | REQ-TOOLS-114 | The per-session sandbox selector in the desktop session dialog, which the same requirement already specified; the mode vocabulary now cites REQ-SANDBOX-048 |
| Section heading "28. Desktop and CLI Surfaces"; configuration-table note naming the launch flag | §28 heading, Data & Formats | Heading is now "28. Desktop Surfaces"; the table note points at REQ-TOOLS-191 |

No behavior was lost to the sweep. In particular the whole of sections 10–14 (terminal foreground
execution, background sessions, outcome classification, the OS-level sandbox, live streaming) is
untouched by it: those describe the application running programs on the user's behalf, which
decision 4 explicitly preserves.

## Dispositions

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | Both values fixed, and fixed for every backend and platform rather than derived from a library. The foreground no-output soft-pause window is **30 seconds**. Captured foreground output is capped at **100,000 characters per call**, truncated from the oldest end so the most recent output always survives — the same direction the background buffer already truncates in (REQ-TOOLS-108) — with the truncation stated in the observation detail and recorded as `output_truncated: true` in the `[terminal_diagnostic]` block. Both values are added to the limits inventory, so nothing about the terminal's bounds is left to be discovered from a runtime-rendered tool description. | REQ-TOOLS-097, REQ-TOOLS-098, REQ-TOOLS-100, limits inventory, `[terminal_diagnostic]` shape |
| 2 | RESOLVED | Turned from a test-planning note into a normative constraint on what "available" may be established from. Availability is proved only by a real backend on a real host: a simulated, stubbed, or recorded backend never yields `available`, and conformance is demonstrated by running the trial *and a subsequent sandboxed command* end to end on each supported platform of REQ-TOOLS-115 (macOS `seatbelt`, Linux and WSL2 `bubblewrap`). This makes the fail-closed guarantee of REQ-TOOLS-118 testable in the only way that matters — a substitute backend cannot pass the check on behalf of an absent one. | REQ-TOOLS-119 |
| 3 | RESOLVED | Explicit per-persona loading is canonical; the folder never auto-loads. Listing a path under `custom_tools:` is the only way a plugin file is loaded, so a file's presence in `<workspace>/.rotaris/plugins` grants nothing and no persona gains a tool it did not name — the same closed-grant principle REQ-TOOLS-001 and REQ-TOOLS-002 apply to public tool names. Auto-loading was rejected because it would hand every persona in the workspace an ungranted, in-process, unconfined tool (REQ-TOOLS-163) merely because a file was copied into a directory. The UI is made to match rather than the reverse: the Plugins inventory tab keeps listing the folder as *discovery*, and each row now states in text (never colour alone, REQ-SHELL-149) whether the file is loaded and by which personas, or that no persona loads it. | REQ-TOOLS-161, REQ-TOOLS-165 |
| 4 | RESOLVED | Pairing is guaranteed from both sides, not just the request side. `permission.decision` carries a non-empty `request_id` exactly when the decision resolved a raised approval under the strict test already written into REQ-TOOLS-062, so every answered `approval.requested` event is matched by exactly one `permission.decision` event bearing the same id and a live consumer never has to infer a pairing from ordering or timing. An empty id means unpaired and nothing else. | REQ-TOOLS-183, REQ-TOOLS-062, REQ-TOOLS-083 |
| 5 | RESOLVED | Both halves decided. (a) A wholesale `replace` protects the `IN_PROGRESS` task as well as `COMPLETED` and `ABANDONED` ones: a protected task is restored by id with its state and position intact even when the incoming list omits it, and a replace whose incoming list marks a different task active while a protected active task exists is rejected with REQ-TOOLS-145's message. Protecting only finished work would let a replace silently retire the task the agent is working on, or produce two active tasks, breaking the single-active invariant. (b) An unloadable custom tool is skipped with a recorded reason, never fatal: the general principle of REQ-TOOLS-004 — missing prerequisites degrade availability rather than failing agent construction — governs plugins too, and the skip is additionally raised as a session issue naming persona, path and cause so nothing goes missing silently. The genuinely ambiguous cases stay fatal: duplicate registered plugin names (REQ-TOOLS-162) and a plugin colliding with a declared public tool name (REQ-TOOLS-002) are questions of which tool a name means, not absences. | REQ-TOOLS-146, REQ-TOOLS-164, REQ-TOOLS-145, REQ-TOOLS-004 |
| 6 | RESOLVED | Three sub-questions, all pinned. **Queueing:** exactly one approval dialog is open per window and dialogs never stack; queued requests are shown oldest-first in the order their `approval.requested` events were published, the next is presented as soon as the open dialog closes, a request that timed out or was cancelled while queued is dropped unshown and counts as cancelled, and the dialog states how many others are waiting. **Focus and default action:** the dialog takes focus on presentation, but it has *no* default action — Enter activates nothing and initial keyboard focus is on Deny, so a keystroke aimed at whatever the user was doing cannot approve an unread call. This deliberately amends REQ-TOOLS-063, which had made Approve once the default action; safety-by-default is what the rest of the domain does everywhere (Escape denies, closing denies, resolution fails closed), and a one-key approve under a burst of prompts contradicts it. Approve once keeps its primary styling. **Cadence:** every status-strip flag reflects a change within the product's 100 ms interface responsiveness budget, coalescing faster changes rather than redrawing per change and never redrawing when nothing displayed changed; the same 100 ms budget governs presenting the next queued dialog. The dialog's 560×380 minimum is restated in logical pixels (REQ-SHELL-022). | REQ-TOOLS-063, REQ-TOOLS-184 |
| 7 | RESOLVED | The formulation the draft already describes is canonical and is now stated exclusively: `autonomous` carries no path-scoped ask rule, no preset ever attaches one to it, and a path outside the workspace under `autonomous` never raises an approval prompt. It either succeeds because `runtime.allow_outside_workspace` is on, or it fails with the path-fence error of REQ-TOOLS-129. The prompting variant is rejected because it contradicts the reason `autonomous` exists (REQ-TOOLS-044's own argument: an ask in the mode chosen to avoid prompts, which unattended resolves to a fail-safe deny and which inverts the restrictiveness ordering of REQ-TOOLS-047). | REQ-TOOLS-044 |
| 8 | RESOLVED | Not intended, and fixed at the source rather than papered over with a matcher exception. The file-writing tool's operation selector is named `operation`, never `command`, so `create`/`edit`/`overwrite`/`insert`/`undo` can never occupy the command-facet slot and no command matcher — starter or custom — ever sees one. Among the public tools of REQ-TOOLS-001 only `terminal` names an argument `command` and only `fetch` names one `url`, which is now stated so the facet rule's reach is knowable by reading the tool surface. Facet selection stays purely by argument name, so a custom plugin tool that names a string argument `command` does supply a facet and matchers do examine it — deliberate, and now written down as the author's choice. | REQ-TOOLS-015, REQ-TOOLS-135 |
| 9 | RESOLVED | Not intended; the difference is removed. A plugin tool is built with, and invoked under, the same run-scoped context a built-in tool receives — the issuing run's policy, sandbox specification, egress configuration, and artifact store, resolved per REQ-TOOLS-009 — and never another run's context nor the rule-less default of REQ-TOOLS-029 while its run is live. What cannot follow is enforcement *inside* plugin code, which REQ-TOOLS-163 already says outright: a plugin runs in-process with the host's privileges. Supplying the context and admitting it is unenforceable is the honest pair; withholding the context would have made a plugin unable even to behave correctly on purpose. | REQ-TOOLS-163 |
| 10 | RESOLVED | Decided rather than measured, and made a property of the shell session instead of the backend. Each terminal session runs at most one foreground command at a time — a second foreground call against a busy session waits — so a session's working directory and exported variables are never mutated by two commands at once. Terminal sessions belonging to different agents run concurrently, bounded only by host resources. This holds identically on `single-session` and `tmux-pool`: an observer comparing the two over the same sequence of calls sees the same ordering, the same observations, and the same shell state, with the backend name the only difference — the same "identical whether or not an accelerator is present" guarantee REQ-TOOLS-141 makes for search. Background sessions never occupy a terminal session and remain fully concurrent up to `runtime.shell_max_background_sessions`. | **REQ-TOOLS-187** (new) |
| 11 | RESOLVED | They survive. `coordinator_only: true` removes exactly `terminal`, `write_file`, `haet_edit`, `haet`, and `git_commit` — the write-and-execute names the requirement already forbade — and removes nothing else, so the entire read-only class of REQ-TOOLS-007 survives, `fetch` and `artifact_write` included. A coordinator can read, search, fetch, delegate, track, and publish while being structurally unable to modify the workspace or run a command, which is what the flag is named after. Defining the control by what it removes (a closed list) rather than by what it keeps also means adding a future read tool needs no edit here. | REQ-TOOLS-006 |
| 12 | RESOLVED | A per-run field of the run configuration produced when a run is started from the desktop interface, recorded in that session's run-configuration record. Explicitly *not* a configuration-file key — it narrows one run, not a workspace — and explicitly not a launch parameter, since no launch surface exists. It is absent by default and then narrows nothing. A name in the list the orchestrator persona never declared is ignored, because the control is an intersection and can only remove; each such name is logged once for the run, so a typo is visible without ever widening what the run may do. | REQ-TOOLS-006 |
| 13 | RESOLVED | A string argument compares as its own text. Every non-string value compares by its compact JSON encoding: no insignificant whitespace, object keys sorted ascending by code point, and numbers written in the shortest form that round-trips to the same value — so an integral value carries no fractional part and `1` and `1.0` compare equal, `true` compares as `true`, `null` as `null`, `[1, 2]` as `[1,2]`. Choosing shortest-round-trip rather than "as written" deliberately collapses the `1` versus `1.0` split the question named instead of preserving it, and JSON was chosen because REQ-TOOLS-163 already requires every tool argument to be JSON-expressible, so no second encoding is introduced. | REQ-TOOLS-017 |
| 14 | RESOLVED | Recoverable tool error, returned to the model. A payload still schema-invalid after repair produces a tool-result error carrying the original tool-call id — the same shape a policy denial takes in REQ-TOOLS-013 — naming the tool and the schema violation and asking for a corrected re-issue. The call is not executed, the host never silently re-sends it, and the run never ends because of it. Host-side retry was rejected because it would re-send a payload the model has not seen judged; ending the run was rejected because REQ-TOOLS-013 already establishes that the run survives a refused call and re-plans. | REQ-TOOLS-032 |
| 15 | RESOLVED | Neither wholesale case-sensitivity nor per-platform folding: the split is by token position, identically on every platform and backend. The **first token of a segment — the command name — is compared without regard to case**; **every later token is compared case-sensitively**. One rule therefore behaves the same wherever it runs, `Remove-Item *` fires on `remove-item -Recurse .` under PowerShell, `rm -rf *` fires on `RM -rf /`, and both observable consequences REQ-TOOLS-033 already promised still hold (`git status` fires on neither `git status-check` nor `git STATUS`, since the differing token is not the command name). Per-platform folding was rejected because it makes one written rule mean two different things depending on where the run happens. Because switches keep their case, the Windows deny patterns gain their uppercase spellings: `rmdir /S *`, `rd /S *`, `del /F *`. | REQ-TOOLS-033, REQ-TOOLS-039, REQ-TOOLS-104 |
| 16 | RESOLVED | The conflict is dissolved at its root rather than adjudicated: **`tools:` never names an MCP server.** Exactly one key grants a server — the persona's `mcp_servers` — and exactly one key narrows it — `mcp_tools` (REQ-TOOLS-166). REQ-TOOLS-001 and REQ-TOOLS-002 are amended accordingly, and a `tools:` entry that happens to name a configured server now fails like any other unrecognized entry, with an error pointing at `mcp_servers`. With that settled, the remaining half is decided on the static/runtime line: a name in `mcp_servers` matching no configured server is a **configuration-validation error** (a typo in the same file, the same class as an unrecognized `tools:` entry), while facts about the host stay warnings — a disabled server, a server whose command is not on PATH, a tool-discovery failure. REQ-TOOLS-168's "a server the persona was not given" is restated as a key in `mcp_tools` naming a server absent from that same persona's `mcp_servers`. | REQ-TOOLS-001, REQ-TOOLS-002, REQ-TOOLS-168, REQ-TOOLS-169 |
| 17 | RESOLVED | REQ-TOOLS-118 is canonical: a session that requests a sandbox unavailable on this host **does not start**. No live run therefore reaches the downgrade test in the "requested but not usable" state, and at downgrade time a run is unsandboxed exactly when `runtime.sandbox_mode` is `off` and sandboxed exactly when it requested a sandbox proved usable under REQ-TOOLS-119. Starting unsandboxed-with-every-command-refused was rejected: it produces a run that can plan but never act, which is worse for the user than a refusal carrying reason and remediation. The `sandbox_unavailable` observation is not thereby dead — it remains reachable for a wrap that fails at command time on a host where the sandbox was proved usable at start (REQ-TOOLS-122), and it still refuses to execute rather than falling back. | REQ-TOOLS-070, REQ-TOOLS-118 |
| 18 | RESOLVED | The recognizer's pattern list is now **closed and exhaustive**, not a floor: six groups covering transfer and remote-shell clients (`curl`, `wget`, `ssh`, `scp`, `sftp`, `rsync`, `nc`, `ncat`, `telnet`, `ftp`), version control (the seven `git` network subcommands plus `gh`), Python packaging (`pip`/`pip3`, `uv`), JavaScript packaging (`npm`, `npx`, `yarn`, `pnpm`), other toolchains (`cargo`, `go`), and system/container package managers (`brew`, `apt`, `apt-get`, `docker pull`/`push`). Nothing matches by inference from a listed spelling. Making the list closed is honest rather than limiting, because REQ-TOOLS-094 already states the recognizer is a permission decision about a command string and never an enforcement boundary; a command line the list misses is caught, where it is statically unreadable, by the escalation matcher of REQ-TOOLS-038, and real egress control lives in the sandbox switch of REQ-TOOLS-117. | REQ-TOOLS-094 |
| 19 | RESOLVED | An explicit `timeout` suppresses the soft pause. Supplying one is the agent declaring how long it is prepared to wait, so such a call is bounded by its own hard timeout alone and never returns early for silence; only a call that supplied no `timeout` can soft-pause, after the 30-second no-output window fixed under question 1. The alternative would have made an explicit long timeout unusable for a genuinely quiet long-running command, which is the one case an agent supplies a timeout for. | REQ-TOOLS-097 |
| 20 | RESOLVED | `background_running` always carries `info` — a session that is still running has reported nothing to be concerned about. `background_terminal` takes its severity from the session's final status of REQ-TOOLS-109: `completed` → `info`, `killed` → `warning` (deliberately ended, so neither a clean finish nor a fault), `failed` and `timeout` → `error`. Severity never asserts a problem the status does not report, and a background failure reads at the same severity the same failure would read at in the foreground (`shell_failure` → error, `timeout` → error). | REQ-TOOLS-112 |
| 21 | RESOLVED | Yes, case-insensitively, exactly like the literal markers and the banner text — one casing rule for all three checks in REQ-TOOLS-113 rather than an unexplained exception in the middle of the list. `found 3 errors` warns; `Found 0 errors` must not warn in any casing. | REQ-TOOLS-113 |
| 22 | RESOLVED — **ownership superseded** | A configuration key, `runtime.additional_read_only_roots`: a list of absolute paths (POSIX or Windows spelling), default empty, with relative entries rejected at load and at assignment under the same rule and message shape as `runtime.sandbox_writable_roots` (REQ-TOOLS-116). *The rule is unchanged; the requirement that owns it is not REQ-TOOLS-116. The fourth reconciliation round named REQ-SANDBOX-050 the product's single definition of `runtime.sandbox_writable_roots`, its default and its entry rules, and REQ-SANDBOX-050 says so in its own text. This disposition and domain 10's own record had settled the same question the other way round — see the note under the amendments at the foot of this record.* Configuration is the only designation — no launch-time flag exists to designate one, and no built-in list of locations is shipped, so nothing outside the workspace is readable unless the user wrote it into the configuration themselves. A built-in list was rejected because it would silently widen the fence on every installation. The exception stays read-only in the strongest sense: every write to such a root is refused with the path-fence error even when `runtime.allow_outside_workspace` is on, and the roots grant nothing to the search tools of section 16. | REQ-TOOLS-132, configuration key reference |
| 23 | RESOLVED | One named function serves both thresholds: similarity(*a*, *b*) = 1 − editDistance(*a*, *b*) / max(length(*a*), length(*b*)), with unit-cost insertion, deletion and substitution over Unicode code points, lengths in code points, and the similarity of two empty strings defined as 1 — symmetric, and always in [0, 1]. REQ-TOOLS-136's 0.85 fuzzy threshold reads it over the candidate window's text against the old-string text; REQ-TOOLS-134's 0.45 cutoff reads it over base names lower-cased on both sides. Tie-breaks are fixed in both places: equally scoring fuzzy windows resolve to the one starting on the lower line number, and equally scoring filename suggestions are listed in ascending name order after a highest-score-first sort. Both thresholds are now reproducible across implementations, which is what the question was actually about. | **REQ-TOOLS-188** (new), REQ-TOOLS-134, REQ-TOOLS-136 |
| 24 | RESOLVED | The surface is specified in full. `haet_read(path, offset=1, limit=2000)`, with `file_path` accepted as an alias for `path`, returns REQ-TOOLS-134's line-numbered format plus a `content_hash` in its metadata header: the SHA-256 digest of the file's exact bytes on disk at read time, 64 lowercase hexadecimal characters — the same SHA-256 the file engine already reports under REQ-TOOLS-132, so no second hashing scheme is introduced. `haet_edit` (alias `haet`) takes `path`, a required `content_hash`, `old_string`, `new_string`, and `replace_all` (default false). A hash that no longer matches the file's current bytes refuses the edit and returns a message naming the path, stating the file changed since that hash was taken and directing a fresh read, without quoting the file's current content. A matching hash *is* the read-before-write proof of REQ-TOOLS-133 for these tools. `haet_edit` matches at level 1 of REQ-TOOLS-136 only — no whitespace normalization, no indentation shift, no fuzzy window — because being exact is the entire point of anchoring; writes are atomic and enter the same per-path undo history, and a success reports the new hash so edits chain without an intervening read. | **REQ-TOOLS-189** (new), REQ-TOOLS-137 |
| 25 | RESOLVED | Order: newest first by publication time, ties broken by ascending artifact id, giving a total and reproducible ordering for any set of artifacts — recency is what an agent scanning a list wants, and the id tie-break removes the last degree of freedom. Out-of-range `limit`: clamped to the nearer bound (below 1 → 1, above 200 → 200), never rejected, with the observation stating the applied limit whenever clamping changed it. Clamping follows the precedent REQ-TOOLS-141 already sets for a bad `base_path`, and it costs a mistaken agent one accurate line of output instead of a whole turn. | REQ-TOOLS-149 |
| 26 | RESOLVED | The attached-artifact section of the child payload is budgeted at **100,000 characters**. Attachments are considered in the caller's listed order; the first whose full body would carry the section past the budget is dropped, and so is every attachment after it. Dropping is therefore deterministic, order-preserving, and never partial — a body is carried whole or not at all, which is what makes an attached artifact quotable by the child — and the caller's `task` text is never truncated to make room, as REQ-TOOLS-152 already required. The count dropped is reported in the observation warning. | REQ-TOOLS-152, limits inventory |
| 27 | RESOLVED | `delegate` **never** suspends the parent conversation, at any point. It returns as soon as the child is accepted, carrying the status of REQ-TOOLS-153, and the parent's turn continues. `run_in_background: true` (the default) ends there; completion arrives as the system notification of REQ-TOOLS-152. `run_in_background: false` changes nothing about the `delegate` call — it enrols the parent in a wait for that one task through exactly the mechanism of REQ-TOOLS-156, as though `wait_for_tasks` had been called with the returned task id immediately afterwards. The product therefore has one waiting mechanism rather than a blocking `delegate` and a non-blocking `wait_for_tasks` that behave differently under cancellation, teardown, and resume. | REQ-TOOLS-153, REQ-TOOLS-152, REQ-TOOLS-156 |
| 28 | RESOLVED | The acceptance persona is `verifier`, the role REQ-ORCH-028 names for final acceptance, and no other persona receives the prefix. The prefix's content is not re-invented here: it is the verification-evidence block of REQ-ORCH-129 — a heading stating that the bound suite has already been executed and must not be executed again, followed by a per-check table of check, command, status, exit code, and path to full output. The delegation refusal REQ-TOOLS-154 mentions is REQ-ORCH-039's. Citing domain 01 rather than defining a parallel vocabulary is deliberate: the gate and the role belong to the orchestration domain, and this domain only has to say where the block lands in the payload. | REQ-TOOLS-154 |
| 29 | RESOLVED | The line is *could not start* versus *started and told us nothing usable*. `unavailable` — the command could not be started at all: program absent, not executable, or working directory unusable; a fact about the host, and the note names what was missing. `undecidable` — the command started but its outcome cannot be read as evidence about a suite: it exceeded the probe timeout, produced output the probe cannot interpret, or ended without an attributable exit status; a fact about the command, and the note says which of the three. For completeness the other two are stated in the same terms: `verified` — ran to completion and identified at least one executed check; `empty` — ran to completion and reported zero checks. Exactly one verdict is returned. The distinction is worth keeping because it is also the distinction between a problem the user fixes by installing something and one they fix by changing the command. | REQ-TOOLS-159 |
| 30 | RESOLVED | A new per-session evidence file, `<workspace>/.rotaris/sessions/<session_id>/evidence/verification-gate.jsonl`, one JSON object per line in attempt order, under the same never-altered, never-reordered, 5000-entry retention rule as `permissions.jsonl` (REQ-TOOLS-078) — the same family the domain already uses, so no new persistence model is introduced. Shape: `timestamp`, `session_id`, `agent_id`, `persona`, `outcome` (`write`\|`decline`), `decline_case` (`missing_reason`\|`invalid_suite`\|`requires_proposal`, empty for a write), `reason`, `checks`, `detail`. Every attempt writes exactly one entry, so a decline is as durable as a write and a reader can reconstruct what was attempted as well as what took effect — without that, REQ-TOOLS-160's in-band declines would leave no trace. A timeline event accompanies each entry (REQ-ORCH-126), and a failed evidence write logs a warning rather than converting a decline into a retryable error. | **REQ-TOOLS-190** (new), REQ-TOOLS-160, on-disk layout, record shapes |
| 31 | RESOLVED | Yes, case-insensitive. `eyJ` is caught by the `eyj` prefix and `GHP_…` by `ghp_`. A masking rule that changing capitalization could evade would be no rule at all, and the whole point of REQ-TOOLS-171 is that the three surfaces it backs cannot leak a credential. Token-boundary recognition is unaffected, so an ordinary word merely containing one of the sequences is still left alone. | REQ-TOOLS-171 |
| 32 | RESOLVED | Yes — names are segmented on hyphens as well as underscores, after any leading run of `-` is stripped. `--api-key`, `--auth-token`, and `--client-secret` are therefore secret-looking, while `--secretly-verbose` is not, because its segments are `secretly` and `verbose` and neither is a listed word. Layer 2 of REQ-TOOLS-171 exists to match flag names, which are conventionally hyphenated; segmenting on underscores alone would have left that layer structurally unable to recognize the names it was added for, while whole-segment matching still keeps the false positives REQ-TOOLS-172 already promises to avoid. | REQ-TOOLS-172 |

## Amendments outside the numbered questions

Four changes were made that no open question asked for, and are recorded here for completeness.

- **REQ-TOOLS-063** loses its default action. The draft made *Approve once* both the primary-styled and the default (Enter-activated) button; the resolution of question 6 removes the default action entirely and puts initial focus on Deny. Recorded separately because it reverses a statement the draft made positively rather than filling a gap.
- **REQ-TOOLS-039** gains three patterns — `rmdir /S *`, `rd /S *`, `del /F *` — as the direct consequence of question 15's decision that only the command-name token folds case.
- **REQ-TOOLS-114** now cites `REQ-SANDBOX-048` for the sandbox mode vocabulary instead of restating it, so the two domains cannot drift.
- **REQ-TOOLS-165** and **REQ-TOOLS-184** now state explicitly that the inventory load state and the status-strip flags are conveyed in text and never by colour alone, per `REQ-SHELL-149`.

**Superseded: which domain owns the two sandbox runtime keys.** This record treats REQ-TOOLS-116 as
the requirement that fixes `runtime.sandbox_writable_roots` and its absolute-path refusal (open
question 22), and question 18 treats REQ-TOOLS-117 as where "real egress control lives". Domain 10's
resolution record, written independently, reached the same conclusion from the other side and had
REQ-SANDBOX-050 *cite* REQ-TOOLS-116 for the message shape. The fourth reconciliation round then
decided the ownership the opposite way: REQ-SANDBOX-050 is the product's single definition of
`runtime.sandbox_writable_roots`, its default and its entry rules, and REQ-SANDBOX-051 of
`runtime.sandbox_allow_network` and its default, both cited by REQ-CONFIG-127. Both decisions stayed
live in the corpus until the sixth round, which is the only reason it took this long to notice: the
two records agree with each other and disagree with the ownership table, and no single reading sees
all three at once. The direction that stands is the fourth round's — the domain that defines
confinement defines the keys that configure it. Nothing about the rule itself changed under either
reading, and no behavior was ever at risk; what was wrong was which requirement a reader is meant to
go to. REQ-TOOLS-116 and REQ-TOOLS-117 still carry copies of what those two own and cite neither, so
the follower side of the pair is not yet written.
