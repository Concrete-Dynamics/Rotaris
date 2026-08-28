---
req-id: [SWR-1500, SWR-1501, SWR-1502, SWR-1503, SWR-1504, SWR-1505, SWR-1506, SWR-1507, SWR-1508, SWR-1509, SWR-1511, SWR-1512, SWR-1513, SWR-1514, SWR-1517, SWR-1518, SWR-1519, SWR-1520, SWR-1521, SWR-1522, SWR-1523, SWR-1524, SWR-1525, SWR-1526, SWR-1527, SWR-1528, SWR-1529, SWR-1530, SWR-1531, SWR-1532, SWR-1533, SWR-1534, SWR-1535, SWR-1537, SWR-1538, SWR-1539, SWR-1540, SWR-1541, SWR-1542, SWR-1543, SWR-1544, SWR-1545, SWR-1546, SWR-1547, SWR-1548, SWR-1549, SWR-1550, SWR-1551]
status: approved
trace: required
test: required
title: "Session Persistence & Diagnostics"
---

# 1500-sessions-diagnostics spec

## SWR-1500 — Session Persistence & Diagnostics

trace: optional
test: optional

Session storage and inspection: split-state persistence, diagnostics artifact layout, task-name hygiene, shared artifact store, background output detail.

## SWR-1501 — Background Output Detail Level Selector

legacy-id: REQ-20260430-160000-001
date: 2026-04-30
source: docs/requirement-log/done/requirements-20260430-160000.md

`background_output` shall accept a `detail_level` selector with values `"summary"` and `"verbatim"`, defaulting to `"summary"`.

## SWR-1502 — Compact Report Retrieval Preserved

legacy-id: REQ-20260430-160000-002
date: 2026-04-30
source: docs/requirement-log/done/requirements-20260430-160000.md

In `detail_level="summary"`, `background_output` shall preserve the existing compact retrieval behavior for completed child reports.

## SWR-1503 — Verbatim Retrieval Mode

legacy-id: REQ-20260430-160000-003
date: 2026-04-30
source: docs/requirement-log/done/requirements-20260430-160000.md

In `detail_level="verbatim"`, `background_output` shall return the child's exact stored `final_response` when present.

## SWR-1504 — Deterministic Evidence Rendering

legacy-id: REQ-20260430-160000-004
date: 2026-04-30
source: docs/requirement-log/done/requirements-20260430-160000.md

In `detail_level="verbatim"`, `background_output` shall include deterministic touched-file paths derived from `edited_files`, `created_files`, and file-backed artifact paths, plus any stored highlighted paths/snippets.

## SWR-1505 — Structured Report Evidence Payload

legacy-id: REQ-20260430-160000-005
date: 2026-04-30
source: docs/requirement-log/done/requirements-20260430-160000.md

`ChildReportArtifact` shall support an optional structured `detail_payload` containing highlighted paths and snippets for later parent retrieval.

## SWR-1506 — Guidance For Retrieval Modes

legacy-id: REQ-20260430-160000-006
date: 2026-04-30
source: docs/requirement-log/done/requirements-20260430-160000.md

Parent-facing tool guidance and completion notifications shall explain when to use compact retrieval versus verbatim retrieval.

## SWR-1507 — Backward Compatibility

legacy-id: REQ-20260430-160000-NF-001
date: 2026-04-30
source: docs/requirement-log/done/requirements-20260430-160000.md

Reports and session snapshots that predate `detail_payload` shall remain valid without schema migration.

## SWR-1508 — Single Summary Pass

legacy-id: REQ-20260430-160000-NF-002
date: 2026-04-30
source: docs/requirement-log/done/requirements-20260430-160000.md

Verbose retrieval shall not trigger a second SummaryAgent run; the richer view shall be rendered from the already-stored child report.

## SWR-1509 — Evidence Fidelity Bound

legacy-id: REQ-20260430-160000-NF-003
date: 2026-04-30
source: docs/requirement-log/done/requirements-20260430-160000.md

The system shall document that snippet fidelity is bounded by what the summarization pipeline preserved or explicitly stored; verbatim mode does not imply raw transcript replay.

## SWR-1511 — Compact Top-Level Task Display Name

