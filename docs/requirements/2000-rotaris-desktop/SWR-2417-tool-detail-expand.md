---
req-id: SWR-2417
status: approved
trace: required
test: required
title: "Expandable tool-call/result rows in the transcript"
epic: SWR-2000
date: 2026-07-26
---

# Expandable tool-call/result rows in the transcript

Tool-call and tool-result rows in the Rotaris transcript shall support the same expand/collapse
interaction as `thinking` rows: clicking the chevron reveals the full, untruncated tool-call
summary and result detail, and clicking again collapses back to the truncated preview. Rows with
nothing extra to reveal (full text identical to the truncated preview) remain non-interactive,
matching today's display.

## Acceptance criteria

- Clicking the chevron on a tool row whose full text/detail differs from the truncated
  preview expands the row in place to show the untruncated summary and detail.
- Clicking the chevron again on an expanded row collapses it back to the truncated preview.
- Tool rows with no additional content to reveal render the chevron as plain (non-clickable) text,
  unchanged from prior behavior.
- The full, untruncated tool-call summary and result detail are persisted per row (capped at a
  bounded maximum to prevent unbounded snapshot growth) so they survive session reload.

Derived requirements: [SWR-2448 — Row expansion state keyed by stable identity](SWR-2448-stable-expansion-identity.md)
