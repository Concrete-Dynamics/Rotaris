## The intent-classifier persona has no built-in default entry, so any partial `personas:` override for it is fatal

The engine's intent classifier sends `persona: 'intent-classifier'` on every classification
call (`packages/engine/src/intent/classifier.ts`), and REQ-MCP-014's table names
`intent-classifier` as a built-in persona carrying no servers. But the built-in default layer
constructs `personas:` entries only from `BUILT_IN_ROLE_NAMES` — REQ-ORCH-028's thirteen
*delegation* roles, of which `intent-classifier` is deliberately not one — so the merged
configuration contains no `personas.intent-classifier` entry at all. Two consequences:

1. **A partial override in any `agents.yaml` kills the whole configuration.** The defaults'
   design contract ("a `personas:` override that states one field merges onto a complete
   entry and validates") holds only where a default entry exists. A file stating a lone
   `personas: { intent-classifier: { thinking: low } }` merges onto nothing; the resulting
   entry lacks the required `name` and `model` (REQ-CONFIG-098), the persona reader pushes
   two schema errors, and `resolveMerged` turns any schema error into a fatal load. Every
   surface that re-loads the configuration — the Settings screen, every skills read —
   reports "Configuration could not be loaded" and falls back to defaults. Found live on
   2026-09-16: a real global file carried exactly such a leftover override, and the app
   logged the fatal on every load.
2. **Even with no file entry, the classifier is never attributed to its own persona.** The
   run host resolves `intent-classifier` through the persona resolver, which returns null
   (no default entry, not a built-in role), and the tools layer silently falls back to
   `BUILT_IN_PERSONAS.orchestrator`.

Noticed on 2026-09-16 while driving the built app after a fresh install. Recorded and
repaired in the same session — the repair is one default-layer entry, within the current
task's authority.

## Specs

- `REQ-MCP-014` — the persona/server table names `intent-classifier` as a built-in persona
  (carrying no servers). The defaults layer ships no such persona, contradicting the table.
- `REQ-CONFIG-031`'s merge design as recorded on `packages/config/src/defaults.ts` — "a
  `personas:` override that states one field merges onto a complete entry and validates".
  For `intent-classifier` there is no complete entry to merge onto, so the contract fails.
- `REQ-ORCH-005/009` — the classifier runs before the coordinator exists and selects its
  model from the slots itself; nothing in the run flow supplies the persona the engine
  names, so the mis-attribution to the orchestrator persona is unrecorded and silent.

## Relevant files

- `packages/config/src/defaults.ts` — the `personas:` default built from
  `BUILT_IN_ROLE_NAMES` alone; the missing entry is the repair site.
- `packages/config/src/sections/personas.ts` — `readPersonaEntry` requires `name`/`model`,
  which is correct per REQ-CONFIG-098; the fatal path is only reachable because the
  default is missing.
- `packages/engine/src/intent/classifier.ts` — names `persona: 'intent-classifier'`.
- `apps/desktop/src/run-host/tools.ts` — the silent `?? BUILT_IN_PERSONAS.orchestrator`
  fallback that absorbs the unknown persona.

## Repaired — 2026-09-16

The repair landed the same day the note was written, in commit `cf2289f`: the default layer
ships `personas.intent-classifier` with `model: small_model` (the classifier's own first
choice, REQ-ORCH-009) and an empty `mcp_servers` per REQ-MCP-014's row. Two regression tests
in `packages/config/src/load.test.ts` — the entry on a bare load, and the partial override
merging onto it and loading (the override's stated thinking synthesising the reserved model
name, unwrapped in the assertion). Consequence 2 — the classifier resolving to null and
silently presenting as the orchestrator persona — is NOT closed by this repair: with the
default entry present the resolver now returns a persona for `intent-classifier`, but
`apps/desktop/src/run-host/tools.ts`'s silent `?? BUILT_IN_PERSONAS.orchestrator` fallback
remains for genuinely unknown names and deserves a warning. That narrower defect stays open
against this note's file list.

The user's own global `agents.yaml` carried the partial override that exposed this; it loads
cleanly against the new default entry and needed no edit.
