# Changelog

Every change to this skill, newest first: the date, what prompted it (with evidence), what changed, how it was
verified. An entry that turns out wrong is corrected by a new entry, never edited away.

## 2026-10-20 — at most two plans build at once on four CPUs

**Prompted by** the friction survey over fin29 to fin47 (run `wf_bd8bdf7f-f09`, 2026-10-20, the procedure the owner
approved on 2026-10-14: "yes. do that."; finders by plan range, one merge-and-verify agent, a drafter and a critic),
item F01 and F18: five plans with live runs and autopsies beside them put the load at 12 to 25 on 2026-10-07 (reviews of
2 h 46 min and over 3 h, one lost to the limit, about 10 extra proof runs and 3 extra gates in one review, a task
owner-blocked on load alone in `wf_4ade4086-c7a` line 10) and again on 2026-10-13, while the skill set no upper bound on
"split the bundles over two plans". **Changed:** `references/workflow-tool.md`, Concurrency, sets the ceiling (two
building plans, nothing beside more than one) with its evidence, and SKILL.md §2 points at it. The proposal's render
warning for lanes past the cap is a script change with its own self-test assertion and is not part of this entry.
**Verified** by `node scripts/orchestration.mjs self-test` and `pnpm check`; the skill-review by one reviewer agent
under `references/skill-review.md`, which judged this entry with the others of 2026-10-20.

## 2026-10-19 — the final report is the handoff the repository fixed

**Prompted by** the owner's eighth infrastructure suggestion (2026-10-19, recorded in `.scratchpad.md`), accepted in the
orchestrating session: one
short handoff shape for every closing report — an agent's to the owner, a lane's to the next lane,
`pnpm worktree:land`'s — four fixed labels (Zustand, Beweise, Offen, Nächster Schritt), canonically defined in
`docs/clean-room/agent-workflow.md` ("The handoff") and anchored in AGENTS.md, the UI skills and here. **Changed:**
SKILL.md §6's final report is that shape: what merged is its Zustand, the evidence's places its Beweise, what remains
and the decisions waiting on the owner its Offen, the owner's first action its Nächster Schritt. Nothing else: no
script, template prompt, profile, protected invariant or self-test assertion changed. **Verified** by the self-test
(`node .agents/skills/orchestrated-build/scripts/orchestration.mjs self-test`) and `pnpm check`; the skill-review by
one independent agent under `references/skill-review.md`.

## 2026-10-14 — a friction survey reads past runs for what this skill should change

