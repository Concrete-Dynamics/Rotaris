# Sequences — the flows the runtime view does not own

[`03-runtime-view.md`](03-runtime-view.md) owns **the run**: start, loop, turn, children, controls, end. Three
other flows cross every process, are asked about constantly, and had no home. They are here, with a fourth that
crosses the run's own agents: how a run comes to rest.

Each is drawn from the code and names the functions in it. One is added when a part first touches a flow that
needs one — not in advance, because a diagram nobody maintains is worse than no diagram.

| Flow | Answers | Section |
|---|---|---|
| Startup to a painted window | what happens before anything else can, and why a view's first read may find no workspace | [§1](06-sequences/01-1-launch-to-a-painted-main-window.md#1-launch-to-a-painted-main-window) |
| A permission approval | how a tool call becomes a modal and comes back a decision | [§2](06-sequences/02-2-a-permission-approval-end-to-end.md#2-a-permission-approval-end-to-end) |
| The requirements board | how a card becomes a run and a run becomes a card again | [§3](06-sequences/03-3-the-requirements-board-release-run-review.md#3-the-requirements-board-release--run--review--accept) |
| A run comes to rest | what a pause, a stop, a quit and a crash leave behind, and when each is written (PD-ORCH-005) | [§4](06-sequences/04-4-a-run-comes-to-rest-pd-orch-005.md#4-a-run-comes-to-rest-pd-orch-005) |

---

## Parts

Since 2026-10-26 the rest of this document is in [`06-sequences/`](06-sequences/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](06-sequences/01-1-launch-to-a-painted-main-window.md) | 1. Launch to a painted main window; `Update now`, and `Restart now` — the offer to the successor; Opening another project, from inside; A notice action that names a workspace (PD-SHELL-001 revisions 2 and 3) |
| [02](06-sequences/02-2-a-permission-approval-end-to-end.md) | 2. A permission approval, end to end |
| [03](06-sequences/03-3-the-requirements-board-release-run-review.md) | 3. The requirements board: release → run → review → accept |
| [04](06-sequences/04-4-a-run-comes-to-rest-pd-orch-005.md) | 4. A run comes to rest (PD-ORCH-005) |