legacy-id: REQ-20260503-TASKNAME-001
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-session-task-name-hygiene.md

TUI and background runs shall create top-level todo task names from a compact single-line display title instead of the full user prompt.

## SWR-1512 — Preserve Full Execution Payload

legacy-id: REQ-20260503-TASKNAME-002
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-session-task-name-hygiene.md

The full user prompt and contextual session history shall remain in `TodoTask.execution_payload` for the agent.

## SWR-1513 — Compact Child Canonical Names

legacy-id: REQ-20260503-TASKNAME-003
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-session-task-name-hygiene.md

`ChildManager` shall normalize child canonical names into compact safe identifiers capped at 80 characters.

## SWR-1514 — Deterministic Long-Name Deduplication

legacy-id: REQ-20260503-TASKNAME-004
date: 2026-05-03
source: docs/requirement-log/done/requirements-20260503-session-task-name-hygiene.md

Long normalized names shall keep a stable hash suffix before normal deduplication so unrelated long names do not collide silently.

## SWR-1517 — Artifact record schema

legacy-id: REQ-20260522-ART-001
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

The system shall define an `ArtifactRecord` model containing `id` (`art_` + 8-char base62), `slug`, `title`, `kind` (`child_report`/`agent_published`/`system`), `source_task_id`, `source_persona`, `status`, `summary`, `key_findings`, `highlight_paths`, `snippets`, `edited_files`, `created_files`, `tags`, `supersedes`, `superseded_by`, `created_at`, and a rendered `body_markdown`.

## SWR-1518 — Session artifact store

legacy-id: REQ-20260522-ART-002
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

The system shall provide a `SessionArtifactStore` that persists artifacts to `<session_dir>/artifacts/` as `<id>.json` (canonical) and `<id>.md` (rendered) plus an ordered `index.json`. All writes shall use the existing atomic `_atomic_write` helper.

## SWR-1519 — Store lifetime

legacy-id: REQ-20260522-ART-003
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

The `SessionArtifactStore` shall live on the `RalphLoop` (per session) - not on `ChildManager` (per iteration). Each new `ChildManager` shall receive the same store via constructor injection.

## SWR-1520 — Auto-record on terminal

legacy-id: REQ-20260522-ART-004
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

When `ChildManager.mark_child_terminal` runs, the system shall derive an `ArtifactRecord` from the `ChildReportArtifact` and write it to the store. Idempotent on the same `task_id`.

## SWR-1521 — Resume hydration

legacy-id: REQ-20260522-ART-005
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

On session resume, the system shall load every artifact from `index.json` into memory; absent or partially-written entries shall be skipped with a warning, not crash the loop.

## SWR-1522 — `artifact_read` tool

legacy-id: REQ-20260522-ART-006
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

All personas (when listed in their `tools:`) shall be able to call `artifact_read(id_or_slug, sections=?)` to retrieve full or section-filtered artifact content. Allowed sections: `summary`, `key_findings`, `snippets`, `highlights`, `files`.

## SWR-1523 — `artifact_list` tool

legacy-id: REQ-20260522-ART-007
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

All personas (when listed in their `tools:`) shall be able to call `artifact_list(tags=?, kind=?, persona=?, limit=20)` to enumerate session artifacts (excluding superseded by default).

## SWR-1524 — `artifact_write` tool

legacy-id: REQ-20260522-ART-008
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

Personas listed in the per-persona `can_publish_artifacts: true` config flag (default for planner, architect, librarian, oracle, docs-writer) shall be able to call `artifact_write(slug, title, body, tags=?, supersedes=?)` to publish curated artifacts.

Derived requirements: [SWR-2419 — Artifact publication attribution](1500-sessions-diagnostics/SWR-2419-artifact-publication-attribution.md)

## SWR-1525 — Delegate `attach_artifacts` field

trace: optional
legacy-id: REQ-20260522-ART-009
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

`RotarisDelegateAction` shall accept an optional `attach_artifacts: list[str]` (artifact ids or slugs). The corresponding artifacts shall be injected in full (incl. `snippets` and `highlight_paths`) at the head of the child's task payload.

## SWR-1526 — Hybrid auto-injection - baseline index

legacy-id: REQ-20260522-ART-010
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

