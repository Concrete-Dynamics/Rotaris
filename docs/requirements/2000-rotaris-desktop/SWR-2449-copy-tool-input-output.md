---
req-id: SWR-2449
status: approved
trace: required
test: required
title: "Copy tool input/output from the transcript context menu"
epic: SWR-2000
date: 2026-08-10
---

# Copy tool input/output from the transcript context menu

The transcript context menu shall offer "Copy tool input" and "Copy tool output" when the
selected row is a tool row, copying the untruncated call summary (`full_text`, falling back to
the preview text) and the untruncated result (`full_detail`, falling back to the preview
detail) respectively. Non-tool rows keep only the existing "Copy message" entry.

## Acceptance criteria

- Right-clicking a tool row shows "Copy message", "Copy tool input", and "Copy tool output";
  the latter two put the full input/output text on the clipboard.
- The entries are disabled when the corresponding text is empty.
- Right-clicking a non-tool row shows the menu without the two tool entries.
