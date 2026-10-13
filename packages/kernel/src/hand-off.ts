/**
 * `PD-TOOLS-006` revision 9 (OQ-256, ruled 2026-10-13 under R-072): the hand-off budget — how many characters of named tasks'
 * answers one hand-off block of a delegated child's payload carries, for the inherited-context block (REQ-TOOLS-154 item 5) and
 * REQ-ORCH-047's prior-agent-context block alike, each block on its own. The figure revision 5 set for the attached-artifact
 * section. Read by the engine, which renders both blocks, and by `delegate`'s description in `agent-tools`, which tells the
 * caller what the two fields carry; neither package imports the other, so the one figure lives here.
 */
export const HAND_OFF_BUDGET = 100_000;
