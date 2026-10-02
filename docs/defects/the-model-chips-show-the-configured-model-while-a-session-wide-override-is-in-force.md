## The model chips show the configured model while a session-wide model override is in force

A session whose model is overridden session-wide — the user's "change model now" during a provider wait
(REQ-ORCH-091 (d), REQ-NOTIFY-089), or since 2026-10-02 the authentication recovery's pin of `fallback_model`
(REQ-NOTIFY-070) — goes on running every later run on the override (`ResilienceMemory.effective`, replayed on every run and
after a reload). The composer's model chip and the inspector's Model field still read the configured entry model. Seen
2026-10-02 in `resilience-proof`'s `auth-fallback` screenshot (`.proof/resilience-proof/auth-fallback.png`): after the 401
on `scripted/alpha` and the restart on `scripted-b/beta`, the chip read `alpha` and the inspector "Model alpha" while the
transcript said the run continued on beta, and a further prompt from that composer would run on beta too. The chip
describes what "the next run starts with" (REQ-CHAT-006), and the next run starts on the override. Noticed while building
the 401 note's part B; not repaired.

## Specs

- REQ-CHAT-006 — "The composer's persona, model, and reasoning chips select what the **next** run starts with"; with an
  override in force the next run does not start with the model the chip shows.
- REQ-SESSION-026 — the runtime model override persists across calls and reloads; nothing says where it is shown, so
  whether the chip should name the override, name both, or say an override stands is a reading for whoever repairs it.

## Relevant files

- `packages/ui/src/WorkspaceView.tsx` — `chip-model`, labelled by `modelChipLabel(…, entry?.model)`, the configured entry.
- `packages/ui/src/Inspector.tsx` — the Model field (`inspector-model`).
- `packages/engine/src/run/resilience.ts` — `ResilienceMemory`, where the override lives; no record field carries it to a
  surface.
