# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table — Status note — 2026-09-05, the card's shell exists; the mechanism is owed (Part O)

Part 6 of 11 of [ADR-0039](../0039-checkpoints-via-a-private-index.md), which indexes every part.

## Status note — 2026-09-05, the card's shell exists; the mechanism is owed (Part O)

The Git view (`packages/ui/src/GitView.tsx`) carries the "Session checkpoints" card in its **empty states only**
(REQ-GIT-086..090): the picker over the session list (`<id> · <branch>` or the bare id, disabled when empty), the
five columns, no rows, the text by cause (no session; a selected session with none recorded), and "Restore
checkpoint" disabled with REQ-GIT-089's reason. Every listing record already carries `checkpoint_count: 0`
(REQ-GIT-018) and the run-host's `session.start` records the binding the capture will need. **Not built:** the
private index, capture at iteration end, the ref namespace, the listing, the preview and the restore with its gates —
this decision has not yet been executed and nothing here is a finding about it.
