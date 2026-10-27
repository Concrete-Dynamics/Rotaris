# Resolution Record — Domain 13, Workspace Handling, Context Injection, and Project Onboarding — Escalations

Part 4 of 4 of [domain 13's resolutions](../13-workspace-context-onboarding.md), which indexes every part.

## Escalations

None. Every open question was decided in this record.


> ## Amendment, 2026-09-02 — the machine setup state names its per-user location by citation
>
> The Data & Formats section spelled `<per-user-data-dir>/setup/state.json` and
> `<per-user-data-dir>/tools/…` without saying which per-user directory that is. `REQ-STARTUP-145` now
> fixes that, once, including the selection between a replicated and a machine-local location on a
> platform that offers both, and it directs every requirement that places something in a per-user
> directory to cite rather than restate. The appendix now carries that citation, and names
> `REQ-STARTUP-070` as the owner of the layout itself.
>
> This is an appendix-level correction rather than a defect: nothing here ever asserted the property, so
> nothing here was wrong. What it prevents is a reader who arrives at the appendix instead of at the
> requirement concluding that the location is unstated, which is the reading that produced the defect the
> round was landing.
>
> `REQ-WORKSPACE-036`'s "a snapshot that is absent, or that fails that specification's validation, SHALL
> contribute nothing and SHALL NOT make configuration load fail" was checked against the ESC-28 / ESC-29
> ruling and is unchanged. It already routes a failed snapshot away from a load failure, which is the
> direction the ruling moves in, and it says nothing about keys under `requirements:`, whose unknown-key
> rule the ruling leaves unweakened.
