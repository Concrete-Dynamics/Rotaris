## Two children timed out at 1200 s and ended failed in one run

Observed 2026-09-20, run `2e21e324` (punchclock_v2, `v1-a0684c46cafde29f419e8b52fe5bab52`): two delegated children each hit the hard per-child timeout and ended failed. Timeline ord 11: `Child wire-registration-submit timed out after 1200s.` (ord 13 `ended failed`, 110 tool calls); timeline ord 38: `Child finish-registration-wiring-2 timed out after 1200s.` (ord 40 `ended failed`, 113 tool calls). Issues table holds both as kind `timeout`, severity `error`. The third child (`registration-unit-tests-2`, 52 tool calls) succeeded. The run was then stopped by the user (`user_cancelled`, ord 43–44).

## Specs

REQ-ORCH-088 — the 1200 s hard per-child bound, graceful pause, single fallback retry, otherwise failed with a timeout issue. The timeouts fired as specified; recorded here for cost, not contradiction.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `CHILD_TIMEOUT_MS`, the expiry path recording `Child timed out after <N>s`.
- `packages/config/src/sections/runtime.ts` — `child_timeout: 1200` default.

Noticed 2026-09-20 by the run-autopsy of run `2e21e324`.
