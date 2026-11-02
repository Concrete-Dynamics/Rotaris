## After an entry persona switch the run-level agent is drawn as the first root's persona

The renderer names the run-level agent, and chooses the declared tools that stand in for its chips, from the persona of
the transcript's **first** agent row that no child carries (`entryOf`). A session's entry persona can change between runs:
`default_persona` is read again for every run, and a plan cycle's root, or a later iteration's, runs fresh under it
(PD-ORCH-003 lets the user re-arm `plan` after an iteration). After such a switch the inspector keeps the name and the
declared tools of the persona the session's first root ran as, while the history its chips are marked from is the latest
root's (`SessionRecord.entryTools`, `entryToolsOf`).

Seen 2026-10-01 in `plan-gate-proof`'s `persona-switch-reopened` launch, while repairing
[`a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md`](a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md).
The session ran one iteration as `orchestrator`, then a plan cycle as `reviewer` (declared tools `glob`, `read_file`,
`todo`), and parked. Reopened at the gate, the inspector named the run-level agent `orchestrator` and drew
`orchestrator`'s fourteen declared tools as its chips, with `glob` marked `used` from `reviewer`'s calls. The model and
reasoning the run-level agent shows come from the same lookup (`snapshot.roles` under that persona). Not repaired:
outside the task that saw it. Which persona the run-level agent is drawn as once the entry persona has changed is not
stated by the specification either (OQ-97 settles the name a resumed root dispatches under, not the name the surface
draws).

## Specs

REQ-MONITOR-060: "Where … the persona has no live instance, the persona's declared tools stand in". The tools that
stand in are another persona's than the one whose calls mark them. REQ-MONITOR-069's tools-and-artifacts card shows the
same set.

## Relevant files

- `apps/desktop/src/renderer/session-view.ts` — `entryOf`: the persona of the first agent row that no child carries, else
  `orchestrator`; its model, reasoning and declared tools from the snapshot's role view.
- `packages/ui/src/agents.ts` — `runLevelAgent`: the run-level agent's name, persona and declared tools from `entry`.
- `packages/engine/src/sessions.ts` — `entryToolsOf` and `entryRootsOf`: the latest root's history, and every root's
  name, which a repair could read the latest root's persona from.
- `apps/desktop/scripts/plan-gate-proof.mjs` — the persona-switch step that shows it (`results.toolsAtGateAfterIteration.inspector`).

## Outcome — repaired 2026-10-01 (fin3)

Confirmed first by a test that failed on the unrepaired lookup (moved verbatim into `packages/ui` so a test could reach
it): rows for an `orchestrator` root then a `reviewer` root gave `orchestrator`, its model, reasoning and declared tools.

- **The run-level agent is drawn as the latest root** (the first repair; the section below refines it). The lookup is now `entryRole` (`packages/ui/src/agents.ts`), which
  the renderer's `entryOf` (`apps/desktop/src/renderer/session-view.ts`) hands to with the session: the persona of the
  transcript's **last** agent row that no child carries, a row named for one of `SessionRecord.entryRoots` preferred (so a
  child's row that reaches the window before its record cannot pass for a root), else `orchestrator`. Its model,
  reasoning and declared tools come from that persona's role view, so the name and the stand-in tools are the persona's
  whose calls mark the chips (`entryToolsOf`). The callers in `main.tsx` (two) and `windows.tsx` pass the session.
- **The reading is recorded, not ruled.** The specification does not say which persona is drawn once the entry persona
  has changed. The build's reading, the latest root, is recorded beside OQ-97 in `docs/architecture/open-questions.md`; no
  requirement was found against it, so no question of its own was raised.

Pinned by `packages/ui/src/agents.test.ts` ("rows for an orchestrator root then a reviewer root draw the reviewer, with its
declared tools, model and reasoning", which fails with the first row read; "a row named for one of the session's roots is
preferred…") and `apps/desktop/src/renderer/agent-links-wiring.test.ts` (the three callers hand the session in). Shown in
the built app by `pnpm plan-gate-proof`'s `persona-switch-reopened` launch, whose step 10 now also requires the run-level
agent named `reviewer` with exactly `glob`, `read_file` and `todo` as chips: 2026-10-01, the inspector read `reviewer`
with `glob:used`, `read_file:not used`, `todo:not used`, the whole proof green, exit 0.

### The verifier's finding on the first repair, repaired 2026-10-01 (fin3, repair round 1)

The first repair read the last **`agent`** row a root wrote. A turn writes an `agent` row only when text arrives
(`packages/engine/src/run/turn.ts`); its tool calls, reasoning and diffs carry the same `persona` and `name` in `tool`,
`thinking` and `diff` rows. So while a switched root's first steps were tool calls, the run-level agent was still named,
and given a model, reasoning and stand-in tools, from the root before it, while its chips came from the new root's live
`entryTools`: this note's mismatch, for the whole stretch before the new root's first text. And before the new root had
written any row at all, from its port's resolution to its first streamed step, no row could name it. Confirmed by tests
that failed on the first repair: a latest root with only a `tool` (or `thinking`, or `diff`) row gave `orchestrator`, not
`reviewer`; and the session record carried nothing that named the live root before its first row.

- **While a run is live, the run's own root persona.** `SessionRecord.entryPersona` (new, nullable,
  `packages/contracts/src/channels.ts`) is `Run.entryPersona` — the run's `config.persona`, the persona its root's rows
  carry and its port resolves `entryTools` for — projected by both `readSession`s in `packages/engine/src/sessions.ts`;
  null with no live run. `entryRole` takes it first (`live`), so the name and the chips come from one snapshot, from the
  run's start.
- **At rest, every row a root authored.** `entryRole` reads the last row of any kind a turn writes under its agent's persona
  and name (`agent`, `tool`, `thinking`, `diff`) that no child carries, a row named for one of `SessionRecord.entryRoots`
  preferred. A row that names no author (`system`, `user`) is no root's.
- **What stays.** At rest, a latest root that wrote no row at all (it failed in its first model call) is drawn as the root
  before it; its chips then show nothing it called, under that earlier persona's stand-in. No requirement covers it, and it
  is left as the build's reading beside OQ-97.

Pinned by `packages/ui/src/agents.test.ts` ("a latest root that has written only tool, reasoning or diff rows is drawn…",
"while a run is live, the persona its root runs as… is drawn, before that root has written any row") and
`packages/engine/src/session-resume.test.ts` ("REQ-MONITOR-060: while a run is live the record names the persona its root
runs as, before that root has written a row; at rest none"), each failing on the first repair; and
`apps/desktop/src/renderer/agent-links-wiring.test.ts` (`entryOf` hands `entryPersona` in). The OQ-97 addendum, the runtime
view's `entryTools` paragraph and the first-executions row are corrected in place.