Whenever a child transitions from `QUEUED` to `RUNNING`, the system shall prepend a `PRIOR SIBLING ARTIFACT INDEX` block listing every succeeded sibling artifact in the parent's scope as **one line** — slug, id, source persona, status, and a one-line summary capped at 160 characters. The block shall carry neither `key_findings` nor bodies; it shall name `artifact_read` as the way to obtain them. The block is capped at a token budget of ~2.5k tokens; over the cap, the system shall replace the overflow with an elision marker pointing to `artifact_list`.

## SWR-1527 — Hybrid auto-injection - full body

legacy-id: REQ-20260522-ART-011
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

When the orchestrator supplies `attach_artifacts` / `depends_on` / `inherited_context`, the corresponding artifacts shall additionally appear in a `PRIOR AGENT CONTEXT (FULL)` block with `snippets`, `highlight_paths`, `edited_files`, and `created_files`.

## SWR-1528 — Opt-out flags

trace: optional
legacy-id: REQ-20260522-ART-012
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

Persona config shall accept `skip_auto_sibling_context: bool = false`; `RotarisDelegateAction` shall accept `suppress_auto_context: bool = false`. Either flag set true shall suppress the baseline `PRIOR SIBLING ARTIFACT INDEX` block for the spawned child.

## SWR-1529 — Summary-agent tags

trace: optional
legacy-id: REQ-20260522-ART-013
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

`ChildReportArtifact` shall gain a `tags: list[str]` field. The summary-agent prompt shall request tags from the closed vocabulary: `research`, `planning`, `implementation`, `review`, `verification`, `errors`. The `artifact_write` tool shall reject any tag not in this set.

## SWR-1530 — Orchestrator prompt update

trace: optional
legacy-id: REQ-20260522-ART-014
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

The orchestrator system prompt shall be updated to explain the artifact store, mandate `attach_artifacts` (or `depends_on`) for delegations following research/planning phases, and forbid paraphrasing sibling findings into delegate prompts.

## SWR-1531 — Planner/architect prompt update

trace: optional
legacy-id: REQ-20260522-ART-015
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

The planner and architect prompts shall instruct the persona to end its turn by calling `artifact_write("plan-…")` or `artifact_write("design-…")` publishing the deliverable for downstream agents.

## SWR-1532 — Backward compatibility

legacy-id: REQ-20260522-ART-N01
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

Existing `depends_on` and `inherited_context` API surface shall continue to work - both shall resolve through the new artifact store. Existing tests shall pass without modification beyond constructor signature changes.

## SWR-1533 — Atomic writes

legacy-id: REQ-20260522-ART-N02
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

All artifact JSON and Markdown writes shall use `mkstemp + os.replace`. The `index.json` shall be updated atomically.

## SWR-1534 — Token budget

legacy-id: REQ-20260522-ART-N03
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

The default baseline auto-injection cap shall be 2,000 tokens (estimated at 4 chars/token). When exceeded the elision marker shall list the count of skipped artifacts and direct the agent to `artifact_list`.

## SWR-1535 — Lazy imports

trace: optional
test: optional
legacy-id: REQ-20260522-ART-N04
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

New module `orchestrator/artifacts.py` shall be importable without triggering heavy SDK imports. `tools/artifacts.py` shall use lazy SDK-tool imports inside `create`.

## SWR-1537 — Track artifact relationships per child

legacy-id: REQ-20260522-ART-T01
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

Child task state shall persist `produced_artifact_ids` and `received_artifact_ids` so the TUI can show artifacts relevant to the focused agent without parsing prompt text.

## SWR-1538 — Editable artifact body persistence

legacy-id: REQ-20260522-ART-T02
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

`SessionArtifactStore` shall expose an update operation that overwrites `body_markdown`, sets `edited_at`, and atomically rewrites JSON, Markdown sidecar, and index files.

## SWR-1539 — Info-pane artifact list

trace: optional
legacy-id: REQ-20260522-ART-T03
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

The TUI `info` panel shall render artifacts for the current view: Produced/Received groups for focused agents and All artifacts when no agent is focused. The selected artifact row shall be visually highlighted.

## SWR-1540 — Artifact stepping keymap

trace: optional
legacy-id: REQ-20260522-ART-T04
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

