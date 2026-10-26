[Product directives](../directives.md) › PD-MONITOR-007

<a id="pd-monitor-007"></a>

### PD-MONITOR-007 — helper model calls follow the session's override and stay off a model held out of quota

The run's helper calls — the pre-flight's intent classifier (REQ-ORCH-009, REQ-ORCH-114), the loop supervisor's classifier
(REQ-ORCH-100), a compression pass on a configured compressing model (REQ-MONITOR-080), the child-report summariser
(REQ-CONFIG-065) and the post-run improvement analyst (REQ-LIBRARY-037) — SHALL each resolve the model its slot configures
through the session's model state at the moment of the call:

1. **The override is followed.** Where a session-wide override replaces the configured provider-and-model pair
   (REQ-ORCH-091 (d), REQ-NOTIFY-089), the call SHALL go to the override's model, as an agent's own calls do.
2. **A pair held out of quota is not called.** Where the pair the call would reach is recorded out of quota for the session
   (REQ-MONITOR-194) and nothing replaces it:
   - a compression pass SHALL compress on the model the agent whose context is compressed is calling — REQ-MONITOR-080's
     default — and, where that is held out of quota too, SHALL make no call and fail with the reason;
   - the summariser SHALL summarise the child on the model the child ran on, and, where that is held out of quota too, SHALL
     make no call and write the fallback report with the reason;
   - the intent classifier SHALL send no request, and the run SHALL proceed on the fallback intent with a reason saying the
     classifier's model is held out of quota; the loop classifier SHALL send no request, and the supervisor SHALL proceed as
     on a classification that did not answer;
   - the post-run analyst SHALL send no request and capture no job, and the application log SHALL say why.

A slot is consulted as REQ-ORCH-009 orders it; the directive changes what the selected slot calls, and an excluded slot is
not replaced by the next slot in that order.

**Why, and what it costs.** Calling a model the session already knows the provider will refuse wastes the call, makes a
compression fail — which can push a long run toward its context limit — reports the analysis failed, and ignores the user's
explicit choice of another model. The owner ruled that every helper follows the override as the summariser already did, and
that an excluded model is replaced by the calling agent's for compression and skipped for the classifiers and the analyst
(OQ-189); the summariser, which the ruling does not name, is read as the condensing call it is, beside compression. What it
costs: a configured compressing or summarising model no longer always "wins" (REQ-MONITOR-080), so a pass may run on a
larger and costlier agent model; a run whose classifier slot is excluded classifies nothing and takes the fallback intent;
and a run whose analyst slot is excluded produces no improvement proposals.

> **Narrows:** REQ-MONITOR-080, REQ-ORCH-009, REQ-ORCH-114, REQ-ORCH-100, REQ-CONFIG-065, REQ-LIBRARY-037

*Raised by the owner, 2026-10-06, ruling OQ-189 as recommended; logged as [R-071](../requests.md#r-071).*

*Numbered PD-MONITOR-007: first written as PD-MONITOR-005 on its branch; renumbered at the landing rebase, since `main` had meanwhile taken PD-MONITOR-003 to PD-MONITOR-005 and this branch's keep-waiting directive became `PD-MONITOR-004` revision 2, so this entry takes the next free number.*

> **First execution, 2026-10-06, built under [R-071](../requests.md#r-071) (plan fin21):** one reader serves every helper,
> `helperChoiceOf` (`packages/engine/src/run/resilience.ts`), behind `Run.helperModel`, read at each call. The compressor
> and the summariser read it in the run (`compressing` in `Run.compressionFor`; `SummariserDeps.resolve` with the child's
> model, `ReportInput.agentModel`); the classifiers and the analyst live in the run host, which `Sessions` hands the reader
> through `PreflightContext.helperModel`, the `supervisor` factory's fourth argument and `onRunResult`'s third
> (`classifyIntent`'s and `createLoopClassifier`'s `helperModel`; `postRunAnalystOf`, whose captured job keeps the model it
> resolved). It found one thing the text had not said: the analyst's artifact names its model by key, so a followed
> override reports the override's key (`HelperChoice.key`). **Measured:** four cases in
> `packages/engine/src/run/ladder.test.ts` (a configured compressor on a1 after the root moved to b1 compresses on b1; after
> a wait's override to c1, on c1; the summariser on a1, excluded, summarises the child on b1; the reader follows an override
> to its key and refuses one whose target is excluded — each red on `37f7a98`), a case in `intent.test.ts`, three in the
> run host's new `loop.test.ts` and two in `configuration.test.ts`; and in the built app `compression-proof`'s `after-a-move`
> (the pass on beta, not alpha) and `resilience-proof`'s `same-tier` (the analyst skipped with its log line;
> the relaunch calling nothing on alpha, the intent classifier making no call — the continuation then carrying the
> previous intent over, as REQ-ORCH-012 does for any fallback) and `two-waits` (the relaunch's
> classifier and analyst on gamma, the override). Not driven in the built app: the loop classifier, which no proof
> activates with an excluded slot. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Added at the plan's repair round 1 (the verifier's findings):** the two no-call clauses had no case. Now pinned: in
> `children/report.test.ts`, a resolver answering `withheld` makes the summariser call nothing and write the fallback report
> with the reason (red with the `withheld` branch removed), and one answering the child's own model sends the one call there;
> in `ladder.test.ts`, a manual pass whose configured compressor and the root's own pair are both held out of quota calls no
> model and fails naming both (red with the old `if (c.model) return null`). The loop classifier now sends the reasoning
> level the reader resolved with an override (`helper.thinking`; before, the slot's own), pinned in `loop.test.ts`.
> [`adr/0060`](../../architecture/adr/0060-context-compression-over-a-replaceable-conversation.md) carries the ruling in place,
> and the engine glossary names the group (**Helper call**, `packages/engine/CONTEXT.md`).
