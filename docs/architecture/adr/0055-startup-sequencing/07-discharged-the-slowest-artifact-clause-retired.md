# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — Discharged — the slowest-artifact clause, retired 2026-09-01

Part 7 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## Discharged — the slowest-artifact clause, retired 2026-09-01

This record previously carried: *"Measurement on the slowest artifact shows the 5 s budget cannot be met
even with an empty first paint — the remedy would be a bundle-mode change, and the portable's single-file
shape is a hard requirement, so the conversation would be about the budget or about what is bundled."*

**The measurement was taken, the clause fired, and its stated remedy was not what happened.** The
portable failed with an empty first paint and with an empty *bundle* — 13,287 ms on a zero-payload build
— so the trigger was met exactly as written. But the conversation the clause predicted, "about the
budget or about what is bundled", turned out to be the wrong pair: SR-7 kept the budget, kept
`REQ-STARTUP-013` and `REQ-STARTUP-031`, kept what is bundled, and changed the **launch mechanism**
instead, with `REQ-STARTUP-155` gaining a first-run-of-a-version exemption and nothing else. The clause
is preserved so a reader can see that it was right about the failure and wrong about the remedy: it
assumed the only variables were the budget and the payload, and the third variable — how the payload
gets onto the disk — was invisible until it was measured.