The TUI shall bind `Alt+Up`/`Alt+Down` to previous/next artifact selection, `Alt+Right` to enter the selected artifact, and `Alt+Left` to exit artifact inspection.

## SWR-1541 — Editable transcript replacement

legacy-id: REQ-20260522-ART-T05
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

Entering an artifact shall replace the transcript pane with an editable Markdown `TextArea` while preserving the live transcript state behind it.

## SWR-1542 — Save and dirty-exit behavior

legacy-id: REQ-20260522-ART-T06
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

The artifact editor shall save with `Ctrl+S`, mark clean after successful persistence, and prompt before discarding unsaved edits on exit.

## SWR-1543 — Editing shortcuts and mouse cursor placement

legacy-id: REQ-20260522-ART-T07
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

The editor shall support Textual `TextArea` defaults for cursor placement, selection, copy/paste, undo/redo, line navigation, and shifted selection.

## SWR-1544 — Regression coverage

status: draft
legacy-id: REQ-20260522-ART-T08
date: 2026-05-22
source: docs/requirement-log/done/requirements-20260522-shared-artifacts.md

Tests shall cover artifact body update, injected artifact id tracking, view-model grouping, and the artifact editor enter/edit/save/exit flow.

## SWR-1545 — Session persistence must write split state files for resume state, run config, and UI transcript.

legacy-id: REQ-20260527-001
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-session-diagnostics.md
priority: High

Derived requirements: [SWR-2130 — Debounced session persistence writes](1500-sessions-diagnostics/SWR-2130-debounced-session-persistence.md)

## SWR-1546 — Session directories must include high-signal inspection files: `summary.md`, `timeline.jsonl`, `metrics.json`, and `issues.json`.

legacy-id: REQ-20260527-002
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-session-diagnostics.md
priority: High

Derived requirements: [SWR-2911 — Tool outcome histogram covers every recorded tool call](1500-sessions-diagnostics/SWR-2911-tool-outcome-classification-coverage.md)

## SWR-1547 — Raw debug logs and OpenHands conversation logs must live under `evidence/`, with `run.log` kept as a compatibility pointer.

legacy-id: REQ-20260527-003
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-session-diagnostics.md
priority: High

## SWR-1548 — Tool timing records must be stored separately from the compact timeline.

legacy-id: REQ-20260527-004
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-session-diagnostics.md
priority: Medium

## SWR-1549 — Artifact indexes must expose creator, consumer, timeline, conversation, and importance metadata.

legacy-id: REQ-20260527-005
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-session-diagnostics.md
priority: Medium

## SWR-1550 — Legacy `snapshot.json` sessions must remain loadable.

legacy-id: REQ-20260527-006
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-session-diagnostics.md
priority: High

This is an obligation on the **load** path, and only on it. Since 2026-08-23 no
`snapshot.json` is written: `state/` is the record a session leaves, and the
whole-state copy beside it duplicated every write for readers that no longer
exist. A directory that already holds one still loads from it, which is what
this requirement protects — a user's own history, written by a version that is
now behind them.

## SWR-1551 — New diagnostics behavior must have unit and integration coverage for split state, JSONL timeline records, tool-call evidence, issues, and background sessions.

trace: optional
legacy-id: REQ-20260527-007
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-session-diagnostics.md
priority: High

Requirements with their own files in `1500-sessions-diagnostics/`:

| ID                                                                                     | Title                                                  | Priority | Status   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------- | -------- |
| [SWR-1552](1500-sessions-diagnostics/SWR-1552-session-forking.md)                      | Session forking                                        | —        | draft    |
| [SWR-1553](1500-sessions-diagnostics/SWR-1553-fork-git-isolation.md)                   | Forked sessions work in an isolated working tree       | —        | draft    |
| [SWR-1554](1500-sessions-diagnostics/SWR-1554-fork-entry-points.md)                    | Session fork entry points                              | —        | draft    |
| [SWR-2130](1500-sessions-diagnostics/SWR-2130-debounced-session-persistence.md)        | Debounced session persistence writes                   | —        | approved |
| [SWR-2427](1500-sessions-diagnostics/SWR-2427-artifact-publication-attribution.md)     | Artifact publication attribution                       | —        | approved |
| [SWR-2911](1500-sessions-diagnostics/SWR-2911-tool-outcome-classification-coverage.md) | Tool outcome histogram covers every recorded tool call | —        | approved |

