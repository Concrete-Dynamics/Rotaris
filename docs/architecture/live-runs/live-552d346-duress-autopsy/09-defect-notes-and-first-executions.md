# Live-run autopsy — origin/main `552d346`, final duress pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Defect notes and first executions

Part 9 of 9 of [the autopsy](../live-552d346-duress-autopsy.md), which indexes every part.

## Defect notes and first executions

- **New, not recorded** (the brief made this examination read-only; CLAUDE.md's standing policy records such notes without
  asking):
  - **V1**, a product defect needing a ruling: proposed note
    `an-answer-handed-on-through-inherited-context-reaches-the-writer-cut-to-4000-characters.md`.
  - **V2**, OQ-250's reopening condition met; this needs a ruling. Proposed note:
    `the-routing-sentence-did-not-stop-a-write-scope-for-architect.md`.
  - **V3**, evidence for Q2; no note yet.
- **First executions this pack reports, each owed in place plus a `first-executions.md` row:**
  - **OQ-214's second ruling / PD-CONFIG-003's raised limit:** PASS, with f1 at 1,253.2 s in one life. The tag (revision 3) was
    NOT REACHED.
  - **PD-TOOLS-006 revision 8 / OQ-250:** 1 refusal against a target of 0, so the reopening condition is met. The enforced
    bounds held. The prescribed hand-off ran twice and lost 86 % and 80 % of the answer (V1).
  - **PD-TOOLS-008 revision 2 and PD-TOOLS-006 revision 7 under duress:** PASS. 0 restored-COMPLETED replaces, 0 s.
  - **PD-ORCH-016 and the loop-classification cap:** reached once and held. Not discriminating.
  - **PD-TOOLS-012 (OQ-215) duress measurement:** file tools clean, no marker files in the deliverables.
  - **D8 note:** 0 lines.
  - **Found nothing because not reached:** the D1 repair, XE1/OQ-245, PD-TOOLS-013 revision 2, PD-ORCH-015,
    PD-TOOLS-014/015/016, PD-CONFIG-003 revision 3 (CN1), and the D9 repair.

**Highest-cost finding: V1.** The route the routing sentence prescribes handed the writer 14 % of the architect's
548-second analysis and 20 % of the verifier's report. As a result, `docs/decisions.md` is mostly the writer's own judgement,
and the user's answer says otherwise. V1 and V2 are ready to be recorded in `docs/defects/` on a go-ahead, and both need a
ruling.
