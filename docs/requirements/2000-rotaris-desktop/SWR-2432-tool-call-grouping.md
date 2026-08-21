---
req-id: SWR-2432
status: approved
trace: required
test: required
title: "Consecutive tool-call grouping in transcript"
epic: SWR-2000
date: 2026-08-03
---

# SWR-2432 — Consecutive tool-call grouping in transcript

When an agent calls several tools of the same kind back-to-back with no
intervening message or thinking event, the Rotaris transcript shall render those
consecutive tool-call rows as a single collapsible group row instead of one row
per call. The group row names the shared **family gerund** of the calls and how
many there were — `▸ reading ×17` — so a wall of identical rows becomes one row
that says what the agent is doing.

A run is live until its last call returns. While it is live the group row counts
upward from the first call's start (`◉ reading ×7 · running… 4s`) and carries a
grey `⤷` follow line naming the call currently executing — the same one-line
result preview idiom SWR-2444 uses — so the user can see that different
parameters are being worked through rather than one call hanging. Once the run
settles, the row states its total duration and outcome tally
(`▸ reading ×17 · 14.5s · 17 ok`, or `15 ok · 2 failed` when calls failed), and
stays grouped. Clicking the group row expands it inline to reveal each
individual tool-call row.

A group of one (single tool call) does not form a group — it renders as a
standalone tool row unchanged from current behaviour.

This feature layers on top of SWR-2417 (per-row tool expand/collapse) and
SWR-2420 (auto-collapse older tool outputs). It does not replace either: rows
revealed inside an expanded group behave exactly like standalone tool rows —
their chevrons work, and the auto-collapse policy applies to them as usual. The
group deliberately adds no second collapse policy of its own.

## Scope

- **In scope**: grouping runs of two or more consecutive `kind == "tool"`
  transcript events that are uninterrupted by any other event kind (message,
  thinking, edit_diff, question_stepper, etc.).
- **In scope**: the family mapping used as the group key — `read_file`,
  `list_dir`, `glob` → "reading"; `write_file`, `edit_file`, `str_replace` →
  "editing"; `grep_search`, `search` → "searching"; `execute`, `execute_bash` →
  "running". An unmapped tool falls back to its own friendly name, so it groups
  with repeats of itself and never with a different tool.
- **In scope**: the group row display — family, call count, live clock with the
  `⤷` current-call line, and the settled duration plus outcome tally.
- **In scope**: expand/collapse of the group row via click.
- **In scope**: a "Group consecutive tool calls" toggle in the Settings →
  Display tab, **on by default** — a burst of calls is noise until asked for,
  so the readable form is the one the user gets without configuring anything —
  persisted like the SWR-2420 toggle and taking effect immediately on the
  visible transcript.
- **In scope**: transcript search matching a collapsed group against its
  members' text, so a hit inside a group lands on the header the user can see.
- **In scope**: group expand/collapse state is transient UI state — not
  persisted across session reload.
- **Out of scope**: grouping across agent boundaries — consecutive tool calls
  from different agents remain separate.
- **Out of scope**: grouping tool calls of different families, or calls
  interleaved with message or thinking events.
- **Out of scope**: grouping the `ask_questions` row, which is an interaction
  the user has to find rather than activity to summarise.

## Acceptance criteria

- Two or more consecutive `kind == "tool"` events of the same family and the
  same agent (no other event kind between them) render as a single group row
  showing that family and the call count.
- A single isolated tool call, a family change, an intervening non-tool row, and
  an agent change each render as standalone rows or separate groups.
- While any call in the group is running, the row shows the pulsing `◉`, counts
  upward from the earliest call's start, and shows the current call's summary on
  a grey `⤷` line; the transcript's live repaint timer stays running.
- A settled group shows the summed duration and the per-outcome tally, and the
  group's worst member outcome drives its colour.
- Clicking the group row expands it: all its individual tool rows appear below
  the header, each with SWR-2417 chevron behaviour and SWR-2420 auto-collapse
  applying unchanged. Clicking again collapses the group.
- A group's identity is its first member's, so a group the user opened stays
  open as further calls join it.
- With the Display toggle off, the transcript rows are exactly the input events
  — no grouping is applied anywhere.
- A group row never exposes its internal payload: copy and accessible text give
  the plain summary (`reading ×17 · 17 ok`).
- Reloading a session that is no longer running shows no group counting upward:
  a tool row left `running` by a dead process is projected without liveness.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Four consecutive read-family calls produce one `reading ×4` group row; a family change, an intervening message, and a second agent each split the run | Group formation: family mapping, run boundaries, single-call no-group, identity stability | `apps/rotaris/tests/test_transcript.py` |
| Unit | Group header renders live (`◉`, clock, `⤷` current call) and settled (`×n`, duration, ok/failed tally) forms | Header rendering and outcome tally | `apps/rotaris/tests/test_transcript.py` |
| Integration | The view projects only when the preference is on, re-projects on group toggle, and keeps its live repaint timer running for a live group | View/model/delegate wiring across the preference and the click path | `apps/rotaris/tests/test_transcript_tool_thinking.py` |
| Integration | A dead session's unfinished tool row projects without `running` liveness | Session projection boundary | `apps/rotaris/tests/test_transcript_tool_thinking.py` |
| User-flow E2E | User enables the Display toggle, sees a run of calls as one row, clicks to expand, sees the individual calls and expands one | Settings → store → transcript projection → delegate interaction chain | `apps/rotaris/tests/test_views.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
