## A skills request throws when the configuration stops loading between its two reads

Each of the run host's five `skills.*` requests reads the saved configuration twice. `dispatch.ts` first asks
`skillsUnloaded`, which reads the `skills:` section through `SkillHost.fault`; when that read loads, the request goes on, and
`SkillHost.state` (and `forceLoad`, `loadFile`) reads the section again. If the workspace's or the global `agents.yaml` is
saved with a fatal fault between those two reads, `state` throws (`The workspace configuration did not load, …`) instead of
the request answering OQ-279's refusal (`config.fatal`, the fault as its detail); and `forceLoad`'s own refusal for the same
case is mapped by `dispatch.ts` to `skills.unknown`, as if the skill had not been found. The window is a few microseconds wide,
so it is rare, but a file a person is saving while Settings › Skills redraws is exactly the case.

Noticed 2026-10-14 by fin44's review of `fin44-hooks-and-config` (Task 2), recorded 2026-10-14 by fin45
(`fin45-optional-findings`).

## Specs

- `REQ-CONFIG-478` with OQ-279 (ruled 2026-10-13 under R-072) — a fatal load leaves the configuration unloaded, and the five
  `skills.*` requests are refused with the fatal report as their detail; a throw, or a refusal coded as an unknown skill, is
  neither.

## Relevant files

- `apps/desktop/src/run-host/dispatch.ts` — the five `skills.*` cases and `skillsUnloaded`.
- `apps/desktop/src/run-host/skills.ts` — `SkillHost.fault`, `state` (which throws on an unloaded section), `forceLoad`.
- `apps/desktop/src/run-host/skills.test.ts` — the OQ-279 cases.

## Outcome

*Repaired 2026-10-14 by fin45 (`fin45-optional-findings`).* Confirmed first on the branch: a `SkillHost` whose section loads at
the first read and not at the next made `dispatch`'s `skills.read` throw "The workspace configuration did not load, …"
(`skills.test.ts`, "a file that stops loading between the request's first read and the next is still answered with the
refusal", red before the repair). `SkillHost.state` and `forceLoad` now throw `SkillsUnloaded`, which carries the fault, when the
read they make does not load (`forceLoad` used to return it as a reason, which `dispatch.ts` coded `skills.unknown`); the five
`skills.*` cases answer through `skillsAnswer` (`dispatch.ts`), which refuses at once on `skillsUnloaded` as before and turns a
`SkillsUnloaded` raised by any later read into the same `config.fatal` refusal, the fault as its detail. The case drives
`skills.read`, `skills.forceLoad` and `skills.rescan` through `dispatch`. No proof can place a save between two reads microseconds
apart; the unit case is the evidence. `03-runtime-view.md` §8 says so.
