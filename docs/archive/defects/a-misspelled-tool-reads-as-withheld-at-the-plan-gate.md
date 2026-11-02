## At the plan gate, a name that is no tool is refused as "withheld until the plan is approved"

`withheldUnderPlanGate` is fail-closed by construction: `withholdsOn` answers `true` on every
facet for a name outside the public registry, which is exactly what REQ-ORCH-153 asks for
("a tool the registry carries no declaration for counting as declaring all three"). The gate's
dispatch check sits ahead of the unknown-tool check, so while the gate is held **any** name
the model produces — including one that has never existed — is answered with the gate's
refusal and its promise that approval will release it.

Observed live on 2026-09-16: a read-only child called `read_path`, a name this product does
not have and never had. It was told the call "is withheld until the plan is approved". No
approval can make that name exist, so the advice is unfollowable; the child spent turns on it
while `read_file` — the tool it actually wanted — was available and working in the same turn.

## Specs

- `REQ-ORCH-153` — the withholding "MUST be enforced where a call is dispatched", so the
  ordering is right and stays. What the requirement binds is the dispatch of a **tool**; a
  name that is no tool dispatches nothing, so nothing is relaxed by answering it honestly.
- `REQ-TOOLS-032` — a call that cannot be executed is a recoverable error naming what was
  wrong. `Unknown tool '<name>'. The call was not executed; choose one of the tools listed.`
  is that answer, and it was unreachable for the whole duration of a hold.
- `REQ-TOOLS-001` — the fail-closed reading of an undeclared name, unchanged.

## Relevant files

- `packages/agent-tools/src/gate.ts` — `Gate.dispatch`: the gate refusal is now given for a
  name that is a tool (an executor holds it, the public registry declares it, or this port
  removed it at the gate) and the rest fall through to the unknown-tool refusal. `GateDeps`
  gained `planGateWithheldNames`, read live, because an MCP or plugin name exists nowhere else
  — the registry cannot recognise it and the port has already removed it. The falsified clause
  of the enforcement-point comment is kept beside its replacement.
- `apps/desktop/src/run-host/tools.ts` — `createToolPort` collects the names it removes at the
  two narrowing points (the declared set and the MCP surface) and hands the set to the gate.

## Repaired — 2026-09-16

Regression tests in `packages/agent-tools/src/gate.test.ts`: "a name that is no tool reads as
unknown, not as withheld: no approval can make it exist"; "refuses a public name the port did
not offer with the gate's reason — approval is what would grant it"; and the existing MCP case
now supplies the port's withheld set, which is what makes it a tool the gate knows of.
