# Changelog

Every change to this skill, newest first: the date, what prompted it (with evidence), what changed, how it was
verified. An entry that turns out wrong is corrected by a new entry, never edited away.

## 2026-10-04 — the shared stash, live launches handed to the orchestrator, waiting, pausing, acceptance order

**Prompted by** plans fin8 to fin15 and the acceptance-only plan finacc (2026-10-02 to 04; times UTC from the session
ledger `TASKS.txt`, lessons (k) to (o) and the review section of `skill-lessons.md`, both in the session scratchpad):
- **(k) The shared stash.** About 07:04 on 2026-10-03, finacc's builders `implement:accept1-5` and `implement:accept1-6`
  (run `wf_6c39b5ac-be8`) each ran `git stash push`/`pop` minutes apart to check a red against the base, and each `pop`
  took the other's entry: a1-5's engine edits landed uncommitted in `wt-finacc-a1-6`, a1-6's UI edits in a1-5's tree.
  a1-5 noticed and reported; the orchestrator checked the three foreign files out of a1-6 at 07:09 (ledger). a1-5's
  branch recorded the note, merged as `8850ea2`.
- **(l) Agent live-run launches are refused.** finacc round 1's `accept:live#1` sent
  `cd /home/user/Rotaris-crw-wt-accept && export PATH=/opt/node24/bin:$PATH && timeout 5400 xvfb-run … node apps/desktop/scripts/live-run.mjs --confirm --skip-build …`
  at 05:14:14; the classifier refused it at 05:14:22 ("[Real-World Transactions]", verbatim in the
  journal's result). An agent's shell starts every command in the primary checkout, so the relative allow rules match
  only a launch of the primary checkout's script, and the `cd` form matches none. Duress was not launched, the autopsy
  had no pack, and its finding F6 (`live-check-failed`) became repair bundle `accept1-4`, whose builder's own launch was
  refused at about 06:39 and which ended blocked. The orchestrator ran both runs itself with absolute paths from its own
  working directory (05:56:26 default in `wt-accept`, passed 05:56 to 06:15; 06:15:51 duress in a dedicated `wt-live`,
  passed 06:15 to 07:32); the duress autopsy's U5 found `wt-live` without the code-intelligence bundle, which a
  `--skip-build` launch refuses since `5cc297d`.
- **(m) A session limit.** "You've hit your session limit · resets 7:40am (UTC)" (HTTP 429) took five agents of finacc
  (halted) and fin12 (`wf_c3ee62dd-7c1`) before 07:45 on 2026-10-03; both resumed by `render --runs` (`wf_22ada3fe-083`,
  `wf_36545f6f-6eb`) with nothing lost (ledger, 07:45).
- **Restarts.** A container restart at 19:35 on 2026-10-02 killed fin8 run 1 (`wf_4a76fbfa-32b`) and left orphaned
  `Xvfb :111` and `:112`; a host reboot (uptime 0) at 23:28 killed fin10 run 1 (`wf_7cfc7b76-139`) and left none; the
  disk, the scratchpad and the check-in survived both, and one `render --runs` recovered each (ledger, 19:40 and 23:30).
- **(n) Pause and backup.** At the owner's "Please Pause all tasks. I will continue another time." the orchestrator
  stopped finacc run 2, fin14 run 1 and an agent with `TaskStop` at 11:35:58 on 2026-10-03, disabled the check-in with
  `update_trigger`, killed an orphaned `Xvfb`, and wrote `RESUME.md`; at the owner's request it pushed two bundle
  branches, a builder's uncommitted edits as `backup/fin14-git-view-state-cell-wip` (`e4f60ec`, built through a temporary
  index) and the scratchpad state as the orphan branch `backup/orchestration-state-2026-10-03` (ledger, 11:38 and 11:47).
  The host rebooted during the pause; worktrees, journals and scratchpad survived (ledger, 10:33 on 2026-10-04).
- **(o) Acceptance order.** finacc was paused mid-round 2 while fin14 and the notes its own repairs recorded still had to
  land; re-rendered, it would have run round 2 on a head the later plans change. It was superseded instead: fin15
  (`wf_3052e4b2-a59`) finishes `accept1-3` from its pushed branch, and one acceptance-only plan runs last (ledger, 10:33
  on 2026-10-04).
