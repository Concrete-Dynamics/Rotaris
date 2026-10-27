[Product directives](../directives.md) › PD-STARTUP-003

<a id="pd-startup-003"></a>

### PD-STARTUP-003 — with no version metadata the running desktop reports `dev`

When the installation metadata REQ-STARTUP-004 reads is absent, the running desktop SHALL report the literal `dev`, as
REQ-STARTUP-007 states, and not `0+unknown`. The About surface (REQ-SHELL-140) and the update comparison read that value,
and REQ-STARTUP-109's unanswerable comparison names it. Every other sentence of REQ-STARTUP-004 still governs: the version
comes from the installation's own metadata, and a standalone bundle always reports its true release version.

**As built.** `VERSION_WITHOUT_METADATA` in `packages/platform/src/version.ts`.

**Why, and what it costs.** OQ-71: REQ-STARTUP-004 and REQ-STARTUP-007 fix two literals for one case. REQ-STARTUP-007 is
written for the running desktop and its two consumers, and `0+unknown` is not a version REQ-STARTUP-027's grammar parses
either. The owner kept `dev`. What it costs: nothing an installed build can reach; only a development launch reports it.

> **Narrows:** REQ-STARTUP-004

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-71.*
