# Implementation Plan: Keyboard Shortcut Architecture — Remaining Features

**Requirement:** `docs/requirement-log/done/requirements-20260616-000001-keyboard-shortcut-architecture.md`
**Also addresses:** `docs/requirement-log/done/requirements-20260526-command-palette-shortcuts.md`
**Planned:** 2026-06-16 00:00 UTC
**Status:** In Progress

---

## Summary

Two remaining partial features: (1) transcript search overlay behind `/search` (REQ-20260616-009f),
(2) command palette cheatsheet panel per `requirements-20260526-command-palette-shortcuts.md`
(satisfying REQ-20260616-013).

---

## Phases

### Phase 0 — Groundwork

- `src/rotaris_core/tui/screens/transcript_search.py` — `TranscriptSearchScreen(ModalScreen[None])` stub
- `src/rotaris_core/tui/screens/command_palette_cheatsheet.py` — `CommandPaletteCheatsheetScreen(ModalScreen[None])` stub
- `src/rotaris_core/tui/screens/__init__.py` — re-exports for both

### Phase 1 — Transcript Search

- Complete `TranscriptSearchScreen` with search input, filtered ListView, scroll-to-event
- Update `/search` handler in `slash_commands.py`
- Add `Ctrl+X /` leader chord in `shortcuts.py` + `app.py`
- CSS in `app.tcss`
- Tests: `tests/unit/test_transcript_search.py`

### Phase 2 — Command Palette Cheatsheet

- Complete `CommandPaletteCheatsheetScreen` with search + cheatsheet panel
- Override `action_command_palette` in `app.py`
- CSS in `app.tcss` + `all_navigation_bindings()` helper in `shortcuts.py`
- Tests: `tests/unit/test_command_palette_cheatsheet.py`

### Phase 3 — Validation

- Run full test suite, lint, typecheck
- Bump version in `pyproject.toml`
- Update requirement statuses in both requirement docs
- Regenerate `TRACEABILITY.md`
