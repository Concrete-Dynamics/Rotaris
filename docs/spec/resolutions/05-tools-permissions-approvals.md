---
reference: ROTARIS-CRW-001
domain: tools-permissions-approvals
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 05, Agent Tooling, Terminal Execution, Permissions, and Approvals

> ## Amendment, 2026-10-21 — a soft-paused command's stream ends when the session closes the command (OQ-370)
>
> `REQ-TOOLS-127` gains a dated note beneath its text, which is kept unchanged. The requirement fixes the closing frame's
> text and its exit code, not its instant. A soft-paused command's live stream ends when the session itself closes that
> command, while no later call holds the stream: at the terminal window's kill, the command's own end frame, the end of the
> session's shell, or the agent's `reset`. It does not wait for the agent's next observation, and a stream a later call has
> re-opened is ended by that call's own result. An end the session does not know of (an interrupt's, until a poll or the
> next command finds it; a queued line a command took as input) leaves the stream open until that observation, as built.
> The closing frame carries the paused command's screen so far — all of its retained output as plain text, capped at
> `REQ-TOOLS-097`'s 100,000 characters and truncated from the oldest end, empty for a queued command that never ran — and
> the stream closes carrying −1 for a command the window killed, no exit code for one that never ran, ended the shell or was
> ended by the agent's reset, its own status for one that ended on its own frame, and −1 where an interrupt left it none.
> Every observation the agent receives is unchanged, and OQ-164's ruling stands.
>
> **Why this is a note and not a directive.** `REQ-SHELL-091` binds the window "once the process exits", and the window
> learns of the exit only from the stream's meta; `REQ-TOOLS-127`'s closing frame is "the one emitted after it has exited",
> and its "rather than on a partial capture" excludes the since-poll text on which the build closed a polled command's
> stream. The reading builds `REQ-SHELL-091`, `REQ-SHELL-087`, `REQ-TOOLS-127` and `REQ-TOOLS-128` as written and departs
> from none of them. Ruled under the owner's delegation ([R-072](../../product/requests.md#r-072)) with no directive; the
> ruling, its evidence and its corrections of the entry are in
> [`open-questions.md`](../../architecture/open-questions/67-spikes-and-later-questions-34.md#oq-370).


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

> ## Correction, 2026-09-02 — the paragraph immediately above is superseded and must not be cited
>
> **"What is deliberately not fixed" is now fixed.** The product owner ruled that the identifier is
> carried **in the entry**, and REQ-TOOLS-079 has been amended to state it and to state why: REQ-EVENTS-056
> requires the locator to resolve *through the export*, on a machine carrying none of this product's code,
> so an identifier held anywhere but in the entry does not survive being exported, and the export is the
> whole reason the audit is an audit. The claim above that "a conformant build can be made today under
> either" reading is withdrawn — a build that carries the identifier beside the entry is now
> non-conformant.
>
> **Two things the amendment deliberately did not change.** REQ-TOOLS-079's no-argument-values property is
> untouched and the identifier is still forbidden to be derived from or to disclose any argument of the
> decided call, so REQ-TOOLS-190's redaction-safety test still passes for the audit. And REQ-TOOLS-082's
> mode-change entries keep their field set exactly: the ruling fixes where a *decision* entry's identifier
> lives, no locator names a mode-change entry, and reading the ruling as an obligation on every entry the
> audit holds would put a field into a shape REQ-TOOLS-082 states as closed.


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

## Parts

Since 2026-10-26 the rest of this document is in [`05-tools-permissions-approvals/`](05-tools-permissions-approvals/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](05-tools-permissions-approvals/01-graphical-only-sweep.md) | Graphical-only sweep |
| [02](05-tools-permissions-approvals/02-dispositions.md) | Dispositions |
| [03](05-tools-permissions-approvals/03-amendments-outside-the-numbered-questions.md) | Amendments outside the numbered questions |
