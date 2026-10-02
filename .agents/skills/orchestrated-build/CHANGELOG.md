# Changelog

Every change to this skill, newest first: the date, what prompted it (with evidence), what changed, how it was
verified. An entry that turns out wrong is corrected by a new entry, never edited away.

## 2026-10-02 — recovery and planning lessons of plans fin1 to fin9

**Prompted by** the plans `fin1` to `fin9` of one session (2026-10-01 and 02), each lesson with its evidence:
- **A usage limit can lift before its stated reset.** fin3 (`wf_27c648a2-1f5`) and fin4 (`wf_27b2ef63-c36`) halted
  about 20:10 UTC on 2026-10-01 (fin3 20:10, fin4 20:16), two and three agents failing with "You've hit your weekly
  limit · resets Oct 5, 9pm (UTC)". The orchestrator's own turns were refused with the same message ("Continue from
  where you left off." at 21:16 UTC on 2026-10-01 and 01:06 UTC on 2026-10-02). After the owner wrote "Continue", a
  one-line probe agent succeeded at 06:43 UTC on 2026-10-02. §4 said to wait for the stated reset.
- **A lost merge agent loses nothing.** The two merge agents lost to that limit (`merge:run-agent-readings`,
  `merge:proof-evidence`: journal `started`, then `failed`) left finished, unpushed merge commits `c6e5d96` and
  `bfc3f33` in their integration worktrees; the re-rendered merge stages merged again from origin/main, and both
  bundles landed (`eb3f13b`, `22fbe5e`).
