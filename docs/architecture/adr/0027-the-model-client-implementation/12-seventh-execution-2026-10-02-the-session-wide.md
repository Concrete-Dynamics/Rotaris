# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Seventh execution — 2026-10-02, the session-wide override followed from every agent's next call (REQ-ORCH-091 a/d, REQ-MONITOR-194)

Part 12 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Seventh execution — 2026-10-02, the session-wide override followed from every agent's next call (REQ-ORCH-091 a/d, REQ-MONITOR-194)

*The repair of [`a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md`](../../../defects/fixed/a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md).
Found a defect in the third execution's mechanism.*

The third execution said the session-wide memory is persisted "so a later run of the session never returns to an exhausted
model and keeps the chosen one", and `setEntryModel` said the override is persisted "so later calls of the session never
return to the exhausted pair". Both were true of an agent **built** after the choice and false of one already running:
the overrides were read where a cell was made (`forChild`; `rootResilience` on a rebuild) and never by the ladder on a call.
A child's wait choice therefore left the root — on the replaced pair, and resuming after that child's report inside the
same turn — calling it, and the summariser, which has no ladder, called its configured pair whatever the session held. The
reason is kept here beside its replacement: the cell now follows the overrides before **every** call (`followOverride` in
`ladder.ts`), and the summariser's model is carried through them at each attempt (`SummariserDeps.resolve`). The move
writes nothing new: the `model_override` entry already records the replacement, and the autopsy reader already read it as
moving the root at once — which, until this repair, the run did not do.

The rule follows any override reaching the cell's pair, a rate-limit wait's choice included, not only an exhausted
pair's: REQ-ORCH-091 (d) persists both alike, and the run's own row says "the run resumes on it now and keeps it for the
rest of the session". The instant is the next call rather than the root's next turn, because the root's next call after a
child's wait is usually its resume inside the turn already running; REQ-MONITOR-194's "neither retried automatically"
rules out that call. A switch of the entry model (REQ-MONITOR-142) is not an override and still applies from the next
iteration, as OQ-177's reading says. Measured in `packages/engine/src/run/ladder.test.ts` with the note's probe: before,
the requests after the choice were child `c1`, child `c1`, summariser `a1`, root `a1`; after, all four on `c1`.

*Second round, the same day (the verifier's finding).* "Follows the overrides" assumed the memory's chain ends. A wait
choice back onto a pair an earlier choice replaced (a1 → c1, then a1 chosen in c1's wait) made it a cycle, and the walk —
eight hops, no cycle detection — ended by parity, on c1 for the root: child `a1`, child `a1`, summariser `a1`, root `c1`
after the second choice. That reason is kept beside its replacement: the newest choice now supersedes an older override
that would lead the chosen pair back to the pair it replaces (`ResilienceMemory.supersededBy`; `Run.overrideFor` takes it
back as a `model_override` entry carrying `cleared: true`, `cause: 'superseded'`), and `follow` ends a cycle a store already
holds on the newest override's target, as both autopsy readers now do. Measured in `ladder.test.ts` (red before with the
sequence above; after, all four on `a1`) and `resilience.test.ts`.

*Third round, the same day (the verifier's repair-round-2 finding).* "Supersedes an older override that would lead the
chosen pair back" was itself too narrow, and that reason is kept above beside this one: a chosen pair's override that led
elsewhere stood, and `followOverride` moved the agent off the pair chosen before its first call (`a1 → c1`, then a1 chosen
in f1's wait: root `a1, c1, f1, c1`, the row saying it resumed on a1; on the quota-retry path, the waiting pair chosen and
the retry sent to c1). The user's newest explicit choice of a pair now supersedes any override from it:
`Run.takeBackOverrideOf` takes it back on both wait paths (the same `cleared: true`, `cause: 'superseded'` entry, now with
`root_cell` saying whether the root's cell had followed it, which both autopsy readers read), so no choice writes a cycle
and `ResilienceMemory.supersededBy` is gone. Measured in `ladder.test.ts`: after, root `a1, c1, f1, a1`, and the retry on
`a1` throughout.

*Fourth round, the same day (the verifier's repair-round-3 finding).* "`root_cell` saying whether the root's cell had
followed it, which both autopsy readers read" held only for a root on the chain's end: the run compared the cell with
`memory.effective` of the chosen pair, so a root on an intermediate pair (followed `a1 → c1`, still on c1 when `c1 → f1` was
added) was recorded `elsewhere` and both readers returned it to `a1` while it called `f1`. That reason is kept beside its
replacement: `followed` now means any pair of the chain from the taken-back override's own target on (`Run.onChainFrom`),
where the root moves along the rest of the chain from its next call, and the readers, which set such a root to the chain's
end, are unchanged. Measured in `ladder.test.ts` with the verifier's probe: before, `root_cell: 'elsewhere'` and the reader
ending `a1, c1, f1, a1`; after, `followed` and `a1, c1, f1`, the root's requests `a1, a1, c1, f1, …`.
