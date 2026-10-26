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

## Repaired in part (2026-10-02, fin8, bundle `fin8-noticed-gaps-4`)

**Fixed: a session-wide override.** The requirements decide this part: REQ-CHAT-006's chips select what the next run starts
with, and REQ-SESSION-026 / REQ-NOTIFY-089 keep the override for the rest of the session, across reloads — so the next run
starts on the override, and the chips now name it.

- The record carries `modelOverrides` (`packages/contracts/src/channels.ts`): each configured model key a session-wide
  override replaces, with the key it runs on — the end of the override chain (`overridesInForce`,
  `packages/engine/src/run/resilience.ts`, over `ResilienceMemory.effective`). A session a run of this process has started
  reads its run's catalogue (`Run.modelOverridesInForce`); one opened from the store reads its workspace's catalogue once,
  the first time its record is read and only where its timeline holds a `model_override` entry, and rehydrates a memory of
  its own against it (`Sessions.modelOverridesOf`, `restingMemory`), so the chips name the override after an application
  restart too.
- That read is a read, not a run start. Its first form called `setupFor`, which is the run host's per-run `configure`: for a
  session with no run it wrote the host's `configuredRuns`/`runBearers` entries, replaced the workspace's `configured` entry
  and called `mcp.newConfiguration`, which could drop the MCP discovery memo and raise load-scope MCP warnings again on merely
  opening the session (fin8's verifier, round 1). It now goes through a catalogue port of its own,
  `SessionsDeps.restingCatalogue`, which the run host fills with `restingCatalogueOf`
  (`apps/desktop/src/run-host/configuration.ts`: the configuration load with REQ-CONFIG-013's `.gitignore` upkeep off, the
  live overlay and the snapshot fold that `prepareRun` does, and nothing else). The memory it rehydrates is kept apart from
  the session's `memory`, which the next run still rehydrates through its own configuration, and it warns about nothing.
- `entryRole` (`packages/ui/src/agents.ts`, `modelInForce`) names the key the entry role runs on, and the renderer's
  `entryOf` hands it the record's overrides, so the composer's model chip ("Model for the next run"), the inspector's Model
  field for the run-level agent and a persona window all read the override. The chip's image-input check reads the same
  model, the one the next run is sent to.

Pinned by `packages/engine/src/run/ladder.test.ts` (a wait choice of `c1` over the exhausted `a1`: the record names
`[{ from: 'a1', to: 'c1' }]`, and a fresh process that only opens the session publishes the same — red before, the field
absent; since the verifier's round, opening it calls the per-run `configure` no time and asks the catalogue port once, and
the run then started still runs on `c1` — red before, `configure` called once by the read; and a host offering no catalogue
port names no override and calls no `configure`), `apps/desktop/src/run-host/configuration.test.ts` (`restingCatalogueOf`
returns `configureRun`'s catalogue with no log line and no `.gitignore` written, and `null` for a configuration that does
not load) and `packages/ui/src/agents.test.ts` (`entryRole` with an override names its key, without one the configured
key — red before). Shown by `resilience-proof`'s driven `override` scenario, which now reads the composer's model chip
after the change-model resolution: `beta`, where it read `alpha` (2026-10-02, load 2.5, no failures).

**Left open: a mid-run switch.** Whether a switch of the entry model or reasoning from the run header or the inspector
(REQ-MONITOR-142) reaches the session's next run — and so whether the chips should name it after the run ends — is the
owner's: plan fin8's ladder-overrides bundle raises it as "Does a mid-run switch of the entry model or reasoning level
reach the session's next run?" (OQ-185 on `origin/main` since that bundle's merge, d0012a2). Under the
reading built there, a switch ends with its run, so the chips naming the configured key (or the override in force) after
it are consistent with what the next run does; if a ruling makes the switch reach the next run, the chips owe it too, and
this note stays open for that.

## Outcome — 2026-10-06 (plan fin21, under [R-071](../../product/requests.md#r-071)): the open part ruled as built

The part left open waited on OQ-185, which the owner ruled as recommended: a mid-run switch from the run header or the
inspector **ends with its run** and does not reach the session's next run
([`PD-MONITOR-006`](../../product/directives/pd-monitor-006.md#pd-monitor-006)). The composer's model chip therefore names what the next run
starts with when it names the configured key or the session-wide override in force, which is what it does since the
repair above; no chip owes a mid-run switch. Nothing further changed for this note; the session-wide override part stays
repaired as recorded above, and `resilience-proof`'s `override` scenario still reads `beta` on the chip after the
change-model resolution (2026-10-06).
