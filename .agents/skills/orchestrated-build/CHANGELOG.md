# Changelog

Every change to this skill, newest first: the date, what prompted it (with evidence), what changed, how it was
verified. An entry that turns out wrong is corrected by a new entry, never edited away.

## 2026-10-01 — long background jobs take an explicit timeout

**Prompted by** two background tasks of the same session. One given no `timeout` (task `by0p2inlx`, a waiter on the
duress live run) was stopped thirty minutes after launch, at 03:45:34 UTC. One given `timeout: 5400000` (task
`bw0152q7w`, the same waiter re-armed) ran from about 03:52 to 04:40:37 UTC and ended on its own condition; the
duress run it waited on took 5078 s. The skill had said a job longer than thirty minutes must run detached, which
also kept agents from launching duress under the live-run allow rules.

**Changed** `references/environment.md` (Long jobs), `references/live-runs.md` (Running), SKILL.md §5 and the
template's grounding line: a long background job carries an explicit `timeout` covering its expected length (the
tool accepts up to 7,200,000 ms); detaching is the fallback when a long `timeout` is refused.

**Verified** by the self-test and `pnpm check`, and reviewed with `references/skill-review.md`. Prompt text, so
reviewed rather than pinned.

## 2026-10-01 — first version

**Prompted by** a release-backlog session (2026-09-28 to 2026-10-01) that drove about eighty bundles through
build → verify → repair → merge in hand-written workflow scripts, across eight container restarts, one usage
limit, and a live run the permission system refused.

**What it encodes**
- The loop: bundles of two tasks per builder; an independent verifier per bundle that sees the previous round's
  findings and the repairer's answers; up to three repair rounds per budget, two budgets before the owner decides;
  serialized merges through an integration worktree, with a red gate on the merged result sent back to repair;
  acceptance rounds (proof sweep, live run, autopsy) whose findings become repair bundles.
- Recovery from journals: each restart was first recovered by hand-writing a continuation, later by a generator.
  `render --runs` is that generator made general. Its rules came from the cases met: a lost builder, repairer or
  verifier resumes with a note about what it may have left; a passed verification goes straight to merge; a lost
  merge first checks whether it already landed; a blocked report is final unless reopened with a scope; finished
  acceptance agents are replayed only while nothing else merged after them; a bundle that spent its budget gets a
  fresh one at `max` effort with a root-cause note (two bundles that had failed four verifications converged in a
  second budget at `max`, a third in a second budget at `high`).
- Lane order: each lane sorted by its dependencies; cross-lane waiters last with what waits on them (caught in a dry
  run before launch: one lane would have waited hours behind a bundle three deep in the other); balancing; pinned
  sets in one lane.
- A repair pool of 3: an unbounded `parallel()` over 25 repair bundles had six builders working at once on four CPUs.
- A halt after three empty agent results in a row (a usage limit stopped eight agents at once).
- Live runs only with the owner's quoted authorization in the plan; refusals stop and go to the owner; long runs
  detached (a background task given no timeout was stopped after about thirty minutes: the first acceptance duress
  run was cut off).
- The plan id on every branch: this repository already held `fix-accept1-*` branches from the first run.

**Review.** An independent reviewer reviewed the draft twice. The first pass found seventeen blocking problems,
among them plan text corrupted by `$&` in a string replacement, lane orders that deadlocked or refused sound plans,
branch names colliding with earlier runs, live runs not tied to the owner's authorization, verifiers without memory
of earlier rounds, a merge refusal with no way back to repair, acceptance replayed after main had moved, and
guardrails that did not protect themselves. The second pass found six more: acceptance replayed while a reopened
bundle had yet to land, a reopen scope only the first verifier saw, the second-budget rule unpinned, agents sent to
a stale or missing copy of the skill, two guardrails lost in the rewrite, and plan ids never checked for reuse. The
third found one: the merge prompt left `merged` undefined, so a red merged result could be reported as a failed push
and retried forever. All were repaired; agents now read the skill from a reference worktree, never the owner's
checkout.

**Verified** by `node scripts/orchestration.mjs self-test`, which `pnpm check` also runs
(`tools/orchestrated-build-skill.test.ts`). These mechanisms were each broken on purpose and the self-test failed:
dependency waiting, merge serialization, re-driving settled repair bundles, the repair pool, rendering, the halt,
skipping acceptance while unsettled, verifier memory, merge refusal back to repair, stale acceptance replay (across
runs and within a run), the second budget after a restart mid-budget, live-run authorization and placeholders, the
reopen scope at every stage, the skill-copy check, plan-id reuse, key-only worktree names, and lowered acceptance
rounds, and a failed push kept apart from a red merge. Prompt text (merge step 0, branch deletion, which worktree a
repairer uses) is reviewed, not pinned.
