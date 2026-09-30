## The duress deadline check fails without saying where the time went, and its default is too short for this endpoint

"The long run reached its result inside the wait" failed at 2,406 s of 2,400 s. The failure is genuine, but the check
reports the two figures and nothing else, and the overrun was about 98 % the endpoint generating: `d` and its
continuation `d2` together spent 1,683 s with 132,973 reasoning tokens, and the run was still progressing (`f` streaming
at the deadline, a ninth request 3.4 s after it). The wait also includes the launch (4.7 s). With this endpoint's
reasoning throughput the 40-minute default is too short for the scenario's three waves.

Live-run finding: H-h (live runs of 2026-09-29)

## Specs

- None; harness. The time the specification spends on the critical path is OQ-114's question.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), `results.json`: `elapsedMs` 2,405,704, `budgetMs` 2,400,000, status `running`; session `379f1490`.

## Relevant files

- `apps/desktop/scripts/live-run.mjs:229` — `DURESS_MS`, default 2,400,000.
- `apps/desktop/scripts/live-run.mjs:1848` — the check, with no time attribution.

## Outcome

Repaired 2026-09-29 under R-067. The check divides every instant of the launch into four buckets: the endpoint (at
least one model request open, from the traffic's `at` and `ms`), tools alone (from the store's tool calls), the launch
(before the first of either), and the product with nothing in flight. It names each bucket, with the requests, output
tokens and reasoning tokens (`attributeWait` and `deadlineReading` in `apps/desktop/scripts/lib/duress-checks.mjs`).
There are three outcomes:

- **inside**: the run reached its result within the wait. A PASS, with the attribution beside it.
- **window**: the wait ran out while the run was still progressing (the last request or tool call ended within 120 s
  of the launch's end), and the product had nothing in flight for at most a tenth of the wait. The window was the
  bound, not the product: a NOTE saying so, which names `LIVE_RUN_DURESS_MS` as what asks the longer question.
- **product**: any other overrun, or one that cannot be attributed because no traffic was recorded. A FAIL, naming
  the shares.

**The default, decided.** `LIVE_RUN_DURESS_MS` stays 40 minutes. That figure is the owner's decision of 2026-09-22
(`docs/architecture/codebase.md`), taken for this same endpoint, and a harness repair does not reverse it. What the
first execution falsified was the check's reading of an overrun, not the figure. A verdict that blames the product for
the endpoint's throughput teaches its reader to ignore the check (the NOTE-versus-FAIL rule in `AGENTS.md`), so an
overrun the endpoint held is reported as the window's bound. `AGENTS.md` records the decision and the setting that
asks for the result on a reasoning endpoint.

Pinned by `apps/desktop/scripts/lib/duress-checks.test.ts` ("an overrun says where the time went"). Replayed over the
2026-09-29 pack, the reading is `window`: "2,406 s of 2,400 s: endpoint generating 2,391 s (99 %; 200 requests, 234,130
output tokens of which 178,627 reasoning), tools alone 6 s, launch 5 s, the product with nothing in flight 3 s (0 %);
the last request or tool call ended 2 s before the launch did".

**Shown live, 2026-09-30.** `pnpm live-run --confirm --skip-build --only=duress` ran against `katalyst` (pack
`.live-run/runs/2026-09-30T05-29-56-712Z`, session `c95d822d`). The check read "NOTE the long run was bounded by the
window, not by the product — 2,406 s of 2,400 s: endpoint generating 2,390 s (99 %; 218 requests, 215,916 output tokens of
which 144,543 reasoning), tools alone 7 s, launch 7 s, the product with nothing in flight 1 s (0 %)". The run was in its
third wave when the wait ran out, `f` verifying, and it came to rest `paused`, `application_shutdown`.
