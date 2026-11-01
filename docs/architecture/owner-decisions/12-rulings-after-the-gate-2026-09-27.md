# Product-owner decisions on the architecture record — Rulings after the gate — 2026-09-27

Part 12 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part. Archived in [the archive](../../archive/architecture/owner-decisions/12-rulings-after-the-gate-2026-09-27.md), one index line each here: ESC-37, ESC-38, ESC-39.

## Rulings after the gate — 2026-09-27

*Ruled together from the first release plan's O-1 ([R-052](../../product/requests.md#r-052)). The owner took
each recommendation as written in `first-release-plan.md` §2.1 and §3.1. Each recommendation was the reading
already built, so the rulings change requirement text and no behaviour.*

- ESC-37, ESC-38, ESC-39 — the three portable-skill escalations; ruled 2026-09-27; [archived](../../archive/architecture/owner-decisions/12-rulings-after-the-gate-2026-09-27.md#esc-37)

### OQ-64 — an instruction override suppresses its base only while it is switched on, ruled

**Ruled 2026-09-27 (R-052), as built.** Suppression is computed over the enabled set: switching an override
off returns its base to the merge, and the Instructions inventory gains no *suppressed* row state.
`PD-WORKSPACE-002`'s injection paragraph states the ruling in place, since that directive governs
`REQ-WORKSPACE-042`. The injection proof (`first-release-plan.md` §3.3) asserts this reading.

### The updater ships in the first release, ruled

**Ruled 2026-09-27 (R-052).** The first release carries the updater of `REQ-STARTUP-107..124`, built to
`REQ-STARTUP-122`'s strict sequence with the installer and portable apply strategies. This is scheduling
within live requirements, so nothing is amended. `first-release-plan.md` §4.6 schedules it.
