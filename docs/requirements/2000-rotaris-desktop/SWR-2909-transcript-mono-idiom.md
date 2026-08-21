---
req-id: SWR-2909
status: approved
trace: required
test: required
title: "Delegation, question, and approval rows share the Nocturne mono idiom"
epic: SWR-2000
date: 2026-08-11
---

# Delegation, question, and approval rows share the Nocturne mono idiom

So the transcript reads as one system, the remaining interactive row kinds shall speak the
same visual language as tool and thinking rows (SWR-2444/2446), taken from the Nocturne
design comp: monospace headers, a teal keyword, `·`-separated dim metadata, and no emoji
glyphs.

- A **delegation context** row renders `▸ delegate <task_name> · <persona>` — the chevron
  and `delegate` keyword in the info (teal) accent, the task name in the agent's
  persona-instance colour, the persona dim. The whole header toggles the details, which
  render behind a 2px persona-coloured rail (category, background/blocking mode, task
  text, dependencies, inherited context — the field set SWR-2433 mandates).
- A **question stepper** row renders a mono `? input needed` header (`?` in the wait
  colour) over the dim step summary and an `answer →` link that opens the stepper.
- An **approval** row renders a mono `! permission required` header (`!` in the fail
  colour) over the dim request summary and a `decide →` link that opens the dialog.

## Acceptance criteria

- Delegation context rows show the teal `delegate` keyword, persona-coloured task name,
  and dim persona in one mono header; collapsing/expanding via the header anchor keeps
  working, and expanded details sit behind a persona-coloured rail.
- Question rows show the mono `? input needed` header and an `answer →` anchor that opens
  the question stepper; approval rows show the mono `! permission required` header and a
  `decide →` anchor that opens the approval dialog.
- None of these rows contain emoji glyphs (`❓`, `⛔`).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Rendering a delegation context, question stepper, and approval event yields the mono headers, keyword colours, anchors, and no emoji | `_event_html` branches for the three kinds, collapsed and expanded delegation | `apps/rotaris/tests/test_transcript_tool_thinking.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