- **Waiting on long jobs.** fin10's `verify:strip-notices-and-listing#3` (`wf_add7be78-430`) waited in the foreground
  with `until grep -q … ; do sleep 20; done; …` at 01:20:10 and 01:27:02 on 2026-10-03, and the owner was shown a
  permission prompt. The owner approved six allow rules for that shape; the orchestrator's first edit of
  `.claude/settings.local.json` was refused as "[Self-Modification]" at 01:38:06 and went through at 01:39:51 on the
  owner's explicit instruction (session transcript; ledger, 01:40).
- **The reviewer's three optional findings on `dec5de3`** (`skill-lessons.md`, "Left for self-improvement #4"): a
  mid-run refresh of a plan's reference worktree changes the references its running agents read; who repairs a red base
  another author left; and the 2026-10-02 entry's wording (below).

**Changed**
- `scripts/workflow.template.js`: every agent's grounding says never `git stash`, with the patch-file and throwaway
  worktree forms; waiting is the completion notice or the Monitor tool, and a polling loop takes environment.md's shape,
  alone, without the shell prefix (any other `sleep` loop may stop on a prompt); a refused live launch is reported as
  not verified with the exact command, and the orchestrator runs it. The live-runner sends each profile command exactly
  as written, with nothing before it (the profile's `live.note` carries this repository's part: the Node binary, the
  tree the script judges, the code-intelligence bundle), and after a refusal launches nothing more and returns every
  run with `refused: true` and its `command`, both now required by its schema. Once a launch is refused, no later round
  of that run starts a live-runner (the refusal covers the outcome, and another agent is not to pursue it): each round
  hands the profile's commands to the orchestrator. The autopsy reads refused runs apart from the judged ones and lists
  exactly one `live-check-failed` finding for them, in the area `live runs handed to the orchestrator`. That finding,
  and any failed live check of a round in which no live run was judged, becomes no repair bundle and stays among the
  round's findings; a judged run's failed check is repaired as before. The run ends `live-handoff`, never `complete`,
  and each round's result carries its `handoff`.
- `scripts/orchestration.mjs`: the profile token `{node}` (the Node 24 binary for a command that takes no shell
  prefix), resolved in nested values too; `status` lists a journal's refused live runs as hand-offs; the dry run keeps
  each agent's schema beside its prompt, and its `liveRefused` stub refuses the first launch, or (`'second'`) the second
  after judging the first.
- `profiles/rotaris-crw.json`: both live commands are one absolute command each, the form the orchestrator ran:
  `{node} {repo}-wt-accept/apps/desktop/scripts/live-run.mjs …`; `live.note` as above.
- `references/live-runs.md`: the permission system and running sections: a refusal's order (the agent stops and reports
  the command, the orchestrator launches under the owner's quoted words, a refusal of that goes to the owner), the reset
  working directory, the refused launch with its evidence, the absolute commands, the absolute allow rule the owner may
  approve (none exists), what the four relative rules match, the trailing `*` admitting later flags (the old text said
  the rules admit no endpoint or budget change, which their trailing wildcard never ensured), the bundle in every judged
  tree, duress in a dedicated tree when run beside a workflow. "An agent holding the rule can run it as well (not yet
  observed)" is deleted: no agent's launch matches.
- `references/environment.md`: Long jobs (how an agent waits; the approved polling shape, and other loops that ran
  unprompted, so a loop outside it "may" stop; a permission rule for agents is the owner's to add, asked once with its
  text; the detached fallback's poll in that shape); Restarts (a host reboot as well as a container restart, and the
  orphaned `Xvfb` only the latter leaves); Limits (the session limit ends every workflow at once); a new section, Pause
  and backup, with the backup push to `backup/*` branches, which needs the owner's word and lands nothing.
- `references/repository.md`: never `git stash`, with this incident and the two ways to set a change aside; "Another
  writer on main" runs the record tools in a short-lived detached worktree beside the checkout
  (`<repo>-wt-maincheck-<id>`), never in a running plan's reference worktree, and lets the orchestrator repair a red base
  forward on its own branch in its own worktree when a docs-only change repairs it, never reverting.
- SKILL.md: §4 the `live-handoff` status, a bundle's refused live scenario (run it on merged main once the bundle has
  landed) and pausing; §5 accept a head nothing else is about to change, and a refused live launch handed to the
  orchestrator (replacing the bullet that said only "run it"); §6 removes the live tree too.