## History

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Rotaris - Background Output Detail Levels & Verbatim Retrieval (2026-04-30)

Original: `docs/requirement-log/done/requirements-20260430-160000.md` — document status: Complete

#### Description

The `background_output` tool shall support two retrieval modes for completed background child tasks: a compact `summary` mode for normal orchestration, and a `verbatim` mode for cases where the parent needs the child's exact final answer plus concrete stored evidence. The richer payload shall be generated once at child completion time and stored on the child report. It shall not require a second summarization pass when the parent later asks for `detail_level="verbatim"`.

**Previous behaviour:**

- `background_output(task_id)` returned a single serialized report view that mixed

summary, key findings, and final response into one compact text blob.

- `ChildReportArtifact` had no structured place to store highlighted file paths or

curated evidence snippets for later parent retrieval.

- The SummaryAgent produced one structured report, but there was no way to ask for

a more explicit retrieval view without overloading the compact report path.

- Parent guidance in prompts and scheduler notifications described only one

`background_output` retrieval mode.

#### Implementation Notes

**Requirements Document:**

**Implemented changes:**

1. `background_output` now accepts `detail_level="summary"|"verbatim"`, defaulting

to `summary`.

2. `ChildReportArtifact` now supports an optional `detail_payload` with

`highlight_paths` and `snippets`.

3. The SummaryAgent prompt/schema can populate `detail_payload` when it has enough

concrete evidence.

4. `background_output(..., detail_level="verbatim")` renders the exact stored

`final_response`, deterministic touched-file paths, and any stored highlighted paths/snippets.

5. Delegate guidance, prompt help, and scheduler notifications now explain the two

retrieval modes.

**Excluded / Out of Scope:**

- Returning the full raw child transcript through `background_output`.

- Adding a second LLM pass at retrieval time.

- Guaranteeing exact snippet fidelity beyond what the stored report already

preserves.

- Changing dependency-context injection semantics beyond the new stored report

payload.

#### Acceptance Criteria

**Constraints:**

- The SummaryAgent still runs once, immediately after child completion, and

`background_output` continues to read from the stored `ChildReportArtifact`.

- `final_response` remains the authoritative exact answer source; the richer

retrieval view does not create a duplicate verbatim-answer field.

- `detail_payload` is optional and must default cleanly for older reports.

- Snippet evidence can only be as exact as the data preserved by the existing

summarization pipeline and stored report fields.

**Acceptance Criteria:**

1. `background_output(task_id)` continues to return the compact report view.

2. `background_output(task_id, detail_level="verbatim")` returns the exact stored

`final_response` when present.

3. Verbose retrieval includes deterministic touched-file paths and any stored

highlighted paths/snippets.

4. Reports lacking `detail_payload` continue to load and render without errors.

5. Updated unit tests pass for the compact path, verbatim path, and SummaryAgent

parsing of the new optional payload.

### Session Task Name Hygiene (2026-05-03)

Original: `docs/requirement-log/done/requirements-20260503-session-task-name-hygiene.md` — document status: Complete

#### Description

Top-level task names and child canonical names must stay compact even when the user prompt is long, pasted, or multiline. The full user request must still be sent to the agent as execution context.

#### Implementation Notes

**Requirements Document:**

name was the entire user prompt and the run log became difficult to inspect.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### Rotaris - Shared Session Artifact Store for Cross-Agent Context Forwarding (2026-05-22)

Original: `docs/requirement-log/done/requirements-20260522-shared-artifacts.md` — document status: Complete

#### Description

