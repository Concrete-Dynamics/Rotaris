# Archived owner decisions — Rulings after the gate — 2026-09-27

The ruled escalations, structural rulings and gate decisions of [part 12](../../../architecture/owner-decisions/12-rulings-after-the-gate-2026-09-27.md) of [the owner decisions](../../../architecture/owner-decisions.md) whose ruling the specification carries, each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/owner-decisions.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="esc-37"></a>

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
