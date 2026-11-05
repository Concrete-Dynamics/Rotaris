## The `autonomous` confirmation dropped REQ-CONFIG-327's residual-guard clause with no directive

**Outcome: settled by PD-WORKSPACE-009 and repaired 2026-11-05 (plan hrdb, `hrdb-recovered-error-line-and-scope-strings`).**
The Runtime card's two confirmations are now one constant, `RUNTIME_CONFIRMATIONS` in
`packages/ui/src/settings/ConfigSettings.tsx`, and the `autonomous` body says the directive's three statements: mutating tools
inside the workspace run without asking, except the destructive commands the starter rules always deny; a file tool reaching a
path outside the workspace is refused by the path fence and never asked about, unless access beyond the workspace is on; and
terminal commands and MCP tools are not judged by the paths they reach and are bounded only by OS confinement where it is
active. Pinned by `packages/ui/src/settings/runtime-confirmations.test.ts` (the three statements, no "continues to require
approval", the access-beyond-the-workspace words unchanged, both drawn from the constant), red on the base; read in the built
app through `pnpm app:drive` (the dialog's title and body as above, Cancel focused).

Recorded and closed in one landing, as [OQ-468](../architecture/open-questions/69-spikes-and-later-questions-36-continued-5.md#oq-468)'s
ruling asks: the departure was found by that ruling, not by a session that noticed it first.

The Settings › Runtime card's `autonomous` confirmation read "Mutating tools inside the workspace will be invoked without asking,
except for the destructive commands the starter rules always deny." REQ-CONFIG-327 required it to say that mutating tools inside
the workspace run without a prompt "while any call reaching a path outside the workspace continues to require approval", and
called that guard "a behavioral promise the prompt makes and the runtime must keep". The shipped prompt had dropped the clause
with no directive and no open question: an unrecorded departure from the requirement. The clause was itself false of the runtime:
REQ-TOOLS-044 is "exclusive and normative" that, under `autonomous`, a file tool's path outside the workspace never raises an
approval prompt (the fence refuses it, or the opt-out of REQ-TOOLS-130 allows it), and REQ-TOOLS-018 never parses a terminal
command's paths.

## Specs

REQ-CONFIG-327 (the residual-guard clause and its "behavioral promise" sentence), departed from without a directive; settled by
[PD-WORKSPACE-009](../../product/directives/pd-workspace-009.md#pd-workspace-009), which narrows it. REQ-TOOLS-044,
REQ-TOOLS-018 and REQ-TOOLS-130 state what the runtime keeps.

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx` — `RUNTIME_CONFIRMATIONS` and the two `Confirm`s of `RuntimeSettings`.
- `packages/ui/src/settings/runtime-confirmations.test.ts` — the pin.
- `packages/ui/src/settings/Confirm.tsx` — the warning prompt, Cancel the default.
