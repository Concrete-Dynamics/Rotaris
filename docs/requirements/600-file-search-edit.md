---
req-id: [SWR-600, SWR-629, SWR-630, SWR-631, SWR-632, SWR-633, SWR-634, SWR-639, SWR-640, SWR-641, SWR-642, SWR-643, SWR-644, SWR-646, SWR-647, SWR-648, SWR-649, SWR-657, SWR-658, SWR-659, SWR-660, SWR-661, SWR-662, SWR-663, SWR-664, SWR-665, SWR-666]
status: approved
trace: required
test: required
title: "File, Search & Edit Tools"
---

# 600-file-search-edit spec

## SWR-600 — File, Search & Edit Tools
status: approved
trace: optional
test: optional

File reading/writing/search tooling: researcher find tool, read_file/write_file split, and the HAET hash-anchored edit tool family.

## SWR-629 — Cross-Platform Fast Path
status: approved
legacy-id: REQ-20260414-162640-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-162640.md

Search should use a faster backend when `rg` is available, without requiring it on every OS or machine.

## SWR-630 — Portable Fallback
status: approved
legacy-id: REQ-20260414-162640-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-162640.md

Search must continue to work correctly on systems where `rg` is unavailable.

## SWR-631 — Ignore Expensive Workspace Noise
status: approved
legacy-id: REQ-20260414-162640-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-162640.md

Default search should skip generated, vendor, cache, VCS, virtualenv, and session directories that can make `find` stall.

## SWR-632 — Limit Costly File Reads
status: approved
legacy-id: REQ-20260414-162640-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-162640.md

Default search should avoid scanning oversized or likely-binary files that are unlikely to be useful for semantic code search.

## SWR-633 — Reduce TUI Refresh Thrash
status: approved
trace: optional
legacy-id: REQ-20260414-162640-005
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-162640.md

Streaming and tool events from `find` should not rebuild the full TUI transcript on every burst of activity.

## SWR-634 — Regression Coverage
status: approved
trace: optional
legacy-id: REQ-20260414-162640-006
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-162640.md

Add targeted tests for search fallback behavior, ignored-path behavior, ripgrep fast-path wiring, and TUI refresh coalescing.

## SWR-639 — Document Required HAET Operation Field
status: approved
trace: optional
legacy-id: REQ-20260414-232544-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-232544.md

The `haet_edit` tool description must explicitly state that each hunk requires an `operation` field and list the accepted lowercase values used by the runtime schema.

## SWR-640 — Strengthen Coding-Agent HAET Prompting
status: approved
trace: optional
legacy-id: REQ-20260414-232544-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-232544.md

Prompt-rendered HAET hints must mention the required `operation` field and accepted lowercase values so child agents stop inventing malformed edit payloads.

## SWR-641 — Forbid User-Visible Retry Monologue
status: approved
trace: optional
legacy-id: REQ-20260414-232544-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-232544.md

The coding-agent system prompt must forbid exposing private tool-schema troubleshooting and retry planning as user-visible text.

## SWR-642 — Suppress Internal Tool Debug Streams
status: approved
trace: optional
legacy-id: REQ-20260414-232544-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-232544.md

TUI streaming and persisted agent-message handling must treat internal tool-debug/self-correction monologues as non-user-visible reasoning instead of rendering them in chat.

## SWR-643 — Exclude Internal Tool Debug from Scheduler Transcript
status: approved
trace: optional
legacy-id: REQ-20260414-232544-005
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-232544.md

Scheduler transcript extraction must not preserve internal tool-debug monologues as assistant-visible progress content.

## SWR-644 — Regression Coverage
status: approved
trace: optional
test: optional
legacy-id: REQ-20260414-232544-006
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-232544.md

Add regression tests for HAET prompt guidance, streaming suppression, transcript extraction suppression, and persisted transcript filtering.

## SWR-646 — Detect plain `call:<tool>{...}` shape
status: approved
trace: optional
legacy-id: REQ-20260414-233300-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-232544.md

Detect plain `call:<tool>{...}` shape.

## SWR-647 — Strip from streaming + persisted TUI transcript
status: approved
trace: optional
legacy-id: REQ-20260414-233300-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-232544.md

Strip from streaming + persisted TUI transcript.

