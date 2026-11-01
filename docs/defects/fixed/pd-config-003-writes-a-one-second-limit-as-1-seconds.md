## PD-CONFIG-003 writes a one-second per-agent limit as "1 seconds"

`PD-CONFIG-003` revision 3's `<limit>` bullet says the limit on a cut-off agent's line is written "1 minute" or "<m> minutes"
for a whole number of minutes, "and '<N> seconds' otherwise" — so a one-second limit reads "1 seconds". The build writes
"1 second" (`timeoutLimitText`, `packages/ui/src/agents.ts`, through `countNoun`; pinned by `agent-timeout.test.ts`), and
revision 3's own first execution recorded the departure ("except that one second reads '1 second'") without the directive
following it. The case can be reached: `runtime.child_timeout` is an integer of at least 1 second with no upper bound in the
workspace file (`packages/contracts/src/config.ts`, REQ-CONFIG-113), though the widget offers only 60 to 14,400. The code and
the record disagree; the code is the reading the minutes clause already takes. Recorded 2026-10-13 by fin36 from the R-072
consortium's ruling TS1 before the record is revised.


**Repaired 2026-10-13 (fin36), in the record:** [`PD-CONFIG-003`](../../product/directives/pd-config-003.md#pd-config-003) revision 4
([OQ-253](../../archive/architecture/open-questions/54-spikes-and-later-questions-21.md#oq-253), ruled under R-072) writes the bullet "1 second" or "<N> seconds",
revision 3's text quoted beside it; the back-pointers under REQ-MONITOR-052 and REQ-MONITOR-069 name revision 4. No code
changed: `agent-timeout.test.ts` already pinned "1 second" and was run again, green.

## Specs

- `PD-CONFIG-003` revision 3, "Where a cut-off agent shows", the `<limit>` bullet; REQ-MONITOR-052 and REQ-MONITOR-069 carry
  its back-pointers. Raised as [OQ-253](../../archive/architecture/open-questions/54-spikes-and-later-questions-21.md#oq-253). REQ-ORCH-088's error form "Child timed out
  after <N>s" is a different text and is not affected.

## Relevant files

- `docs/product/directives.md`: `PD-CONFIG-003`, revision 3's `<limit>` bullet and its first execution.
- `packages/ui/src/agents.ts` (`timeoutLimitText`) and `packages/ui/src/agent-timeout.test.ts`: the built "1 second".
