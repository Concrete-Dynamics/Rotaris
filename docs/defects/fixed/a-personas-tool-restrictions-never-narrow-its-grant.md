## A persona's `tool_restrictions` never narrow its grant

REQ-TOOLS-006 names four controls that narrow a persona's declared tools. The fourth is the per-persona
`tool_restrictions` map. The configuration loader parses that map for each persona (`tool_restrictions`, a map from a
name to an allowed-tool list, as REQ-CONFIG-103 describes it). The registry's `narrow` has a `tool_restrictions` stage.
Nothing connects the two. The run host's tool port calls `resolveToolSet` with the persona's name, tools,
`coordinator_only` and `read_only`, and never with its restrictions, and the engine's `Persona` carries no such field.
So a configured `tool_restrictions` removes nothing from any agent's tools. The two shapes also differ: the
registry's stage takes a map from a tool to `false`, while the loader and REQ-CONFIG-103 hold a map from a name to an
allowed-tool list. REQ-CONFIG-103's "restricts named entities" does not say which entities its keys name. REQ-CONFIG-062
canonicalises those keys as role names.

Noticed 2026-09-29 while building `PD-TOOLS-006` revision 3's refusal. That refusal reads a persona's tools "after
REQ-TOOLS-006's controls", and OQ-112's build note records that it follows the grant the tool port actually builds.
The refusal therefore ignores `tool_restrictions` as well, and it will need to read the map once the map is applied.
Not reproduced in a built app.

## Specs

- `REQ-TOOLS-006` (4): "the per-persona `tool_restrictions` map", one of the four controls that narrow a persona's
  declared tool set. The build applies the first three and not this one.
- `REQ-CONFIG-103` (the field's type, and what it restricts), `REQ-CONFIG-046` and `REQ-CONFIG-062` (its merge and its
  keys). What the map's keys and lists mean for the resolution is not settled, and settling it is an open question
  before it is code.

## Relevant files

- `apps/desktop/src/run-host/tools.ts` — the `resolveToolSet` call, which passes no `toolRestrictions`.
- `packages/agent-tools/src/registry.ts` — `narrow`'s `tool_restrictions` stage (`Record<string, boolean>`) and `PersonaToolConfig`.
- `packages/config/src/sections/personas.ts` — `tool_restrictions` parsed as `stringListMapOrNull`.
- `apps/desktop/src/run-host/configuration.ts` — `personaResolverFor`, which builds the engine `Persona` without it.
- `packages/engine/src/children/write-scope.ts` — `writesFiles`, which reads the same two controls the port applies.

## Outcome

Repaired 2026-09-29 under R-067 (acceptance finding A4), under the reading raised as
[OQ-141](../../architecture/open-questions.md) — the requirements do not settle whose grant an entry narrows:
- **The map reaches the grant.** `personaResolverFor` now carries the loader's `tool_restrictions` onto the engine
  `Persona` (`toolRestrictions`). The tool port reads, with `toolRestrictionsFor`, the lists its own persona's map and
  the delegating persona's map give the agent's persona name. The engine hands every child's port that persona as
  `ToolPortContext.parentPersona`, taken from the ledger (`IterationChildren.parentPersonaOf`); the entry agent has none.
- **One shape, REQ-CONFIG-103's.** The registry's `tool_restrictions` stage now takes those allowed-tool lists instead
  of a map from a tool to `false`. A tool survives only when every list names it (`restrictionsAllow` in
  `@rotaris/contracts`: an alias counts as its tool, and `delegate` carries its two companions). Every removal is logged
  `by tool_restrictions` with the persona. A tool-server tool the list does not name is withheld: it is taken off the
  MCP surface before the executors and the prompt's MCP section are drawn from it, so the section never prints a name
  the agent cannot call (REQ-MCP-062). The first form skipped it only in the executor loop and still printed it; the
  verifier found that, and the MCP case now renders through the real `renderMcpSection` and asserts the section.
- **The write-scope refusal reads the same lists.** `writesFiles` and `fileWriters` take the delegating persona, so a
  persona that persona's map restricts to reading cannot take a `write_scope`. The reason names only the writers that
  map lets write.

Pinned by `run-host/tools.test.ts` ("REQ-TOOLS-006 (4): the per-persona tool_restrictions map narrows the grant"), five
cases through the loader and the real port, four of them red on the old code. The unrestricted case passed before and
after. Also by `policy.test.ts`'s stage case and `write-scope.test.ts`'s case, and by two `children.test.ts` cases
(the parent persona reaching the port, the refusal under the parent agent's map), both red with `orchestration.ts` reverted.
Not measured in a built app: no proof or live-run scenario configures `tool_restrictions`.
