## A resumed child's retry payload loses its attachments and its inherited context

`IterationChildren` keeps two parts of a child's payload in memory, for the life of the run that accepted the `delegate`
call: the explicitly attached artifact references (`attached`, REQ-LIBRARY-098) and the rendered inherited-context block
(`inherited`, REQ-TOOLS-152 / REQ-TOOLS-154 item (5)). Since PD-ORCH-005 a child outlives that run: a paused child is
resumed by a later run, whose `IterationChildren` is new and holds neither. The resumed child's first attempt starts from
its record, so nothing is lost there — but when REQ-ORCH-088's fallback retry restarts it, the payload is assembled again
(`execute`'s `payload()`), and it now carries no `PRIOR AGENT CONTEXT (FULL)` block and no inherited-context block, with
nothing said to the child or the caller. The comment above `rememberAttachments`' use ("a child does not outlive the run
that spawned it") predates PD-ORCH-005.

Noticed 2026-09-29 while repairing `suppress_auto_context` (R-067), whose flag was stored on the child's record
(`children.suppress_auto_context`, v25) for exactly this reason. Established by reading the code; not driven.

## Specs

REQ-TOOLS-154 fixes the payload's order, (4) the attached artifacts' full bodies and (5) the inherited-context block among
it; REQ-LIBRARY-098 and REQ-TOOLS-152 say what they carry. A retry's payload that omits them is not the payload those
requirements assemble. PD-ORCH-005 (clause 4: "a retry starts from its payload") is what lets the retry happen in a
later run. The ids themselves are on the record (`children.inherited_context`); the attachment references are not.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `IterationChildren.attached` and `.inherited` (in memory),
  `rememberAttachments`, `execute`'s `payload()`, `artifactContext`.
- `packages/store/src/schema.ts`, `packages/store/src/dal.ts` — where the attachment references would be stored with the
  child, as `write_scope` and `suppress_auto_context` are.

## Repaired 2026-09-30 under R-067 (acceptance finding A25)

**Confirmed first.** A case driven through `Sessions` over a real store and the session's artifact store (below) paused a
child that depended on a completed sibling, named it in `inherited_context` and attached its report, resumed it with the
Continue action, and let its hard timeout retry it on the role's fallback. On the unrepaired code the retry's payload read
the workspace root, the sibling index and the task only: no `PRIOR AGENT CONTEXT (FULL)` block and no inherited-context
block, as this note says — and no REQ-ORCH-047 prior-agent-context block either, which the note did not name. That third
loss has the same cause in another form: the block is guarded by `children.context_injected`, which the first run had set,
so the later run's `execute` rendered none, where a retry within the first run reuses the block it rendered.

**What changed.** Store migration **v28** (appended) adds `children.attach_artifacts` — the call's `attach_artifacts` as
given, `'[]'` when none — and `children.inherited_context_block` — the block rendered at the call from the reports as they
stood then, `''` when nothing was carried. The rendered block is stored rather than re-derived from `inherited_context`,
since a sibling ignored at the call as unfinished may have completed since, and the ids alone would not say which counted.
`ChildLedger.spawn` writes both (`SpawnInput.attachArtifacts`; the block rendered by `inheritedContextBlock`).
`IterationChildren`'s in-memory `attached` and `inherited` maps are removed; `execute`'s `payload()`, `startingPayload`
(a follow-up of a child that never started) and `artifactContext` read the row. `rememberAttachments` became
`resolveAttachments`, which only resolves the references for the caller's warning, at the call as before. A resumed
execution's retry renders the prior-agent-context block again from its dependencies' rows — still given once in the
conversation the retry's payload starts, and never re-prefixed on a state hop. A row written before v28 carries neither,
and its retry in a later run carries none, as before.

**Pinned by** `packages/engine/src/run/ladder.test.ts`, "REQ-TOOLS-154 with PD-ORCH-005 (the repair of
a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context): …" — fails on the unrepaired code with all three
blocks absent; repaired, the retry's payload equals the first payload exactly, in REQ-TOOLS-154's order — and by
`packages/store/src/store.test.ts`, "REQ-LIBRARY-098 / REQ-TOOLS-152 (R-067): a v27 store migrates to v28; …". The first
execution is reported in `docs/architecture/adr/0012-the-delegated-child-scheduler.md` and its row is in
`docs/architecture/first-executions.md`. No live run shows it: no live-run scenario pauses a child that attached an artifact
and then times it out on a fallback.