## SWR-648 — Preserve malformed-attempt classification for stall recovery
status: approved
trace: optional
legacy-id: REQ-20260414-233300-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-232544.md

Preserve malformed-attempt classification for stall recovery.

## SWR-649 — Regression coverage
status: approved
trace: optional
test: optional
legacy-id: REQ-20260414-233300-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-232544.md

Regression coverage.

## SWR-657 — FileToolEngine shared state module
status: approved
legacy-id: REQ-20260417-001
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-120000.md

Path resolution, binary detection, encoding detection, content hashing, read ledger, undo stack, atomic write, 4-level fallback cascade

## SWR-658 — ReadFileTool
status: approved
legacy-id: REQ-20260417-002
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-120000.md

ReadFileAction/Executor/Observation with pagination, line numbers, grep mode, directory listing

## SWR-659 — WriteFileTool
status: approved
legacy-id: REQ-20260417-003
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-120000.md

WriteFileAction/Executor/Observation with 5 commands: create, edit, overwrite, insert, undo

## SWR-660 — Agent factory integration
status: approved
legacy-id: REQ-20260417-004
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-120000.md

TOOL_NAME_MAP, sentinel-based idempotent registration, shared engine instance, READ_ONLY_TOOLS

## SWR-661 — Prompt hints and system prompt updates
status: approved
trace: optional
legacy-id: REQ-20260417-005
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-120000.md

TOOL_HINTS for 4 tool names, coding_agent.md and tester.md prompt updates

## SWR-662 — Default persona migration
status: approved
test: optional
legacy-id: REQ-20260417-006
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-120000.md

6 personas migrated from file_editor → read_file + write_file; librarian → read_file only

## SWR-663 — Unit tests
status: approved
trace: optional
legacy-id: REQ-20260417-007
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-120000.md

57 new tests: 26 engine, 12 read, 19 write - all passing

## SWR-664 — Integration tests
status: approved
trace: optional
legacy-id: REQ-20260417-008
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-120000.md

12 e2e tests covering round-trip flows, undo, grep→edit, encoding, atomicity, fallback cascade

## SWR-665 — README and documentation
status: approved
trace: optional
test: optional
legacy-id: REQ-20260417-009
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-120000.md

Core Tools table, personas table, Standard Editing section updated

## SWR-666 — HAET (Hash-Anchored Edit Tool) full overhaul
status: approved
legacy-id: REQ-20260430-HAET-OVERHAUL-001
date: 2026-04-30
source: docs/requirement-log/done/requirements-20260430-haet-overhaul.md

Rewrite the HAET wire format and engine to address anchor collisions, stale reads, relocation, recovery payloads, and snapshot-aware edit validation.

## History

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Agentic Framework - Researcher Agent & `find` Tool (2026-04-13)

Original: `docs/requirement-log/done/requirements-20260413-210038.md` — document status: Complete

#### Description

A new built-in agent named Researcher is introduced. Its sole responsibility is semantic codebase search: given a natural-language query, it locates the files and code snippets most relevant to that query and returns a structured, deterministic result. The Researcher is not exposed as a named agent that other agents can address directly; instead, it is entirely hidden behind a standard tool called `find`. From the perspective of any calling agent, `find` is an ordinary synchronous tool call with a query parameter and a structured response - the fact that an agent is running underneath is an implementation detail. The output schema is defined verbatim in the Researcher's system prompt so that the structured format is enforced at the prompt level, not only at the API boundary.

#### Implementation Notes

**Requirements Document:**

> **Consolidation note:** This file remains the canonical requirement-ID source for the > `Researcher` / `find` contract. Later fixes in `requirements-20260414-162640.md`, > `requirements-20260414-191500.md`, and `requirements-20260414-230140.md` refine runtime > behavior and schema handling without replacing the core requirement IDs below.

**Tests:**

**Excluded / Out of Scope:**

- The Researcher does not perform vector-embedding-based semantic search; its semantic capability comes from the LLM reading and evaluating code, not from a pre-built embedding index. Adding an embedding index as a backend optimisation is out of scope for this requirement set.

- The `find` tool does not support cross-repository or remote search; it is scoped to the current local workspace only.

- Streaming or incremental results from `find` are not in scope; the tool call is synchronous and returns a single complete response.

#### Acceptance Criteria

**Constraints:**

