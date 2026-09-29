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
