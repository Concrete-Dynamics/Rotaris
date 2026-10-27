# Product-owner decisions on the architecture record — Rulings after the gate — 2026-09-27

Part 12 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Rulings after the gate — 2026-09-27

*Ruled together from the first release plan's O-1 ([R-052](../../product/requests.md#r-052)). The owner took
each recommendation as written in `first-release-plan.md` §2.1 and §3.1. Each recommendation was the reading
already built, so the rulings change requirement text and no behaviour.*

### ESC-37, ESC-38, ESC-39 — the three portable-skill escalations, ruled

- **ESC-37: domain 13 stands.** Invoking a skill's command loads it for the current session and delivers it
  as `REQ-WORKSPACE-062`'s force-loaded block, carrying `REQ-CHAT-162`'s three identifying facts and the
  verbatim body. No in-context indicator and no composer chip exist anywhere. Amended: `REQ-CHAT-034`
  (delivery) and `REQ-CHAT-162` (the listing's in-context column and the "mark it as in context" sentence).
- **ESC-38: seven columns.** Skill, Source, Path, Trigger, Invocation, Load, Description. Amended:
  `REQ-CONFIG-343`'s count.
- **ESC-39: suffixed.** A taken command name is offered under `REQ-SHELL-056`'s first free `-2`, `-3`, …,
  with the description naming the skill. The command takes the catalogue normal form, and the skill's
  identity stays `REQ-WORKSPACE-054`'s normalized name, deliberately two forms. Amended: `REQ-CHAT-034`'s
  collision clause.

Each amended requirement carries an inline amendment mark, and the resolution records of domains 03 and 15
carry the amendment notes. ADR-0063's rulings table now reads as ruled.

**What these rulings change for the first release.** The `/skills` listing (`first-release-plan.md` §2.2) is
built without an in-context column.

### OQ-64 — an instruction override suppresses its base only while it is switched on, ruled

**Ruled 2026-09-27 (R-052), as built.** Suppression is computed over the enabled set: switching an override
off returns its base to the merge, and the Instructions inventory gains no *suppressed* row state.
`PD-WORKSPACE-002`'s injection paragraph states the ruling in place, since that directive governs
`REQ-WORKSPACE-042`. The injection proof (`first-release-plan.md` §3.3) asserts this reading.

### The updater ships in the first release, ruled

**Ruled 2026-09-27 (R-052).** The first release carries the updater of `REQ-STARTUP-107..124`, built to
`REQ-STARTUP-122`'s strict sequence with the installer and portable apply strategies. This is scheduling
within live requirements, so nothing is amended. `first-release-plan.md` §4.6 schedules it.
