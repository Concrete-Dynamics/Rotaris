## PD-SHELL-009's withdrawal and hold paths are pinned by no engine case or proof, and REQ-SHELL-021 does not point to it

Three gaps fin28's reviewers found in the window-close build (2631eaf), each a claim of `PD-SHELL-009` nothing measures or
points to:

- **(e)** `run.test.ts`'s PD-SHELL-009 case stops a workspace's run and pins its rest, `paused` by `stop`; it holds no
  pending approval and no background terminal session, so the directive's "the approvals and questions they wait on are
  withdrawn and never answered … and their background terminal sessions end" (`PD-ORCH-005` clauses 9 and 10, through
  `Sessions.stopActiveIn`) is pinned by no case of the workspace stop.
- **(f)** REQ-SHELL-021's gate 3 reads REQ-SHELL-122's test, which `PD-SHELL-009` narrows to the window's own workspace;
  the requirement carries `PD-SHELL-001`'s and `PD-WORKSPACE-001`'s notes and nothing that leads a reader of gate 3 to
  the directive that now decides what it counts.
- **(g)** `index.ts`'s `quit.holdsBack` and `quit.unshownToReport` call sites are reached by no test or proof:
  `part-j-proof`'s two-window launch stops a session that publishes no notice and holds no dialog as its window closes
  (the directive's own first-execution note says so under "What was not measured").

## Specs

`PD-SHELL-009`; `PD-ORCH-005` clauses 9 and 10; REQ-SHELL-021 (gate 3), REQ-SHELL-122; REQ-STARTUP-046's last sentence;
REQ-TOOLS-063.

## Relevant files

- `packages/engine/src/run/run.test.ts` — the PD-SHELL-009 case.
- `docs/spec/12-desktop-shell-windows.md` — REQ-SHELL-021 and its notes.
- `apps/desktop/scripts/part-j-proof.mjs` — the two-window launch (`pair-app`).
- `apps/desktop/src/main/index.ts` — the approval dialog's close (`dialogCloseAnswersDeny`), `runHost.onEvent`, `unshownApprovals`.
