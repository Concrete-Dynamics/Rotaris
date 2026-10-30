# `live-run` — What it costs, and what stops it

Part 4 of 12 of [the live-run record](../live-run.md), which indexes every part.

## What it costs, and what stops it

Two bounds always hold: the model the owner chose, and `runtime.max_iterations` written into the sandbox's
`agents.yaml`, so one confused run cannot spend the lot. The third is whatever the endpoint allows, and the
script names which one it used rather than implying a number it cannot know: **nothing** for an endpoint
registered `--unmetered` (the owner's own hardware — tokens counted, nothing stopping on them, unless the
invocation names a ceiling itself); else the **provider's own figure** (OpenRouter's `GET /key`); else the
**registered prices** over the store's token counts; else **tokens alone** against `--max-tokens`.

Crossing whichever ceiling applies stops the run there, records the figure and reports a failure.

**`--max-iterations` defaults to 500, raised from 15 on 2026-09-22 by the owner's decision.** Fifteen was a
bound while every scenario was a short task; the long run made it the thing being measured rather than a bound
on it — a delegating run reaches 15 while it is still commissioning, and then reports its own ceiling as a
result about the product. What the raise gives up is worth knowing before running against a metered endpoint:
the accounting gate between scenarios still holds, and so do `--budget` and `--max-tokens`, but there is no
longer a tight bound **within** one run. The endpoint it was raised for is registered `--unmetered`, where the
cost of a long run is wall clock. Name `--max-iterations` yourself on an endpoint that charges.

`--context=<tokens>` is for an endpoint whose `/models` payload does not declare a context window in a key
discovery reads — vLLM's `max_model_len` is one such. The number is written into the sandbox's `agents.yaml` as
`max_input_tokens` on a `models:` entry that **replaces** the snapshot layer's entry for the same model as
a whole (provider, `model_id`, `auth_provider`, `base_url` with it), which is what keeps the leased bearer
reaching the right endpoint.
