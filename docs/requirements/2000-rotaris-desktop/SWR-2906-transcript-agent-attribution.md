---
req-id: SWR-2906
status: approved
trace: required
test: required
title: "Sticky agent attribution in transcript message blocks"
epic: SWR-2000
date: 2026-08-10
---

# SWR-2906 — Sticky agent attribution in transcript message blocks

When several agents interleave activity in the Rotaris workspace transcript, the
user shall always be able to tell which agent produced which row. Today the role
column is painted per row but suppressed for tool rows — and real runs consist
almost entirely of tool rows — so long stretches of the "All activity" view show
no agent identity at all.

The transcript shall group consecutive events by their originating agent
(`TranscriptEvent.role`) into attribution blocks:

- The **first row of a block** shows a two-line attribution label in the role
  column: the persona display name (e.g. `coding-agent` → "Coding Agent") in
  bold, painted in that agent's persona-instance color, with the agent's task
  name (the event role, e.g. `draft-worktree-run-requirement`) beneath it in a
  smaller, dimmed style. When the second line would only repeat the first (fixed
  roles such as `you`, `system`, `intent`, `orchestrator`, or a role equal to
  its persona), it is omitted.
- Every **continuation row** of the same block shows a thin vertical bar in the
  same persona color at the left edge of the role column, spanning the row
  height, so mid-block rows remain attributable after the block header has
  scrolled away.
- A block ends as soon as an event with a different role follows — another
  agent, the user, or the system — and that event starts its own block with its
  own label.

Colors resolve exactly as the existing per-row labels did (SWR-2421 persona
colors with SWR-2435 per-instance shading; fixed colors for `you`, `intent`,
`system`, `orchestrator`; `theme.RUN` fallback for events without persona).
The grouping applies uniformly to the full-run view and the per-agent scoped
view, and to every event kind including tool rows.

## Acceptance criteria

- The first event of each same-role run of transcript rows paints the persona
  display name in the agent's persona-instance color plus the task name on a
  second, dimmed line, elided to the role column width.
- Subsequent events of the same run paint no label text but a persona-colored
  continuation bar; a role change (agent, user, or system) starts a new labelled
  block.
- Tool rows participate fully: a block that starts with a tool row carries the
  attribution label on that row.
- Fixed roles (`you`, `intent`, `system`, `orchestrator`) keep their existing
  colors and render a single-line label; events without persona metadata fall
  back to the existing `theme.RUN` color.
- Block-start rows are tall enough to show both label lines without clipping;
  size caching stays correct across incremental transcript syncs (append,
  truncate, streamed-tail update).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Attribution computed for a mixed multi-agent event list yields block starts at role changes, persona display names, task-name second line, and per-persona colors with fallbacks | Block-start detection (first row, role change, same-role tool runs, user/system breaks), label composition, second-line suppression, empty-persona fallback | `apps/rotaris/tests/test_transcript.py` |
| Integration | Transcript delegate reserves extra height for block-start rows and paints a mixed multi-agent transcript without stale sizes after incremental sync | `sizeHint`/size-cache behaviour across `sync()` append and streamed-tail update, delegate paint over a live `TranscriptListView` | `apps/rotaris/tests/test_views.py` |
| User-flow E2E | User loads a session where two agents interleave tool and message events and sees exactly one colored attribution header per agent block, with continuation rows attributed to the same agent | Session projection → transcript model → delegate attribution, user-observable label text and colors | `apps/rotaris/tests/test_production_ux.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
