## The composer chips name `orchestrator` at rest instead of the configured default role

Reproduced 2026-11-08 by plan `rotaris-persona-chip-reset`, in the built app, from the owner's report that the
composer's persona chip sat on `orchestrator` and **jumped to `Architect` the moment a prompt was submitted**.

With no session and no transcript row the renderer read the entry role from the literal `'orchestrator'`:

```ts
// packages/ui/src/agents.ts, entryRole(...)
const persona = live ?? latest?.persona ?? 'orchestrator';
```

`live` is `SessionRecord.entryPersona`, non-null only while a run is live; `latest` is the persona of the latest
transcript root row, absent before the first one. So before a run both were absent and the literal won — **whatever the
configuration said**. The run itself does not do this: a run started from that window really does start as the
configured `default_persona` (the run host logs `configuration: loaded … entry <default_persona> on …`, and the store
records it as the iteration's `root_persona`). The chip therefore showed a value no run would ever start with, and the
first row a live run wrote made it appear to change.

Seen in the built app against a scratch workspace stating `default_persona: architect`, `personas.architect.model:
arch-model`, `personas.architect.thinking: low`. At rest (run state `Ready`, no session) — while the send pill's own
accessible name read `Start run. Persona orchestrator. …` — versus during the run:

| chip | at rest | during the run | the file states |
|---|---|---|---|
| persona | **`orchestrator`** | `architect` | `architect` |
| model | **`scripted`** | `arch-model` | `arch-model` |
| reasoning | **`Medium`** | `Low` | `low` |
| permission mode | `mode: ask` | `mode: ask` | `ask` |

**All three persona-reading chips misdrew, from one cause**, because `entryRole` resolves the role once and takes the
model, the reasoning and the declared tools from it (`roles.find((r) => r.role === persona)`): the model and reasoning
chips read the `orchestrator` role's values. The permission-mode chip was unaffected — it reads
`session?.permissionMode ?? configuredMode` (`packages/ui/src/WorkspaceView.tsx`), the shape whose live-state sibling
[`a-settings-screens-live-state-outlives-the-screen-and-overrides-a-durable-write.md`](a-settings-screens-live-state-outlives-the-screen-and-overrides-a-durable-write.md)
repaired — and it is the proof's non-moving control.

The wrong role is not only drawn: the same `entry.persona` is the **key the other two chips write to**
(`onSetNextModel`/`onSetNextReasoning`, `apps/desktop/src/renderer/main.tsx`), so with no session a chosen model or
reasoning level was written onto the `orchestrator` role's entry instead of the configured one. Both are repaired by the
same fallback correction.

A negative control with a second workspace whose `default_persona` is `coding-agent` — deliberately not the literal's
word — read `orchestrator` at rest as well, which is what showed the value came from a hard-coded fallback rather than
from the configuration.

## Specs

- **REQ-CHAT-006** — the composer's persona, model and reasoning chips "select what the **next** run starts with"; the
  chip must therefore name what that would be, before any run exists.
- **REQ-CHAT-009** — the composer's selector chips state the current choice.
- **REQ-CONFIG-063** — `default_persona` names the role used when none is requested (shipped default `orchestrator`).
  That is the value the chip owes at rest, and the one the sibling permission-mode chip already owes through
  `configuredMode` (REQ-CONFIG-288's "the next run starts from it").
- **REQ-MONITOR-057/058** — the persona the latest root runs or ran as governs the run-level agent's reading. That
  reading was correct and is unchanged; the defect is the *absence* of a configured-value branch for the no-run case.
- **REQ-CONFIG-441/463** — the Tier A scoped per-field write the persona chip takes (`config.setField
  { default_persona }`); unchanged and correct.

## Relevant files

- `packages/ui/src/agents.ts` — `entryRole`: the literal `'orchestrator'` fallback, and the role lookup that gave the
  model and reasoning chips the wrong role's values.
- `packages/ui/src/agents.test.ts` — the pin that a configured default is drawn at rest, with its model and reasoning.
- `packages/contracts/src/config.ts` — `ConfigSnapshotSchema`, which carried no configured default role.
- `packages/config/src/snapshot.ts` — `snapshotOf` and `fatalSnapshot`, which now state it.
- `apps/desktop/src/renderer/session-view.ts` — `entryOf`, which hands it to `entryRole`.
- `apps/desktop/src/renderer/main.tsx` — the three chips' props and their writes (the comment beside them was false and
  is corrected), and `apps/desktop/src/renderer/agent-links-wiring.test.ts`, which pins the `entryOf` call text.
- `apps/desktop/scripts/persona-chip-proof.mjs` — the live proof, red on the unrepaired head.
- `apps/desktop/scripts/mode-reset-proof.mjs` — the sibling proof this one is modelled on, and the mode chip it protects.

## Outcome — repaired 2026-11-08 (`fix/composer-persona-chip-next-run-persona`)

The fallback is the configured default role the surface was handed (`ConfigSnapshot.defaultPersona` → `entryOf` →
`entryRole`), with the literal `'orchestrator'` kept only for a caller that holds no configuration at all. The live-run
and latest-root precedence is unchanged.

- `packages/ui/src/agents.test.ts` pins the whole fallback (persona, model, reasoning, tools) and fails on the
  unrepaired lookup: with the fix neutered it reads `orchestrator`/`large`/`high` where `architect`/`arch-model`/`low`
  is owed.
- `pnpm persona-chip-proof` fails on the unrepaired head with *"the persona chip at rest does not name the configured
  default role: `orchestrator` while the file states `default_persona: architect`"*, and passes on the repair with all
  three chips agreeing at rest and during the run.
