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

## Repaired — 2026-10-07, fin29 (PD-SHELL-009, PD-ORCH-005 clauses 9 and 10, REQ-SHELL-021)

- **(e)** `run.test.ts` gains "finding e": a workspace stop of a run whose root waits on a person withdraws the wait by `stop`
  (never cancelled as an answer, no `approval_denied`) and ends its running background session, recorded as ended by `stop`.
  It pins behaviour that already held: it passes on the source before, and fails with the withdrawal or the terminal end
  removed from the stop's path.
- **(f)** REQ-SHELL-021 carries a cross-reference (no requirement text changed, no back-pointer verb, so the register's one
  narrowing directive for it stays `PD-SHELL-001`): gate (3)'s "with a run active" is REQ-SHELL-122's test, which
  `PD-SHELL-009` narrows to the requesting window's workspace.
- **(g)** `part-j-proof`'s two-window launch now runs A under `permission_mode: ask` with a root that asks to write, so A's
  run waits on REQ-TOOLS-063's dialog as its window closes. The proof requires `approval_withdrawn` and no `approval_denied`
  in A's timeline (the dialog that closed with its window answered nothing: `dialogCloseAnswersDeny` reading
  `QuitState.withdrawnByClose`), the stopped run's outcome held back and logged (`QuitState.holdsBack`), and no notice of A's
  session relayed. `quit.unshownToReport` stays reached by its `exit.test.ts` case only: the scripted client raises one call
  per step, so no proof yet queues a second approval behind an open dialog.
