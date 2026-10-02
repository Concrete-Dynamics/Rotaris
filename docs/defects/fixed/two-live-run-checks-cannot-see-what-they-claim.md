## Two live-run checks cannot see what they claim

- **"the ladder retried past the refusals rather than giving up"** counts proxy traffic only: more calls than injected
  refusals passes. The model client's own dispatch-layer retries satisfy it without the ladder being reached, which is
  what happened (L3).
- **"the agent ran the suite through the terminal tool"** passes on any agent's `terminal` call. The prompt asks the
  orchestrator to run `node --test` "yourself", which REQ-TOOLS-006's `coordinator_only` control makes impossible — the
  orchestrator holds no terminal — so the check passes on the children's calls while the thing it names never happens.

Live-run finding: H3 (live runs of 2026-09-29)

**Ruled in part 2026-09-29 — [OQ-110](../../architecture/open-questions.md), [R-067](../../product/requests.md#r-067):** the dispatch layer's retries come
first, as the specification states, and "the live run's ladder check says what it can see". The first check's repair is
to claim only that the run survived the refusals, or to read the ladder's own trace (an issue, a wait, a timeline entry,
or OQ-110's session-log line) before claiming the ladder handled them.

## Specs

- None; harness. OQ-110 (`REQ-CONFIG-086` before `REQ-ORCH-091/092`); `REQ-TOOLS-006`.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), session `474a2d22` (`faults-ladder`): the check passed on 5 calls for 2 refusals, all retried by the SDK.
  Session `ccc662d9` (`edit`): the orchestrator answered "Run node --test yourself"; the check passed on the children's
  calls.

## Relevant files

- `apps/desktop/scripts/live-run.mjs:1584` — the ladder check.
- `apps/desktop/scripts/live-run.mjs:1106` — the prompt's "yourself"; `:1118` — the terminal check.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067, as OQ-110 rules. Each check now says what it can see.

- **The ladder check** reads the product's own record for every injected refusal: the session log's WARNING line
  "model request retried by the dispatch layer: … met HTTP <status> and waited <n> ms before retry <k> of <m>" (the line
  `a-retry-the-dispatch-layer-absorbs-leaves-no-trace.md` added), or the ladder's own `issues` row (`model_wait` for a
  429, `transient_llm_error` for a 500). It passes only when every injected status is answered by one of them and at
  least one refusal was injected; the call count is detail, never the test. It is named "each injected refusal was
  retried, read from the session log's dispatch-layer lines or the ladder's issues (OQ-110)", and a NOTE beside it says
  which layer it was. `results.json`'s `faults-ladder` carries `dispatchRetries` and `ladderIssues`.
- **The terminal check.** The orchestrator is `coordinator_only` (REQ-ORCH-029), which removes `terminal` (REQ-TOOLS-006),
  so the prompt no longer asks it to run the suite "yourself": it says it holds no terminal and asks it to tell each
  child to run `node --test` before reporting. The check reads the store for a `terminal` call whose command runs
  `node --test` by an agent other than the orchestrator ("a child ran `node --test` through the terminal tool", naming
  the children), and a second check asserts the orchestrator made at least one call and no terminal call — so an entry
  agent carrying another name turns it red rather than passing it vacuously (added at the verifier's round 1).

No unit test covers `live-run.mjs`'s checks; they are shown by the live run. `pnpm live-run --confirm --skip-build
--only=faults,edit` against `katalyst` (pack `.live-run/runs/2026-09-29T21-11-24-678Z`, git-ignored) passed:

```
PASS  a child ran `node --test` through the terminal tool  — REQ-103-implementation-in-src-todos.js, REQ-103-tests-in-src-todos.test.js
PASS  the orchestrator made no terminal call (REQ-TOOLS-006 coordinator_only)  — 11 orchestrator call(s)
PASS  each injected refusal was retried, read from the session log's dispatch-layer lines or the ladder's issues (OQ-110)  — 2 refusal(s) (429, 500); dispatch layer: HTTP 429 waited 2006 ms, retry 1 of 5; HTTP 500 waited 4002 ms, retry 2 of 5; ladder: no issue; 6 call(s) recorded
NOTE  which layer retried the refusals  — the dispatch layer alone (2 absorbed retries); the ladder was not reached, as OQ-110 rules for a budget that was not exhausted
```

The ladder check would fail on the first live run's pack, whose session log held no line for either refusal. No live run
exhausts the dispatch layer, so the ladder branch of the check is not yet shown live.

Files: `apps/desktop/scripts/live-run.mjs` (`readSessionLog`, the `faults-ladder` checks, the `edit` prompt and checks).
