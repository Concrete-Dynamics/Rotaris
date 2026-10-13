## An answer handed on through inherited context reaches the writer cut to 4,000 characters

`PD-TOOLS-006` revision 8's routing sentence tells the coordinator, where a route's persona lacks what the work needs, to ask it
for its answer and hand that answer on "through `depends_on` or `inherited_context`" to a persona that has what the work needs.
The two channels did not carry the same thing. The inherited-context block (REQ-TOOLS-154 item 5) rendered each sibling with
`reportBlock`, REQ-ORCH-060's resume-message block, whose result text is capped at 4,000 characters; REQ-ORCH-047's prior-agent
block carried the whole answer with no bound. No channel a child holds carries the rest: `artifact_read` of a child report
returns summary, findings and commands, not the final response.

Measured in the duress live run at `552d346` (session `18a9d22d`, finding V1 of its autopsy): the architect e1's 28,330-character
analysis reached the docs-writer e2 as 4,000 characters and "… [24330 characters omitted]" (req 99), and the verifier f1's
20,195-character report reached f2 with "… [16195 characters omitted]" (req 156) — 14 % and 20 % of the answers. e2 spent 7 hunting
calls (`artifact_read`, `artifact_list`, `glob`, three reads under `.rotaris`) and 12 of its 24 steps on the cut, then wrote 7 of
`docs/decisions.md`'s 8 file sections from its own reading, against a brief saying the judgement was already made; the user's
answer credits them to the architect. The coordinator spent #243 to #246 and a 7,123-character brief re-typing f1's findings, and
every harness check passed over it. Raised as [OQ-256](../../architecture/open-questions.md#oq-256).

**Repaired 2026-10-13 (fin38, `fin38-edits-handoff-classifier`) under [`PD-TOOLS-006`](../../product/directives.md#pd-tools-006)
revision 9**, the R-072 consortium's ruling of OQ-256. `inheritedContext` and `priorAgentContextParts`
(`packages/engine/src/children/notify.ts`) render both hand-off blocks with each named task's whole result text under one
100,000-character budget per block (`HAND_OFF_BUDGET`, `packages/kernel/src/hand-off.ts`); an answer that does not fit is cut to
the larger of the remainder and 4,000 characters and ends in `handOffMarker`, which tells the child what it lacks and that its
report must say so. The cuts reach the caller through `Spawned.inheritedCuts` and `DelegateOutcome.handOff` (with a forecast for a
`depends_on` task already complete), rendered by `handOffWarnings`; `delegate`'s description says what each field carries
(`HAND_OFF_SENTENCE`). `reportBlock` and its 4,000-character cap stay on the resume message and the wait results. The 28,330-character
answer now reaches the writer whole. Pinned by the "PD-TOOLS-006 revision 9" cases in `notify.test.ts`, `children.test.ts` and
`tools/delegation.test.ts`, each red on the code before; the live run's NOTE counts cut answers (`lib/hand-off-cuts.mjs`).

## Specs

- `PD-TOOLS-006` revision 8 presents `depends_on` and `inherited_context` as one route for an answer; the build delivered 14 %
  through one and 100 % through the other.
- REQ-TOOLS-152 says `inherited_context` carries "reports" and names no cap; REQ-ORCH-060's 4,000-character cap is written for
  "each per-child report block in a resume message", not for a child's payload. REQ-TOOLS-152 says `depends_on` carries "summary
  and key findings", which REQ-ORCH-047 contradicts (final response, else last response). Which channel carries an answer whole,
  and whether the child is told of a cut, is a question the specification leaves open, for a ruling.

## Relevant files

As they stood when the note was written.

- `packages/engine/src/children/notify.ts`: `REPORT_BLOCK_CAP`, `cap`, `reportBlock`, `inheritedContextBlock`, `priorAgentContext`.
- `packages/engine/src/children/ledger.ts`: `spawn` stores the inherited block at the call.
- `packages/engine/src/children/orchestration.ts`: `delegate`'s accept path, the payload assembly.
- `packages/agent-tools/src/tools/delegation.ts`: `delegate`'s description, which does not say what each channel carries.
