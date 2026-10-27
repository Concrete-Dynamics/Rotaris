[Product directives](../directives.md) › PD-MONITOR-004

<a id="pd-monitor-004"></a>

### PD-MONITOR-004 — the quota wait's model picker lists every configured model, an out-of-quota one marked, and keep waiting retries an out-of-quota wait now

*Revision 2 (2026-10-06, [R-071](../requests.md#r-071)) — **keep waiting**, the paragraph and clauses marked below, which rule
OQ-188 as the owner took its recommendation. Revision 1 (2026-10-06, [R-071](../requests.md#r-071), the ruling of OQ-186) is
quoted where it is replaced, never deleted.*

The model picker that the quota wait's "change model" opens SHALL list **every configured model key** the configuration
snapshot holds, in alphabetical order, the waiting model included. It applies neither REQ-MONITOR-193's filter and order
(the same-tier candidates in declaration order) nor REQ-NOTIFY-074's (other providers first, the failed model left out),
and no model is labelled with its provider. A key whose provider-and-model pair the session recorded out of quota is
listed in its place, annotated "provider reported insufficient quota in this session", and stays choosable, as
REQ-MONITOR-194 asks of every model selector. What a choice of a model then does, and every other clause of
REQ-MONITOR-303 and REQ-NOTIFY-263 but keep waiting's (below), is unchanged by this directive.

**Keep waiting — revision 2.** On the quota-wait decision surface (REQ-MONITOR-303, REQ-NOTIFY-263), **keep waiting** SHALL depend on the wait's variant:

1. Where automatic resume is **not** allowed — a provider-and-model pair recorded out of quota (REQ-MONITOR-194) — keep
   waiting SHALL resolve the wait as a retry of the same pair at once and return the status to `running`. It is a retry,
   never a change of model: it clears the pair's out-of-quota exclusion as an explicit choice of the pair does
   (REQ-MONITOR-194), persists no override, and takes back an earlier override of the pair (`PD-ORCH-013`), so the retry
   calls it. It resumes the agents parked out of quota on that pair, each on its own model; an agent parked on another pair
   is not moved and stays in its own wait, which the surface shows next. A further insufficient-quota answer records the
   pair again and parks the agent in a new wait. One press retries the wait shown once: a press that reaches no outstanding
   out-of-quota wait — one already retried, or a timed one — is refused and changes nothing, and never switches the entry
   model.
2. Where automatic resume **is** allowed, keep waiting SHALL acknowledge the choice and change nothing: the wait goes on
   and its timer resolves it as a retry when the interval elapses (REQ-MONITOR-192, REQ-NOTIFY-087).

Neither adds an operation to REQ-MONITOR-004's enumeration: the retry travels on the switch-of-entry-model operation, marked
as keep waiting and naming the wait it answers (its agent and attempt) and the waiting pair's model key, which the session
record's wait carries; so marked, it switches nothing. Where no model key names the waiting pair — a configured key first,
else a discovered one — keep waiting acknowledges in both variants; change model and cancel the run remain.

> **Revision 1 said, and no longer governs:** "What a choice then does, and every other clause of REQ-MONITOR-303 and
> REQ-NOTIFY-263, is unchanged by this directive" — so keep waiting stood as REQ-MONITOR-303 states it, which the build
> read as the absence of a decision ([OQ-188](../../architecture/open-questions.md)).

*This revision was minted on its branch as a directive of its own (`PD-MONITOR-004`, then `PD-MONITOR-007` at the landing
rebase) and folded into this one there, since `main` had meanwhile given REQ-MONITOR-303 this directive's narrowing and the
symbol generator refuses two directives narrowing one requirement (`README.md`, Identifiers).* *(No longer binding since 2026-10-13, [OQ-237](../../architecture/open-questions.md): two directives may narrow one
requirement in disjoint cases when one names the other, so such a case need not be folded here; what was folded here stays.)*

**As built.** `WaitHeader` and `waitModelOptions` (`packages/ui/src/WorkspaceView.tsx`), the annotation read from the
record's `wait.excluded` (`excludedModelKeys`, `packages/engine/src/run/resilience.ts`).

**Why, and what it costs.** OQ-186: REQ-MONITOR-303 offers REQ-MONITOR-193's candidates beside the excluded pairs, and
REQ-NOTIFY-263 opens REQ-NOTIFY-074's list, which has no tier, labels each model with its provider and leaves out the very
model REQ-MONITOR-194 would list annotated. The built list holds both requirements' models and applies neither's filter,
and marks what REQ-MONITOR-194 asks every selector to mark. The owner accepted it and asked for both requirements to
describe it. What it costs: a model of another tier, or of the provider that failed, is offered beside the candidates the
ladder itself would try, in an order that says nothing about which the ladder prefers.

*Revision 2's reasons.* REQ-MONITOR-303 says keep waiting resolves the wait as a retry; the build had read it as the
absence of a decision, so in the out-of-quota wait the button did nothing and a user who had topped up the account had no
obvious way to resume short of choosing the same model in the change-model picker. Retrying a timed wait early would only
meet the provider's limit again before its interval ends. The owner ruled the retry for the out-of-quota wait and the
acknowledgement for the timed one (OQ-188). What it costs: in the timed wait keep waiting departs from REQ-MONITOR-303's
"resolves the wait as a retry", and the user who wants to try before the interval ends has no control for it.

> **Narrows:** REQ-MONITOR-303, REQ-NOTIFY-263

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the ruling of OQ-186.*

*Revision 2 raised by the owner, 2026-10-06, ruling OQ-188 as recommended; logged as [R-071](../requests.md#r-071).*

> **First execution of revision 2, 2026-10-06, built under [R-071](../requests.md#r-071) (plan fin21):** the record's `wait` gained `modelKey`
> (`keyOfPair`, `packages/engine/src/run/resilience.ts`: the first configured key naming the pair, else the first discovered
> one, else null), and the wait header's Keep waiting reads `keepWaitingAction` (`packages/ui/src/WorkspaceView.tsx`): with
> `resumeAt` null and a key it sends `setModel` with that key and says "Retrying <key> now.", reaching
> `Run.setEntryModel`'s existing quota-retry branch; otherwise "Still waiting." and nothing sent. The field was first named
> `key`, and ADR-0030's credential-shape test (`providers.test.ts`, consequence 2) refused it as a field named like a
> credential; it is `modelKey`, beside the record's `entryModelKey`. It also found the clause about
> other parked agents, which the existing branch already did (`overrideWaitingPairs`) and which the directive now states.
>
> **Corrected the same day (repair round 1 of plan fin21, the verifier's findings), the clause above kept as it was found:**
> the first build sent a plain `setModel` and so reached `setEntryModel`'s quota-retry branch, the change-model chooser's own
> path for the waiting pair. That branch moves every other parked agent to the waiting pair with a `model_override` that
> "stands for the rest of the session" (`overrideWaitingPairs`) — a change of model the user never chose, which the first
> text of clause 1 wrote down as "an agent parked on another pair resuming on the waiting pair" — and with no wait current, a
> second press (a double-click before the next snapshot) switched the entry model to the waiting pair. Clause 1 now says
> keep waiting moves no other agent and that a press reaching no outstanding wait is refused. Built as `Run.keepWaiting`
> (`setModel` marked `keepWaiting`, with the wait's `agent` and `attempt`): it refuses a press naming no outstanding
> out-of-quota wait or a key of another pair, and resumes the agents parked out of quota on the waiting pair alone
> (`WaitRegistry.retryOn`); the header sends once per wait drawn (`keepWaitingAction`'s `sent`). The change-model chooser's
> choice of the waiting pair is unchanged. **Measured:** three `ladder.test.ts` cases on two agents parked at once (the root
> on a1, a child on b1): keep waiting on a1 leaves the child in its own wait on b1, retried there next, with no override and
> both exclusions cleared — red before, the child moved to a1 with a `b1 → a1` override. The same case pins the pair filter of
> `WaitRegistry.retryOn` (repair round 2, the verifier's finding that it could be removed with every test green): after the
> press on a1 the child's wait is still its first (attempt 1), the session still has two `model_wait` issues and b1 was called
> once — red with the filter cut to `p.state.exhausted`, where the press took the child off its own wait and it re-entered a
> new one at attempt 2 with a third `model_wait` issue; a second press for the wait already
> retried is refused and writes no `entry_model_switched` — red before, `{ok: true}` and a switch to b1; presses naming another
> pair, another attempt or another agent are refused and change nothing — red before. `ui.test.ts`: `keepWaitingAction`
> answers `sent` after a retry was sent for the wait shown — red before. `resilience-proof`'s `keep-waiting` now presses Keep
> waiting twice in one frame and requires one retry row and no `entry_model_switched`.
> **Measured as first built (the plain `setModel` the correction above replaced):** `ladder.test.ts` (a quota wait's record names `modelKey: 'a1'`, and `setModel` with it completes the run on a1,
> a1 recorded then cleared, no override, no refusal; a timed wait names its key too), `ui.test.ts` (`keepWaitingAction`:
> retry in the out-of-quota wait, acknowledgement in the timed one, with no key, or with no `setModel` — red before, the
> function absent), and `resilience-proof`'s driven `keep-waiting` scenario on the built app (alpha refused on quota, Keep
> waiting pressed: calls alpha, alpha; `model_exhausted` recorded then cleared; no `model_override`). Not driven: the timed
> variant's acknowledgement in the built app, which is the unchanged behaviour. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
