[Product directives](../directives.md) › PD-STARTUP-002

<a id="pd-startup-002"></a>

### PD-STARTUP-002 — a launch the product starts itself is neither the instance nor handed to it

REQ-STARTUP-161's two outcomes SHALL govern every launch a person makes. A launch the running product starts itself,
carrying a reserved token first on its command line that no user-facing invocation defines (REQ-STARTUP-015), SHALL take
neither outcome: it is admitted outside the instance claim and is not handed to the running instance. There are three:

1. **The code-intelligence child**, `builtin:code-intelligence` (REQ-MCP-033, REQ-STARTUP-002). Its branch runs before the
   claim and ends without opening a window, creating the instance record or a data directory.
2. **The update-restart successor**, `builtin:update-successor` (REQ-STARTUP-121). It takes over the record from the
   predecessor that started it rather than claiming one, and ends quietly, starting nothing, when the predecessor refuses it.
3. **A benchmark iteration child** (REQ-UIBENCH-037 to REQ-UIBENCH-039), marked by its parent the same way. It runs with
   its redirected configuration home and never reads or writes the user's instance record.

None of them is a second instance, and REQ-STARTUP-161's last sentence still holds: no configuration key, environment
variable, preference or control a user can set starts one.

**As built.** The first two (`apps/desktop/src/main/sentinel.ts`, ahead of main's body; `inheritInstance` beside
`claimInstance` in `apps/desktop/src/main/index.ts`). The third is not built: ADR-0053's benchmark harness does not exist, so
no iteration child is started, and its marker (constraint W-14) is owed with the harness.

**Why, and what it costs.** OQ-43: REQ-UIBENCH-037 to REQ-UIBENCH-039 make a benchmark iteration a fresh child of the
product's own program, and REQ-UIBENCH-046 requires the user's settings untouched afterwards. If the gate handed that child
to the running instance, the measurement would run against the user's real preferences and still report numbers. "Which
processes the gate admits" has a security flavour, so the owner had the exception stated rather than inferred. What it
costs: the single-instance rule has three named exceptions, each a launch only the product makes.

> **Narrows:** REQ-STARTUP-161

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-43.*
