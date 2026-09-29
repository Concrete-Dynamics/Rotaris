## The scripted model client restarts its script for every run

The scripted client keeps its per-agent step counters in the client instance, and each run builds a new client. So a
child resumed by a continue (PD-ORCH-005) takes its script from the first step again, not from where it stood. A driven
proof cannot script "the resumed agent carries on with its next step" in one list. The phase 7 rehearsal's writer asked
for its first `write` again after the continue. A relaunch resets the counters in any case.

Noticed 2026-09-27 by PD-ORCH-005's phase 7 rehearsal.

## Specs

None. The scripted client is verification only. What the product sends a resumed agent is the agent's own record,
which this does not touch.

## Relevant files

- `apps/desktop/src/run-host/scripted-client.ts` — `calls`, keyed by agent and task line, per client instance.
