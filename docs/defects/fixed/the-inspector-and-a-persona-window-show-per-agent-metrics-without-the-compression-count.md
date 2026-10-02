## The inspector and a persona window show per-agent metrics without the compression count

REQ-MONITOR-281 asks every display of per-agent metrics to convey the agent's token count, tool-call count and
compression count. Since the Mission table's repair (2026-10-01) the table does; the other two surfaces that display
per-agent metrics do not. The Workspace inspector's meta line reads `{state} · {elapsed} · {n} tool calls` and its ring
caption the agent's tokens, and a persona window's context card reads `{n} tool calls · {elapsed}` and the tokens, but
neither draws `AgentRecord.compressions`, which the record has carried since Part AH. The run-wide count REQ-MONITOR-086
makes readable at any time — the sum `runLevelAgent` already computes as the run-level agent's `compressions` — is drawn
by no surface: the Mission table has no row for the run-level agent, and the inspector and the persona window, which
draw the run-level agent, show no count.

Noticed 2026-10-01 while repairing the Mission table's cell on `fin3-run-agent-readings`
([`the-mission-table-says-the-record-carries-no-compression-count.md`](the-mission-table-says-the-record-carries-no-compression-count.md)).
Not repaired: outside that task.

## Outcome — repaired 2026-10-02

**Wider than this note said.** The note took `runLevelAgent`'s sum to be the run-wide count. It was not:
`session.agents` is built from `children` rows (`dal.childrenOf`, `packages/engine/src/sessions.ts`), so the sum held the
children's compressions alone, while a root's own compressions — counted by `run/compression.ts` under the root's name,
the tracker's `compressed(agent)` and the session aggregate's `onCompressed` raised at the same completion — reached no
surface at all. The run-wide aggregate existed in the store (`sessions.compressions`, maintained per ADR-0008), and no
`SessionRecord` field carried it. Repaired whole, on `fin6-mission-metrics`:

- `SessionRecord.compressions` (`packages/contracts/src/channels.ts`, new): the run-wide count — the live run's maintained
  aggregate while a run is live (`Run.compressions`, which the stored figure lags until the pass's save), else the stored
  `sessions.compressions` (`runCompressionsOf` and `toSessionRecord`, `packages/engine/src/sessions.ts`). Both are raised at
  the completion that raises the compressing agent's own count, the roots' included, so it is REQ-MONITOR-086's sum of the
  per-agent counts.
- `runLevelAgent` (`packages/ui/src/agents.ts`) carries it as the run-level agent's `compressions`, in place of the
  children-only sum (OQ-159's recorded reading: the run-level agent's compression count is the run-wide count).
- The count is drawn as an element of its own, labelled with its unit (`compressionLine`): the inspector's ring caption
  (`inspector-compressions`) and the persona window's context card (`persona-compressions`) read `{N} compressions across
  the run.` for the run-level agent and `{N} compression(s) of this agent's context.` for a child. The meta line
  (REQ-MONITOR-052) and the context line (REQ-MONITOR-069) keep their fixed forms, which `mission-proof` matches exactly.
- Pinned by `packages/ui/src/agents.test.ts` ("a root that compressed twice and a child that compressed once read 3 across
  the run and 1 on the child", red on the children-only sum: 1, not 3), `packages/ui/src/inspector-links.test.ts` (both
  surfaces draw the element, for the run-level agent and for a child) and `packages/engine/src/run/compression.test.ts`
  (a run whose only agent is its root records one compression and its snapshot carries `compressions: 1` with no child).
- Shown by `pnpm compression-proof` scenario 6, new (`root-and-child`): the root and its child each compress once; the
  inspector at the end and the run-level agent's persona window (popped out of the inspector, read with the persona probe's
  new waiting form, `selector>>text@~ms`) both read `2 compressions across the run.`, and the session's aggregate is 2.
  Green on the repair; red on a build with the children-only sum restored ("the inspector at the end: orchestrator, "1
  compression across the run." — not "2 compressions across the run."").
- Not changed: a session stored before the aggregate was first raised (ADR-0008's read-back of 2026-09-12) can hold
  `sessions.compressions = 0` beside `context_compressed` entries; its run-wide count reads the stored 0 until a run raises
  it. The Mission table still has no row for the run-level agent (its run row shows the run's status).

## Specs

- REQ-MONITOR-281: wherever per-agent metrics are displayed, the compression count is conveyed, labelled with its unit.
  The inspector and the persona window display the token and tool-call counts and not this one.
- REQ-MONITOR-086: the run-wide count, the sum of the per-agent counts, is readable at any time during and after the
  run. No surface reads it.

## Relevant files

- `packages/ui/src/agents.ts`: `metaLine` (the inspector's meta line) and `runLevelAgent`, whose `compressions` is the sum.
- `packages/ui/src/Inspector.tsx`: the meta line and the ring caption.
- `packages/ui/src/PersonaWindow.tsx`: the context card's `persona-context-line`.
- `packages/ui/src/AgentTable.tsx`: the one surface that drew the count, per child.
- `packages/contracts/src/channels.ts`, `packages/engine/src/sessions.ts`, `packages/engine/src/run/run.ts`: the run-wide count
  the record now carries (`SessionRecord.compressions`, `runCompressionsOf`, `Run.compressions`).
- `apps/desktop/scripts/compression-proof.mjs` scenario 6 and `apps/desktop/src/main/capture/seams.ts` (the persona probe's
  waiting form) — the proof.
