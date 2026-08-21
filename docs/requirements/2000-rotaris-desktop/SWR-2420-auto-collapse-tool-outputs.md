---
req-id: SWR-2420
status: approved
trace: required
test: required
title: "Auto-collapse older tool outputs in transcript"
epic: SWR-2000
date: 2026-07-28
---

# Auto-collapse older tool outputs in transcript

When enabled via a Display settings toggle, only the most recent tool-call + tool-result pair
in the Rotaris transcript renders expanded (full content visible). All older tool-call and
tool-result rows auto-collapse to show only the tool name and a clickable expand chevron (▸).
The user can still click any older collapsed row's chevron to expand it individually, preserving
existing per-row expand/collapse behavior. When the toggle is off, all tool rows render with
their prior expansion state — no change from current behavior. The toggle takes effect
immediately on the visible transcript without requiring a reload.

This feature extends SWR-2417 (per-row tool expand/collapse) — it does not replace it. The
per-row chevron interaction from SWR-2417 remains fully functional. This feature adds a global
auto-collapse policy on top.

## Acceptance criteria

- When "Auto-collapse older tool outputs" is enabled in Display settings, only the most recent
  tool-call + tool-result pair renders with full content visible; all older tool rows render
  collapsed (tool name + chevron only).
- Older collapsed tool rows remain individually expandable — clicking the chevron expands them
  in place (existing SWR-2417 interaction).
- When the toggle is disabled, all tool rows render with their prior expansion state — no change
  from current behavior.
- The toggle is accessible via a new "Display" tab in the Settings dialog.
- The toggle setting persists across app restarts via the existing settings save/discard flow.
- The toggle takes effect immediately on the visible transcript — no reload or session restart
  needed.
- The most recent pair is determined by the last two `kind == "tool"` events in the transcript
  list; if fewer than two tool events exist, all are treated as recent (none auto-collapse).
