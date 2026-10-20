---
reference: ROTARIS-CRW-001
domain: run-orchestration
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 01, Multi-Agent Run Orchestration

> ## Amendment, 2026-10-20 — the same action compares the arguments as one JSON value (OQ-364)
>
> `REQ-ORCH-101` gains a dated note beneath its text, which is kept unchanged. "The whole of their arguments" is their
> value read as JSON: every member of every object at every depth, arrays in order, nothing trimmed, cased, cut or
> disregarded. The order in which an object's members were written is no part of that value, so one argument object sent
> with its keys in another order is the same action, and two calls whose values differ anywhere stay two actions, the two
> long edits differing near their end among them. Arguments that do not parse as JSON are compared whole as text and never
> equal a parsed value. The repetition trigger, the cycle trigger and `PD-ORCH-016`'s raw-count evidence take the one
> comparison together; the thresholds of `REQ-ORCH-100`, the fallbacks of `REQ-ORCH-104`, the comparison of assistant
> messages and the text forwarded to a tool are unchanged.
>
> **Why this is a note and not a directive.** The requirement's ban on "a normalized rendering" states its own reason:
> each such rendering "makes the two long edits above compare equal". An encoding that keeps every member whole cannot
> make two different values equal, so the reading builds `REQ-ORCH-101` as written and departs from nothing; the build's
> comparison of the text in its emitted key order was the defect
> [`the-loop-supervisor-misses-identical-calls-whose-argument-key-order-varies`](../../defects/the-loop-supervisor-misses-identical-calls-whose-argument-key-order-varies.md)
> records. Ruled under the owner's delegation ([R-072](../../product/requests.md#r-072)) with no directive; the ruling, its
> evidence and its reopening condition are in [`open-questions.md`](../../architecture/open-questions.md#oq-364).

> ## Amendment, 2026-09-14 — one persisted run vocabulary
>
> The two-value `task` / `maintenance` clause in disposition 31 and REQ-ORCH-137 is superseded by
> the persisted marker owned by REQ-SESSION-021 and made exact by REQ-LIBRARY-002:
> `task_run`, `improvement_run`, and `integration_run`. Ordinary user runs carry `task_run` and are
> eligible for post-run collection. Library-launched application runs carry `improvement_run`, and
> hidden worktree-integration runs carry `integration_run`; both are analysis-ineligible. The
> gate-authoring work of REQ-ORCH-126 remains a detached internal task and creates no durable session,
> so it introduces no fourth run type. This amendment preserves disposition 31's behavioural boundary
> while removing its duplicate vocabulary.


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 3** — records "the product's 100 ms budget: a state change the run has recorded appears on these
>   surfaces within 100 ms" with no percentile. Under **SR-8** that figure is a **95th percentile**
>   (REQ-ORCH-155). A single update beyond 100 ms is not by itself non-conformant. The absolute reading is
>   not merely expensive but unsatisfiable in principle, so it was never the intended one.
> - **The note on REQ-ORCH-087** records only the "in background mode" → "where no view is attached"
>   rewrite. The `.message_limit_paused` signal file that requirement also wrote is now gone under **SR-4**:
>   the durably recorded execution status `paused_message_limit` is the whole of the signal, and no marker
>   is written anywhere for another process to find (REQ-ORCH-087, REQ-SESSION-107, REQ-NOTIFY-248).
> - Any disposition below that locates a check's full output, a child transcript or an artifact body by a
>   path under a session directory describes a layout that no longer exists. The guarantees survive in
>   REQ-ORCH-123, REQ-ORCH-140 and REQ-ORCH-149; the paths do not.


This record disposes of every open question raised in the draft of
[`../01-run-orchestration.md`](../01-run-orchestration.md) (domain 01, requirement prefix
`REQ-ORCH`). The body of that specification has been amended so that each decision below is stated
normatively in place; the numbering of the original open questions is preserved here so the draft
and the resolved specification can be read against each other.

The product-owner decisions of 2026-08-30 that governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, surface, exit codes, or event vocabulary. Under-determined cases are
   decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent. This is what decided open question 2: the plan gate is specified and built.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. A requirement in this
   domain whose only observable surface was a shell invocation or a text-mode screen is
   **withdrawn**, and every capability that reached a user only through such a surface is carried by
   a desktop-reachable requirement instead. Running external programs stays fully in scope: check
   suites, terminal command execution by an agent, and version-control invocations are unaffected.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract. Statuses, stop reasons, state names, event names, issue
   kinds, task-id and canonical-name grammars, and configuration keys stay exact; the sentences a
   user reads do not.

## Graphical-only sweep

The document was written around two hosts that no longer exist — a background command-line host and
an interactive terminal-UI host. One requirement existed only to hold those two hosts to the same
behavior and is withdrawn. Everything else the sweep touched was a *venue* change rather than a
capability loss: a surface that named the terminal now names the desktop interface, and the
substance is unchanged.

| Withdrawn | Why its only surface was a shell or text-mode screen | Capability now carried by |
| --- | --- | --- |
| **REQ-ORCH-001** — a run started from the background/headless command-line host and a run started from the interactive terminal UI host reach the same orchestration outcome, differing only in presentation, in the run override, and in how a message-limit pause is surfaced | The whole requirement was a parity contract between two entry points, both removed. With no command line and no text-mode interface there is no second host for the first to be compared against, and no reading of the requirement survives the removal of either side | **REQ-ORCH-150** (new). The capability underneath the parity contract is *a run that does not change because of who is watching it*. It is restated over the axis that still exists: a run reaches the same intent handling, delegation and iteration rules, verification gating, stop reason and terminal status whether its view is attached for the whole run, for part of it, or never opened; attaching, detaching, closing the window and switching views change only what is shown. The single permitted difference is carried forward intact — the message-limit pause is a dialog when a view is attached (REQ-ORCH-086) and takes the detached path when none is (REQ-ORCH-087) — and the run override of REQ-ORCH-025, which the draft listed as a host-supplied difference, is now available to every run alike |

Process exit codes are withdrawn as a concept rather than as a requirement. The application does not
exit when a run ends, so an exit code is a script-oriented output with no venue here. **REQ-ORCH-083**
keeps the whole of its substance — the status vocabulary `completed`, `failed`, `max_iterations`,
`interrupted`, `error`, the stop-reason mapping, the session-status fallback, and the
never-raises rule — and loses only the numeric codes. (Two of those were later re-sited by
cross-domain reconciliation without changing what they say: the stop-reason set and its total mapping
onto this vocabulary are REQ-MONITOR-301's, and the no-stop-reason fallback onto the persisted
execution status is REQ-SESSION-076's. REQ-ORCH-083 keeps the status vocabulary, is the product's
single definition of it, and holds no copy of either of the other two.) The Data & Formats section, the Overview, and
the three requirements that mentioned an exit code in passing (REQ-ORCH-136, REQ-ORCH-137,
REQ-ORCH-138) are amended the same way. Nothing that consumed a status loses anything: the status
vocabulary is unchanged and remains citable by other domains.

Five further requirements named a terminal venue beside their substance. Each keeps the substance
and changes only the venue, so nothing is withdrawn and no capability moves:

- **REQ-ORCH-014** — "In the interactive host, a transient `Classifying intent...` status" becomes
  the desktop interface showing a transient status before the call and replacing it in place with
  one carrying the classified category identifier. Under decision 5 the four quoted literals give
  way to required information content; the category identifier stays exact and REQ-SHELL-149's
  no-colour-alone rule is cited.
- **REQ-ORCH-066** — "functional in both attached (interactive) and background sessions" becomes
  functional whether or not a view is attached, citing REQ-ORCH-150.
- **REQ-ORCH-086** — the terminal modal with `c`/Enter, `d`, `x`/Escape single-key bindings becomes
  a desktop modal dialog carrying the same three actions and the same three pieces of information,
  presented in the action vocabulary of REQ-SHELL-048, keyboard-reachable and fully labelled at the
  minimum window size (REQ-SHELL-022). The shortcut assignments belong to the desktop shell.
- **REQ-ORCH-087** — "In background mode" becomes "where no view is attached to the session". The
  signal file, the `paused_message_limit` execution status, the never-auto-continue rule and the
  command-palette entry are all retained; a signal file in the session directory is durable state,
  not a shell surface.
- **REQ-ORCH-025** — the "host-selected" run override becomes a user-selected run option chosen in
  the desktop interface where the run is started. Its substance is settled at open question 14
  below.

Nothing else in the domain needed rescuing. The word *host* elsewhere in the document denotes the
application layer that embeds this engine rather than an entry point, and is left as written.

## Dispositions

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | Timing is specified as budgets against a monotonic clock, and the domain deliberately makes no claim about real provider latency. Every stated duration is measured from the start point its own requirement names; a budget fixes when the run takes its action, never the total elapsed time, so an action that can only be taken at a boundary is taken at the first boundary at or after expiry (the iteration-limit overshoot REQ-ORCH-069 already permits), and a budget spent inside a provider call runs from when the run issued the call, not from when the provider began work. Where two budgets bound one activity the smaller governs and does not reset the larger. Conformance to every duration here must be demonstrable with a controlled clock — which turns the draft's admission that live timing could not be verified into the normative statement that live timing is not what is being specified. | REQ-ORCH-156 (new), REQ-ORCH-069, REQ-ORCH-124 |
| 2 | RESOLVED | Build it. Unbuilt-but-intended behavior is in scope, and a plan gate is a capability a user either has or does not — deferring it would be dropping it. Three requirements now specify it, authored to the described intent. A persistent `auto`/`plan` mode defaults to `auto`, is set where a run is started and in settings, and outlives the run that used it. In `plan` mode, and only where the intent is not `question` or `exploration`, the run produces a plan and blocks before any file-modifying work: no child holding a workspace-write or command-running tool is spawned and no check suite runs until the user answers. The plan is shown verbatim as its author wrote it, never summarized. The wait is indefinite — no timeout, no default, no proceeding because the window closed — and the pending decision survives an application restart the way a message-limit pause does. Exactly three answers exist: approve, revise, cancel (stop reason "stopped by user" as written here; the closed stop-reason set of REQ-MONITOR-301 later replaced the prose reasons with snake_case tokens, and REQ-ORCH-153 states the token `user_cancelled`). The plan is directly editable and the edited text is what is carried out, but editing does not approve. Revise runs another cycle with the current plan plus the user's stated changes, unlimited in number. Approval is one-way for that run: a later plan never re-blocks it, and a mid-run mode change applies to the next run. Two timeline events, `plan_gate_opened` and `plan_gate_resolved`, and the session execution status `awaiting_plan_decision`, make the gate observable. | REQ-ORCH-152 (new), REQ-ORCH-153 (new), REQ-ORCH-154 (new), Data & Formats |
| 3 | RESOLVED | The split is made explicit rather than left as an admission. This domain fixes *what* each surface must convey and closes the set of surfaces it requires — intent status, plan gate, live child graph with each child's state, role, canonical name and task id, model-slot and rate-limit waits with their three resolutions, message-limit dialog, verification progress and the skip control, repair scheduling and escalation, and the run-progress summary. All of them are reachable within the seven views of REQ-SHELL-023 and use the action vocabulary of REQ-SHELL-048. Layout, typography, placement and animation are the desktop shell's, subject to REQ-SHELL-149, REQ-SHELL-135 and REQ-SHELL-022. The one timing guarantee this domain does add is the product's 100 ms budget: a state change the run has recorded appears on these surfaces within 100 ms. | REQ-ORCH-155 (new) |
| 4 | RESOLVED | Agreed, and now stated normatively instead of as advice to a rewrite. The domain's conversation-lifecycle guarantees are enumerated and closed — the graceful-pause tool deadline and its [5, 120] bounds, the no-force-close rule for a notification pause, the rule that pause and close never block event handling, the `child_conversation_closed` event and discarded waits of REQ-ORCH-098, and the context-overflow recovery of REQ-ORCH-093. Everything below that line is explicitly unconstrained: the threading model, the shape of streamed model events, and any retry beneath the classification of REQ-ORCH-092. No conformance claim in this domain depends on any of it, so an implementation may choose freely without risking a conformance gap. | REQ-ORCH-134 |
| 5 | RESOLVED | No variant text is fixed anywhere — the eight slot names, the slot semantics and the lookup rules of REQ-ORCH-021 are the whole contract, and an implementation authors the catalogue's prose to them. The real gap the question exposed was a different one: REQ-ORCH-026 forbids an override from naming a variant the catalogue does not define, which is unusable if the defined set is invisible. So the catalogue is made user-inspectable — the settings interface lists every slot, every variant identifier defined for it, and each one's built-in text, and that listing *is* the definition of what an override may address. An override author can therefore see the closed set before writing a file, and REQ-ORCH-026's warning for an unknown name becomes a correctable error rather than a guess. | REQ-ORCH-026 |
| 6 | RESOLVED | Concurrent runs are fully isolated, and the isolation is an invariant rather than an artifact of the implementation. More than one run may be in flight, in one workspace or several. Each run's iteration ledger, child records, task ids, canonical-name scope, message counter, consecutive-retry counters, repair budgets, loop-supervisor state, artifact store, session snapshot and diagnostics are scoped to its own session id and are never read or written by another run. A run's stop reason, terminal status, and the state sequence of each of its children do not depend on how many other runs exist or on how concurrent runs interleave. The per-model concurrency cap of REQ-ORCH-050 is scoped to one run for the same reason — a process-wide cap would let one run starve another and make a run's observable behavior depend on its neighbours — and cross-run contention for a provider is left to the rate-limit and quota rules of REQ-ORCH-091, which is where provider protection belongs. | REQ-ORCH-151 (new), REQ-ORCH-050 |
| 7 | RESOLVED | The values already recorded in REQ-ORCH-100 are canonical: thresholds 60 and 60, classifier timeout 20 s, fingerprint-based repetition and cycle triggers as the primary detection path with the raw counts as a backstop behind them. The 10/20 thresholds are rejected because the fingerprint triggers of REQ-ORCH-101 did not exist when those numbers were written, and raw counts alone produce false positives on legitimate long work. The 2-second activation-cycle latency budget is dropped outright rather than restated: an activation pauses one child and never bounds the run, so its cost is governed by the classifier timeout alone, and a second budget over the same activity could only conflict with it. The parenthetical deferring the question is removed from REQ-ORCH-100. | REQ-ORCH-100, REQ-ORCH-101 |
| 8 | RESOLVED | Deliberate, kept, and now stated as an invariant rather than noted as an observation. A `partial` report means the child did usable work and stored a report, so its dependents may proceed on that report exactly as on a `succeeded` one, while the loop's task-level bookkeeping independently re-queues the task under REQ-ORCH-074. The two decisions answer different questions — whether a sibling has findings worth handing on, and whether the top-level task is finished — and neither constrains the other. Blocking dependents on a partial parent was rejected: it would discard findings already stored and strand a dependency graph on a task the loop fully intends to continue. | REQ-ORCH-112, REQ-ORCH-074 |
| 9 | RESOLVED | Visible diagnostic, never a silent skip. A change-model resolution that cannot be applied leaves the wait outstanding on the model it already had, persists no override, records a `model_override_rejected` issue naming the model asked for and why it could not be applied, and tells the user the model was not changed and the wait is still open, so the same choice can be retried or a different one taken. Silence was rejected on the strength of its worst case: a user who believes the model changed waits indefinitely on the model that had already failed, with nothing in the interface to contradict them. The issue-kind vocabulary gains `model_override_rejected`. | REQ-ORCH-091, Data & Formats |
| 10 | RESOLVED | The bundle is defined by capability against the registry's own declarations, so no name list has to be kept in step. It is todo management and delegation, the search, fetch and artifact-read capabilities, and every tool the public tool-name registry declares as reading workspace files, writing workspace files, or running commands (REQ-CONFIG-231). A tool added to that registry later joins the bundle, or stays out of it, by its own declaration with no amendment here — which is the same construction domain 15 already uses for `coordinator_only` and `read_only`, and makes the bundle the exact complement of the coordination-only profile rather than an independently drifting list. | REQ-ORCH-016 |
| 11 | RESOLVED | The keys are `small_model`, `fallback_model` and `default_summary_model` (REQ-CONFIG-064, REQ-CONFIG-065), consulted in exactly that order, so the resolution order is now testable. `fallback_model` is the run-level slot of REQ-CONFIG-065 and never the per-role fallback of REQ-ORCH-144: classification completes before the coordinator is initialized (REQ-ORCH-005), so no role exists yet whose overrides could be read. The names are taken from domain 15 rather than invented, so the three slots this domain consults are the three slots the user actually configures. | REQ-ORCH-009 |
| 12 | RESOLVED | Two answers. Tiers are exactly `small`, `medium`, `large`, ordered small < medium < large, plus the wildcard `any` which matches every tier when it appears in a matrix key and is never a role's own tier. A model's tier is the tier alias it resolves through (REQ-CONFIG-070, REQ-CONFIG-071) and a role's tier is that of its configured model, so the vocabulary is domain 15's and not a parallel one. The producer-to-consumer pairings are exactly two: `planner` and `architect` each produce for the role that will carry the work out, identified by the same mapping REQ-ORCH-022 already uses. No other pairing exists, so REQ-ORCH-020's downgrade-only substitution has a closed domain and REQ-ORCH-023's fall back to `medium` has a defined position in the order. | REQ-ORCH-019, REQ-ORCH-020, REQ-ORCH-022, REQ-ORCH-023 |
| 13 | RESOLVED | The per-user configuration directory of REQ-CONFIG-001 — `~/.config/rotaris/` on Linux, `~/Library/Application Support/rotaris/` on macOS, `%LOCALAPPDATA%\rotaris\rotaris\` on Windows — with overrides in its `playbooks/` subdirectory, mirroring the workspace-scope path exactly. Citing domain 15's directory rather than fixing a path of this domain's own keeps one directory for the whole product and means a platform convention only ever has to change in one place. | REQ-ORCH-026 |
| 14 | RESOLVED | `single` is a capability change, not advice, and the contradiction dissolves on REQ-ORCH-029's own wording: its constraints bind the entry role *while it acts as coordinator*, and `single` declares that for this run it does not. So under `single` the entry role is the worker, REQ-ORCH-029 does not apply to it, and it is granted the direct-work bundle whatever the classified intent is — making the override an input to REQ-ORCH-016's mapping, where the draft said it was not. The demand not to delegate is enforced structurally rather than instructed: the `delegate` tool is withheld from every role for the whole run, so no child is ever spawned and the whole delegation machinery is inert. This also matches REQ-CONFIG-263, which already strips the delegate tool from every role for a `single` delegation strategy. `swarm` is unaffected and stays instruction-only, with the coordinator keeping its coordination-only tool set. Narrowing `single` to the two simplest intents was rejected: a user who asks for one agent on a large feature has made a legitimate choice and should get it, not a silent downgrade. | REQ-ORCH-016, REQ-ORCH-025, REQ-ORCH-029 |
| 15 | RESOLVED | (a) Instructed, and explicitly never enforced. The run's own test of whether work is finished is the deterministic completion gate of REQ-ORCH-116, which rests on checks that actually executed; conditioning a terminal status on a role's declaration would put a model's assertion in front of deterministic evidence, which is the exact inversion REQ-ORCH-109 exists to prevent. Terminal status therefore continues to follow REQ-ORCH-082 and REQ-ORCH-083 from completed and abandoned task counts alone, and no status, stop reason or gate decision is ever made conditional on sign-off. (b) Per todo item and at no other granularity. An implementation delegation is one whose target role holds a tool the registry declares as writing workspace files (REQ-CONFIG-231). Two children on the same file for two different todo items are not a violation; two children on one todo item are, whatever files they touch. File- or directory-level ownership was rejected as unmeasurable at spawn time, since a delegation does not declare which files it will touch. | REQ-ORCH-028, REQ-ORCH-029, REQ-ORCH-116 |
| 16 | RESOLVED | All three parts. An attempt is one implementation delegation for the todo item, and it failed if its child reached any terminal state other than `succeeded`, or if the child succeeded but the verification evidence recorded for that item afterwards holds a blocking check `failed`. A `NEEDS_ITERATION` verdict is deliberately not an attempt: it judges an iteration, not a delegation, and counting it would let one delegation burn two strikes. The count is per todo item, accumulates across iterations of the run, and resets only when the item completes. The rule is run-enforced, not instructed — the fourth implementation delegation is refused with the error observation of REQ-ORCH-038, which is added to that requirement's rejection list — so no instruction text can spend a fourth attempt. Diagnosis delegations to `codebase-analyst` or `librarian` are never refused by this rule, so the escape route is always open. The failure report must convey the item that could not be completed and, for each attempt, what was tried and how it failed; its wording is the implementation's. | REQ-ORCH-030, REQ-ORCH-038, REQ-ORCH-028 |
| 17 | RESOLVED | The asymmetry is intended and is now stated with its reason instead of flagged. The completion gate decides whether the work is finished, so a blocking check that never answered its question leaves it unsatisfied; the delegation refusal exists only to stop the acceptance role being asked to bless a result already known to be red. Keying the refusal on `failed` alone is exactly what keeps acceptance reachable when checks timed out, were skipped, or were refused by policy — which is the case REQ-ORCH-129's list of checks that did not answer their question was written to hand it. Aligning the two would make that list unreachable and leave no role able to interpret an unanswered check. | REQ-ORCH-039, REQ-ORCH-116, REQ-ORCH-129 |
| 18 | RESOLVED | SHA-256 over the UTF-8 encoding of the name as it stood after the first three canonicalization steps and before any shortening — so the digest is taken over the already-normalized character set, not over the user's raw text, and two names that normalize alike also shorten alike. The suffix is the first 8 characters of the lowercase hexadecimal rendering. The separator is a single `-`, which is already in the permitted character set. A shortened name is therefore the first 71 characters of the pre-shortening result, then `-`, then the 8 characters, giving exactly the 80 that Data & Formats fixes. | REQ-ORCH-045 |
| 19 | RESOLVED | No maximum, and the requirement now says why rather than leaving it as a silence. Every child is bounded by the hard child timeout of REQ-ORCH-088, and every non-terminal child record is closed by the sweeps of REQ-ORCH-052 and REQ-ORCH-053, so the waited-for set always becomes terminal and a wait cannot outlive the children it waits on. A wait ends when that set is terminal or when the run is cancelled, and at no other time. A separate deadline is forbidden rather than merely omitted: it could only fire in a state those two guarantees already exclude, and firing it would resume a parent whose children still hold model slots — turning a bounded wait into a leak. | REQ-ORCH-062, REQ-ORCH-064, REQ-ORCH-088 |
| 20 | RESOLVED | Yes — a separate, smaller, independently configurable limit, default 3. Sharing the iteration limit's value made the per-task guard unreachable: a re-queued task is selected again by REQ-ORCH-067, so the per-task counter and the completed-iteration counter advance in step and REQ-ORCH-069's global stop always fires first. A guard that can never fire is no guard, so the value is split out and given a default small enough to catch a task cycling on its own long before the run's overall budget runs out. The configuration table gains the setting. | REQ-ORCH-077, REQ-ORCH-070, Data & Formats |
| 21 | RESOLVED | The queued prompt is evaluated first and wins outright; the two never extend one stop together. A queued prompt carries an explicit user instruction, which outranks a model's judgment that the original request is unmet. Where a queued prompt extends the run, relentless mode is not evaluated for that stop at all — it is evaluated afresh at the next stop the run reaches, by which time the queued prompt's own work is part of what it audits, which is strictly better than auditing against a request the user has since added to. Relentless mode is now stated to run only after REQ-ORCH-071 has been evaluated and has not extended the run. | REQ-ORCH-071, REQ-ORCH-079 |
| 22 | RESOLVED | Its own timeout, default 60 s, added to the configuration table. A failed, timed-out, or unparseable audit is not retried and does not extend the run: the run stops with the stop reason it already had, exactly as when the audit reports the request fully met. Failing open matches the rest of the document — REQ-ORCH-007's fallback intent and REQ-ORCH-113's `UNCLEAR` ≡ `COMPLETE` both make a model call that could not answer harmless — and the alternative would let a flaky provider hold a finished run open through repeated remediation phases. | REQ-ORCH-079, Data & Formats |
| 23 | RESOLVED | It should read differently, so a new rule 2 is inserted ahead of the old one and the rest renumber. A run that completed no task and abandoned no task reports status "completed" with severity information and a message conveying that it ended without resolving anything, naming the stop reason that ended it. Status "completed" is retained because nothing failed — "failed" would be a false alarm for a run that was, for instance, started with no pending task — but the message must not be the ordinary completion message, since a user who reads "Run completed" after nothing happened has been misinformed. The four literal message strings are converted to information content under the message-text decision, keeping the status token, the severity, and the counts or failure detail as the contract. | REQ-ORCH-082 |
| 24 | RESOLVED | Both classes are defined exhaustively. **Transient**: the call produced no usable answer for a reason outside the request's content and expected to differ on repetition — connection, DNS or TLS errors, request timeouts, HTTP 408, 425, 500, 502, 503, 504, and provider-signalled temporary overload. **Validation-class**: the provider answered but the answer did not satisfy the structured-output contract asked of it — unparseable JSON, schema violation, or a value outside a constrained enumeration. Everything else — authentication, authorization, an HTTP 400 that is not a context-window rejection, a missing or unknown model, a content-policy refusal — is neither and fails the child at once, which is what the requirement's final sentence already provided for. Precedence is stated so the budgets cannot double-count: rate-limit and quota failures including HTTP 429 are handled by REQ-ORCH-091 before this requirement is reached, and a context-window rejection by REQ-ORCH-093, so neither is ever spent from the transient budget. | REQ-ORCH-092, REQ-ORCH-091, REQ-ORCH-093 |
| 25 | RESOLVED | The six identifiers, in the order the requirement's own prose describes them, are `work_performed`, `answered`, `bookkeeping_only`, `malformed_tool_call`, `text_only`, `no_activity`. They are exact wherever a category is recorded, which makes the `incomplete_execution` issue testable in both directions — a conformance test can assert the identifier as well as the fact that an issue was raised. `answered` and `text_only` are named separately because REQ-ORCH-095 already treats them differently: `answered` is accepted outright on an answer-only route, and both may end as a text-only success after the single re-prompt. | REQ-ORCH-095, Data & Formats |
| 26 | RESOLVED | The existing `circuit_breaker_escalation`, with no new issue kind. REQ-ORCH-096 already routes repeated stuck reports through the same consecutive-activation rule as REQ-ORCH-102 and escalates through REQ-ORCH-106, so it is literally the same escalation reaching the same place by the same counter; giving it a second kind would split one condition across two names for consumers of the diagnostics. What tells the two occasions apart is the issue's reason, which states that stuck-recovery was exhausted. | REQ-ORCH-096, REQ-ORCH-106 |
| 27 | RESOLVED | The summary is the child's own final response, taken from its head and capped at 220 characters — the same cap REQ-ORCH-110 already applies to its no-model fallback, so one number governs every model-free summary in the domain — with a truncation marker stating how many characters were omitted where it was longer. Nothing of the run's own composition is added. That is what keeps the deterministic path honest: a summary produced without a model must not read as an assessment, and quoting the child verbatim is the only construction that cannot. | REQ-ORCH-111, REQ-ORCH-110 |
| 28 | RESOLVED | (a) A scan for the same three markers to a maximum depth of 3 directory levels below the workspace root, skipping any directory whose name begins with `.`, any directory the workspace's version-control ignore rules exclude, and the conventional dependency and output directories `node_modules`, `venv`, `.venv`, `dist`, `build`, `target`. At most 25 subproject roots are considered, in ascending lexicographic order of workspace-relative path, and exceeding that is recorded in the run-configuration record so a large monorepo degrades visibly instead of silently. Bounding depth and count keeps detection from becoming a full-tree walk on every run. (b) A command "cannot be launched" only when it never became a running process — executable not found, permission refused by the operating system, working directory absent, or the run's permission policy refused it. A command that started and exited with any status, zero or not, has launched, and its result is recorded under REQ-ORCH-123 rather than falling through to the next candidate. The line is drawn there so that a failing test suite can never be mistaken for a missing tool and quietly replaced by a weaker check. | REQ-ORCH-122, REQ-ORCH-123 |
| 29 | RESOLVED | Role `test` only, and by an explicitly declared pattern rather than a heuristic. A check may declare a `failure_pattern` regular expression; where one is declared and matches the check's combined standard output and standard error, the check is recorded `failed` whatever its exit status, and a check declaring none is recorded on exit status alone. The synthesized `pytest -q` check declares a pattern matching pytest's own failure-summary line; the synthesized `npm test` and `make test` checks declare none, because what those commands print is decided by the project rather than by this product, and a guessed pattern would silently fail a passing suite. An uncompilable pattern is a load-time configuration error, reported like a duplicate check name. The field is added to the per-check configuration in Data & Formats. | REQ-ORCH-123, REQ-ORCH-122, REQ-ORCH-143, Data & Formats |
| 30 | RESOLVED | (a) 5 seconds, matching the settle period REQ-ORCH-133 already uses for cancellation, so one number governs how long this domain waits for a process to honour a signal. (b) Yes — an explicit user skip is exempt from gating and consumes no repair budget, and the check is marked user-initiated to distinguish it. Gating on it would trap the run in the repair loop of REQ-ORCH-118 re-running the very check the user had just chosen to stop, with no way out that the user controls. The exemption is drawn narrowly: it belongs to a skip the user asked for and to nothing else, so a permission refusal or an exhausted suite budget still gates on exactly the terms of REQ-ORCH-116, and the gate decision names every user-skipped check so the record shows which question went unanswered and on whose decision. REQ-ORCH-116's exception list grows from one entry to two. | REQ-ORCH-128, REQ-ORCH-116, REQ-ORCH-118, REQ-ORCH-120, Data & Formats |
| 31 | RESOLVED | Exactly two run types. A `task` run carries a top-level user task through the iteration loop — every run the rest of the document describes. A `maintenance` run is one the product starts for its own upkeep and which carries no user task; the detached gate-authoring task of REQ-ORCH-126 is the only one this document defines. Only a `task` run performs the improvement pass, which is what the requirement's skip condition needed in order to be testable. Two values were chosen over a longer taxonomy because the distinction the requirement actually draws is binary — is there a user task whose conduct is worth learning from — and a richer vocabulary would invent categories nothing consumes. | REQ-ORCH-137, REQ-ORCH-126 |

## Cross-domain consequences

- **Exit codes.** Domain 20 (`REQ-EVENTS-025`, `REQ-EVENTS-026`) mapped this domain's run statuses
  onto process exit codes for a command-line surface. The status vocabulary is unchanged and remains
  citable; the numeric codes are no longer stated here, so that mapping had no counterpart in this
  domain and was domain 20's to withdraw under its own sweep. It did: REQ-EVENTS-025 is withdrawn,
  and REQ-EVENTS-026 now cites REQ-ORCH-083's set rather than holding a copy of it.
- **Model slots.** REQ-ORCH-009 now names `small_model`, `fallback_model` and
  `default_summary_model` from REQ-CONFIG-064 and REQ-CONFIG-065 rather than describing them, and
  states that the run-level `fallback_model` is meant, not the per-role fallback of REQ-ORCH-144.
- **Model tiers.** The `small`/`medium`/`large` vocabulary and its ordering are read from the tier
  aliases of REQ-CONFIG-070 and REQ-CONFIG-071 rather than defined afresh.
- **Playbook global scope.** REQ-ORCH-026 now resolves the global override directory to the
  `playbooks/` subdirectory of the per-user configuration directory of REQ-CONFIG-001.
- **`single` delegation strategy.** REQ-ORCH-025 now withholds the `delegate` tool from every role
  for the run, which is the behavior REQ-CONFIG-263 already describes for the `single` delegation
  strategy. The two are now the same rule stated in two domains.
- **Tool capability declarations.** REQ-ORCH-016, REQ-ORCH-028 and REQ-ORCH-153 resolve the
  direct-work bundle, the definition of an implementation delegation, and the plan gate's spawn
  restriction against the per-tool declarations of the public tool-name registry (REQ-CONFIG-231).
  **The owner named here is the wrong one, and has been since the fifth reconciliation round.**
  REQ-CONFIG-231 states in its own text that it fixes the referential-validation rule alone and owns
  no capability, and until the sixth round no requirement in any domain stated the classification
  these three read. The sixth round put it in REQ-TOOLS-001, which now declares the three facets —
  reads workspace files, writes workspace files, runs commands — as part of the registry it owns.
  These three requirements have not yet been re-pointed at it and still cite REQ-CONFIG-231; that
  belongs to the next round and is recorded as open in `../../clean-room/provenance.md`.
  **Executed in A4's round, 2026-09-13.** All three now cite REQ-TOOLS-001 for the classification they
  read. REQ-CONFIG-231 keeps the referential-validation rule it does own and is no longer cited here for
  a capability it never carried. The round that did it was the one amending REQ-ORCH-153 anyway, which is
  why it was taken here rather than left for a sweep of its own.
- **New configuration settings.** Four settings are added to this domain's table and will need
  entries in the settings domain: the per-task consecutive-retry limit (default 3), the relentless
  audit timeout (default 60 s), the run-start mode (default `auto`), and the per-check
  `failure_pattern`.
  **Executed in the sixth reconciliation round, five rounds after it was written.** Three of the four
  needed a key in domain 15 and had none: `task_consecutive_retry_limit` is now REQ-CONFIG-474,
  `relentless_audit_timeout` REQ-CONFIG-475, and the run-start mode key REQ-CONFIG-476, each
  registering the key, its type and its default and holding no copy of the rule here that consumes
  it. The fourth needed nothing there — `failure_pattern` is a field of a check declaration, which
  this domain states itself. A sentence in a resolution record saying another domain "will need" a
  requirement is not a requirement, and nothing in the first five rounds was looking for one.
- **New vocabulary.** The timeline-event vocabulary gains `plan_gate_opened` and
  `plan_gate_resolved`; the issue-kind vocabulary gains `model_override_rejected`; the session
  execution status gains `awaiting_plan_decision`. Domains consuming this domain's diagnostics
  should expect all three.
  **Checked in the sixth reconciliation round, and only one of the three was owed anywhere else.**
  The session execution status is REQ-SESSION-073's closed vocabulary, so `awaiting_plan_decision`
  had to be admitted there and is: domain 07 carries it, and REQ-SESSION-076 maps it. The
  timeline-event and issue-kind vocabularies are this domain's own and no other document enumerates
  either, so `plan_gate_opened`, `plan_gate_resolved` and `model_override_rejected` were owed to
  nobody. "Domains should expect" was the wrong form of words for the one obligation that was real.
- **New surfaces.** The plan gate (REQ-ORCH-153, REQ-ORCH-154) and the surface set closed by
  REQ-ORCH-155 are new obligations on the desktop shell domain, within the views of REQ-SHELL-023.
  **Executed in the sixth reconciliation round.** REQ-SHELL-168 is the shell domain's answering
  requirement: it states that this window hosts those surfaces, that each is presented inside the
  primary view the run belongs to and offers its actions in the one action vocabulary of
  REQ-SHELL-048, that it holds no copy of what each surface must convey, that window-level Escape
  never answers the gate, and that a session waiting at the gate is not an active run for the close
  guard of REQ-SHELL-119. Between this record and that round the obligation was recorded and
  unanswered.

## A4 — the root execution record and the planning execution path (2026-09-13)

Item **A4** of the accepted review (`../../../SPECIFICATION_REVIEW.md`) found a contradiction this record
left standing across two of its own dispositions. Disposition **2** built the plan gate and disposition
**14** made `single` a capability change; read together with the iteration mechanics, the three
requirements said incompatible things.

**What each said, kept beside its replacement.**

- **Disposition 14** concluded that under `single` "no child is ever spawned and the whole delegation
  machinery is inert", and REQ-ORCH-025 said so. **REQ-ORCH-072 spawns the root child at the start of
  every iteration of every run.** Both cannot be true. The word "child" was carrying two meanings: the
  run's own root agent, and an agent another agent delegated to. The outcome of disposition 14 stands
  unchanged — the `delegate` tool is withheld from every role, the delegation machinery is inert — and
  what changed is the vocabulary: REQ-ORCH-025 now says **no delegated child**, and REQ-ORCH-072 calls
  the run's own record the **root execution record** and states in its own text that it is not a
  delegated child. It arrives through no `delegate` call, counts against none of REQ-ORCH-046's
  admission limits, holds no model slot of REQ-ORCH-050, and is not presented as a task agent. That
  reading is the one the rest of the corpus already took: REQ-MONITOR-043 and REQ-MONITOR-089 both call
  it "the run's synthetic root", and REQ-CHAT-068 withholds the delegation-context header from it. Only
  REQ-ORCH-072 was out of step, and it is the sentence that changed.
- REQ-ORCH-072's clause that lookups "resolve for it" is kept and made precise rather than dropped: the
  root carries a canonical name and a task id in the same namespace a delegated child's identity lives
  in, so a lookup naming the root resolves to it. The parent-scoping of REQ-TOOLS-155 and REQ-TOOLS-156
  is untouched, so an agent that may not read a record it does not own is refused for **that** reason
  and is never told the root does not exist — the two refusals mean different things and a reader of the
  transcript can tell them apart.
- **Disposition 2** specified the gate as a restriction on spawning: "no child is spawned whose role
  holds a tool the registry declares as writing workspace files or running commands". **Under `single`
  the entry role holds exactly those tools**, by disposition 14. A gate stated only over spawning
  therefore either blocked a `single` run from starting at all or said nothing about the one agent that
  would do the writing. Neither is what the gate is for.

**The replacement.** The gate withholds **capability**, not the start. The run starts, its root execution
record is created with the entry role as REQ-ORCH-072 requires of every run, and while the gate is held
every agent — the entry role included — holds **planning grants**: the set it would otherwise hold, less
every tool declared as writing workspace files or running commands, with an undeclared tool counting as
declaring all three. The withholding is enforced **where a call is dispatched**, so it binds whatever
route a tool reached a role by and does not depend on any one role's configuration being right. The spawn
restriction disposition 2 wrote is kept beside it rather than replaced by it: a child whose role holds
such a tool is still refused admission, which tells the model why at the moment it asked. Approval
installs the execution grants for the remainder of the run.

**Two consequences worth stating.** A hold is not a termination — it raises no terminal status and no
terminal result, and the run the user answers is the run that reached the gate, whether or not the
process that hosted it outlived the hold. And the product's own recording is not the work the gate
blocks: the session, the plan, the todo state and the run's events stay writable throughout, because a
gate that stopped the product recording what it was doing would lose the plan it exists to obtain.

**Dependent contract.** A hook command withheld at the gate needed a reason, and REQ-HOOKS-126 declared
`"untrusted_workspace"` "the only defined reason". It now defines exactly two, the second being
`"plan_gate"`, emitted once per withheld invocation rather than once per session — the hold ends when the
user answers, and the same hook runs normally afterwards. The rationale REQ-HOOKS-126 already gave for
emitting anything at all is what settled it: a configured hook absent from the stream cannot be told
apart from one that ran and had no effect.

**Not decided here.** Whether the host process is released while the gate is held, how the answer reaches
the run, and where the mode is offered at run start are architecture and are owed by the build of
REQ-ORCH-152 to REQ-ORCH-154. What this round fixes is what the requirements say, not how the mechanism
is put together.
