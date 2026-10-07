## A session a window's close stopped, and never continued, keeps its notices held while main runs; its rest's own notice is never held

`QuitState.holdsBack` (`apps/desktop/src/main/exit.ts`) holds every `notice.publish` of a session the close of one of
several main windows stopped until a later run of it publishes an active status (`observeStatus`). A session that rests and
is never started again is never released: every later notice the run host publishes for it — an improvement analysis's
outcome, a recording failure found on reopen — is dropped from the windows that stay for as long as main runs (fin28
reviewers' finding (c) on 2631eaf).

Found while confirming it: the opposite gap on the same path. The rest's own notice — the terminal outcome main raises
from the run host's `run.result` (`runEndingPublication`, then `runFailures.endedOtherwise` in `index.ts`) — never passes
through `holdsBack` at all, which reads `notice.publish` only. So the one notice the stop certainly produces ("the run was
stopped" in the run's own summary words) reaches the window that stays, naming the session, at the moment the hold was
built to cover.

## Specs

`PD-SHELL-009` and REQ-STARTUP-046's last sentence ("no notice of those runs appears on a window that stays *while they
come to rest*": the hold is bounded by the rest, and covers the rest's own notice); REQ-NOTIFY-031 (the outcome notice of a
session not on screen names it).

## Relevant files

- `apps/desktop/src/main/exit.ts` — `QuitState.holdsBack`, `observeStatus`.
- `apps/desktop/src/main/index.ts` — `runHost.onEvent`: the `notice.publish` branch and the `run.result` branch.

## Repaired — 2026-10-07, fin29 (PD-SHELL-009, REQ-STARTUP-046)

The stopped run's `run.result` is now the hold's end, and it is held itself: `QuitState.holdsBack` answers true for it once,
and main, which still does everything else the `run.result` asks (the failure tracker's end, the improvement checkpoint, the
log line), does not raise the outcome notice and logs it as held back ("run <id>: its outcome "…" held back: its window's
close stopped the run"). A later notice of the session — an analysis's outcome — is relayed again, whether or not the session
is ever continued. Pinned by `exit.test.ts`'s "finding c" case (red on the source before: the result was not held and the
later notice was), and shown by `part-j-proof`'s two-window launch, whose stopped session's outcome is held back and logged,
and which finds no `notice from the run host` line for that session.
