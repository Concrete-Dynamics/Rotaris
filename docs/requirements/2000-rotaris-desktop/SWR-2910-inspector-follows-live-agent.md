---
req-id: SWR-2910
status: approved
trace: required
test: required
title: "Inspector follows the generating agent when nothing is selected"
epic: SWR-2000
date: 2026-08-11
---

# SWR-2910 — Inspector follows the generating agent when nothing is selected

The workspace inspector is bound to the explicit agent selection, and selecting
an agent also narrows the transcript to that agent. The default state of the
screen — nothing selected, the scope button reading "All activity" — therefore
leaves the inspector empty: no name, an empty context ring, a disabled model
picker and no controls. That is the state a user spends most of a run in, so the
one panel that answers "which model is producing this output, how much of its
context is gone, which tools is it holding" is blank exactly while the answer is
changing.

Without an explicit selection the inspector shall describe the agent that
authored the newest transcript row — the agent currently generating:

- The **inspector subject** is the selected agent when there is one, and
  otherwise the author of the most recent transcript event that resolves to a
  known agent. Rows the run owns rather than an agent — the user's own messages,
  `intent` and `system` rows, and check-suite `verifier` rows (SWR-2609) — are
  not authorship, and roles that match no agent are skipped, so the scan
  continues backwards past them.
- Following is **display only**. The selection stays empty, so the transcript
  keeps showing every event and the scope control keeps reading "All activity".
  Selecting an agent pins the inspector to it exactly as before, and clearing
  the selection resumes following.
- While following, the inspector marks itself as tracking the newest agent in
  words rather than by colour alone, and states that selecting an agent pins it.
- The inspector's per-agent actions — Steer, Cancel, Pop out — act on the agent
  the panel is showing, followed or selected. Cancellation keeps its existing
  confirmation naming the agent and its live descendants, so a target that has
  moved on cannot be cancelled silently.
- When no transcript row resolves to an agent at all, the existing empty state
  is kept unchanged.

## Acceptance criteria

- With no agent selected, the inspector names the author of the newest
  attributable transcript row and shows that agent's state, context window,
  model, tools, and artifacts.
- A new row from a different agent moves the inspector to that agent without
  changing the transcript scope; the scope control still reads "All activity"
  and the transcript still lists every event.
- User, `intent`, `system`, and `verifier` rows never become the inspector
  subject, and a role matching no known agent is skipped rather than blanking
  the panel.
- Selecting an agent pins the inspector to it and drops the following marker;
  clearing the selection resumes following.
- Steer, Cancel, and Pop out target the followed agent while following, and the
  cancel confirmation names that agent.
- A transcript with no agent-authored rows leaves the pre-existing empty state
  intact.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Resolving which agent authored the newest attributable row over a mixed transcript of user, system, verifier, unknown-role, and agent events | `latest_transcript_author` backwards scan, chrome-role and verifier exclusion, unknown-role skip, empty result | `apps/rotaris/tests/test_transcript.py` |
| Integration | Workspace inspector renders the followed agent, moves when another agent posts, pins on selection, and routes its actions to the followed agent | Store signals → `_refresh_inspector_content`, follow marker visibility, transcript scope untouched, `steer_requested`/`cancel_requested`/`agent_popout_requested` payloads | `apps/rotaris/tests/test_views.py` |
| User-flow E2E | User watches a live run in the desktop window without clicking anything, reads the generating agent's model in the inspector, then clicks an agent and the panel stops following | Real `MainWindow` with real store wiring, agent tree click, inspector labels as the user reads them | `apps/rotaris/tests/test_inspector_live_focus_e2e.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
