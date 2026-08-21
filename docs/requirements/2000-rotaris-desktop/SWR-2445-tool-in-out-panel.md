---
req-id: SWR-2445
status: approved
trace: required
test: required
title: "Expanded tool rows render an INPUT/OUTPUT rail card"
epic: SWR-2000
date: 2026-08-10
---

# Expanded tool rows render an INPUT/OUTPUT rail card

Expanding a tool row (SWR-2417 interaction) shall show the call input and result output as a
Nocturne rail card: content on the card surface with a 1px border and a 2px status-coloured
left rail, sectioned by uppercase micro-labels `INPUT` (the untruncated call summary,
`full_text`) and `OUTPUT` (the untruncated result, `full_detail`) in the small dim
letter-spaced label style the design comp uses on cards. Collapsed rows keep a single-line
dim result preview after the header, prefixed with a `⤷` continuation glyph (unless
auto-collapse, SWR-2420, hides it).

## Acceptance criteria

- The expanded body renders as a visually distinct card (surface background, border from
  `rotaris.theme`, 2px left rail coloured by the row's status) using the mono font family.
- The card contains an `INPUT` section with the full call summary and an `OUTPUT` section
  with the full result detail, each introduced by a small dim uppercase label; a section
  with no content is omitted.
- Collapsed, non-auto-collapsed rows show the truncated result preview in secondary colour
  on the line after the header, behind a `⤷` glyph.
- The expand/collapse interaction and its non-interactive fallback (nothing extra to reveal)
  behave per SWR-2417 unchanged.
