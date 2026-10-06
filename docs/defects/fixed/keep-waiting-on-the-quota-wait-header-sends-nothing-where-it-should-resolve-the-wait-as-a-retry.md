## Keep waiting on the quota-wait header sends nothing where it should resolve the wait as a retry

The wait header's "Keep waiting" (`WaitHeader` in `packages/ui/src/WorkspaceView.tsx`) sets a local "Still waiting." and
sends nothing: no operation exists for it (`docs/architecture/views/03-runtime-view.md` §5, the *keep waiting* row). The
reading is ADR-0010's third execution (2026-09-05): "keep waiting is the absence of a decision", read from REQ-MONITOR-192
("continues indefinitely until a person decides") and REQ-NOTIFY-263, which it cites; it predates REQ-MONITOR-303, which
says keep waiting "resolves the wait as a retry and returns the status to `running`", and spec resolution 29
(`docs/spec/resolutions/02-run-monitoring-steering.md`) fixes "what each does" as part of the three-choice contract. In the
wait that never auto-resumes (an exhausted pair) the run therefore stays parked after the user chose to keep waiting, and in
the auto-resuming wait it waits out the interval rather than retrying. Found by the sixth triage of the open notes (fin10,
origin/main 97e1de4) reading the code; recorded 2026-10-02 by the bundle that made the ladder read the exclusion before every
call (task 1 of `fin10-quota-exclusions-and-choices`), since it is in that code. Not repaired: REQ-MONITOR-303 and ADR-0010
do not agree on the auto-resume variant — an immediate retry there reads against REQ-MONITOR-192 ("the wait timing out
resolves as a retry") and REQ-NOTIFY-087 ("the wait ends by itself once the computed interval has elapsed") — and REQ-MONITOR-004's
enumeration of operations is closed at twenty-two, none of them a keep-waiting; the question is raised as OQ-188 in
[`open-questions.md`](../../architecture/open-questions.md), with the reading the build proceeds under (as built).

**What any repair must carry.** Since the same bundle the ladder reads the exclusion before every call
([an-agent-calls-a-pair-the-session-recorded-out-of-quota-when-no-override-replaces-it.md](an-agent-calls-a-pair-the-session-recorded-out-of-quota-when-no-override-replaces-it.md)):
an agent on a pair the session holds out of quota is not called but moved, or parked in the wait that never auto-resumes.
A keep waiting that resolves the exhausted variant as a retry must count as an explicit choice of the waiting pair
(REQ-MONITOR-194: it clears the exclusion, as `Run.setEntryModel`'s quota-retry branch does through
`clearChosenExclusion`), or the pre-call check sends the retry straight back into the wait. As built no loop is possible:
keep waiting sends nothing, and the wait ends only by a change of model (which clears or overrides) or a cancel.

## Specs

- REQ-MONITOR-303 — keep waiting "resolves the wait as a retry and returns the status to `running`"; spec resolution 29 fixes
  what each of the three choices does.
- REQ-NOTIFY-263 — exactly three choices in the header; it does not say what keep waiting does.
- REQ-MONITOR-192 / REQ-NOTIFY-087 — the auto-resume variant ends by itself when the interval elapses; the exhausted
  variant continues until a person decides.
- REQ-MONITOR-194 — a retry of an excluded pair the user chose is an explicit choice, which clears the exclusion.

## Relevant files

- `packages/ui/src/WorkspaceView.tsx` — `WaitHeader`: "Keep waiting" sets `acknowledged` and sends nothing.
- `docs/architecture/adr/0010-three-channels-between-run-and-surfaces.md` — the third execution's reading (a).
- `docs/architecture/views/03-runtime-view.md` — §5, the *keep waiting* row.
- `packages/engine/src/run/waits.ts` — `WaitRegistry`: `resolveWithModel` and `releaseForRest`, no resolve-as-retry for one
  session's waits.
- `packages/engine/src/run/run.ts` — `setEntryModel`'s quota-retry branch, the explicit choice a retry would have to count as.

## Outcome — 2026-10-06 (plan fin21, under [R-071](../../product/requests.md#r-071)): ruled and repaired

OQ-188 was ruled by the owner as recommended ([`PD-MONITOR-004`](../../product/directives.md#pd-monitor-004), narrowing
REQ-MONITOR-303): in the wait that never auto-resumes, Keep waiting retries the waiting pair at once through the existing
retry path; in the timed wait it stays an acknowledgement and the timer retries.

- **The record** carries the waiting pair's model key, `wait.modelKey` (`packages/contracts/src/channels.ts`; `Run.currentWait`
  over `keyOfPair`, `packages/engine/src/run/resilience.ts`: the first configured key naming the pair, else the first
  discovered one, else null).
- **The header** (`keepWaitingAction`, `packages/ui/src/WorkspaceView.tsx`): with `resumeAt` null and a key, Keep waiting
  sends `setModel` with it and says "Retrying <key> now."; that reaches `Run.setEntryModel`'s quota-retry branch, the
  explicit choice of the waiting pair, which clears its exclusion (`clearChosenExclusion`) and resolves the wait as a retry
  with no override — so the pre-call exclusion read cannot send the retry straight back into the wait, as this note
  required. Otherwise it says "Still waiting." and sends nothing. No operation was added: REQ-MONITOR-004's twenty-two stand.

Pinned by `packages/engine/src/run/ladder.test.ts` (the quota wait's record names `modelKey: 'a1'`; `setModel` with it completes
the run on a1 with a1 recorded then cleared, no override and no refusal — red before, no `modelKey`) and
`packages/ui/src/ui.test.ts` (`keepWaitingAction`, red before: absent). Shown by `resilience-proof`'s driven `keep-waiting`
scenario on the built app (2026-10-06): alpha refused on quota, Keep waiting pressed, calls alpha then alpha, the exclusion
recorded then cleared, no `model_override`. ADR-0010's reading (a) carries the ruling in place.

**Corrected the same day (plan fin21's repair round 1), the outcome above kept as first written.** Reaching
`setEntryModel`'s quota-retry branch moved every other agent parked on another pair onto the waiting pair with a
session-wide `model_override`, and a second press with no wait current switched the entry model. Keep waiting is now a
retry of its own wait alone: the header sends `setModel` marked `keepWaiting` with the wait's `agent` and `attempt`
(`onKeepWaiting`), once per wait drawn (`keepWaitingAction`'s `sent`), and `Run.keepWaiting` refuses a press naming no
outstanding out-of-quota wait and otherwise resumes the agents parked on that pair alone (`WaitRegistry.retryOn`), no
override persisted. Pinned by three `ladder.test.ts` cases on two parked agents and a `ui.test.ts` case, each red before;
`resilience-proof`'s `keep-waiting` presses twice in one frame. `PD-MONITOR-004` clause 1 states it.