Replace the implicit, opt-in, lossy context-forwarding chain (`depends_on` / `inherited_context` injecting only `summary + key_findings` strings between sibling children) with an explicit **session-scoped artifact store**. Every child report is automatically materialised as a persistent `ArtifactRecord` on disk (JSON + Markdown sidecar). All personas gain `artifact_read` and `artifact_list` tools to fetch evidence on demand. Selected personas (planner, architect, librarian, oracle, docs-writer) gain `artifact_write` to publish curated outputs for downstream consumers. A **hybrid auto-injection** rule guarantees that every spawned child receives, as a prefix to its task payload, a `PRIOR SIBLING SUMMARIES` block summarising every succeeded sibling artifact in the current parent's scope; when the orchestrator explicitly attaches artifact ids via `attach_artifacts`, `depends_on`, or `inherited_context`, the full body (incl. snippets and highlight paths) is injected. This removes the "every agent starts from zero" failure mode observed when the planner in session `385ea719bc1f` was spawned without access to the librarian or oracle findings and had to re-explore the workspace from scratch.

**Observed failure:**

Session `385ea719bc1f`:

1. `librarian` succeeded → produced `ChildReportArtifact` describing the

requirements doc.

2. `oracle` succeeded → produced a rich (54-event) map of `InputComposer`.

3. `planner` was delegated **without** `depends_on` or `inherited_context` -

the planner's first user message contained only the orchestrator's hand-paraphrased prompt. The planner re-ran `haet_read`, `find`, `grep`, then hit a downstream LLM connection error before producing a plan.

**Existing infrastructure (kept and extended):**

- `ChildReportArtifact` (`orchestrator/report.py`): structured per-child

report with `summary`, `key_findings`, `detail_payload.snippets`, `detail_payload.highlight_paths`, `edited_files`, `created_files`.

- `SummaryAgent` (`orchestrator/summary_agent.py`): generates

`ChildReportArtifact` from child transcript at terminal time.

- `ChildManager._format_dependency_context` (`orchestrator/child_manager.py`):

injects `PRIOR AGENT CONTEXT` block built from `summary + key_findings` of succeeded `depends_on` dependencies.

- `RotarisDelegateAction.inherited_context` (`orchestrator/delegate_tool.py`):

opt-in mechanism for the orchestrator to forward sibling reports.

- `background_output(task_id, detail_level="verbatim")`: parent-only access to

the rich payload - not available to siblings.

**Gaps:**

1. **Opt-in propagation.** Orchestrator must remember to set `depends_on` or

`inherited_context`. When forgotten, the downstream child starts from zero.

2. **Lossy injection.** Even when used, only `summary + key_findings` text is

propagated - `snippets` and `highlight_paths` (the exact code excerpts a planner needs) are never injected.

3. **In-memory only.** `ChildManager._reports` is recreated each

`RalphLoop._run_iteration`. Reports do not survive iterations or resume.

4. **Not addressable by topic.** No way for a coding-agent to ask "what is

known about the InputComposer?" without orchestrator wiring.

#### Implementation Notes

**Requirements Document:**

Implementation Notes (v0.37.0):

- `SessionArtifactStore` and `ArtifactRecord` live in

`src/rotaris_core/orchestrator/artifacts.py`; store is owned by `RalphLoop` and survives iteration boundaries.

- Auto-record on terminal: `ChildManager.mark_child_terminal()` calls

`store.upsert_from_child_report()` (idempotent on `task_id`).

- Hybrid auto-injection in `RotarisDelegateExecutor`: baseline summaries

(`baseline_block`) + full attached bodies (`full_block`) prepended before `inherited_context` and `action.task`. Suppressed via per-call `suppress_auto_context` or persona-level `skip_auto_sibling_context`.

- Three new tools: `artifact_read`, `artifact_list`, `artifact_write`

(registered via closure-based factories in `agents/factory.py`). `artifact_write` is gated by the new `PersonaConfig.can_publish_artifacts` flag.

- Storage layout: `<session_dir>/artifacts/<id>.json` + `<id>.md` (sidecar)

- `index.json`. Atomic writes via `_atomic_write` (mkstemp + os.replace).

`hydrate()` reloads on RalphLoop resume.

- Prompts updated: `orchestrator.md` documents inherited_context vs

attach_artifacts contract; `planner.md` and `architect.md` instruct Final-Step `artifact_write` of plan/design.

- Tests: 30 new unit tests across `test_artifact_store.py`,

`test_artifact_injection.py`, `test_artifact_tools.py`. Full unit+integration suite has zero regressions vs master (4 pre-existing failures unchanged). Follow-up Notes (v0.37.5):