- `docs/clean-room/agent-workflow.md`: the stash rule. The note
  `docs/defects/parallel-worktree-agents-swap-uncommitted-edits-through-the-shared-git-stash.md` moved to
  `docs/defects/fixed/` with its outcome; no link pointed at its old path.

**Corrects** the 2026-10-02 entry's "the fourth triage counted thirteen recorded or changed since the third, across fin4's
second run and fin5": the notes recorded or changed between the third triage's head `2e8f9c0` and the fourth's `dc796f5`
also came from fin6's `mission-metrics` (merged as `de5387e`) and the owner's Codex merges (`5f022de` adds a fixed note).

**Not changed**: no protected invariant, "Improving this skill", `references/skill-review.md` or existing self-test
assertion. Live runs still need the owner's quoted authorization, and the orchestrator runs refused ones under it; every
round still has its sweep and its autopsy; the autopsy records the handed-off runs as one `live-check-failed` finding,
which stays among the round's findings to record; Done still needs the authorized live runs passing, so a run that
handed them off does not read `complete`. No permission rule was added. The backup push (environment.md, Pause and
backup) sits beside the invariant that the gate runs on the merged result before every push: a `backup/*` branch is no
landing and is never merged, so its content reaches main only through a bundle whose merged result passed the gate.

**Proposal to the owner**: approve the two absolute allow rules `references/live-runs.md` gives (The permission system),
in `.claude/settings.local.json`, so the acceptance live-runner can launch the profile's commands itself instead of
handing them off. Until then every agent launch is handed off and the orchestrator runs it under the standing R-068
words.

**Review.** The reviewer (`references/skill-review.md`) returned CHANGES-NEEDED on the first commit, `0c91d34`, with
two blocking findings. First, the live-runner's side of the hand-off had no assertion: the dry-run stub returned
`refused: true` whatever the prompt or schema said, so reverting the live-runner's prompt, its schema's `required` or
the grounding's report sentence left the self-test green; three assertions now pin the rendered prompt, the rendered
schema and the authorised grounding. Second, the autopsy was told a refused run is "NO finding of yours", which narrowed
what the autopsy and the record-every-finding step receive while this entry said it did not; it now lists exactly one
`live-check-failed` finding for the hand-off. Of the optional findings, all were taken but one: treating a run whose
`fails` carry "Permission for this action was denied" as refused even without `refused: true`. That would reinterpret
journals written before this change (finacc's `accept:live#1` carries the text and no `refused`): a re-render would drop
its F6 from the repair bundles and renumber round 1's `accept1-<n>`, whose journaled states are keyed by number. The
schema now requires `refused`, so a new journal always carries it. A second review, on `57201fe`, confirmed both
fixed and found two new hunks of that answer unpinned: the live-runner prompt's rendering of the profile's `live.note`,
and the grounding's clause that a polling loop is sent alone, without the shell prefix. Both are pinned now.

**Verified** by `node scripts/orchestration.mjs self-test` and `pnpm check` under Node 24, both green, and
`node tools/check-record-links.mjs`. Fourteen new self-test assertions pin seventeen hunks; each hunk, reverted alone in
a scratch copy of the skill, turns the self-test red with the assertion named:
- the stash line: "implement:a1 is told that every worktree shares one stash";
- the wait line: "agents wait on a long job without a sleep loop of their own";
- the polling loop's clause, alone and without the shell prefix: "a polling loop is sent alone, without the shell
  prefix";
- the absolute profile commands, and the nested token resolution: "a live command names its tree absolutely, every
  token resolved";
- the live-runner's prompt: "the live-runner sends each command as written and hands a refusal back";
- its schema's `required`: "the live-runner must return each run's command and whether it was refused";
- the rendering of the profile's `live.note`, and the note itself (deleted from the profile): "the live-runner is told
  the profile's live note, the code-intelligence bundle included";
- the grounding's report sentence: "an authorised agent reports a refused launch with its command";
- no later live-runner: "after a refusal no later round starts a live-runner, and every round still has its autopsy";
- the autopsy's hand-off section, and its one finding: "the autopsy records the handed-off runs as one finding, in the
  hand-off area";
- the no-judged-run filter: "a failed live check no run made becomes no repair bundle";
- the hand-off area filter: "a judged live run's failed check is repaired; the hand-off finding is not";
- the `live-handoff` status: "a run whose live launches went to the orchestrator never reads complete";
- `status`'s hand-off list: "status shows a check-in the live runs handed to it".

The rendered live-runner and autopsy prompts were read as an agent sees them.

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
