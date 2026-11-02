## `sessions-proof` and `checkpoint-proof` assert `session_marked_interrupted`, a name the product no longer writes

OQ-46's audit of REQ-SESSION-062 found that the stale-session repair had invented every field of its
diagnostics entry but the actor, and corrected it: the entry is written as
`session.interrupted_recovered` with severity `warning`, `previous_execution_status` beside
`execution_status`, and the requirement's message. The product was corrected; the proofs that assert the
invented name were not. `sessions-proof` fails at the repair scenario —

```
Error: no session_marked_interrupted entry
```

— and `checkpoint-proof` carries the same assertion at its own repair step. Both fail AFTER asserting that
the repair itself worked (the status reads `interrupted`, the orphaned lock is released, the report names
the dead pid), so the red is about the name the proof looks for, not about the repair.

The name is not the only field the audit corrected and the proof did not follow: `sessions-proof` also asserts the
written entry's severity is `info`, the default the first implementation used, where REQ-SESSION-062 fixes `warning`
and the product writes `warning`.

Everything the two scripts measure after that line has been unmeasured since — in `sessions-proof` that is
the export's timeline shape, the 12-hex entry id, the empty-record case and the disclosure paragraphs.

## Specs

REQ-SESSION-062 fixes the entry's type, severity, actor, message and metadata keys, and the product meets
it: `packages/engine/src/sessions.ts` `repairOne`, covered by `session-actions.test.ts`. No requirement is
contradicted. What failed is `.claude/rules/tests-and-proofs.md` — a change runs the suite it touches, and
a corrected name touches every proof that reads the timeline by name; the unit tests were updated in the
same breath and the proofs were not, which is exactly the blind spot proofs exist to cover.

## Relevant files

- `packages/engine/src/sessions.ts` — `repairOne`, which writes `session.interrupted_recovered`.
- `apps/desktop/scripts/sessions-proof.mjs` — the repair scenario's count, the export's timeline names and
  the empty-record case (six occurrences).
- `apps/desktop/scripts/checkpoint-proof.mjs` — the same assertion at its repair step (two occurrences).
- `docs/architecture/open-questions.md` — OQ-46, closed 2026-09-06 and implemented 2026-09-13.

Noticed 2026-09-17 by Part AT (`PD-LIBRARY-002`) running the wider proof sweep, and confirmed to pre-date
that work by running `sessions-proof` against a clean `main` build, where it fails identically.

## Repaired — 2026-09-17

Both scripts now assert the name the specification fixes and the product writes — and the severity it fixes,
`warning` — with a comment at each corrected assertion naming the audit and this note, so the next reader does not
"restore" the invented spelling. `pnpm sessions-proof` and `pnpm checkpoint-proof` now pass every assertion around the repair. Both then fail FURTHER ON, each at something the stale name had been hiding — `sessions-proof` at `plan_cycles` having no cascade (`../a-session-delete-leaves-its-plan-cycles-behind.md`) and `checkpoint-proof` at a Start session dialog that accepts and creates nothing (`../the-start-session-dialog-accepts-and-creates-nothing.md`). Both are recorded and neither is repaired here; the point of this repair is that they are now VISIBLE.
