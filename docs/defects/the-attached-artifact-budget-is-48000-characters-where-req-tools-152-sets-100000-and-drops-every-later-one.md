## The attached-artifact budget is 48,000 characters where REQ-TOOLS-152 sets 100,000 and drops every later one

Two requirements budget the same block, a delegated agent's attached artifacts (`attach_artifacts`), differently, and the
build follows neither whole:

- **REQ-TOOLS-152** budgets "the attached-artifact section of the child's payload" at **100,000 characters**. Attachments are
  considered in the caller's order, and "the first whose full body would carry the section past the budget is dropped, and
  so is every attachment after it"; "the observation warns how many were dropped for size (REQ-TOOLS-153)".
- **REQ-LIBRARY-098** injects the attached artifacts "as a `PRIOR AGENT CONTEXT (FULL)` block within a **48,000-character**
  budget, reporting unresolvable references and elided ids".
- **The build** uses 48,000 (`FULL_CONTEXT_BUDGET`, `packages/engine/src/artifacts/context.ts`) and, where a body does not
  fit, skips that body and keeps trying the later ones (`fullContextBlock`'s `continue`), so a short attachment listed after
  a long one is still carried. The elided ids are reported to the child inside its block and recorded on the timeline's
  `context_selection` entry, not to the caller.
- **The delegate tool's observation** says "N artifacts were attached to its context"
  (`packages/agent-tools/src/tools/delegation.ts`), where N counts the references resolved at delegation
  (`resolveAttachments` in `packages/engine/src/children/orchestration.ts`), before the budget is applied when the child's
  payload is built. So the caller can be told an artifact was attached that the child never received, and no observation
  warns how many were dropped for size.

Noticed 2026-10-07 by the OQ-207 consortium (advocate A, and the ruling agent's correction of it) and recorded by fin28 while
building `PD-SESSION-002`, which counts the build's elisions as `summary.md`'s mostly-elided artifacts. Recorded, not repaired:
which budget and which dropping rule govern is a conflict between two requirements, to be classified on its own (an open
question, or a defect found by building and its amendment round).

## Specs

REQ-TOOLS-152 (100,000 characters; the first overflowing attachment and every later one dropped; the observation warns how
many were dropped for size, REQ-TOOLS-153) against REQ-LIBRARY-098 (48,000 characters; elided ids reported). The build meets
REQ-LIBRARY-098's figure and neither requirement's whole: its skip-and-continue matches REQ-TOOLS-152's "never partial" but
not its "every attachment after it", and its observation counts attachments before the budget.

## Relevant files

- `packages/engine/src/artifacts/context.ts` — `FULL_CONTEXT_BUDGET` (48,000) and `fullContextBlock`, which skips an
  overflowing body and keeps later ones.
- `packages/engine/src/children/orchestration.ts` — `resolveAttachments` (the count at delegation) and `artifactContext`
  (the block assembled at payload time, and the `context_selection` entry with `attached_elided`).
- `packages/agent-tools/src/tools/delegation.ts` — the observation's "N artifacts were attached to its context".
- `packages/engine/src/run/summary.ts` — `PD-SESSION-002`'s count of the elided attachments, which reads whatever the
  budget decides.
