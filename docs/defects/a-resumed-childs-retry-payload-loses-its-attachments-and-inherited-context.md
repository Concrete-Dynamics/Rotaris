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
