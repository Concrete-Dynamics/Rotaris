---
reference: ROTARIS-CRW-001
domain: requirements-adoption
date: 2026-10-29
status: decided
---

# Resolution Record — Domain 22, Requirements Adoption Assistant

> ## Amendment, 2026-10-29 — the adoption assistant (R-088): thirty identifiers decided, not derived
>
> REQ-ADOPT-001 to REQ-ADOPT-030 were minted at the owner's explicit ask
> ([R-088](../../product/requests.md#r-088)): "Rotaris' specification-driven development must work end to end … there
> is no agentic adapter that inspects a foreign project's actual requirement layout and brings it into the format
> Rotaris can read", with the adapter "dynamically built and executed", "offered by a button", refreshable "on an
> initial run and on a re-run", detecting the structure "by script/tooling", and finding "new requirements that were
> added to the codebase since the last run".
>
> This departs from domain 08's resolution row 11 ("Automatic project-structure detection is withdrawn rather than
> specified") **for this surface only**. [`PD-TRACE-001`](../../product/directives/pd-trace-001.md#pd-trace-001)
> narrows REQ-TRACE-155 to admit it; the four toolchain operations of REQ-TRACE-508 to REQ-TRACE-511 stay the whole
> of what the toolchain offers, REQ-TRACE-152's write set is unchanged, and row 11's reason — that a detector
> proposing a layout would be "a second, rival definition of the repository's shape" — is answered by the design:
> the assistant's output **is** the layout file of REQ-TRACE-040, validated by the toolchain's own rules, written
> only on the user's choice and never over an existing one (REQ-ADOPT-019).
>
> The layer rule of [`../README.md`](../README.md) (requirements are derived from the behavioural target) does not
> hold for these identifiers; each says so at the domain's heading, as REQ-STARTUP-169 to REQ-STARTUP-181 do.
