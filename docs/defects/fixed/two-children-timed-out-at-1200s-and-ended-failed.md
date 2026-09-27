## Two children timed out at 1200 s and ended failed in one run

Observed 2026-09-20, run `2e21e324` (punchclock_v2, `v1-a0684c46cafde29f419e8b52fe5bab52`): two delegated children each hit the hard per-child timeout and ended failed. Timeline ord 11: `Child wire-registration-submit timed out after 1200s.` (ord 13 `ended failed`, 110 tool calls); timeline ord 38: `Child finish-registration-wiring-2 timed out after 1200s.` (ord 40 `ended failed`, 113 tool calls). Issues table holds both as kind `timeout`, severity `error`. The third child (`registration-unit-tests-2`, 52 tool calls) succeeded. The run was then stopped by the user (`user_cancelled`, ord 43–44).

## Specs

REQ-ORCH-088 — the 1200 s hard per-child bound, graceful pause, single fallback retry, otherwise failed with a timeout issue. The timeouts fired as specified; recorded here for cost, not contradiction.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `CHILD_TIMEOUT_MS`, the expiry path recording `Child timed out after <N>s`.
- `packages/config/src/sections/runtime.ts` — `child_timeout: 1200` default.

Noticed 2026-09-20 by the run-autopsy of run `2e21e324`.

**Raised with the owner, 2026-09-22 — [R-047](../../product/requests.md#r-047).** Repairing this note means
changing behaviour a live requirement states exactly, which `docs/product/README.md` sends to a `PD` and
an implementer may not mint. The request is logged with the requirements a directive would have to name,
so the decision is in front of the owner rather than waiting in a defect note.

**Ruled 2026-09-23 — [`PD-ORCH-004`](../../product/directives.md#pd-orch-004), [R-048](../../product/requests.md#r-048).** The limit stays at
1200 seconds. A child that completed a tool call within its final stall window when the limit expired still
ends `failed`, and its report now also carries the paths it changed and offers the parent one continuation,
which a continuation child never offers again. Both children here qualified. The note stays open until the
directive is built.

## Repaired 2026-09-27 ([R-057](../../product/requests.md#r-057))

`PD-ORCH-004` is built. The limit, its default and REQ-ORCH-088's expiry path are unchanged: a child still lands,
still takes the one fallback retry and still ends `failed` with `Child timed out after <N>s`. At the instant the limit
expires, `ProgressLog` (`packages/engine/src/children/cut-off.ts`, fed by the turn's new `onToolCompleted`) answers
whether the child completed a tool call within the final stall window. That window is the role's `stall_timeout`,
else `runtime.child_stall_timeout` (90 s); neither key reached a run before. If the child did complete one, its report
gains `cut_off`, carrying three things:

- the statement that it was cut off while making progress;
- the workspace paths its own `write_file`/`haet_edit` calls changed with `ok`, in the order first changed, or that
  it changed none;
- unless it is a continuation, an offer naming `continuation_of`.

The parent reads them after the result text in its resume block and in `background_output`. `delegate` takes
`continuation_of`. `IterationChildren.delegate` admits it only for the caller's own child that made the offer and was
not already continued, and records it as `children.continuation_of` (store v22).

Evidence: `cut-off.test.ts` (13 cases) and four scripted end-to-end cases in `children.test.ts`:

- a call completed exactly at the start of the final 90 s is progress, and the parent's resume block carries the
  three additions;
- one completed a millisecond earlier is not, the report is REQ-ORCH-088's alone and a continuation is refused;
- a 60 s window set through the run's configuration moves the bound;
- the paths are ordered and de-duplicated with failed writes left out; the continuation reports that it changed
  nothing and carries no offer; and a chained continuation and a second continuation are both refused.

Each end-to-end case went red under a mutation of the mechanism it covers. What was not measured: no built app
exercised it (`pnpm resilience-proof` could not launch as root) and no live run was made. So whether run `2e21e324`'s
two children would have qualified is taken from the ruling above, not re-measured.