- **Every round needs a fresh triage.** Builders keep recording defect notes (fin2's journals alone list more than a
  dozen; the fourth triage counted thirteen recorded or changed since the third, across fin4's second run and fin5),
  and the autopsy lists only what its runs observe. The session's fifth triage, an incremental one, took 13 minutes
  and produced plan fin9 (`wf_c9402872-e4a`), which merged `2fb627d` while fin6 still ran.
- **A standing live-run authorization.** On 2026-10-02 the owner wrote "you may do the live run.never ask for my
  persmission for it. you always have my permission." (R-068); the plan files of fin5 to fin9 and of the
  acceptance-only plan quote it in `live.ownerWords`, and no plan asked again. §1 read as if every plan asked.
- **The request log's count.** Appending R-068 to `docs/product/requests.md` went red in `pnpm lint` at 09:06 UTC
  on 2026-10-02: `tools/check-request-log.mjs` said "the Count section declares R-001 to R-067, but the highest
  row is R-068".
- **Another writer on main.** The owner merged a Codex-built branch (head `d367280`, adding R-069) while fin4 and fin5
  ran; their intermediate merge `a46180d`, made before they merged this session's work, read like a lost R-068 row.
- **§4's recovery command was a shorthand without `--profile`.** At 10:42:58 UTC on 2026-10-02 the orchestrator's
  fresh render of fin6's `run-1.js` from the refreshed reference worktree, typed from memory with neither `--runs`
  nor `--profile` (no `RUNS.txt` existed yet), failed with "render needs --profile". §3 writes `--profile` out; §4's
  shorthand `render --plan … --runs` did not, so a recovery typed from it fails the same way.
- **A cross-plan dependency.** fin8's `ladder-overrides` and `focus-bound-recovery` build on fin6's unmerged
  `auth-recovery` changes; the fourth triage marked them `after: ["fin6"]` in its own list, `after` in a plan names
  bundles of that plan only, so the orchestrator holds fin8.

**Changed**
- SKILL.md §1: an authorization the owner made standing is quoted in every later plan and asked about no further;
  what its words leave out is asked.
- SKILL.md §3: the check-in also looks for another writer on main.
- SKILL.md §4: a usage limit is probed at the first turn it lets through, not only at its stated reset; the recovery
  command is written out whole, with `--profile` as in §3. `references/environment.md` (Restarts) names `--profile`
  beside its shorthand.
- SKILL.md §5: with split plans, triage again over origin/main before the acceptance-only plan (a single plan, when
  its acceptance ends); a short triage of the last plan's notes can fill a free plan slot while another plan builds.
  `references/workflow-tool.md` points the acceptance-only plan at it.
- `references/environment.md` (Limits): the orchestrator's refused turns, the early probe with its evidence, and the
  lost merge agent's unpushed commit.
- `references/live-runs.md` (Authorization): ask once per owner; record the standing words once, quote them in every
  later plan; they cover what they say, and another or a metered endpoint is asked about; a new session relying on
  the recorded words alone may meet the classifier's refusal, and then asks the owner once.
- `references/repository.md`: a request row and the `## Count` line move in the same commit; a new section, "Another
  writer on main": the check-in comparison (author and session trailer), the two record tools run in the refreshed
  reference worktree, and a red base reported to the owner and recorded, never reverted.
- `references/workflow-tool.md` (Concurrency): a bundle building on another plan's unmerged changes is a later plan,
  held by the orchestrator; the triage's mark never goes into `plan.json`.

**First exercise of the `unverified` re-render.** fin6's run 1 (`wf_2f9ffe7c-6a7`) ended `incomplete` with
`auth-recovery-1` `unverified` after four failed verifications; run 2 (`wf_6fd02cd2-ceb`, rendered with `--runs`)
resumed it at `fix:auth-recovery-1#4` with a fresh budget, and `verify:auth-recovery-1#5` passed, so the bundle
reached its merge in one round. §4's table said what happened; its text is unchanged.

**Not changed**: no script, so no new self-test assertion; no protected invariant, "Improving this skill",
`references/skill-review.md` or self-test assertion. The plan still carries the owner's quoted authorization for every
live run.

**Verified** by `node scripts/orchestration.mjs self-test` and `pnpm check` under Node 24, both green.

## 2026-10-01 — a run executes two agents at a time; one integration worktree per plan

**Prompted by** plan `fin1` (run `wf_64915ef8-93e`): four lanes rendered, and for over twenty minutes only
`implement:child-teardown` and `implement:session-rest-writes` had started (journal `started` entries). Measured over
the session's sixteen runs (each agent transcript's first and last timestamps; script `measure-concurrency.py`, output
`concurrency.txt`, both in the session scratchpad), none ran more than two agents at once: fourteen peaked at two, two
small ones at one. The first version's "an unbounded `parallel()` had six builders working at once" (and the repair
pool's reason in its entry) is false: in `wf_a0529435-e19`, `implement:accept1-1` to `-6` ran two at a time, a
sliding window, from 11:36 to 12:56 UTC on 2026-09-30 (five left commits, one uncommitted edits). Agents started with
the Agent tool ran beside a run, and two runs overlapping on 2026-09-29 (`wf_4da43d03-b3a`, `wf_f722534f-88d`, 05:27
to 11:29 UTC) ran four workflow agents at once, every merge made then green. The Workflow tool's own reference
(the `workflow-authoring` skill, read 2026-10-01 at the owner's suggestion) states the cause: concurrent `agent()`
calls are capped at min(16, available CPUs − 2) per workflow, two on this 4-CPU host.

**Changed** `references/workflow-tool.md` (Concurrency), `references/environment.md` (Load), SKILL.md §2 and §3: a
run executes two agents at a time and lanes past two queue; to go faster, split disjoint bundles over two plans, each
with its own scratchpad directory and no acceptance rounds, then one acceptance-only plan. The profile's `integ`
becomes `{repo}-wt-integ-{id}`, so two plans never merge in one worktree, and `integ` joins `skillref` as a reserved
plan id (`<repo>-wt-integ-<id>` would read as a bundle worktree of a plan named `integ`); `references/repository.md`
names the new path. The self-test's existing integration-path assertion now expects the `{id}` suffix. That edit is
the owner's to approve, and the owner approved it: "Yes I do approve that. I highly value when work can gets
parallelized and reduces the overall time spent." (2026-10-01).

**Verified** by two new self-test assertions (two plans resolve to two integration worktrees; `integ` is no plan id),
each failing with its hunk reverted, the edited assertion failing with the profile's old path, the self-test and
`pnpm check`, and a review with `references/skill-review.md`.

## 2026-10-01 — long background jobs take an explicit timeout

**Prompted by** two background tasks of the same session. One given no `timeout` (task `by0p2inlx`, a waiter on the
duress live run) was stopped thirty minutes after launch, at 03:45:34 UTC. One given `timeout: 5400000` (task
`bw0152q7w`, the same waiter re-armed) ran from 03:47:06 to 04:40:37 UTC (53 minutes) and ended on its own
condition; the duress run it waited on took 5078 s. The skill had said a job longer than thirty minutes must run
detached, which also kept agents from launching duress under the live-run allow rules.

**Changed** `references/environment.md` (Long jobs), `references/live-runs.md` (Running, and the permission
section's pointer to the detached launch), SKILL.md §5 and the template's grounding line: a long background job
sets the Bash tool's `timeout` parameter to cover the longest it may run (the tool documents a background maximum
of 7,200,000 ms); detaching is the fallback when a long `timeout` is refused.

**Verified** by the self-test, with a new assertion that the builder's prompt names the Bash tool's `timeout`
parameter (it fails with the old grounding line), `pnpm check`, and a review with `references/skill-review.md`.

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
