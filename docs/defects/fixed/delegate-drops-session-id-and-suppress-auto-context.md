## `delegate` drops `session_id` and `suppress_auto_context`

The `delegate` tool's schema accepts `session_id` and `suppress_auto_context`, and `execute` never forwards either:
`DelegateRequest` has no field for them, and every child runs with `delegationSessionId: null` and the automatic context
it would have got anyway. A caller that sets either is told nothing and gets the default.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../../product/requests.md#r-058)). Established by reading the code; not driven.

## Specs

`REQ-TOOLS-152` lists both as `delegate` fields (`session_id`: "reuse a previous delegation's session for a retry or a
follow-up"). Neither has any effect. What reusing a session would mean is itself undefined; OQ-66 recorded that.

## Relevant files

- `packages/agent-tools/src/tools/delegation.ts` — the schema and `execute`.
- `packages/engine/src/children/delegation.ts` — `DelegateRequest`.
- `packages/engine/src/sessions.ts` — `delegationSessionId: null`.

## Read by PD-ORCH-005's build — 2026-09-27, not repaired

PD-ORCH-005 resumes an agent from its own record under its own task id. It gives `session_id` no meaning, and it
neither needs nor defines "reusing a previous delegation's session". The field still has no effect, and what it would
mean is still OQ-66's open part. Nothing in the resume depends on it, so the fix is not part of this build.

## Ruled 2026-09-29 — what `session_id` means (R-067), not repaired

OQ-66's open part is ruled ([R-067](../../product/requests.md#r-067)): `session_id` names, by task id, a settled child of
the caller — a direct child that reached a terminal state and that its `child_timeout` did not cut off (a cut-off child
keeps `continuation_of`). The follow-up resumes that child from its recorded conversation under its own task id, with the
call's `task` appended as its next user message; a `session_id` naming no such child is refused `rejected` with no record.
[`PD-ORCH-005`](../../product/directives.md#pd-orch-005) revision 5 (clause 22) and
[`PD-TOOLS-006`](../../product/directives.md#pd-tools-006) revision 3 carry it. `suppress_auto_context` needed no ruling:
REQ-TOOLS-152 and REQ-TOOLS-154 (3) already say what it does. This note stays open until both fields are built.

## `suppress_auto_context` repaired 2026-09-29 under R-067 — `session_id` still open

The `suppress_auto_context` half is built. `delegate`'s `execute` forwards the flag (`DelegateRequest.suppressAutoContext`);
`ChildLedger.spawn` stores it with the child (`children.suppress_auto_context`, store migration v25, appended), so every
assembly of the payload reads it — the first, REQ-ORCH-088's retry, and a resumed child's retry in a later run; and
`IterationChildren.artifactContext` omits REQ-LIBRARY-097's `PRIOR SIBLING ARTIFACT INDEX` (REQ-TOOLS-154 item (3)) when
the row carries it. The attached artifacts, which the caller named explicitly, are carried either way, and the
`context_selection` diagnostic records `sibling_index_suppressed`.

The persona-level setting REQ-TOOLS-152 names is REQ-CONFIG-107's `skip_auto_sibling_context`. The loader parsed it and
nothing read it: the run host's persona resolver (`apps/desktop/src/run-host/configuration.ts`) now maps it to
`Persona.skipAutoSiblingContext`, and `artifactContext` omits the index for every child of that role. It is configuration,
read at each assembly, and is not copied onto the record.

Pinned by: `packages/agent-tools/src/tools/delegation.test.ts` ("delegate — suppress_auto_context"),
`packages/engine/src/children/children.test.ts` ("REQ-TOOLS-152 / REQ-TOOLS-154 (3): suppress_auto_context omits the
sibling-artifact index" — the default gives it, the call's flag omits it and is stored, the role's setting omits it, the
attachments survive it), `apps/desktop/src/run-host/configuration.test.ts` ("skip_auto_sibling_context reaches the
persona") and `packages/store/src/store.test.ts` (v24 → v25). Each fails on the code before the repair.

Noticed while building it: a resumed child's retry loses its attachments and its inherited context, which the run kept in
memory — [`a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md`](../a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md).

The note stays open for `session_id` (PD-ORCH-005 clause 22, PD-TOOLS-006 revision 3), which is another bundle's.

## `session_id` repaired 2026-09-29 under R-067 — the note is closed

Repaired 2026-09-29 under [R-067](../../product/requests.md#r-067). Both halves are now built, so the note is in `fixed/`.

**What changed.**
- `delegate`'s `execute` forwards `session_id` (`DelegateRequest.sessionId`). `IterationChildren.delegate` hands a call
  that carries one to `followUp`, which creates no record. The tool's description tells the model what the field does.
- The refusals are `PD-TOOLS-006` revision 3's: status `rejected`, no record touched, no task id. A `session_id` is refused
  when it is no task id of the caller's own children (REQ-TOOLS-155's test, the root's under any of its names), when it
  names a child that has not ended, and when it names a child its `child_timeout` cut off. The last reason names
  `continuation_of`.
- The writer's `followUpChild` makes REQ-MONITOR-300's one exit from a terminal state in one transaction, as clause 22
  narrows it (`isLegalFollowUp`, `FOLLOW_UP_STATE` in `packages/contracts/src/children.ts`). The child moves to `queued`;
  its completion time, report and observation are cleared (`StoreDal.reopenChild`, a statement over existing columns, so
  no migration); the call's `task` joins its conversation record as a user message; and `child.transition` and a
  `child_resumed` timeline entry are written.
- The scheduler starts the child as any queued child. `execute` finds a conversation in its record and carries on from it
  (`resumedStart`), as a resumed agent does, instead of from its payload. The child then ends, reports and notifies its
  parent again.
- The stored write scope is claimed again. A call the record left open is answered as cut off first. A follow-up waits for
  a cancelled child's execution to wind down. A child that never started is given its payload first, and REQ-ORCH-048's
  cascade leaves it. OQ-130 records these readings and the ones clause 22 does not state.

**Pinned by.**
- `packages/agent-tools/src/tools/delegation.test.ts` ("delegate — session_id"): the id reaches the port, and the
  description names it.
- `packages/engine/src/children/children.test.ts`:
  - "the transition table", for the follow-up move;
  - "the writer's follow-up reopens a settled child", at the ledger against a real store;
  - the describe "PD-ORCH-005 clause 22 / PD-TOOLS-006 revision 3", thirteen cases in all:
    - the follow-up resumes under its own task id from its record, and reports and notifies again;
    - `run_in_background: false`;
    - the three refusals (unknown, a name, another agent's child), the live child, and the cut-off child;
    - the blocked child;
    - a follow-up paused while waiting for a model slot, which the continue starts from its record;
    - the cancel race;
    - the open call.

The tool's two cases and the first seven engine cases were written first. Each failed on the code before the repair:
the id was dropped, and a fresh child `survey_1` was spawned. The later cases were checked by removing their own limb,
and each then failed:
- the cascade's exemption and the payload-first record, for the blocked child;
- the start from the record, for four cases;
- the wait for the winding-down execution, for the cancel race;
- the open-call answer, for the open call.

The live check the task named as optional was not made.