### Find Tool Freeze Mitigation (2026-04-14)

Original: `docs/requirement-log/done/requirements-20260414-162640.md` — document status: Complete

#### Description

The `find` tool now avoids the most expensive default scan paths and reduces UI churn while a search is running. Search prefers a fast `rg` backend when it is available on the host OS, falls back to a portable Python implementation when it is not, skips generated/vendor/session directories by default, and throttles bursty TUI refreshes triggered by streamed agent activity.

#### Implementation Notes

**Requirements Document:**

**Implementation Notes:**

- Added common ignore rules and file-size/binary guards to `src/rotaris_core/tools/search.py`

- Added `rg`-backed grep/glob execution when available, with a Python fallback when it is not

- Switched the Python grep fallback to lazy iteration instead of eager whole-workspace file materialization

- Added a small refresh throttle in `src/rotaris_core/tui/app.py` for bursty token and tool-event updates

- Added regression coverage in `tests/unit/test_search_tools.py` and `tests/unit/test_tui_app.py`

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### Find Tool Empty Output Fix (2026-04-14)

Original: `docs/requirement-log/done/requirements-20260414-191500.md` — document status: Complete

#### Description

The `find` tool must correctly consume Researcher output under the current OpenHands SDK event model. Researcher replies arrive as `MessageEvent(source="agent", llm_message.role="assistant")`, so extraction must key off the LLM role rather than the event source label. The Researcher agent should also avoid unrelated built-in tools that can weaken its strict JSON-only contract.

#### Implementation Notes

**Requirements Document:**

**Implementation Notes:**

- Updated assistant-text extraction in `src/rotaris_core/agents/researcher.py` to use `llm_message.role == "assistant"` instead of the event `source` field.

- Disabled default OpenHands tools for the internal Researcher agent via `include_default_tools=[]`.

- Added regression tests in `tests/unit/test_find_tool.py` for the real event shape and the default-tool configuration.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### HAET Schema Guidance and Streaming Deliberation Suppression (2026-04-14)

Original: `docs/requirement-log/done/requirements-20260414-232544.md` — document status: Complete

#### Description

The coding agent was leaking tool-schema self-debugging into the TUI while also being steered toward malformed `haet_edit` calls. The fix aligns HAET guidance with the actual lowercase schema, explicitly tells the coding agent not to expose retry/debug narration, and suppresses internal tool-debug monologues from streaming, activity previews, persisted transcript messages, and scheduler transcript extraction.

#### Implementation Notes

**Requirements Document:**

**Implementation Notes:**

- Updated `src/rotaris_core/haet/tool.py` so the runtime-exposed HAET description documents the required `operation` field and lowercase operation names.

- Expanded `src/rotaris_core/agents/prompt_render.py` and `src/rotaris_core/agents/prompts/coding_agent.md` to reinforce the correct HAET payload shape and forbid visible retry/debug narration.

- Added shared internal-deliberation detection in `src/rotaris_core/sdk_text.py` and applied it in `src/rotaris_core/tui/streaming.py`, `src/rotaris_core/tui/app.py`, `src/rotaris_core/tui/live_activity.py`, and `src/rotaris_core/orchestrator/scheduler.py`.

- Added regressions in `tests/unit/test_prompt_render.py`, `tests/unit/test_tui_streaming.py`, `tests/unit/test_tui_app.py`, and `tests/unit/test_scheduler.py`.

- Bumped `pyproject.toml` from `0.10.4` to `0.10.5`.

**Follow-up: Plain Raw Tool-Call Suppression (2026-04-14 23:33 UTC, v0.10.6):**

Some OpenHands events surfaced raw plain-text tool calls of the form `call:<tool>{...}` without the SDK marker tokens already handled above. The sanitizer was extended so this shape is suppressed in streaming output, persisted transcripts, and scheduler transcript extraction. **Touched:** `src/rotaris_core/sdk_text.py` (detection), reused sanitizer in existing TUI + scheduler paths; regressions in `tests/unit/test_tui_streaming.py`, `tests/unit/test_scheduler.py`, `tests/unit/test_tui_app.py`.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### Persona Switch to file_editor Workflow (Superseded) (2026-04-15)

Original: `docs/requirement-log/done/requirements-20260415-212920.md` — document status: Complete (transitional - superseded by `requirements-20260417-120000.md`, which replaced `file_editor` with the split `read_file` / `write_file` tools).

