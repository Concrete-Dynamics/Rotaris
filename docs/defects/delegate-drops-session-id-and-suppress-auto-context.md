## `delegate` drops `session_id` and `suppress_auto_context`

The `delegate` tool's schema accepts `session_id` and `suppress_auto_context`, and `execute` never forwards either:
`DelegateRequest` has no field for them, and every child runs with `delegationSessionId: null` and the automatic context
it would have got anyway. A caller that sets either is told nothing and gets the default.

Noticed 2026-09-27 by the code survey for the run-continuation policy ([R-058](../product/requests.md#r-058)). Established by reading the code; not driven.

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

OQ-66's open part is ruled ([R-067](../product/requests.md#r-067)): `session_id` names, by task id, a settled child of
the caller — a direct child that reached a terminal state and that its `child_timeout` did not cut off (a cut-off child
keeps `continuation_of`). The follow-up resumes that child from its recorded conversation under its own task id, with the
call's `task` appended as its next user message; a `session_id` naming no such child is refused `rejected` with no record.
[`PD-ORCH-005`](../product/directives.md#pd-orch-005) revision 5 (clause 22) and
[`PD-TOOLS-006`](../product/directives.md#pd-tools-006) revision 3 carry it. `suppress_auto_context` needed no ruling:
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
memory — [`a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md`](a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md).

The note stays open for `session_id` (PD-ORCH-005 clause 22, PD-TOOLS-006 revision 3), which is another bundle's.
