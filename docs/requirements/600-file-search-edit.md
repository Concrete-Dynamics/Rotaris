---
req-id: [SWR-600, SWR-629, SWR-630, SWR-631, SWR-632, SWR-633, SWR-639, SWR-640, SWR-641, SWR-642, SWR-643, SWR-646, SWR-647, SWR-648, SWR-657, SWR-658, SWR-659, SWR-660, SWR-661, SWR-662, SWR-665, SWR-666]
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

File reading/writing/search tooling: grep/glob search, the read_file/write_file split, and the HAET hash-anchored edit tool family.

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

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
