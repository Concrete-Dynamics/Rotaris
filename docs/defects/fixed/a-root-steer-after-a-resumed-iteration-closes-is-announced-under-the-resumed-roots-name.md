## A root steer after a resumed iteration closes is announced under the resumed root's name

A root resumed as the entry role, because its persona is no longer configured (OQ-97), keeps the persona its iteration was
opened with as its name (`rootName`, `iterations.root_persona`). A steer for the root is announced under that name
(`Run.steer`'s `steering_submitted`), and its injection names the root that takes it (`steering_injected`, under the
name the injecting root dispatches as). `rootName` is reset only when the next iteration's turn begins. Between the
resumed iteration's close and that turn the run awaits the checkpoint capture, the `iteration_end` hooks and the event
drains, and in that window `rootName` still names the resumed root, `orchestrator`, which has finished.

A steer for the root submitted in that window is announced for `orchestrator`. The next iteration's root is fresh and
runs as the entry role, `coding-agent`, and injects it under that name. This is the split between the name a steer is
announced under and the name it is delivered under that
[`a-root-resumed-under-a-fallback-persona-hides-its-rows-from-the-crash-record.md`](a-root-resumed-under-a-fallback-persona-hides-its-rows-from-the-crash-record.md)
repaired for the resumed root's first step. When no iteration follows, teardown's not-delivered line names `orchestrator`,
as the announcement did, so that path is consistent. Only a root resumed under a fallback persona has two names: in every
other run `rootName` is the run's persona.

Resetting `rootName` when the resumed iteration closes is not the repair. `Run.currentRoot` pairs `rootName` with the
finished root's canonical name, so it would name a root that never existed. `entryContext` and `entryTools` read the last
root's reading and history under it, which is what they should show between iterations. A repair names a root steer by the
root that will take it: the current root while it can still step, else the run's persona. It keeps the announced name for
the not-delivered line, so that a steer announced while the resumed root ran, and left pending when it finished, is still
reported under the name it was announced with.

Found by the fifth review of the repair of
[`the-run-level-agent-is-known-by-its-entry-persona-alone.md`](the-run-level-agent-is-known-by-its-entry-persona-alone.md)
as a lesser finding, and confirmed by reading the code on 2026-09-29. Not driven.

## Specs

None directly: REQ-MONITOR-133 and REQ-MONITOR-134 do not word the timeline entries. The prompt itself reaches the next
root, as REQ-MONITOR-134 asks. `PD-ORCH-005` clause 4, the root restored with its identity, is why the resumed root has a
name of its own. The timeline then names two agents for one prompt.

## Relevant files

- `packages/engine/src/run/run.ts`:
  - `Run.steer` and `reportUndeliveredSteering`, which name a root steer by `rootName`;
  - `Run.turn`, the only place `rootName` is set after the run is built;
  - `Run.iterate`, whose close awaits the capture, the hooks and the drain before the next turn.
- `packages/engine/src/run/turn.ts` — `recordSteeringInjected`, called with the injecting agent's name.

## Outcome

Confirmed on `fix-accept1-17` (from `origin/main` `f4ae181`) by two cases, both red before the repair: a continue run set up
as `coding-agent` resumed iteration 2's root `orchestrator`, which answered; with the iteration's `iteration_end` hook held, a
root steer was announced "for orchestrator" — and, when a queued prompt gave the run iteration 3, injected by that
iteration's fresh root as `coding-agent`.

`Run.steer` now names a root steer by `Run.rootSteerName`, the root that will take it, as the note proposed: `rootName`
while the current root can still step (its turn running, or a resumed root before its first turn), the run's persona once
that root's execution is over. `Run.rootDone` is set as each root's turn settles — returned, raised or given up on — and
cleared as the next turn begins. `rootName` itself is unchanged, so `currentRoot`, `entryContext` and `entryTools` still read
the last root between iterations. Each pending steer keeps the name it was announced under, and the not-delivered line
repeats it, so a steer announced while a resumed root ran and left pending when it finished is still reported under that
name.

Pinned by: `packages/engine/src/run/crash.test.ts` — "REQ-MONITOR-133/134 with clause 4 and OQ-97 (the repair of
a-root-steer-after-a-resumed-iteration-closes-is-announced-under-the-resumed-roots-name.md) …" — "an iteration follows:
announced and injected under the fresh root's name, the entry role" and "no iteration follows: announced, and reported not
delivered, under the same name" (the second fails when the not-delivered line names the root by `rootName` again). Not
driven in the built app or live: no proof or live-run scenario resumes a root whose persona is no longer configured, and the
note was found by reading the code.

Repaired 2026-09-29 under R-067.