#### Description

Switch the shipped personas from HAET-first editing to the standard OpenHands `file_editor` workflow while preserving HAET as an explicit opt-in tool family. The internal Researcher must also move to the standard file surface, but remain read-only by enforcing `view`-only semantics.

#### Implementation Notes

**Requirement Log - 2026-04-15 21:29:20 UTC:**

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete (transitional - superseded by `requirements-20260417-120000.md`, which replaced `file_editor` with the split `read_file` / `write_file` tools).`.

### read_file / write_file Tool Split (2026-04-17)

Original: `docs/requirement-log/done/requirements-20260417-120000.md` — document status: Complete

#### Description

Replace the monolithic `file_editor` tool with two hardened, research-backed tools: `read_file` (view/grep/list) and `write_file` (create/edit/overwrite/insert/undo). The redesign was motivated by `file_editor`'s single-occurrence `str_replace` limitation and the lack of fallback matching when LLM-provided context has whitespace or indentation drift. A full industry survey (9 production implementations, 4 research papers) informed the design documented in `docs/proposal-file-tools-redesign.md`.

#### Implementation Notes

**Requirement Log - 2026-04-17 12:00:00 UTC:**

**Detailed Specifications:**

**REQ-20260417-001 - FileToolEngine:**

**File:** `src/rotaris_core/tools/file_engine.py` Shared state engine providing:

- Path resolution with workspace-root scoping (symlink/traversal rejection)

- Binary file detection (null-byte scan on first 8KB)

- Encoding detection: UTF-8 → Latin-1 fallback

- SHA-256 content hashing for change detection

- Read ledger: tracks which files have been read (gates write operations)

- Undo stack: capped at 10 entries per file

- Atomic write: mkstemp + os.replace (file never left in partial state)

- Directory listing with type indicators

- In-file grep with context lines

- 4-level fallback matching cascade:

1. Exact string match

2. Whitespace-normalized match

3. Indent-normalized match

4. Fuzzy match (difflib, threshold ≥ 0.6)

- `apply_replacement` (single) and `apply_replacement_all` (global)

- `count_changed_lines` for edit feedback

**REQ-20260417-002 - ReadFileTool:**

**File:** `src/rotaris_core/tools/file_read.py`

- `ReadFileAction`: path, offset, limit, grep, grep_context

- `ReadFileExecutor`: directory listing, binary detection, pagination with 1-indexed line numbers, grep mode, read ledger recording

- `ReadFileObservation`: path, content, total_lines, shown_from, shown_to, encoding, content_hash, truncated, error

**REQ-20260417-003 - WriteFileTool:**

**File:** `src/rotaris_core/tools/file_write.py`

- `WriteFileAction`: path, command, content, old_str, new_str, replace_all, insert_line

- 5 command handlers:

- `create`: write new file (rejects if exists)

- `edit`: single or replace_all edit with fallback cascade

- `overwrite`: full file replacement (requires prior read)

- `insert`: insert lines at a specific line number

- `undo`: pop from undo stack and restore

- `WriteFileObservation`: path, command, success, lines_changed, content_hash, error

**REQ-20260417-004 - Factory Integration:**

**File:** `src/rotaris_core/agents/factory.py`

- `TOOL_NAME_MAP`: `"read_file"` → `"read_file"`, `"write_file"` → `"write_file"`

- `_file_tools_registered_root`: global sentinel for idempotent registration

- `_register_file_tool_factories(workspace_root)`: creates shared `FileToolEngine`, registers factory closures

- Called unconditionally in `create_agent_for_persona` (same pattern as HAET)

- `read_file` added to `read_only_tools` set

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.

### HAET (Hash-Anchored Edit Tool) full overhaul - 2026-04-30 (2026-04-30)

Original: `docs/requirement-log/done/requirements-20260430-haet-overhaul.md` — document status: Complete

#### Description

The HAET wire format and engine were rewritten end-to-end to address chronic collision and stale-read failures observed in agent traces. This is a **breaking** change: there is no compatibility shim with the previous 2-char anchor / no-snapshot protocol.

#### Implementation Notes

**HAET (Hash-Anchored Edit Tool) full overhaul - 2026-04-30:**

**Wire-format changes:**

Aspect | Before | After Anchor length | 2 base62 chars (xxh32) | **4 base62 chars (xxh32)** Anchor line number | Optional, only for duplicates | **Mandatory on every hunk** (`anchor_line_number`, 1-based) File fingerprint | _none_ | **`snapshot_id`** - xxh64 hex of raw file bytes (`"empty"` sentinel) Adjacency proof | _none_ | Optional `context_before_hash` / `context_after_hash` (16 hex / `BOF` / `EOF`) Range edits | `end_anchor` | `end_anchor` + mandatory `end_anchor_line_number` Result | `success`, `hunks_applied` | adds `new_snapshot_id`, `relocated` Ambiguity recovery | Plain error message | Structured `HAETRecoveryPayload` with fresh `snapshot_id` and up to 20 candidate `(line, anchor, preview)` tuples

**Engine semantics:**

- **Snapshot-first validation.** `apply_patch` rejects any request whose

`snapshot_id` does not match the current file fingerprint - _before_ any per-hunk validation runs.

- **One-shot internal re-anchor.** On snapshot mismatch the engine attempts to

relocate every hunk by its anchor: first within ±5 lines of the supplied `anchor_line_number`, then file-wide if the anchor is globally unique. If every hunk relocates uniquely, the patch applies and the response sets `relocated=true`. Otherwise the engine returns a structured `snapshot_mismatch` error carrying the fresh `snapshot_id` and recovery candidates so the agent can retry without re-reading.

- **Context-window hashes** are validated when present and dropped silently

when relocated (line offsets shift; the agent should re-supply context with the next attempt).

- **Atomic write** unchanged: `mkstemp + os.replace`.

- **Orphan-lines guard** preserved: a single-anchor `replace` whose payload

exceeds 20 lines is rejected as `single_anchor_replace_too_large` to prevent catastrophic accidental rewrites; range replaces (`end_anchor`) are exempt.

**Model-facing prompt:**

The tool descriptions in `_HAET_READ_DESCRIPTION` / `_HAET_EDIT_DESCRIPTION` were shortened. The required-fields example is the path of least surprise; the optional context-window fields are mentioned in one line and otherwise stay out of the way. `render_for_llm` now emits `snapshot_id=<hex>` in the file header and a `→ anchor="Ab12"` example to anchor (pun intended) the new 4-char shape in the model's working memory.

**Error codes:**

Code | Meaning `snapshot_mismatch` | Stale `snapshot_id` and re-anchor could not save it `context_mismatch` | Supplied context hash did not match the live neighbour `anchor_line_not_found` | `anchor_line_number` is past EOF `anchor_line_mismatch` | The line at `anchor_line_number` carries a different anchor `end_anchor_line_not_found` | `end_anchor_line_number` is past EOF `end_anchor_line_mismatch` | The line at `end_anchor_line_number` carries a different anchor `end_before_start` | `end_anchor_line_number < anchor_line_number` `single_anchor_replace_too_large` | Orphan-lines guard tripped

**Files touched:**

- `src/rotaris_core/haet/hasher.py` - `ANCHOR_LENGTH=4`, new `snapshot_id`,

`context_hash_for_position`, `BOF` / `EOF` sentinels.

- `src/rotaris_core/haet/anchor.py` - 4-char anchor regex on `TaggedLine`,

required `snapshot_id` on `TaggedFile`, updated `render_for_llm` header.

- `src/rotaris_core/haet/patch.py` - schema with mandatory `anchor_line_number`

and `snapshot_id`, optional context-hash fields, `HAETRecoveryCandidate` / `HAETRecoveryPayload`, new `HAETPatchResult` fields.

- `src/rotaris_core/haet/engine.py` - snapshot-first apply loop, `_try_reanchor`,

`_build_recovery`, structured context validation.

- `src/rotaris_core/haet/tool.py` - shortened descriptions, `snapshot_id` on

`HAETEditAction`, new success / failure rendering with recovery candidates.

- Tests rewritten (`tests/unit/test_haet_*.py`,

`tests/integration/test_haet_large_files.py`) - 101 assertions.

**Version:**

`pyproject.toml`: `0.27.0` → `0.28.0` (minor bump - wire-format change with no backwards compatibility, accepted by the user as part of the locked plan).

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Complete`.
