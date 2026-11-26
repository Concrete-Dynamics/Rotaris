[Product directives](../directives.md) › PD-ORCH-020

<a id="pd-orch-020"></a>

### PD-ORCH-020 — `intelligent`: the small model chooses each run's strategy from its request

A fifth value of `rotaris.delegation_strategy`, `intelligent`, MUST be supported. It is no strategy of its own: it has
the strategy of each run chosen from that run's request. This directive's case is **a run started while the configured
strategy is `intelligent`**, and nothing it states reaches a run started under one of the four named strategies.

1. **The choice comes first.** As an `intelligent` run starts, and before any intent classification request, the product
   MUST ask the small model once which strategy the run takes, giving it the run's request and nothing of the codebase.
   The request goes to the model the intent classifier uses, by the same slot order and the same structured-output ladder,
   under a bound of 12 seconds. While it is outstanding the session shows the classifying status.
2. **Three strategies may be chosen, by these criteria.** `single` for quick, simple work one agent finishes in a few
   steps: a question, an explanation, a lookup, a one-line fix, a small edit confined to one file, one command. `lead` for
   ordinary development work: a feature, a bug to diagnose and fix, a refactor, tests, a review, an investigation, a change
   across several files. `orchestrator` for long-running, heavy work only: a whole application or project built from
   nothing, a rewrite or migration across a codebase, a request with many independent deliverables that needs a plan
   first. Where two are plausible, or the request is unclear, the choice is `lead`.
3. **`swarm` is never chosen.** An answer naming `swarm`, or any name outside the three, MUST NOT be taken.
4. **A choice that cannot be made leaves the run on `lead`.** No small model configured, a failed or cancelled call, the
   bound reached, an empty answer or one naming no strategy that may be chosen: the run MUST proceed under `lead`, and the
   reason MUST be recorded with the choice. The choice never fails a run and never delays it past its bound.
5. **From the choice on, the run is a run of the chosen strategy.** Every rule that binds a run of that strategy binds it
   unchanged, including whether it is classified: a run that chose `orchestrator` or `single` makes its intent
   classification request next, and a run that chose `lead` makes none (`PD-ORCH-019` clause 2). No agent of the run is
   told that the strategy was chosen for it.
6. **The choice is said and recorded.** The run MUST write one transcript row, `Strategy chosen: <strategy>`, with the
   small model's reason in brackets, or why no choice was made, and one timeline entry `run_strategy_chosen` carrying the
   strategy, the reason and whether it was the fallback. The audit's configuration snapshot keeps `intelligent`.
7. **A run with no request text keeps the previous choice.** A continuation that carries no text of its own (a plain
   Continue) MUST take the strategy the session's previous run was given, without a request to the model; where the
   application has no such choice in memory, clause 4 applies. A continuation that carries text is chosen for afresh.
8. **Where it is offered, and how it looks.** The settings screen's selector and the composer's strategy choice MUST offer
   `intelligent` as the fifth option, after `lead`, labelled "Intelligent". While it is the chosen value the composer
   MUST draw its name with a wave of the product's accent and axis colours moving along the text; under a reduced
   motion preference the colours stay and do not move.

**Why, and what it costs.** The owner wants the best strategy for each request without choosing one each time: most work
suits `lead`, quick work suits `single`, and only heavy, long work pays for a coordinator and a team. `swarm` is left out
because fanning out widely is a decision the owner wants to stay a person's. The cost is one more small-model request
before a run starts, up to 12 seconds on a slow endpoint and on top of the classification an `orchestrator` or `single`
choice then makes, and a strategy that can differ between two runs of one session. The criteria are a first guess, set by
the builder on the owner's word ("make an educated guess"), and are expected to be tuned from what runs show.

This directive names [`PD-ORCH-019`](pd-orch-019.md#pd-orch-019), which narrows REQ-ORCH-025, REQ-CONFIG-321, REQ-ORCH-005
and REQ-ORCH-014 for a run taken under `lead`, and adds `lead` to the selector and the composer. Its case is a run whose
strategy is configured; this one's is a run whose strategy is chosen as it starts, so the cases stay apart, and clause 5
hands a run that chose `lead` to that directive whole.
It names [`PD-ORCH-005`](pd-orch-005.md#pd-orch-005) too, which narrows REQ-ORCH-005 for a continued run's
carried intent: that case is what a continuation classifies, this one is the request that precedes any classification. And
it names [`PD-ORCH-006`](pd-orch-006.md#pd-orch-006), which narrows REQ-ORCH-025 for a run whose mapping grants direct
work under `orchestrator` or `swarm`: that case begins once a run has its strategy, this one ends there.

REQ-ORCH-025 is narrowed in that the value is not itself an override, the override being chosen per run; REQ-ORCH-005 in
that a model request precedes the classification; REQ-ORCH-014 in that the transient status covers the choice as well;
REQ-CONFIG-321 in that there is a fifth option.

**First execution, 2026-11-24.** Built as stated. The choice is made inside the run's start, since a run is created
before any request can be awaited; the run host then makes the choice the override its pre-flight and tool ports read.
Measured: the criteria alone against the owner's self-hosted `ds41`, 14 sample requests of 14 routed as clause 2 intends
(4 `single`, 6 `lead`, 4 `orchestrator`), each under one second. The built application driven with the scripted model:
the composer offered the fifth option, the name drew its wave, and a run asked for its strategy before its
classification and wrote its row. `pnpm live-run --only=intelligent` against `ds41`: a question chose `single`, a small
feature chose `lead`, both chosen and not fallen back to, both completed. The live run's coordinator readings took an
`intelligent` session for a coordinating one; they now read the strategy the run chose. Not measured: an
`orchestrator` choice through the whole product with a real model, the fallback against a real endpoint that fails or
times out, clause 7's kept choice (no test holds it), the wave in the `nocturne` and `high-contrast` themes and under
reduced motion, and the settings screen's selector by eye.

> **Narrows:** REQ-ORCH-025, REQ-ORCH-005, REQ-ORCH-014, REQ-CONFIG-321
