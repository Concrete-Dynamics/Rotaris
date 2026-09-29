---
reference: ROTARIS-CRW-001
domain: library-artifacts-improvements
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 14, Library, Artifacts, and Improvement Proposals

> ## Amendment, 2026-09-29 — a child report's artifact falls back to the canonical name only without a task id (OQ-113)
>
> `REQ-LIBRARY-092` read "idempotent keyed on the task id (falling back to the canonical agent name)". Read as a fallback
> taken whenever the task-id lookup finds nothing, it let a later child whose name repeats an earlier child's rewrite the
> earlier child's report artifact in place, so that report was no longer materialized — against the requirement's own
> "Every terminal child report is materialized". The parenthesis now says the fallback serves only a record that carries
> no task id, so two children with different task ids never share or overwrite one artifact.
>
> **Why this is an amendment and not a directive.** The requirement disagreed with itself under the reading built; a
> clause that says when a fallback applies corrects it without changing what it was written to guarantee. The owner ruled
> OQ-113 as it recommended ([R-067](../../product/requests.md#r-067)); `open-questions.md` holds the ruling.

> ## Amendment, 2026-09-14 — history states gaps truthfully
>
> REQ-LIBRARY-168's statement that every artifact history is nonempty is superseded for an artifact
> whose ADR-0061 best-effort version operation failed. REQ-LIBRARY-051 continues to synthesize version
> 1 only for a pre-history artifact whose `versions_due` is zero. Once a write allocated a due version,
> an absent row is reported through `versions_never_recorded`; the history surface may therefore contain
> zero retained rows while stating the gap count. This keeps the inspection surface and REQ-LIBRARY-176's
> export aligned with REQ-LIBRARY-047's successful artifact write.


> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **Row 33** resolves the Windows retry ladder for the improvement store — "the attempt count is
>   contractual and so is the total bound; all 5 attempts must complete within 1 second". REQ-LIBRARY-043
>   no longer states any ladder, because no writer outside this application can reach a record in this
>   store. **This row must not be cited as evidence that a ladder survives anywhere:** OQ-44 forbids
>   borrowing a neighbouring store's constants to pretend one exists. The corpus states exactly one ladder,
>   REQ-SESSION-033's, and it governs the session summary file alone.
> - **Row 8** — the read-modify-write disposition stands; the **accepted interleaving loss it closed on
>   does not**. Under **ESC-18** the read-modify-write takes effect as one indivisible step, so two
>   genuinely interleaved review decisions on different proposals can no longer lose one another. ESC-3's
>   last-writer-wins semantics on the **same** proposal are untouched.
> - Any row treating `<workspace>/.rotaris/improvement_artifacts/<artifact_id>.json`, the
>   `history/<artifact_id>/<version>.json` layout, `rotaris-prompts.json` or `<session_dir>/artifacts/` as
>   settled file layouts now describes withdrawn mechanism. Every guarantee attached to those layouts was
>   re-homed before the mechanism went; see REQ-LIBRARY-042, -043, -047, -049, -087 and -138.
> - **The gap that block leaves is closed as of 2026-09-01.** Improvement artifacts were readable JSON
>   files a user could open for themselves before SR-4 made them records, and nothing replaced that.
>   **SR-9(a)**, ruled again under **ESC-20**, mints the export: REQ-LIBRARY-176 requires the workspace's
>   improvement artifacts to be obtainable as a file the user chooses, per artifact and for the whole
>   workspace, carrying the artifact container, each proposal with its evidence entries in stored order,
>   and the recorded version history REQ-LIBRARY-168 calls "the audit trail the write path keeps" — in
>   recorded order, none omitted, and with a statement where retention has pruned intermediate versions.
>   It cites REQ-EVENTS-166 for what an export must guarantee rather than restating it, and applies it on
>   the terms REQ-SESSION-199 fixes.
> - **Its boundary is worth reading before anyone widens it.** ESC-20 draws the export line on redaction
>   safety, not readership: a record gains an export when it carries no unredacted user or tool content.
>   REQ-LIBRARY-176 therefore carries the artifact exactly as stored and MUST NOT resolve an evidence
>   entry's `source_session_id`, `source_artifact_id` or `source_task_id` into the material those ids
>   name, because that material is REQ-SESSION-136's tool-call evidence, which never gains an export
>   (REQ-TOOLS-190). **This domain states no redaction obligation over an evidence entry's own excerpt**,
>   which REQ-LIBRARY-010 allows to hold quoted source text. That is not a defect introduced here — it
>   predates the export — but the export is what makes it consequential, and it is the one thing in this
>   area that may still need a product ruling.


This record disposes of every open question raised in the draft of
[`../14-library-artifacts-improvements.md`](../14-library-artifacts-improvements.md) (requirement
prefix `REQ-LIBRARY`). The body of that specification has been amended so that each decision below
is stated normatively in place; the original open-question numbering is preserved here so the draft
and the resolved specification can be read against each other.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** No obligation to match any other
   implementation's formats, command surface, exit codes, or event vocabulary. Under-determined
   cases are decided here on their merits.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   omitted rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement was dropped merely for describing
   intent.
4. **The product is one Electron desktop application, with no command-line interface and no
   terminal user interface.** Domains 17 and 18 are retired and the `REQ-TUI` and `REQ-CLI`
   identifiers are withdrawn. Requirements of this domain whose only observable surface was a shell
   invocation or a full-screen text-mode interface are **withdrawn**, and every capability they
   carried has been rescued into a new desktop-reachable requirement. See the graphical-only sweep
   below.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (an event field value, an enum, a parseable output format). Open
   questions asking only for phrasing of a human-readable message are resolved by fixing what the
   message must convey and leaving the wording to the implementation.

Cross-domain coherence was checked against `01-run-orchestration.md` (check auto-detection, check
status and completion-gate vocabularies, gate lifecycle record), `05-tools-permissions-approvals.md`
(probe verdicts), `06-git-worktrees-checkpoints.md` (integration runs, REQ-GIT-131),
`07-sessions-persistence.md` (the persisted run-type marker, REQ-SESSION-021),
`12-desktop-shell-windows.md` (view order REQ-SHELL-023, the shortcut table REQ-SHELL-049, the
single action vocabulary REQ-SHELL-048, demo mode REQ-SHELL-005 and REQ-SHELL-162, the per-user
preference store REQ-SHELL-006), `15-settings-configuration.md` (the `verifier` configuration
section, the check-entry schema, the improvement-collector keys REQ-CONFIG-118) and
`19-notifications-errors-recovery.md` (REQ-NOTIFY-254, no failure is reported by silence). No other
document was consulted.

New requirements added by this record: **REQ-LIBRARY-165** through **REQ-LIBRARY-175**. No
requirement identifier was renumbered, reused, or deleted.

## Graphical-only sweep

The product has no command line and no text-mode interface. Fourteen requirements of this domain
described only those surfaces and are withdrawn in place. Removing the entry point removed no
capability: each one below names the desktop requirement that now carries what it did.

| Withdrawn | What it was | Capability now carried by |
| --- | --- | --- |
| REQ-LIBRARY-079 | `improvements` command group, help text, `--workspace` flag | REQ-LIBRARY-166 and REQ-LIBRARY-167 (inspect the workspace's improvement artifacts); REQ-LIBRARY-169 through REQ-LIBRARY-171 (roll an applied improvement run back). Workspace selection is already a desktop capability (REQ-SHELL-010, REQ-SHELL-021). |
| REQ-LIBRARY-080 | Process exit codes 0 / 1 / 2 | REQ-LIBRARY-167 (artifact absent is reported), REQ-LIBRARY-170 (a declined confirmation changes nothing), REQ-LIBRARY-171 (a refused or failed rollback is reported with its reason). |
| REQ-LIBRARY-081 | `improvements list` padded-column text listing | REQ-LIBRARY-166 — desktop improvement-artifact list: id, generation time, whether a rollback point exists, per-status proposal counts. |
| REQ-LIBRARY-082 | `improvements show` detail and history text tables | REQ-LIBRARY-167 (artifact detail, rollback point, proposal table) and REQ-LIBRARY-168 (recorded version history, previously reachable from no other surface at all). |
| REQ-LIBRARY-083 | `improvements rollback` preview printing, `--force` | REQ-LIBRARY-169 — preview shown in a modal dialog before anything is written, with the per-path label vocabulary and the work-done-since warning. |
| REQ-LIBRARY-084 | Terminal confirmation prompt, `--yes`, non-interactive stdin refusal | REQ-LIBRARY-170 — explicit confirmation defaulting to Cancel, plus the separately activated override for the dirty-tree refusal only. |
| REQ-LIBRARY-085 | Success output lines | REQ-LIBRARY-171 — persistent success notice conveying files changed, proposals returned to `pending_review`, and the safety checkpoint. |
| REQ-LIBRARY-086 | Output contract binding the command group's text | REQ-LIBRARY-164 — the cross-surface obligation is agreement about stored state, which survives without the command group. |
| REQ-LIBRARY-144 | Text-mode review screen, header, key bindings | REQ-LIBRARY-109, REQ-LIBRARY-110, REQ-LIBRARY-166, REQ-LIBRARY-167 (review one artifact's proposals); REQ-LIBRARY-175 (the `p` reset-to-pending decision, which no desktop surface previously offered). |
| REQ-LIBRARY-145 | Text-mode proposal table and status labels | REQ-LIBRARY-109 (columns and status labels), REQ-LIBRARY-111 (selection kept by proposal id), REQ-LIBRARY-164 (same on-disk review semantics). |
| REQ-LIBRARY-146 | Reload on a vanished proposal; persistence-failure notice | REQ-LIBRARY-173 — desktop handling of a store that moved underneath the user, and of persistence, listing and loading failures. |
| REQ-LIBRARY-147 | `s` — start an improvement run from the review screen | REQ-LIBRARY-172 — "Start improvement run" on the improvement-artifact detail, including the nothing-approved and failed-start reports. |
| REQ-LIBRARY-148 | Text-mode palette entry, cheatsheet entry, `/improvements` | REQ-LIBRARY-174 — an "Improvement proposals" entry in the window's single action vocabulary (REQ-SHELL-048), so it appears in the command palette and the composer's slash catalogue, plus the no-artifacts and failure states. |
| REQ-LIBRARY-149 | Reachability without depending on a notification | REQ-LIBRARY-174 — the same guarantee, stated for the desktop entry points. |

Two further consequences of the sweep, applied to requirements that were not themselves
shell-surface requirements:

- REQ-LIBRARY-074, REQ-LIBRARY-163 and REQ-LIBRARY-072 no longer speak of a `--force` flag; the
  dirty-tree override is the deliberate user choice of REQ-LIBRARY-170.
- REQ-LIBRARY-158 and REQ-LIBRARY-164 no longer name the terminal-UI review screen or a fresh CLI
  invocation as surfaces that must agree; the Overview and the Data & Formats section were amended
  to match, and the CLI output-format block was replaced with the desktop inspection and rollback
  contract.

## Dispositions

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | The bounds are fixed constants, identical in every workspace and deliberately not configurable: at most 200 most-recent transcript events, each cut to 2,000 characters with the whole transcript block cut to 40,000; at most 100 most-recent run-progress entries; at most 200 todo items; at most 20 child reports, each cut to 4,000 characters with the block cut to 60,000; the rendered gate-evidence text cut to 8,000 characters; and the at most 5 prior artifacts of REQ-LIBRARY-034 rendered to 4,000 characters each. Where more material exists than a bound admits, the most recent is kept, so evidence always ends at the run's terminal state. Every cut is marked `…`. Constants rather than settings is the point: the result a user sees must not vary with how the workspace was configured or how large the run grew. | REQ-LIBRARY-018, new REQ-LIBRARY-165 |
| 2 | RESOLVED | Within each of the two status groups, artifacts are ordered newest first by creation time with ties broken by ascending artifact id — a total order, so two readings of the same session produce the same block — and artifacts are dropped from its tail until the 10,000-character budget is met. The elision marker must state how many artifacts were left out and name the `artifact_list` tool as the way to reach them; its exact wording is left to the implementation, being human-readable text. `published` was added alongside `succeeded` as a successful status, matching the closed set fixed under OQ 30. | REQ-LIBRARY-097 |
| 3 | RESOLVED | Yes, 200 history entries and 100 stash entries are the intended limits, and neither is configurable; no key of any scope changes them. The reasoning is stated in the requirement: this is a convenience store, not the record of work — the durable record of what a run was asked to do lives in the session — so silently dropping the oldest entries loses nothing unrecoverable, and a setting would buy nothing worth its surface area. | REQ-LIBRARY-139 |
| 4 | MOOT | The question asked only what a full-screen text-mode interface should announce. There is no such interface. REQ-LIBRARY-149 was withdrawn in the graphical-only sweep; the reachability guarantee it carried now lives in REQ-LIBRARY-174, which makes proposals reachable from the command palette and the composer's slash catalogue whether or not any notice was seen. The desktop's own proactive announcement is already specified by REQ-LIBRARY-124 and needed no new decision. | REQ-LIBRARY-149 (withdrawn), REQ-LIBRARY-174 |
| 5 | RESOLVED | The asymmetry is removed rather than defended. Keeping and removing become two separate stash actions on the Prompts tab, exactly as they already are in the stash dialog: a secondary "Use" button and a double-click copy the prompt and leave the entry in place, and only a primary "Use and remove" button takes it out of the stash, keyed by the entry's original index so a filtered view removes the right item. Prompt history offers no removal at all. Emptying the stash is therefore always deliberate, and no user loses a stashed prompt by doing the obvious thing. | REQ-LIBRARY-106, REQ-LIBRARY-107 |
| 6 | RESOLVED | Undo always re-reads the stored artifact and acts on what it finds there, never on the state the notice was posted from, and it never creates, restores, or repairs anything. If the proposal or its artifact is gone, Undo writes nothing and reports that what it would have reverted no longer exists. If the status changed again from another surface in the meantime, Undo writes nothing, reports that the proposal has since changed and names the status it now holds, and leaves the newer decision standing — an undo must never silently overwrite a decision the user made after it. In both cases the Undo action is spent and is not offered again, and the surfaces re-read the store. | REQ-LIBRARY-116 |
| 7 | RESOLVED | The silence is not intended and is withdrawn; it also contradicts REQ-NOTIFY-254, which forbids reporting a failure by silence. A job that ended without producing an artifact for any reason other than cancellation now publishes a warning notice conveying that the completed run could not be reviewed for improvements, naming the run, and carrying the reason. It offers no action, because there is nothing to review. Cancellation stays silent, being something the user asked for. The application-log entry of REQ-LIBRARY-035(b) is kept in addition. The run itself is unaffected (REQ-LIBRARY-161). | REQ-LIBRARY-124 |
| 8 | RESOLVED | Neither reading is dropped; the tension is removed by fixing how a mutation is performed. Every mutation is a read-modify-write against what the store holds at that moment: the writer re-reads the artifact file immediately before applying the change and writes back that freshly read state, never a copy a surface has been holding on screen. Decisions on different proposals of the same artifact therefore both survive whenever the later writer's read follows the earlier writer's replacement, and only genuinely interleaved read/write pairs can lose a change — in which case the later complete replacement wins whole and no reader ever sees a partial file. REQ-LIBRARY-164's guarantee is restated as what it always was: agreement about what the store holds, not a promise that no decision can be overwritten. | REQ-LIBRARY-042, REQ-LIBRARY-158, REQ-LIBRARY-164 |
| 9 | RESOLVED | Visual qualities are not contractual. What is contractual is enumerated instead: when each indicator is present and absent, its label, its accessible name and description, that the activity is never conveyed by colour or animation alone (REQ-SHELL-149), that any animation obeys the reduced-motion rule (REQ-SHELL-135), and that the added indicators leave every control reachable and fully labelled at the minimum window size (REQ-SHELL-022). Size, colour, pulse cadence, rendered appearance, and table layout at varying window sizes are governed by the shell's theming and responsiveness requirements, not here. The run-header indicator's accessible description is required to convey the same three facts as the title-bar one — a completed run is being reviewed, in the background, and the user can continue working — with wording left to the implementation. | REQ-LIBRARY-125 |
| 10 | RESOLVED | No further guarantee. What REQ-LIBRARY-016 enumerates is the whole of what the product promises about an analysis pass. Whether a proposal is useful, novel, or non-speculative is a property of the model's judgement, is not decidable by the product, and is therefore not stated as a requirement — a requirement no build could be failed against is worse than none. The product's answer to a poor proposal is the human gate: it is rejected, and a rejected proposal suppresses nothing later (REQ-LIBRARY-030, REQ-LIBRARY-046), so turning one down costs the user nothing in future analyses. | REQ-LIBRARY-016 |
| 11 | RESOLVED | Only the four things the Library shows. A "library change" is exactly a change to the prompt history, the prompt stash, the session artifact store, or the workspace's improvement artifacts. Nothing else is one: a settings change that touches none of them — enabling a tool server, switching a skills mode, changing a model slot — neither rewrites the saved-prompts file nor rebuilds the Library's tables. The same definition governs the refresh cycle of REQ-LIBRARY-105, the save of REQ-LIBRARY-138, and the slash-catalogue rebuild of REQ-LIBRARY-142, so the three can never key off different events. | REQ-LIBRARY-105, REQ-LIBRARY-138, REQ-LIBRARY-142 |
| 12 | RESOLVED | The sample prose is deliberately not fixed; the seed is specified as checkable properties instead. All three Library tabs must be non-empty; the sample proposals must cover every status and every risk level and must come from at least two improvement artifacts, so the artifact list and its filtering are both exercised; the sample artifacts must include one of each `kind` and at least one hand-edited record so the ` · edited` marker is visible; and every sample value must read as sample data rather than as a real workspace's contents. Read-only is evident before any attempt: every mutating control is visibly disabled and says in its accessible description that demo mode is read-only, with the REQ-LIBRARY-119 refusals kept as the answer to an action that is reached anyway. | REQ-LIBRARY-143 |
| 13 | RESOLVED | Exactly the markers the check auto-detection of REQ-ORCH-122 already recognises at the workspace root or at a subproject root — `pyproject.toml`, `package.json`, `Makefile` — read by the rules that requirement fixes, and nothing else. No other file, directory, or convention makes a role present, and a marker that cannot be read or parsed makes none present and does not fail the capture. This was already stated normatively in REQ-LIBRARY-031; the decision confirms it and declines to invent a second, improvement-specific detection rule that could drift from the orchestration one. | REQ-LIBRARY-031 (confirmed, unchanged) |
| 14 | RESOLVED | The distinction is observable and the requirement stays. Two consequences are visible to a reader of the artifact file: every one of the six sources that could not be obtained is named in the produced artifact's `notes`, while a source that was obtained and reported nothing is not, so an analysis made without the transcript is distinguishable from one made over an empty transcript; and a gate proposal made without a known state or fingerprint carries the literal `unknown` in the rendered text of REQ-LIBRARY-029 rather than asserting a state nobody observed. Both are checkable from the stored file alone, so this is not an internal-only distinction. | REQ-LIBRARY-019 (confirmed, unchanged) |
| 15 | RESOLVED | The key names are fixed and are exactly: `state`, `config_fingerprint`, `suite_origin`, `suite_declaration`, `checks` (each entry `name`, `command`, `role`, `severity`, `cwd`), `probes` (each entry `command`, `role`, `verdict`, `note`), `outcomes` (each entry `name`, `status`, `exit_code`), `unrunnable_checks`, and `uncovered_roles`. Their value vocabularies are borrowed rather than reinvented: `state` from the completion-gate decision of REQ-ORCH-116, `config_fingerprint` from the gate lifecycle record of REQ-ORCH-125, `role` and `severity` from REQ-CONFIG-145, `status` from REQ-ORCH-123, and `verdict` from REQ-TOOLS-159. A value that was not observed is JSON null or absent, never the string `unknown`. REQ-LIBRARY-027 already carried this; the Data & Formats summary was corrected to match. | REQ-LIBRARY-027 (confirmed), Data & Formats "Gate evidence mapping" |
| 16 | RESOLVED | The machine-shaped parts are fixed and the prose is not. A probe line reads `'<command>': <verdict> — <note>`, the form REQ-TOOLS-159 fixes; an outcome line begins `outcome <name>: <status>` with the status from REQ-ORCH-123. Ordering is total: per-check lines follow the resolved check suite's declaration order, outcome lines follow that same order, and probe lines follow it too with probes of commands no configured check declares placed after them. The two closing sentences must convey, respectively, every check that did not answer its question and therefore demonstrated nothing, and every verification role the workspace carries a marker for but no check covers; their wording is left to the implementation, subject to one rendering being used everywhere so the text a person reads and the text stored in an evidence entry can never differ. | REQ-LIBRARY-028 (confirmed, unchanged) |
| 17 | RESOLVED | SHA-256, truncated to its first 16 lowercase hexadecimal characters, over a canonical UTF-8 JSON encoding of a two-member object `{section, situation}` where `situation` holds `state`, `config_fingerprint`, `unrunnable_checks` and `uncovered_roles`. Canonical means: every object member ordered ascending by the Unicode code points of its key; `unrunnable_checks` and `uncovered_roles` each deduplicated and sorted ascending by code point; an unobserved `state` or `config_fingerprint` written as JSON null; and no insignificant whitespace. Two implementations reading the same workspace therefore compute the same key from the same suggestion, which is the whole point of fixing it. | REQ-LIBRARY-029 (confirmed, unchanged) |
| 18 | RESOLVED | The `verifier` section of the layered configuration surface — REQ-CONFIG-139 through REQ-CONFIG-144 together with the check-entry schema of REQ-CONFIG-145 — as the running build enforces it. There is no second, improvement-specific gate schema and none that is separately versioned. The same validation decides acceptance at construction time and again when the block is applied (REQ-LIBRARY-063), so a block that has become invalid because the configuration schema moved on is refused at application time rather than written. Deliberately one schema and one version: two would let a proposal be valid when authored and silently wrong when applied. | REQ-LIBRARY-009 (confirmed, unchanged) |
| 19 | RESOLVED | Exactly four: `applied` (the block was written and the gate configuration now differs), `unchanged` (the block was already in effect, so the write changed nothing), `invalid` (the block no longer validates and was not written), and `failed` (validation passed but the write did not complete). Only `applied` and `unchanged` count as the proposal having been applied; `invalid` and `failed` leave both the gate configuration and the proposal's status exactly as they were. The `unchanged` value earns its place by keeping a no-op distinguishable from a refusal. | REQ-LIBRARY-063 (confirmed, unchanged) |
| 20 | RESOLVED | The label vocabulary is closed at three values, each stated from the user's side: `delete` for a path the run created, which the rollback removes; `restore` for a path the run deleted, which the rollback brings back; and `revert` for a path the run modified, which the rollback returns to the content the checkpoint recorded. Every previewed path carries exactly one of them. The nine-character padding was a text-output artifact and went with the withdrawn CLI. The repository-inspection-failure sentence must name the improvement, convey that the workspace's Git repository could not be inspected and so no rollback can be previewed, and carry the reason the inspection gave; its wording is left to the implementation. | REQ-LIBRARY-072, REQ-LIBRARY-083 (withdrawn), new REQ-LIBRARY-169 |
| 21 | RESOLVED | Neither is settable. History retention stays 25 versions and checkpoint retention stays 10 per artifact, both fixed by this document, and the configuration surface of this domain remains exactly the three keys of section 6 — no key of any scope changes either. Both bound storage the user never asked for and never sees except through the surfaces this domain provides; a setting would add a way to break the guarantees that version 1 and the newest version always survive (REQ-LIBRARY-052, REQ-LIBRARY-162) and that an artifact cannot lose its rollback point to pruning (REQ-LIBRARY-071). REQ-LIBRARY-052 keeps stating the rule for a general keep count N so that the rule is well defined at every value, not so a user can choose one. | REQ-LIBRARY-052, REQ-LIBRARY-071 |
| 22 | RESOLVED | A one-time informational notice, never a startup failure and never silence. The default-on setting with no resolvable model still takes the no-analyst path — no job captured, no artifact written — but the first time a task run in that workspace reaches a terminal state in that condition, the product posts one informational notice conveying that improvement analysis is switched on, that no model is configured for it, and that no proposals will be produced until one is, with an action opening the Settings view at the improvement-collector model slot. At most one such notice per workspace per application session, so a misconfiguration never becomes a notice after every run. A startup failure is expressly refused: an optional analysis that is not configured must never stop a user from working. | REQ-LIBRARY-037 |
| 23 | RESOLVED | Restoration subject to the repository's normalisation is canonical. A restored path must hold exactly the content a fresh checkout of that checkpoint would produce in this working tree under the repository's configured normalisation — not necessarily the same bytes the path held before the run. Byte-identical restoration was the weaker claim to keep, because the rollback restores through the repository and cannot override the repository's own configuration without becoming a second, competing checkout mechanism. Where the two differ, the difference is a property of the repository's configuration and is not reported as a rollback anomaly; reporting it would train users to distrust correct rollbacks. | REQ-LIBRARY-077 |
| 24 | RESOLVED | Shutdown never blocks on an outstanding provider call. The call is abandoned, whatever it eventually answers is discarded unread, and no artifact, notice, or log entry attributable to it may appear afterwards — so there is no wait to bound. The time from the user asking to quit to the process exiting must not depend on whether an analysis was in flight, which is the only reading consistent with REQ-LIBRARY-024 (the provider may never answer) and REQ-LIBRARY-127 (shutdown leaves nothing behind) both holding. An unreachable provider can therefore never hold a quit open. | REQ-LIBRARY-024, REQ-LIBRARY-127 |
| 25 | MOOT | The question was entirely about a text-mode message pointing at a command line. Both surfaces are gone: REQ-LIBRARY-147 was withdrawn in the graphical-only sweep, and REQ-LIBRARY-079 took the `improvements` command group with it. Applying approved proposals is now a desktop action — the "Start improvement run" control of REQ-LIBRARY-172 on the improvement-artifact detail — so there is no command to name and no message to correct. | REQ-LIBRARY-147 and REQ-LIBRARY-079 (withdrawn), REQ-LIBRARY-172 |
| 26 | RESOLVED | The search considers every checkpoint the artifact still retains and is not narrowed further. Retention already bounds that list to at most 10 records per artifact (REQ-LIBRARY-071), so the search is bounded without inventing a second limit — and a second limit could only cause the failure the question worries about, a still-retained post-run checkpoint passed over for being old, which would report work done by the run itself as work done since it. The stated no-post-run-checkpoint behaviour (nothing at risk, no block) already covers the case where retention has dropped every post-run record. | REQ-LIBRARY-073 |
| 27 | RESOLVED | Domain 06 owns it, and this domain must not redefine it. The run-type marker is the persisted marker of REQ-SESSION-021, stamped at session creation and never changed on resume; the runs carrying the `integration_run` value are the hidden worktree-integration runs of REQ-GIT-131. This domain consumes the value and does exactly one thing with it — treats it as ineligible for analysis, exactly as `improvement_run` is. Naming the owner rather than restating the definition is what keeps the two documents from drifting. | REQ-LIBRARY-002 |
| 28 | RESOLVED | The two link fields are `timeline_event_id` and `conversation_id`, both nullable and both null until the link exists. A sidecar section with no content is omitted entirely — no heading, no placeholder line — so a reader never has to tell an empty section from an absent one, and a record carrying only a body renders as frontmatter, title, and nothing else; the sections that are present keep the fixed order. The frontmatter follows the same rule for its optional members: the link fields, the other source ids, `tags`, and the supersession links are written only when the record holds them. | REQ-LIBRARY-088, REQ-LIBRARY-090 |
| 29 | RESOLVED | Domain 12 is canonical and this domain stops restating the contract. REQ-SHELL-023 fixes the seven views and their order; REQ-SHELL-049 fixes the shortcut table that binds `Ctrl+1` through `Ctrl+7` to them in that order. REQ-LIBRARY-102 now requires only that the Library is one of those views, carries the navigation label "Library", and is reachable by whatever key REQ-SHELL-049 assigns it — so if that assignment ever moves, this requirement follows rather than contradicts it. Deep-linking to a named tab stays this domain's, because the tabs are this domain's. | REQ-LIBRARY-102 |
| 30 | RESOLVED | Exactly five: `succeeded`, `failed`, `blocked`, `partial` — the four a materialised child report may carry, and the four the sibling-index ordering keys off — together with `published`, which only an agent publish produces. That makes "ready" (REQ-LIBRARY-136) exactly `succeeded` or `published` and the unsuccessful group of REQ-LIBRARY-097 exactly the other three, so the three requirements that read this field can no longer disagree about it. A record carrying any other value fails validation and is skipped by hydration. | REQ-LIBRARY-088, REQ-LIBRARY-097, REQ-LIBRARY-136 |
| 31 | RESOLVED | Normalised, then matched: surrounding whitespace stripped and the remainder compared case-insensitively, so ` Research ` is the tag `research` and is accepted. A tag that still does not match is rejected, and the error names it as the user supplied it rather than in normalised form, so the message points at what was actually typed. A repeated tag is collapsed to one occurrence rather than rejected — a duplicate expresses no ambiguity, so refusing a whole publish over it would be gratuitous — and the record stores tags normalised, in order of first occurrence. | REQ-LIBRARY-089 |
| 32 | RESOLVED | Only prompts actually sent to a run or queued for one are recorded; REQ-LIBRARY-137 is canonical and REQ-LIBRARY-142's contrary sentence is removed. Composer text the window consumes as a slash command is handled locally, becomes neither a sent nor a queued prompt, and is not recorded — recording it would fill the history a user reaches for with commands rather than with the prompts they wrote, which defeats the feature. Text that merely begins with a slash without being a recognised command is ordinary prompt text and is recorded once sent or queued. | REQ-LIBRARY-137, REQ-LIBRARY-142 |
| 33 | RESOLVED | The attempt count is contractual and so is the total bound; the individual delays are not. Each retry is preceded by a non-zero pause, and all 5 attempts must complete within 1 second of the first, so a file another process is momentarily holding delays a save by at most that long before the failure is reported. The growth pattern between attempts is an implementation choice, is not observable, and must not be relied on. Bounding the total rather than the steps is what makes the guarantee testable — a save can never hang on a held file — without pinning a backoff curve. | REQ-LIBRARY-043 |


> ## Amendment, 2026-09-02 — ESC-30, and the export destination's ladder by citation
>
> *Recorded by the sweep pass rather than by the agent that made the amendment, so the record is not
> owed twice.*
>
> **ESC-30, ruled "make them distinguishable".** A version absent because retention pruned it and a
> version absent because the best-effort recording never wrote it mean different things to a user reading
> an audit trail: one is the record working as designed, the other is a hole in it. `REQ-LIBRARY-047`
> makes the version write best-effort and outside the all-or-nothing boundary, so both cases genuinely
> occur.
>
> **Where the obligation was put, and why there.** On the **store**, not on the export.
> `REQ-LIBRARY-047` now requires each artifact write to record, inside its own all-or-nothing operation,
> that a version was due for the state it stored — so a version the best-effort recording then failed to
> write is afterwards known to be absent and countable. What is retained must be enough to say **how
> many** were never recorded and must not be a copy of what any of them held. That mirrors how
> `REQ-LIBRARY-052` and `REQ-TRACE-405` already work, and follows `REQ-SESSION-133` as the named model:
> retain enough to say what was dropped, in the same durable operation.
>
> **The guards, so the amendment does not overreach.** Recording that a version was *due* is not
> recording the version, so nothing is brought inside the boundary that was outside it; version recording
> stays best-effort; a version that cannot be recorded still does not undo the artifact write; and the
> user's change still takes effect in a workspace whose versions cannot be written.
>
> **`REQ-LIBRARY-176` carries two figures, never one.** How many versions retention dropped
> (`REQ-LIBRARY-052`) and how many were never recorded (`REQ-LIBRARY-047`), each identified as which of
> the two it is, never merged, never stated without saying which it is, and each stated as **zero rather
> than omitted** where neither has occurred — because an omitted figure is ambiguous between "none
> dropped" and "not computed", which is the same reasoning as the requirement's existing empty-record
> rule. The zero clause was not in the ruling and is recorded here as an addition.
>
> **The cross-export guard.** `REQ-LIBRARY-176` may not carry either figure in a shape shared with the
> export of a store whose absences have only one cause, and `REQ-TRACE-514` states the reciprocal. One
> shared export mechanism is the natural implementation and it would emit one undifferentiated "dropped"
> field true of neither store.
>
> **`REQ-LIBRARY-052` gained one clause and no more**, pointing at `REQ-LIBRARY-047` as the owner of the
> other count, so its correct "this obligation covers versions pruning dropped and nothing else" no
> longer reads as implying the never-recorded case is uncounted.
>
> **The export destination.** `REQ-LIBRARY-176` writes to a file the user chooses, which may sit on
> removable media, on storage shared with another machine, in a synchronising client's folder, or in a
> directory where another application holds the previous export open. It **cites** `REQ-TRACE-061`'s
> retry ladder rather than stating a third one, and records in terms that this domain states no
> replacement ladder of its own. `REQ-LIBRARY-043`'s withdrawn ladder is **not** reinstated;
> `REQ-LIBRARY-158`'s reason for that withdrawal — no writer outside this application can reach a record
> in the store — was checked and does not reach a destination outside the store that the user named.
