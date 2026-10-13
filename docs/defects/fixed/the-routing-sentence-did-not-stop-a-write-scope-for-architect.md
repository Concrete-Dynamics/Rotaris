## The routing sentence did not stop a write scope for `architect`

`PD-TOOLS-006` revision 8 (OQ-250) closed the coordinator's routing table with a sentence sending the work a route implies to a
persona whose catalogue entry allows it, and set OQ-216's target of zero `write_scope` refusals for a non-writer. In the duress
live run at `552d346` (session `18a9d22d`, finding V2 and the D3 verdict of its autopsy) the sentence was in 41 of 41 coordinator
requests and the brief clause in 41 of 41 `delegate` descriptions, and req 59 still gave `architect` a `write_scope` for
`docs/decisions.md` (#92, row 168), refused in 5 ms before any record ("The delegation was not started", issue 5). Its reasoning
chose the scope by habit, about overlap ("These are non-overlapping scopes"), never weighing the persona. `delegate`'s own
sentence is "When the child will write files, give write_scope: …": it makes the task the condition and never the persona, and
the `write_scope` field carries no description. Req 65 then quoted the routing sentence and re-routed 30.0 s later: e1
(`architect`, no scope, #111) and e2 (`docs-writer`, `inherited_context`, #163). Every enforced bound held: 0 unknown-tool calls,
0 stray files, 0 impossible briefs. OQ-250's reopening condition (first limb) is met; raised as
[OQ-257](../../architecture/open-questions.md#oq-257).

**Repaired 2026-10-13 (fin38, `fin38-edits-handoff-classifier`) under [`PD-TOOLS-006`](../../product/directives.md#pd-tools-006)
revision 9**, the R-072 consortium's ruling of OQ-257. `delegate`'s write-scope sentence is `WRITE_SCOPE_SENTENCE`
(`packages/agent-tools/src/tools/delegation.ts`): work that writes files goes to a persona whose catalogue entry writes workspace
files, which is given the scope, and a scope given to any other persona is refused and nothing is started; the `write_scope` field
carries `WRITE_SCOPE_FIELD_SENTENCE` in the offered schema. Neither names a persona. Revision 3's refusal, the routing table and
revision 8's sentence are unchanged. OQ-216's target of zero is replaced by a bound (at most one refusal a run, each re-routed by
the next `delegate`), which the harness reads with the seconds to re-route (`routingMissReading`'s `rerouted`, `secondsToNext`
and `flagged`, `apps/desktop/scripts/lib/routing-misses.mjs`). Pinned by the "PD-TOOLS-006 revision 9" cases in
`tools/delegation.test.ts` and `lib/routing-misses.test.ts` (the `552d346` shape), each red on the code before.

## Specs

- No requirement's text is contradicted: REQ-TOOLS-152's `write_scope` (as `PD-TOOLS-006` narrows it) and revision 3's refusal
  behave as written. The miss is against OQ-216's target of zero and OQ-250's reopening condition, which ask for a ruling.

## Relevant files

- `packages/agent-tools/src/tools/delegation.ts`: `delegateTool`'s description (the write-scope sentence) and `delegateSchema`'s
  `write_scope` field, which has no description.
- `packages/engine/src/children/personas.ts`: `ROUTING_WORK_SENTENCE`, `ROUTING` (unchanged by this note).
- `packages/engine/src/children/write-scope.ts`: `scopeWithoutWriterReason`, `fileWriters` — revision 3's refusal (unchanged).
- `apps/desktop/scripts/lib/routing-misses.mjs`: the harness NOTE that counts the refusal against a target of zero.
