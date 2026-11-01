[Product directives](../directives.md) › PD-STARTUP-010

<a id="pd-startup-010"></a>

### PD-STARTUP-010 — the preparation warning outlasts the no-provider notice

**The directive.** On a launch that owes both REQ-STARTUP-165 (c)'s warning — the artifact could not prepare itself and
runs from its run-scoped placement — and the notice that no model provider is authenticated, the warning SHALL be the
current notice once both have been published, and it SHALL stay current until the user dismisses it or a run clears it.
The no-provider notice SHALL be presented once more after that, if it still applies: no provider has been authenticated in
the meantime. Under a second on the notice surface is not "reported" in the sense of REQ-STARTUP-165 (c).

REQ-NOTIFY-024 is narrowed for exactly this pair and nothing else: one notice is still current at any moment, and the
no-provider notice is the one notice that returns after being replaced, by this publication alone. Every other notice is
replaced as the requirement says and does not return; the record of REQ-NOTIFY-268 is unchanged; a starting run clears
under REQ-NOTIFY-028 and REQ-NOTIFY-029 as before.

**Why, and what it costs.** `docs/defects/the-could-not-prepare-warning-is-replaced-within-a-second-on-a-launch-with-no-authenticated-provider.md`,
noticed 2026-10-31: the warning is raised from the post-show activation and the no-provider notice is published at the
open's 800 ms slot, so on a portable's first launch — the one case where a user is told nothing else about a slow start —
the warning is gone before it can be read, and stays only in the diagnostics. The owner ruled that this does not meet
REQ-STARTUP-165 (c). What it costs: one notice that returns, and a first launch on an unwritable root where the
no-provider notice is read second rather than first. What it displaces: REQ-NOTIFY-024's "the replaced notice does not
return unprompted", for the no-provider notice replaced by this warning.

**As built.** Not yet: `postShowActivation` in `apps/desktop/src/main/index.ts` raises the warning before the 800 ms slot
publishes the no-provider notice, which replaces it. The repair is owed with this directive's first execution; `pnpm
portable-proof` B4 then asserts that the warning stays, and the open note moves to `fixed/` when it lands.

> **Narrows:** REQ-NOTIFY-024

*Raised by the owner, 2026-11-01; logged as [R-090](../requests.md#r-090).*