- Default persona config now grants `artifact_read`/`artifact_list` to every

built-in persona and `artifact_write` plus `can_publish_artifacts: true` to planner, architect, librarian, oracle, and docs-writer.

- `SessionArtifactStore` now persists child `canonical_name`, rebuilds the

canonical-name idempotency index during hydration, and exposes a public `supersede(old_id_or_slug, new_id_or_slug)` helper.

- Summary-agent instructions now require structured `topic:<slug>` and

`phase:<research|planning|implementation>` tags.

- Integration coverage now includes planner auto-receipt of librarian/oracle

sibling context via `PRIOR SIBLING SUMMARIES`. Follow-up Notes (v0.39.0):

- `TOOL_HINTS` in `src/rotaris_core/agents/prompt_render.py` now includes entries

for `artifact_list`, `artifact_read`, and `artifact_write`, providing behavioral guidance to agents when these tools are rendered into the `[[ROTARIS:TOOLS_SECTION]]` placeholder. Previously, these tools rendered as bare bullet names with no description.

- Added a **Session Artifact Intake** section to all nine built-in persona prompts

(planner, architect, coding-agent, tester, docs-writer, refactorer, requirements-engineer, librarian, oracle), explicitly directing each persona to call `artifact_list()` early and `artifact_read(id)` on any planning, architectural, requirements, or research artifact before broad exploration. This addresses root cause #2 observed in session `21ab75c4f085` where no agent ever called `artifact_read` despite all having the tool available - because zero prompt guidance existed on when or why to use it.

- Regression coverage added: `test_artifact_tool_hints_appear_in_rendered_section` in

`tests/unit/test_prompt_render.py`. Follow-up Notes (v0.43.6):

- `agent_published` artifacts now preserve their authored Markdown body as the

canonical `body_markdown`, so tool reads and persisted Markdown sidecars no longer diverge from what the publishing persona wrote.

- Explicit attachment injection now treats edited artifacts as current-body

authoritative: when a user edits an artifact in the TUI, downstream `attach_artifacts` consumers receive the saved Markdown body instead of stale structured report fields.

- Repeated child-report upserts now preserve lifecycle metadata such as

`consumed_by`, preventing read-audit information from being dropped when the same task artifact is refreshed.

- Explicit attachments now apply a size budget with inline elision notice, and

delegate observations warn when requested artifact ids/slugs are missing or partially elided for size. Follow-up Notes (v0.43.8):

- The TUI info pane now derives artifact read state directly from

`ArtifactRecord.consumed_by` for the focused agent persona and renders read artifacts with a green filled-circle indicator. Follow-up Notes (v0.57.3):

- When a child publishes an `agent_published` artifact during execution, the

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### Session Diagnostics And Artifact Layout (2026-05-27)

Original: `docs/requirement-log/done/requirements-20260527-session-diagnostics.md` — document status: Complete

#### Description

Historical requirement entry normalized from the requirement log.

#### Implementation Notes

**Requirement Log - Session Diagnostics And Artifact Layout:**

**Status:**

Implemented as an additive, backward-compatible session layout.

**Notes:**

- `snapshot.json` was written as a compatibility copy for one release, with `state/resume.json` as the preferred load source when present. That release has passed: since 2026-08-23 no copy is written, and `state/` is the record. The load path still reads a `snapshot.json` it finds, which is what SWR-1550 requires — a session already on a user's disk stays loadable, and that says nothing about the shape new ones are written in.

- Full SDK event logs remain available under `evidence/conversations/event_logs/`; the new timeline and issues files are the intended first inspection surface.

- 2026-06-09: Added opt-in runtime memory diagnostics for long-running sessions. When `runtime.memory_diagnostics_enabled` is true, child boundaries record RSS, traced current/peak memory, and top `tracemalloc` allocation sites to `evidence/memory.jsonl` and `run.log`. Bounded diagnostic JSONL writes now retain only the configured tail with bounded in-process line storage.
- 2026-06-09: Added a `Dev Options` command-palette entry that opens a submenu for toggling `runtime.memory_diagnostics_enabled` at either the global config scope or the current project's `.rotaris/agents.yaml` scope. The screen shows the effective value plus the global and project overrides so merge precedence is visible in the UI.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.
