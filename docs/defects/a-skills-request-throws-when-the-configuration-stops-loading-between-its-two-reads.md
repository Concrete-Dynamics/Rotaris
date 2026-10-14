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
