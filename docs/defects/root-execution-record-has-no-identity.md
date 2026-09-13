## The root execution record carries no resolvable identity

Each iteration's root agent is addressed only by the string `root:<iteration>`, minted in the run
loop and used as the parent id of that iteration's delegated children. It has no canonical name,
no task id in the children namespace, and no record of any kind, so a lookup naming the root
resolves to nothing: `background_output` finds no row and answers `not_found`, and
`wait_for_tasks` refuses because the root is not a child of the caller.

The distinction the root has from a delegated child is correct and deliberate — it must not be a
ledger row (see ADR-0012's decision and REQ-ORCH-072 as amended for A4). What is missing is the
identity the same requirement asks for on the other side of that distinction.

Noticed while amending REQ-ORCH-072 for item A4 of the accepted review; the amendment settled
what the requirement says and did not build the identity it asks for.

## Specs

**REQ-ORCH-072** requires the root execution record to carry "a canonical name and a task id, in
the same namespace" a delegated child's identity lives in, "so a lookup naming the root resolves
to it rather than reporting it unknown". Today no such identity exists.

The same requirement's parent-scoping clause is the reason this matters beyond tidiness: a caller
that may not read a record it does not own should be refused **for that reason**
(REQ-TOOLS-155, REQ-TOOLS-156) and never told the root does not exist. With no identity the two
refusals are indistinguishable, and the transcript records the wrong one.

Delivery of the plan gate (REQ-ORCH-152 to REQ-ORCH-154) depends on the same record, because
REQ-ORCH-153 states that the run starts its root execution record with the entry role while the
gate is held.

## Relevant files

- `packages/engine/src/run/run.ts` — `this.rootId = \`root:${iteration}\`` in `turn()`, the only
  place the root's address is minted; `steer`, `cancelAgent` and `steeringFor` special-case the
  literals `run` and `root` against it.
- `packages/engine/src/children/orchestration.ts` — `backgroundOutput` and `waitForTasks`, the
  two lookups REQ-ORCH-072 names; both resolve through `ledger.get`/`childrenOf`, which the root
  is deliberately absent from.
- `packages/engine/src/children/ledger.ts` — the ledger of delegated children; `all()`,
  `activeCount()` and `slotsInUse()` are the counters a root row would corrupt, which is why the
  identity has to arrive without one.
- `packages/engine/src/children/naming.ts` — `canonicaliseName`, `mintTaskId`,
  `uniqueUnderParent`: the namespace the root's identity has to be minted in to be resolvable.
- `apps/desktop/src/run-host/tools.ts` — `isEntryPort`, which reads the root by the
  `^root(:\d+)?$` spelling and by depth 0; a first execution already found that spelling drifting
  once.
