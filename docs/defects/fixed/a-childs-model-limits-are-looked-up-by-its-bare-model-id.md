## A child's context limit and model cap are looked up by its bare model id

A child's `model_key` is recorded as the persona model's bare id (`qwen3.8-flash-next`), while configuration keys models
by their qualified key (`openai-compatible--katalyst/qwen3.8-flash-next`). Every lookup by the child's key therefore
misses: the context meter falls back to the 265,000-token default instead of the configured 262,144, and the per-model
`max_parallel` cap is never found for a child.

Live-run finding: D5 (live runs of 2026-09-29)

## Specs

- `REQ-MONITOR-049`: the 265,000 default applies only "when the model's own maximum is unknown"; it is known.
- `REQ-MONITOR-020`: the per-model concurrency cap.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored): the inspectors in the duress PNGs read "… of 265,000 tokens"; `agents.yaml` sets `max_input_tokens: 262144`
  under `openai-compatible--katalyst/qwen3.8-flash-next`; `children.model_key` holds `qwen3.8-flash-next` for all eight
  children of session `379f1490`.

## Relevant files

- `packages/engine/src/children/orchestration.ts:235` — `modelKey: persona?.modelRef?.modelId ?? this.deps.model.modelId`.
- `apps/desktop/src/run-host/host.ts:340` — `contextLimitFor`, keyed by the models key.
- `apps/desktop/src/run-host/configuration.ts:84` — `modelCapFor`; `:370-372` — `contextLimitsOf`.
- `packages/engine/src/sessions.ts:798` — the meter's limit, defaulting when the lookup misses.

## Repaired 2026-09-29 under R-067

A child's `model_key` is now the `models:` key of the model it runs on (REQ-CONFIG-094: the cap is "counted by the entry's
key", a synthetic copy against the entry it was copied from). `childModelKey` in
`packages/engine/src/children/orchestration.ts` takes the role's `Persona.modelKey` when the role names its own model — set
by the run host's persona resolver from the role's `model`, a `__persona__:` synthetic copy mapped to the key it was
copied from by `syntheticOriginOf` over the loader's `syntheticOrigins` (see the correction below) — and otherwise the run's `RunConfig.modelKey`, which `prepareRun` sets from the entry role's model. The model id stands in
only where no configuration names a key (the engine's tests, the process-wide model). `modelCapFor` and `contextLimitFor`
were already keyed by the `models:` key and are unchanged; they now match. The compression threshold was never affected:
`compressionTriggerFor` finds the entry by model id.

The inspector's "Model" field, which reads `children.model_key`, now shows the configured key rather than the bare id.

Pinned by: `packages/engine/src/children/children.test.ts` ("live-run finding D5: a child is recorded, capped and measured
under its model's models: key" — a child on the run's model and a child of a role with its own model each recorded under
the key, and a cap stated under it parking the second) and `apps/desktop/src/run-host/configuration.test.ts` ("a child is
recorded under its model's models: key" — the live run's configuration shape: the role's key through a synthetic copy and
the run's key are the qualified key, under which `max_parallel` and `max_input_tokens` are found and under the bare id
nothing is). Each fails on the code before the repair.

Re-measured live: `pnpm live-run --only=edit` on 2026-09-29 against `katalyst`, pack
`.live-run/runs/2026-09-29T10-11-17-489Z/` of the `fix-child-spawn` worktree (git-ignored) — both children's
`model_key` is `openai-compatible--katalyst/qwen3.8-flash-next`, and the inspector in `edit/edit.early.png` reads
"7,802 of 262,144 tokens", the configured `max_input_tokens`, where the duress pack read "… of 265,000".

**Corrected in place, verifier round 1 (2026-09-29).** The first form of this repair read a synthetic copy's origin with
`unwrapSynthetic` (`packages/config/src/slots.ts`). *Falsified reason kept:* "a `__persona__:` synthetic copy unwrapped by
`unwrapSynthetic`" — that function does not know the origin; it guesses the first non-synthetic key with the same
`provider` and `model_id`, so where two `models:` keys name the same provider model (every live-run key is
`openai-compatible--<endpoint>/<model>`, all provider `openai-compatible`) a role on `beta`'s copy was recorded under
`alpha`, counted against `alpha`'s cap and metered at `alpha`'s `max_input_tokens` — the very case REQ-CONFIG-094 says
never shares a count. *Replacement:* the loader records each synthetic name's source key at the moment it makes the copy
(`SlotResolution.syntheticOrigins`, carried on `LoadedConfiguration.syntheticOrigins`, computed and never serialised), and
the run host's persona resolver and `prepareRun` read it through `syntheticOriginOf`. Pinned by
`packages/config/src/load.test.ts` ("each synthetic copy records the models: key it was copied from, even where two keys name
the same provider model") and `apps/desktop/src/run-host/configuration.test.ts` ("two keys naming the same provider model
never share a count" — fails on the `unwrapSynthetic` form, receiving `openai-compatible--alpha/qwen` where
`openai-compatible--beta/qwen` is expected). The same guess still serves the preference read-back
(REQ-CONFIG-253/255); recorded, not repaired here:
[`preference-read-back-guesses-a-synthetic-copys-origin-by-provider-and-model-id.md`](preference-read-back-guesses-a-synthetic-copys-origin-by-provider-and-model-id.md) — repaired 2026-09-30 (acceptance A42), where `syntheticOriginOf` was also found to stop after four recorded origins; it now follows them to the end.

Rows written before this repair keep the bare id in `children.model_key`; a session resumed from before it still meters
such a child at REQ-MONITOR-080's default and finds no cap for it. Nothing rewrites those rows.

Noticed while repairing it: [`../the-per-model-cap-counts-only-one-iterations-children.md`](../the-per-model-cap-counts-only-one-iterations-children.md).