**Prompted by** the owner, in the orchestrator's session on 2026-10-14, during fin44 (06:03 UTC): "Would it make sense
to occasionally launch a surveying agent that gathers insights from past workflows to identify frictions and suggest
updates to the according skill?", and, during fin46 (15:28 UTC), to the proposal of a report-only survey every three or
four plans and once before the final report, "yes. do that." Until now an improvement started only when the orchestrator
noticed a friction while it happened: the entry below came from the owner noticing the per-item verify stage of run
`wf_f659576e-da7` mid-run, after 42 verifiers had started (63 by the time it was stopped). **Changed:**
`references/workflow-tool.md` gains "A friction survey": the read-only survey's four stages over each plan's `RUNS.txt`,
the runs' journals and agent transcripts and the orchestrator's ledger, pinned in a detached worktree of its own (a
running plan's reference worktree is never refreshed for it), each finder given the absolute paths and its plan range's
time span, the range recorded in the ledger, verified by one agent against the skill and this changelog, drafted as
ranked proposals. It changes nothing itself: each accepted proposal goes through "Improving this skill" as its own
change and review, and one that crosses a protected invariant goes to the owner. SKILL.md §4 runs it every three or four
plans and §6 once before the final report; the reference table names surveys. No script, template prompt, invariant,
assertion or the "Improving this skill" section changed. **Verified** by `node scripts/orchestration.mjs self-test` and
`pnpm check`; the skill-review by one reviewer agent under `references/skill-review.md`.

## 2026-10-14 — a read-only survey verifies its merged list with one agent

**Prompted by** the Windows-on-ARM hand-over survey, run `wf_f659576e-da7`: six sweeps and one merge (85 items), then
one verifier per merged item, two at a time on the two-agent cap. When the owner asked, 42 `verify:<key>` agents had
started (journal line 97, `verify:per-user-dirs-windows`, about 05:48 UTC); when the run was stopped at about 06:10
UTC, 63 had started and 61 returned, and the verify stage had run from 04:59 against 04:28 to 04:59 for the sweeps and
the merge. The owner asked mid-run: "Can you skip the individual verify steps for the windows arm survey and give all
results to a single verifier? This will Speed Things up this time.", and then, of writing it into this skill: "Yes add
that to the skill." The remaining 24 items went to one verifier (run `wf_87fd482b-879`). Surveys had no shape written
anywhere; each was authored ad hoc. **Changed:** `references/workflow-tool.md` gains "A read-only survey": pin a
detached worktree at one commit, sweep several ways, merge, verify the whole merged list with ONE agent (split into
the fewest batches only when the list is too long for one agent), then draft and critic. SKILL.md §1.1 points at it.
No script, template prompt, invariant or assertion changed. **Verified** by `node scripts/orchestration.mjs self-test`
and `pnpm check`; the skill-review by one reviewer agent under `references/skill-review.md`.

## 2026-10-13 — the skill-review of fin41's three entries, by its bundle's reviewer

**Prompted by** the three entries below, each "Not run: the skill-review step, which is the bundle's reviewer's", and by
N97's finding that a review done and not written here reads as never done. **Changed:** nothing in the skill. **The
review**, `references/skill-review.md` applied by fin41's reviewer, which built none of it: (1) `git diff
origin/main...HEAD` read in full; the evidence checked: the orchestrator's session transcript holds ENOSPC results at
09:39:23 and 09:44:26 UTC on 2026-10-07 and the detached `LIVE_RUN_DURESS_MS=7800000 setsid nohup timeout 9600 xvfb-run`
launch at 08:12:40 UTC on 2026-10-13; `faf9525`'s author time is 04:21:19 UTC; run `wf_6808e87e-364`'s agent `a46bb849`
holds the "Skill-review checklist" for `c735074`. (2) `node scripts/orchestration.mjs self-test`: all checks passed;
`pnpm check` ran on the landed head. (3) No change to `scripts/`. (4) The protected invariants: none edited. SKILL.md
§1.2's consortium step has the orchestrator rule open questions, which the owner granted in so many words (R-072), and it
keeps escalations and the owner's own clauses the owner's (OQ-214), so "nothing … rules an owner's decision" still holds;
rewording that invariant stays a proposal to the owner. (5) `references/repository.md` against its authorities: the
owner's-alone bullet matches R-072 and OQ-214's re-ruling, keeps "Raise; never decide" for workflow agents and drops
nothing; the Records bullet matches the views README's maintenance rule. (6) No template prompt changed. (7) Each is the
smallest change for its friction; SKILL.md is 234 lines. **PASS** for all three entries. **Verified** by the self-test and
`pnpm vitest run tools/orchestrated-build-skill.test.ts`.

## 2026-10-13 — a view's reconciliation entry goes to the log, not the views README

**Prompted by** the 2026-10-13 survey at `6de2a67` (item N96, plan fin41): since 2026-09-16 every change had written its
reconciliation entry in `docs/architecture/views/README.md`, about 350 of them (2,658 lines), although that day's
navigation pass split them into `reconciliation-log.md` so that consulting a view costs a page. Builders followed this
page's Records bullet, which named only the README's date. **Changed:** the bullet names the log for the entry and the
README for the date only, as the README's maintenance rule now says; the entries moved to the log verbatim in the same
plan. **Verified** by `node scripts/orchestration.mjs self-test` and `node tools/check-record-links.mjs`. Not run: the
skill-review step, which is the bundle's reviewer's.

## 2026-10-13 — the improvement steps the 2026-10-13 changes left: faf9525's entry, two reviews, one follow-up

**Prompted by** the 2026-10-13 survey at `6de2a67` (item N97, plan fin41): `faf9525` ("Disk is the session's allowance", in
`references/environment.md`, Load) landed with no entry here (step 2) and no recorded review (step 4); `d92e595` (the detached
duress launch) has its entry below but no recorded review, and its "Not run: a duress launch in this form" was never followed
up; the entry for `c735074` says the skill-review was not run. This entry records what the append-only rule will not let
those entries say. **Changed:** nothing in the skill but this entry, and the self-test's header comment
(`tools/orchestrated-build-skill.test.ts`), which still named "serialized merges" among the pinned mechanisms although the
2026-10-07 change retired them for each bundle's review and landing from its own tree.

- **`faf9525`, 04:21 UTC** (the orchestrator, from fin30's review, optional): the bullet "Disk is the session's allowance,
  not the device's" under Load. Its evidence holds: the orchestrator's session transcript carries ENOSPC lines at
  09:39–09:44 UTC on 2026-10-07, and `df -h /` on 2026-10-13 read 9.3 GB free at 28 GB used when fin41 started (the
  bullet's 7.9 GB at 30 GB was an earlier reading the same day).
- **`c735074`'s review did happen.** fin38's reviewer (`review:notes-optionals-skill#1`, run `wf_6808e87e-364`) applied
  `references/skill-review.md`'s checklist to it — the diff, the protected invariants and the entry's claims — and landed
  it; the entry's "Not run: the skill-review step" was written by the builder before that review.
- **The skill-review of `faf9525` and `d92e595`**, applied by fin41's builder, which built neither, with the fixed prompt:
  (1) each diff read in full; `faf9525`'s claims checked as above; `d92e595`'s against AGENTS.md (`LIVE_RUN_DURESS_MS=7800000`
  in its duress recipe), OQ-214's re-ruling and `references/environment.md` (Long jobs, the detached form). (2)
  `node scripts/orchestration.mjs self-test` passed; `pnpm check` is the landing reviewer's. (3) No change to `scripts/`.
  (4) No protected invariant touched: live runs still need the owner's quoted authorization, and a refused detached launch
  is still handed back with its exact command (the self-test's live-command assertions cover the new command). (5) No
  change to `references/repository.md`. (6) No template prompt changed. (7) Each is the smallest change for its friction;
  SKILL.md is not touched. **PASS for both.** One optional observation: `references/live-runs.md` says the profile's
  duress launch "matches none of the allow rules", which is the reason a refusal of it reaches the orchestrator.
- **`d92e595`'s follow-up.** The duress run at `552d346` was launched detached, but not in the profile's form: the
  orchestrator sent `cd <repo>-wt-live && LIVE_RUN_DURESS_MS=7800000 setsid nohup timeout 9600 xvfb-run … --only=duress >
  <scratchpad>/live-552d346-duress.log 2>&1 < /dev/null & disown` at 08:12:40 UTC on 2026-10-13 (its session transcript),
  with no `bash -c` wrapper and so no `exit=` line, and it passed in 55 minutes (`live-run PASSED`, 30 PASS, 9 NOTE, 0 FAIL;
  [`live-552d346-duress-autopsy.md`](../../../docs/architecture/live-runs/live-552d346-duress-autopsy.md)). So the detached shape has run and the window held; the profile's exact command, with its
  `exit=` line in `.live-run/duress-launch.log` and the Monitor wait on it, has still not been sent by a live-runner.

**Verified** by `node scripts/orchestration.mjs self-test` (all checks passed) and `pnpm vitest run
tools/orchestrated-build-skill.test.ts`. Not run: the skill-review of this entry, which is the bundle's reviewer's.

## 2026-10-13 — open questions go to the consortium (R-072), and plans hold their own number ranges

**Prompted by** the 2026-10-13 survey at `6de2a67` (item N94, plan fin41): `references/repository.md` still listed "ruling an
open question" as the owner's alone, and SKILL.md §1.2 and §5 sent every ruling to "needs the owner", although since
2026-10-07 the owner's standing delegation (`docs/product/requests.md` R-072) has the orchestrator's consortium rule them,
and `docs/architecture/open-questions.md` applies it throughout (the 2026-10-07 paragraph near the top; dozens of entries
"Ruled … under the owner's delegation"). `grep -rniE "consortium|R-072|advocate"` over `.agents/`, `.claude/`, `CLAUDE.md`
and `docs/clean-room/` returned nothing. The parallel plans' number collisions (OQ-240/241 landed as OQ-247 to OQ-250,
OQ-254 as OQ-255) were in `references/environment.md` only. **Changed:** `references/repository.md`'s owner's-alone bullet
is corrected toward R-072 and its scope (OQ-214's re-ruling: R-072 "delegates open questions and does not reach a clause the
owner has already decided"), the old wording quoted beside it; SKILL.md §1.2 gains the consortium step, §2 the number ranges,
§5 the consortium before the next round. Workflow agents still raise and never rule; the template's prompts already say so
and are unchanged. **Not changed, and proposed to the owner:** SKILL.md's protected invariant "nothing … rules an owner's
decision" (Improving this skill). It reads consistently with R-072, since a delegated open question is no longer an owner's
decision, but rewording it to name R-072 edits a protected invariant, which `references/skill-review.md` step 4 makes the
owner's to approve. The consortium's workflow script stays session-local (`consortium-rulings-wf_fccb0fa3-466.js` in the
orchestrator's session); moving it into `scripts/` would make it a mechanism owing a self-test assertion, and is left.
**Verified** by `node scripts/orchestration.mjs self-test` (all checks passed) and `node tools/check-record-links.mjs`. Not
run: the skill-review step, which is the bundle's reviewer's.

## 2026-10-13 — the host notes carry what the 2026-10-06 to 13 rounds showed

**Prompted by** the orchestrator's fin38 brief (Task 3 of `fin38-notes-optionals-skill`), from the rounds' own record: reviews
of up to three hours at a load of 10 to 17 and timing reds that passed alone (the hundred-epic-columns note, closed by fin38 at
0 ms alone); a message to a workflow's agent that resumed a second copy of it; ENOSPC failures on a full session disk and
about 29,900 test directories in `/tmp`; agents stopped mid-step by an account limit and resumed by `render --runs`; the duress
run at `LIVE_RUN_DURESS_MS=7800000` past the background cap, and a `pgrep -f` waiter that matched itself; Electron proofs
exiting `SIGTRAP` with no display; and OQ numbers that collided between parallel plans (OQ-240 and OQ-241, landed as OQ-247 to OQ-250; OQ-254, landed as OQ-255). **Changed:**
`references/environment.md` gains one short bullet for each, in the section it concerns (Toolchain, Long jobs, Load, Limits),
and a new section, "Parallel plans", for the messaging and numbering rules. No script, profile or protected invariant changed.
**Verified** by `node scripts/orchestration.mjs self-test` and `node tools/check-record-links.mjs` (both green). Not run: the
skill-review step (`references/skill-review.md`), which is the bundle's reviewer's.

## 2026-10-13 — the profile's duress launch is detached, at the window AGENTS.md names

**Prompted by** fin32's review (`review:child-reports-and-limits#1`, an optional finding handed to fin35): AGENTS.md's duress
recipe since OQ-214's re-ruling is `LIVE_RUN_DURESS_MS=7800000`, and with the launch's own 180 s that needs a bound of about
7,980 s, above the Bash tool's 7,200,000 ms background cap and above the profile's `LIVE_RUN_DURESS_MS=5400000 timeout 7200`,
so a run whose children use their 45 minutes would overrun into a NOTE. **Changed:** `profiles/rotaris-crw.json`'s duress
command is the detached form `references/environment.md` gives (`setsid nohup bash -c '…; echo "exit=$?" >> <log>' … &
disown`) at `LIVE_RUN_DURESS_MS=7800000 timeout 8100`, its log `.live-run/duress-launch.log` in the judged tree, and its
`what` tells the sender to wait with the Monitor tool for the log's `exit=` line; `references/live-runs.md` says the same and
that the detached form matches no allow rule. **Verified** by the self-test (`tools/orchestrated-build-skill.test.ts`, green:
the command names its tree absolutely, resolves every token, holds no `&&` or `cd`, and is handed back exactly on a refusal).
Not run: a duress launch in this form (the orchestrator's).

## 2026-10-07 — one reviewer per bundle reviews, repairs in place and lands; the full gate runs once per landing

**Prompted by** the owner, in the session's own conversation on 2026-10-07 (relayed verbatim to this change's builder
by the orchestrator). First message: "Okay, we need to optimize the workflows which are building something. Currently,
we have too many gates and checking. Maybe one implementer, one fix, and then merge. Maybe, and the one which fixes
should also merge so we can cut down on sub-agents. Because it takes way too long. What do you think about that?" The
orchestrator proposed two agents per bundle: a builder that implements and runs the tests for the packages it touched,
then a reviewer-lander that did not build it, reviews the diff against the requirements, repairs what it finds itself,
rebases onto main, runs the full gate once on that exact head, and pushes; a finding too big to repair in place goes
back to a builder (rare). It said this removes the separate merge agent, the fix-then-re-verify round trip and two of
the three full-gate runs per bundle, and that the protected invariants on the separate verifier need the owner's
approval. The owner answered, verbatim: "Uh, yes, go ahead and make the change. I approve it. Exactly. Um, as you say,
we will do this for our last and future work, not for the current runs." Those words are the owner's explicit approval
for changing the protected invariants this change touches (the verifier's, and the verify and merge stages' model and
effort) and the self-test assertions tied to the old stages.

**Evidence.** The orchestrator measured the agent transcripts of runs `wf_2b1b4e68-911`, `wf_b9cff0a1-2bf`,
`wf_23df3d2f-d83`, `wf_37ac914c-c9c`, `wf_e167fab1-dfa` and `wf_3d935556-2b2`
(`~/.claude/projects/-home-user-Rotaris-crw/349f6b0e-6880-59f4-942d-818d53f7b76a/subagents/workflows/<run>/agent-*.jsonl`,
first to last timestamp per agent): implement n=11, mean 39.4 min (433 in all); verify n=13, mean 13.6 (177); merge n=8,
mean 12.2 (98); fix n=3, mean 11.8 (36). Verify, merge and fix took 42 % of agent time. The full gate ran three times per
bundle (the builder's rule 5, the verifier's step 4, the merge agent's step 2), more with a fix round; 3 of 11 bundles
had blocking findings (fin23 `terminal-and-records`, fin24 `undo-create`, fin28 `window-gate-timeout`). Re-measured by
this change's builder at 05:12 UTC on 2026-10-07 from each agent's journal label and its transcript's timestamps only,
counting only agents whose journal holds a result: implement and verify the same; merge n=7, mean 11.1 (77); fix n=2,
mean 17.3 (35); verify, merge and fix 289 of 722 agent-minutes, 40.0 %. Two agents were still running then and are
left out: `merge:coordinator-todo` (`wf_b9cff0a1-2bf`, 40.7 min so far) and `fix:window-gate-timeout#1`
(`wf_2b1b4e68-911`, 17.8 min so far); counted at their lengths of the moment, as the orchestrator's earlier figures
counted them, the share is 42.8 %.

**Changed**
- `scripts/workflow.template.js`. A bundle goes implement → review, and only when a review hands back blocking
  findings it did not repair, fix → review again, within the same budget (`maxFixRounds`; `unverified` after it, the
  needs-owner cap after two). `meta` names the phases Implement, Review, Fix, Accept, Repair.
  - `reviewPrompt` (label `review:<key>#<n>`, phase Review) replaces `verifyPrompt` and `mergePrompt`. Reviews of
    different bundles run at once: each gates and pushes from its bundle's own landing worktree (the profile's
    `integ`, a dash, the bundle's short name), made when missing and removed with the bundle worktree after the
    landing, and origin/main orders their pushes (a push rejected because main moved is rebased, gated and pushed
    again, as the merge stage's step 3 already said). The old in-run landing lock and the plan's one integration
    worktree are gone. Its effort is `high`, or `max` when a plan asks, never lower. It does the landing's step 0
    first. **Part A, Review** is the verifier's checklist: steps 1 to 3, 5 to 7, the ownerBlocked rule and the
    previous round's findings first, word for word; step 4 keeps the proofs against the claims and leaves the gate to
    Part C, which carries the verifier's "re-run a timing red once alone first"; "Pass ONLY with zero blocking findings
    across all tasks" now holds once Part B is done. **Part B, Repair in place**: each blocking finding it can repair
    within the tasks, at its root, in its own commits with the trailers, each with a test that fails without it, the
    record obligations in the same commits, listed in `repaired`; one that needs a task rebuilt, a decision the record
    does not make, an owner ruling or more than a contained repair goes in `blocking`, unlanded. **Part C, Land, only
    with zero blocking findings remaining** is the merge stage's steps 0 to 4, unchanged but for this: step 0 names an
    earlier reviewer too and reports an earlier landing with `pass: true, blocking: []`; an unresolvable conflict
    (step 1) and a red it cannot repair (step 2) are reported in `blocking`; step 2 gates in the bundle's landing
    worktree (still a clean, detached tree other than the one the bundle was built in, with the
    `merge-base --is-ancestor` check) and also repairs a red that is a defect of the bundle's tasks, with a test,
    listed in `repaired`; steps 3 and 4 push from and remove that worktree.
  - `REVIEW_SCHEMA` replaces `VERDICT_SCHEMA` and `MERGE_SCHEMA`: `pass` (zero blocking findings remain after the
    repairs), `blocking` (the unrepaired ones), `repaired`, `optional`, `evidence`, `merged`, `pushed`, `mainCommit`,
    `checkOnMain`, `conflicts`, `problem`. `pushed` keeps its description; `merged`'s adds "a blocking finding remains".
  - A review that lands ends `merged`; landed but unpushed, `merge-failed`; otherwise its `blocking` (or, if it lists
    none, "The gate is red on the bundle rebased onto origin/main" with its `problem`) goes to `fix:<key>#<n>`. A review
    that lands while its `blocking` is not empty broke its rule; the bundle is on main, so it ends `merged`, but with
    `landedWithBlocking` and its findings in `lastBlocking`, and the run logs "WARNING <key>: LANDED WITH n BLOCKING
    FINDING(S)". `reviewer-lost` replaces `verifier-lost` and `merger-lost`. The completion result lists `repaired` per
    bundle, repairs made before a restart included.
  - Builder rule 5, which the repairer shares: the narrowest tests while working, then the profile's `quickGate`, the
    tests beside every unit changed (the profile's `tests`), and after the build every proof (and, if authorised, live
    scenario) the tasks name; the full gate runs once, on the rebased head, when the reviewer lands the bundle. It read
    "Gate before you finish: `pnpm check` fully green in your worktree". The repairer's prompt names the reviewer, shows
    what it already repaired, and ends "Run rule 5's checks again" where it read "Re-run the gate".
- `profiles/rotaris-crw.json`: `quickGate` (`pnpm symbols && pnpm typecheck && pnpm lint`) and `tests`
  (`pnpm vitest run <paths>`); `gate` stays `pnpm check`. `render` refuses a profile without `gate`, `quickGate` or
  `tests`.
- `scripts/orchestration.mjs`. `deriveState` reads `review:` journals, and journals of the old stages resume in the
  new ones: a passed verification, an interrupted verifier or merge agent, or a landing whose push failed at `review`;
  a failed verification or a refused merge at `fix`. One `findingsOf` gives a repairer the findings of a review that
  did not land, of an old failed verification or of an old refused merge, as `drive` does; an old refused merge now
  meets the needs-owner cap like any handed-back finding. A journaled landing with blocking findings is seeded
  `merged` with `landedWithBlocking` and `lastBlocking`, and `status` prints "LANDED WITH n BLOCKING FINDING(S): record
  each one" beside it. The repairs every review of a bundle journaled travel in its resume state.
  `REVIEWER_INTERRUPTED` replaces `VERIFIER_INTERRUPTED` (it adds step 0 first, a rebase left in progress, and an
  interrupted reviewer's repair commits). A failed push now costs a full review round: `PUSH_FAILED` tells that review
  why it runs, and it reviews the bundle again before step 3 retries the push, where the old flow retried only the
  merge stage. That is the conservative choice: the review stage has no landing-only mode, and one would be an
  unreviewed way onto main. A plan's old `efforts.verify` is read as `efforts.review` and `efforts.merge` is dropped
  (it never set the merge stage's effort), and `render` names each bundle it read so. The dry run stubs `review:`
  (`failReview`, `landRefuse`, `landUnpushed`, `landWithBlocking`; `dry-run --fail-review key=N`); `status` prints the
  new stages.
- SKILL.md: the description (and the router's in `.claude/skills/orchestrated-build/SKILL.md`, which the self-test
  pins to it), the opening, the file table, §2's ownerBlocked judge, §3's landing worktrees, the `merged` row (with
  `landedWithBlocking`: record each finding in `lastBlocking` and report it) and the `merge-failed` row, §4's
  reopening, refused live scenario and "Reviewers' optional findings", and §6's cleanup. Two protected invariants, in
  the shape the owner approved: "the verifier never built what it verifies, reads the full diff and the requirement
  texts itself, and runs the gate itself; no step of its checklist or of the builder's rules is removed or loosened; a
  bundle passes only with zero blocking findings and lands only after it passes" now reads "the reviewer never built
  what it reviews, reads the full diff and the requirement texts itself, may repair blocking findings in place in its
  own commits, and lands only with zero blocking findings remaining and the gate, which it runs itself, green on the
  exact head it pushes; the builder runs the quick checks, and the full gate runs once per landing, on the pushed head
  (the owner, 2026-10-07: "Maybe one implementer, one fix, and then merge." and "Uh, yes, go ahead and make the change.
  I approve it."); no step of its checklist or of the builder's rules is removed or loosened"; and "the verify and
  merge stages' model and effort" reads "the review stage's model and effort". Every other invariant is word for word.
- `references/workflow-tool.md`: the labels and how old journals resume; reviews land concurrently from their own
  landing worktrees, ordered by origin/main, where a lock serialized landings through one integration worktree per
  plan; the observed durations dated as the old stages'. `references/repository.md`: a reviewed bundle lands, gated in
  its own landing worktree; `pnpm check` on the rebased head before every push, once per landing, after the builder's
  quick checks; "Boundaries the reviewer checks". `references/environment.md`: a reviewer lost mid-landing (a merge
  agent before this change), the facts kept; a backup branch reaches main reviewed and landed.
- `docs/clean-room/agent-workflow.md`: "an orchestrated build's integration worktree is one" reads "landing worktree";
  nothing else in it names a stage of the workflow.
- `CLAUDE.md` and `AGENTS.md`, on the owner's words. CLAUDE.md annotated `pnpm check` "all four green before a commit"
  and AGENTS.md called it "the gate every commit passes": no commit reaches main without `pnpm check` green on the
  exact head pushed, as before; what changes, as the owner approved, is that a builder hands over after the quick
  checks and the tests beside what it changed (a builder's intermediate commits were never each gated, before or
  after). The orchestrator amended CLAUDE.md's line in `056482d`, as it amended CLAUDE.md for the rebase rule on
  2026-10-04; it now ends "(an orchestrated build: on each head it lands)". AGENTS.md's sentence, amended there and
  made one statement at the review, reads "`pnpm check` (symbols, typecheck, lint, tests) is the gate every change
  passes before it lands on main: an agent working alone runs it before each commit; in an orchestrated build it runs
  on the exact head each landing pushes, its builders committing on the quick checks (the owner, 2026-10-07; the
  skill's CHANGELOG)." Its summary of this skill read "independent verification per bundle, repair rounds, serialized
  merges"; with concurrent landings that last was false, and it reads "per bundle an independent reviewer that repairs
  in place and lands it, repair rounds".

**Self-test assertions rewritten**, each keeping its intent:
- a dependent waits until its dependency merged, in its lane and across lanes: now after `review:<dep>#1`, the agent
  that lands it (was `merge:<dep>`);
- "merges are serialized" (`peakMerges`) existed so that no two landings shared the integration worktree. Each
  landing now has its own tree, and origin/main orders the pushes: "each reviewer gates in its own landing tree, never
  the one the bundle was built in", "two bundles land from two trees", and "a rejected push is rebased again and gated
  again before it is pushed again" (kept below) take its place, and "two lanes' reviews may run at once" (`peakLandings`,
  the stub counting `review:` agents) pins the concurrency;
- a failing bundle is repaired and re-verified (`fix:a1#2`, `verify:a1#3`): handed back, repaired and reviewed again
  (`fix:a1#2`, `review:a1#3`); the next verifier sees the findings the repair answered: the next reviewer does;
- the trailers: the verifier saw those it checks and the merge agent those it writes; now the builder, the reviewer and
  the repairer each see them;
- "a merge refused on a red gate goes back to repair" and "the merge agent is told how to report a red merged result":
  a red rebased head the reviewer could not repair goes to `fix:b3#1` and then `review:b3#2`, the repairer is told what
  was red, and the reviewer's step 2 says to repair a red it can and report any other in `blocking` with
  `merged: false`;
- the landing's eight assertions now read the reviewer's prompt and `REVIEW_SCHEMA`. Six keep their patterns (the
  rebase, a rejected push rebased and gated again, no merge commit, nothing forced, the landed test by ancestry or
  subject, the schema's `pushed`). Two name the landing worktree: the gate on the exact rebased head now matches
  "in this bundle's own landing worktree `/srv/repo-wt-integ-st-st-a1` (detached HEAD; a tree other than the one the
  bundle was built in)" and `git status --short` clean before the checkout and the `merge-base --is-ancestor` check,
  where it matched "in the integration worktree `/srv/repo-wt-integ-st`"; the fast-forward push is from that tree;
- `merge-failed` when only the push failed, never sent to repair: through the review stub (`landUnpushed`);
- the polling-loop and Monitor rules read the reviewer's prompt; the stash rule is checked in the builder's, the
  reviewer's and the repairer's;
- the budget ending `unverified` (`failReview: { b3: 9 }`), and the reopen scope reaching `review:p1#1`, `fix:p1#1` and
  `review:p1#2`;
- resume from the old-label journals `wf_one` and `wf_two` (kept as they were, now the old-label case): a lost merge
  resumes at `review` (was `merge`), a lost verifier at `review` with the "reverting a hunk" note and the previous
  findings (was `verify`), a builder's report without a review at `review` (was `verify`), a reopened bundle at
  `review` (was `verify`), and the resumed run calls `review:a2#1` (was `merge:a2`); every other expectation of
  theirs (fix, the restart notes, the root-cause round at `max`, needs-owner, the acceptance cache) is unchanged;
- `wf_four` (a budget spent across a restart), `wf_five` (acceptance after a reopened bundle) and `wf_three` (an
  acceptance repair resumed) are written with `review:` labels; their assertions are unchanged.

**Added assertions**, each failing without this change: a passing bundle lands with exactly two agents
(`implement:solo`, `review:solo#1`) and no `verify:` or `merge:` label drives a bundle; unrepaired findings go
`fix:solo#1` then `review:solo#2`, which shows the previous findings, while the repairer sees what the reviewer already
repaired and the completion result lists it; the reviewer never built the bundle, keeps each step of the verifier's
checklist, repairs in place in its own tested commits and hands the rest back unlanded, lands only with zero blocking
findings remaining, does step 0 first and reports an earlier landing with `blocking: []`, runs the profile's `gate` on
the rebased head and leaves it out of Part A, lists a repair made on the rebased head in `repaired`, and removes the
landing worktree after the landing; the builder's and the repairer's rule 5 name `quickGate` and `tests` and no longer
require the full gate; `REVIEW_SCHEMA` requires `pass`, `blocking`, `repaired`, `merged` and `pushed`; a review that
lands with a blocking finding leaves the bundle `merged` with `landedWithBlocking`, the finding in `lastBlocking` and a
WARNING in the log, and a journal of one seeds the same and `status` shows it; a plan's `efforts.review` of `low` or
`medium` runs the review at `high`, `max` at `max`, and an old `efforts.verify: 'max'` at `max`; a profile without
`quickGate` or `tests` is refused; and in the `review:` journal `wf_seven` a landing settles, a lost reviewer resumes at
`review` with its note in the prompt, a handed-back review and a red rebased head resume at `fix`, a failed push resumes
at `review` with its note, the budget and the needs-owner cap hold, an acceptance result older than a later landing is
not replayed, a repair journaled before the restart reaches the resume state and the completion result, `status` prints
`next: review` and `next: fix`, and the old-label journal `wf_old` resumes a passed verification at `review`.

**Review answered.** The independent review of `056482d` came back CHANGES-NEEDED. B1, the owner's confirmation of the
invariant's wording, was settled with the owner directly: at about 06:10 UTC on 2026-10-07 the orchestrator asked them,
through the session's question tool, "Do you confirm the texts in the preview (invariant, CLAUDE.md and AGENTS.md
lines), the stated consequence, and parallel reviews?", with a preview holding (1) this invariant word for word as it
now reads, "the gate, which it runs itself" included, (2) CLAUDE.md's command-list line, (3) AGENTS.md's gate sentence
as it now reads, (4) the consequence the review named: "a fix the reviewer makes itself is checked by the full gate on
the pushed head, the final proof sweep and the live runs, and by no second agent", and (5) parallel reviews, each
landing from its own tree, a push rejected because main moved rebased, gated and pushed again. The owner chose
"Confirm all (Recommended)" over "Confirm, keep serialized" and "Hold it". The opening's "every bundle is checked by an
agent that did not build it" is read with that consequence: the builder's work is checked by the reviewer, and the
reviewer's own repairs by the gate, the sweep and the live runs. B2: the invariant keeps "the gate, which it runs
itself" (`990cd41`). B3: a landing with blocking findings is flagged and kept, as above (`670c441`, `a4ee099`). B4: the
review effort's floor is asserted (`670c441`). O1, which the orchestrator asked the owner to confirm, gives each bundle
its own landing worktree and drops the in-run landing lock: on the measured means a review takes about 25 minutes while
two lanes deliver a build about every 20, so serialized reviews would have eaten the gain (`670c441`, `a4ee099`). O2,
O3, O4 and O6 as above (`670c441`, and `9da5632` for O2's lint); O5 is AGENTS.md's sentence above (`4dde48d`); O7
is the failed-push note above.

**Second review: PASS** at `d3473ce` (its self-test, `pnpm check` 06:16 to 06:23 UTC at load 4.6 to 7.9, and each answer reverted alone turning the self-test red at its named assertion). Its optional findings carried before landing: `meta.description` no longer says "one landing at a time"; two self-test comments name the landing worktrees; SKILL.md's opening states the confirmed consequence beside "every bundle is checked by an agent that did not build it". Left for the first run on the new stages: whether concurrent reviewers' gates make "re-run a timing red once alone" unattainable, and whether sibling pushes meet a ref-lock warning on `refs/remotes/origin/main`; record what it shows in `references/environment.md`.

**Not changed.** The acceptance stages and their prompts, `grounding()`, the builder's rules but rule 5, the profile's
`gate`, the budget, and the needs-owner cap.

**Verified** under Node 24. `node scripts/orchestration.mjs self-test`: "self-test: all checks passed". `pnpm check`
from 05:12 to 05:19 UTC on 2026-10-07, every code change before the review in the tree: "Test Files 360 passed | 5
skipped (365)", "Tests 5207 passed | 33 skipped (5240)", exit 0, at a load of 4.71 at the start and 8.59 at the end
(other workflows were running), no timing red; again on `1df9ee5`, 05:20 to 05:26, the same counts, exit 0, load 7.50
and 6.92. After the review's answers: `pnpm check` from 05:51 to 05:57 UTC on `9da5632`, with only this entry's text
uncommitted beside it, the same counts, exit 0, load 8.48 at the start and 6.28 at the end; a first run at 05:48 was
red on one lint error, the dropped old `merge` effort bound to an unused name in `stageEfforts`, repaired in
`9da5632`. Reverting in scratch copies of the skill, with the assertions added or rewritten above run one by one in a
scratch harness: with `scripts/workflow.template.js` at origin/main (`17075a7`), each of the 21 that read the template
fails; with `deriveState` and its notes at origin/main, the self-test fails at "an old lost merge resumes at review
(its landing's step 0 finds an earlier landing)", and the resume checks for `review:` journals, old passed
verifications, old interrupted merges and `status` fail. Each answer to the review, reverted alone, turns the
self-test red at the assertion named: the effort floor (B4), "a plan never lowers the review stage below high"; the
flag in `drive` (B3), "a bundle landed with a blocking finding keeps it, flagged for the orchestrator"; the flag in
`deriveState`, "a journaled landing with blocking findings stays flagged after a restart"; a lock put back around the
review (O1), "two lanes' reviews may run at once: origin/main orders their pushes"; one landing tree for all bundles,
"each reviewer gates in its own landing tree, never the one the bundle was built in"; the repairs carried in `drive`
(O6), "the completion result lists repairs journaled before a restart", and in `deriveState`, "repairs a reviewer made
before a restart travel in the resume state"; the `verify` mapping (O2), "an old plan's efforts.verify is read as
efforts.review"; the profile check (O4), "a profile without `quickGate` is refused". A sample plan (three bundles, one
waiting on another, one acceptance round) rendered from this copy with `render`, whose dry run settles every bundle in
9 agent calls (three `implement`, three `review`, three acceptance); with `efforts: { verify: 'max' }` on one bundle,
`render` prints "bundle gamma: `efforts.verify` is read as `efforts.review` and `efforts.merge` is dropped" and
`dry-run --fail-review gamma=1` gives `review:gamma#1 [max]`, `fix:gamma#1`, `review:gamma#2 [max]`, every bundle
`merged`, status `complete`.

## 2026-10-04 — main's history is linear: a bundle lands as a rebase and a fast-forward push

**Prompted by** the owner, in the session's own conversation at 12:17:10 UTC on 2026-10-04 (the user's message in the
session transcript, read before this edit): "please always use rebase instead of a merge commit for main." The
orchestrator had just landed self-improvement #4 by a rebase (`3aef461`). Until now the merge stage merged each bundle
into origin/main with `git merge --no-ff` in the plan's integration worktree and pushed that merge commit. The owner's
words are their explicit approval for this change, the protected invariant's wording included.

**Changed**
- `scripts/workflow.template.js`, the merge stage only (`mergePrompt` and `MERGE_SCHEMA`'s descriptions). Step 0: a
  landing is found without a merge commit, by `git merge-base --is-ancestor <branch> origin/main` on the rebased branch,
  or by the bundle's commit subjects on origin/main when the branch is gone (an older landing is still found by its
  `Merge branch '<branch>'` commit), and the landed head is reported. Step 1: in the bundle worktree, a rebase or merge
  left in progress is aborted, `git status` is clean, and the branch is rebased onto origin/main (its own merges of
  origin/main drop out; each replayed conflict is resolved as repository.md says). Step 2: that exact head, checked out
  detached in the plan's integration worktree, gets the gate and the proofs the tasks name; a red that is the rebase's
  own is fixed in a new commit on the branch, any other red goes back to repair. Step 3: that head is pushed from there
  as a fast-forward to each push target; a push to main rejected because origin moved is rebased, gated and pushed
  again; nothing is forced.
- **The integration worktree stays.** The gate could run in the bundle worktree, but the old landing also ran the
  proofs on merged main in a tree other than the one the bundle was built in, which is what
  `docs/clean-room/agent-workflow.md` asks for ("Proofs that reach into per-workspace state have passed in the tree
  they were written in and failed in the primary checkout on a directory name alone"). Gating the exact rebased head in
  the integration worktree keeps that, and keeps the profile's `integ` and the self-test's two assertions on it as they
  were.
- SKILL.md: the opening (nothing lands unless the gate is green on the exact head that lands, as a rebase and a
  fast-forward push), the `merge-failed` row, §6's landed branches, and the protected invariant, which read "the gate
  runs on the merged result before every push; nothing is forced, reset or rewritten" and now reads "the gate runs on
  the exact head that is pushed, before every push; main's history stays linear, a rebase and a fast-forward push and
  never a merge commit (the owner, 2026-10-04: "please always use rebase instead of a merge commit for main."); nothing
  is forced or reset, and no branch is rewritten but a bundle's own unlanded one, by its rebase onto main". Its
  substance is kept: the old "nothing is forced, reset or rewritten" stands but for the one rewrite the owner's words
  need, a bundle's own unlanded branch rebased onto main; the merge prompt's step 3 says the same.
- `references/repository.md`: Worktrees and branches states main's linear history and the landing, and that merging
  origin/main into a bundle branch while it is built is fine, since the rebase at landing drops those merges; the gate
  runs before verification and on the rebased head before every push; Merge conflicts applies to each replayed commit;
  "Another writer on main" compares from the last head this session pushed.
- `references/environment.md`: a merge agent lost mid-landing (a rebased, unpushed branch, or a rebase in progress),
  with fin3's and fin4's merge commits kept as the case before rebase landing.
- `references/workflow-tool.md`: the `merge:<key>` label keeps its name for the landing stage; landings are
  serialized, and a rejected push is rebased, gated and pushed again.
- `docs/clean-room/agent-workflow.md`: the title; "Merge back, and persevere" becomes "Rebase onto main, and
  persevere", with its old name kept beside it (`docs/architecture/first-executions.md` and a fixed note cite it) and
  the owner's words; conflicts in a merge into one's own branch and in each replayed commit; no `git add -A` during a
  rebase either; "Verify the rebased head, never only the branch before it", in another tree; "Remove the worktree once
  landed".
- `CLAUDE.md` ("Where the work happens"), by the orchestrator in `0d7fb3e` on the owner's words of 12:17:10: a change
  "lands on `main` by a rebase and a fast-forward push the agent performs itself; `main`'s history is linear, with no
  merge commit (the owner, 2026-10-04: "please always use rebase instead of a merge commit for main.")", and "Steps,
  the conflict shapes a rebase replays, and the LF line-ending rule live in `docs/clean-room/agent-workflow.md`".
  It read "lands on `main` by a merge the agent performs itself" and "Steps, merge-conflict shapes, and the LF
  line-ending rule". The builder of this change left CLAUDE.md to the orchestrator, since an agent does not change it
  on another agent's word.
- The finding a refused landing hands the repairer (`workflow.template.js` `drive`, and `deriveState` in
  `scripts/orchestration.mjs`) is now titled "The gate is red on the bundle rebased onto origin/main"; it read "The gate
  is red once origin/main is merged in".

**Not changed**, so the paused plans fin15 and fin16 resume under the same instructions for every stage but the
landing: `grounding()`, the builder, verifier, repairer, sweep, live-runner and autopsy prompts, and
`scripts/orchestration.mjs`'s resume notes (`MOVED_ON` and the others); the one difference a repairer can see is the
renamed finding above. Labels and endings (`merge:<key>`, `merged`, `merge-failed`) keep their names. No existing
self-test assertion was removed or changed.

**Verified** by `node scripts/orchestration.mjs self-test` and `pnpm check` under Node 24, both green, and
`node tools/check-record-links.mjs`. Each hunk, reverted alone in a scratch copy of the skill, turns the self-test red
with the assertion named:
- the whole merge prompt (the old one restored), and step 2, the exact head in the integration worktree: "the gate runs
  on the exact rebased head, in a tree other than the one it was built in";
- step 0, the landed test: "the landed test needs no merge commit: the rebased branch is part of main, or its commits
  are found by subject";
- step 1's rebase (the old `git merge origin/main` put back): "the merge agent rebases the bundle onto origin/main";
- step 3's push: "the merge agent pushes the rebased head as a fast-forward";
- step 3's rebase again on a rejected push: "a rejected push is rebased again and gated again before it is pushed
  again";
- step 3's "Never force or reset, and never rewrite a branch but this bundle's own, unlanded one, by its rebase onto
  origin/main.": "the merge agent forces nothing, resets nothing, and rewrites only its own unlanded branch";
- a `git merge --no-ff` put back: "the merge agent makes no merge commit";
- `MERGE_SCHEMA`'s `pushed` description: "the merge schema reports the rebased head".

**A one-time check, not an assertion**, that every other prompt is unchanged: a SHA-256 over every rendered prompt but
the merge stage's, for a fixed plan and profile (the self-test's plan; the profile with `{node24}` and `{node}` replaced
by fixed strings, so the result does not depend on the host's Node), across a fresh run with one failed verification
and one acceptance finding, a run resumed from the self-test's journals, and a run with a refused live launch, each
run's prompts sorted by label. At the base, `3aef461`, it is
`7bea50c0aa095d82331ba410186729e69047fc6b481db1ea2aa2f0fb1b961976`; at this change's head it is the same once the
renamed finding title is written back to the old one (`a1694776…` without that), the same under Node 20 and Node 24.
A first version pinned that hash as a self-test assertion; the review removed it, since it would make every later
improvement to those prompts edit an assertion, and so need the owner, which the improvement rule does not ask; and
`render --runs` seeds settled stages by label, not by prompt.

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
