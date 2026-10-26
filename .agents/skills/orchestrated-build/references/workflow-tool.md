# The Workflow tool, as it behaves

## Opt-in

A workflow spends many agents. Run one only when the owner asked for a workflow or multi-agent orchestration in
their own words, or invoked this skill. Load the `workflow-authoring` skill once per session before editing the
template.

## Shape

- `export const meta = {…}` must be a pure literal. Everything else is plain JavaScript with `agent()`, `parallel()`,
  `log()` and the global `args`.
- **A script cannot read files.** State goes in as `args` or embedded in the script. `render` embeds the whole plan
  and the recovered state, so the tool call carries only `scriptPath`: large inline `args` would cost the
  orchestrator's own context.
- `agent(prompt, { label, phase, schema, model, effort })` returns the schema-validated object, or `null` when the
  agent was lost. `model: 'opus'`; `effort: 'medium' | 'high' | 'max'`. The template wraps it in `call()`, which
  halts the run after three empty results in a row.
- Agents cannot see the conversation. Everything they need is in the prompt, the brief, the files the prompt names,
  and `AGENTS.md`.

## Labels are the resume keys

`implement:<key>`, `implement:<key> (resumed)`, `review:<key>#<n>`, `fix:<key>#<n>`,
`accept:sweep-1#<round>`, `accept:sweep-2#<round>`, `accept:live#<round>`, `accept:autopsy#<round>`. `deriveState`
in `scripts/orchestration.mjs` reads them; change a label's shape only together with it and its self-test. Since
2026-10-07 the `review:<key>#<n>` stage reviews a bundle, repairs in place and lands it; journals written before by
the `verify:<key>#<n>` and `merge:<key>` stages still resume, in the new stages: a passed verification or an
interrupted merge at `review`, a failed verification or a refused merge at `fix`.

## Journals

`~/.claude/projects/<project>/<session>/subagents/workflows/<run>/journal.jsonl`, one JSON object per line:
`{"type":"started","key":…,"label":…}` and `{"type":"result","key":…,"result":…}`. A `started` without a
`result` is an agent the run lost. The completion notice's output file is a JSON object whose `result` holds the
script's return value (`result.status`, every bundle's ending, acceptance), with `summary`, `logs` and usage beside
it; the journal holds every agent's.

## Resuming

- `resumeFromRunId` replays cached agent results **by call order**: editing an earlier call's prompt or options
  invalidates every later one, and with concurrent lanes the order is not stable from run to run. Use it only for a
  single sequential chain.
- For lane scripts, recover with `render --runs` (SKILL.md §4): the journals decide where each bundle stands, and the
  new script starts each bundle there.

## Concurrency and serialization

- **A run executes at most two agents at a time on the 4-CPU container.** The tool's own reference caps concurrent
  `agent()` calls at min(16, available CPUs − 2) per workflow, a nested `workflow()` sharing its parent's cap: two on a
  4-CPU host, and six on the 8-CPU Windows host (run `wf_68d2abb8-296`, 2026-10-20, started six of its eight first-stage
  agents between 08:05:49 and 08:05:51 UTC and queued the other two).
  None of the sixteen runs of the session this skill came from exceeded two (fourteen peaked at two; measured from
  each agent transcript's first and last timestamps), whatever their lanes or `parallel()` width; a four-lane run
  started two lanes and queued the other two. Agents you start yourself (the Agent tool) run beside it. Lanes past
  the cap only queue, and one lane runs one agent at a time: plan duration on the cap per run.
- **Two runs at once each run two**: on 2026-09-29 `wf_4da43d03-b3a` and `wf_f722534f-88d` overlapped from 05:27 to
  11:29 UTC with four workflow agents at once, and every merge either made then had its gate green.
- **At most two plans build at once on a 4-CPU host**, and nothing else runs beside more than one of them: no live
  run, proof sweep or autopsy agent. A third plan waits for one of the two to settle. Two plans' reviewers gating at
  once already put the load at 10 to 17 (`references/environment.md`, Load). Five plans at once, with live runs and
  autopsies beside them, put it at 12 to 25 (fin29 to fin33, 09:33 to 11:39 UTC on 2026-10-07): a review took 2 h 46
  min, a fix agent's test timed out on load (`wf_ef97319a-344`, journal line 11), and a builder returned a task
  owner-blocked on load alone (`wf_4ade4086-c7a`, journal line 10). It came back with five plans on 2026-10-13, 03:08
  to 04:49 UTC.
- **To run more, split the bundles over two plans** that share no bundle, no file and no `after`, within the
  ceiling above:
  - each has its own `id`, so its own branches and landing worktrees (`<repo>-wt-integ-<id>-<short>`), and its own
    scratchpad directory (SKILL.md §3: `plan.json`, `RUNS.txt`, rendered scripts) and check-in;
  - each takes `"acceptance": { "rounds": 0 }`, because every plan shares the profile's acceptance worktree;
  - when both have settled and a fresh triage has run (SKILL.md §5), one acceptance-only plan (`"bundles": []`, the
    rounds a single plan would have had, 2 by default) runs the acceptance over merged main, and its repairs go
    through the same loop;
  - the acceptance live runs stay one at a time, in the acceptance-only plan; a builder's short `--only=<scenario>`
    run may meet one from the other plan, and two live runs leave each other's sandboxes alone
    (`references/live-runs.md`), competing only for CPU and the endpoint.
  Pushes from the two meet at `origin/main` (below).
- **A bundle that builds on another plan's unmerged changes** is a later plan, launched when what it builds on has
  merged, and the orchestrator holds it until then. A triage marks such a bundle with the plan it waits on, in the
  triage's own list (triage 4 wrote `after: ["fin6"]`); the mark never goes into `plan.json`, where `after` names
  bundles of the same plan only and `render` refuses any other. On 2026-10-02 fin8's `ladder-overrides` and
  `focus-bound-recovery` were held so while fin6's `auth-recovery` bundles had yet to merge. A plan that would mix
  such a bundle with ready ones is split: the ready bundles launch now, and the waiting one is its own later plan.
  No prompt or brief tells a builder to wait for, or poll, another plan's landing: fin33's builder held a cap slot
  about 3 h 35 min polling for fin29's (10:10 to 11:42 UTC on 2026-10-07, then 02:48 to 04:49 on 2026-10-13).
- Reviews of different bundles run at once since 2026-10-07, each gating and pushing from its bundle's own landing
  worktree (`<repo>-wt-integ-<id>-<short>`); before, one integration worktree per plan served one landing at a time
  under a promise-chain lock. Proof sweeps are still serialized with such a lock. Reviewers of one run, two workflows,
  or a workflow and you, coordinate through `origin/main`: a push that is not a fast-forward is rejected, and whoever is
  rejected fetches, rebases, runs the gate again and pushes again. Never run two runs of one `RUNS.txt` at once.

## A read-only survey

Scoping (SKILL.md §1.1), a "what is left" map, or a hand-over list for another host is a survey: agents read and
report, nothing is built or landed. It is a workflow of its own, outside `workflow.template.js`, in four stages:

1. **Pin.** A detached worktree at one `origin/main` commit (`git worktree add --detach <repo>-wt-<name> origin/main`),
   named with its hash in every prompt, so all readers see one tree while plans land beside it. Remove it after.
2. **Sweep.** Several finders at once, each searching a different way (the record by file, defect notes, code paths,
   tooling), each returning items with `file:line` sources through a schema.
3. **Merge, then verify with one agent.** One agent merges the duplicates; then ONE verifier checks the whole merged
   list in one pass: still open at the pinned commit, the steps that measure it, where the result is recorded. It marks
   an item done when the tree shows it done. This replaces one verifier per item, which took most of a survey's wall
   clock on the two-agent cap (above); the owner asked for the single verifier on 2026-10-14 ("give all results to a
   single verifier? This will Speed Things up …", then "Yes add that to the skill."). Only a list too long for one
   agent to read every source of is split, into the fewest batches that fit, and `log()` says so. Read a survey's
   progress against its merge stage's logged item count, never against the labels started: "40 of 42 done" on
   2026-10-14 counted verifiers of 85 merged items.
4. **Draft and critic.** One agent writes the deliverable from the verified list; one critic checks it against the
   tree (every command, script, flag and path exists at the pinned commit; nothing is claimed that was not
   verified); the drafter applies the corrections it confirms.

## A friction survey

A read-only survey whose subject is this skill: what the runs since the last one cost, and what change to the skill
would have spared it. The owner asked for it on 2026-10-14 ("Would it make sense to occasionally launch a surveying
agent that gathers insights from past workflows to identify frictions and suggest updates to the according skill?",
then "yes. do that."). It runs every three or four plans and once before the final report (SKILL.md §4 and §6), in
the four stages above:

1. **Pin** the skill in a detached worktree of the survey's own (`git -C <repo> worktree add --detach
   <repo>-wt-survey-friction-<hash> origin/main`), named with its hash in every prompt and removed after. Never
   refresh a running plan's reference worktree for it (`references/repository.md`): that plan's agents still read it.
2. **Sweep** the evidence, split by plan range, one finder per range. Agents cannot see the conversation: give every
   finder the absolute paths of its plans' scratchpad directories (`RUNS.txt`), the workflows journal directory
   (Journals, above; every run's `journal.jsonl` and agent transcripts), the completion notices, the orchestrator's
   ledger (`references/environment.md`, Places) and session transcript, and the time span of its range. A finder reads
   that transcript only within its span, so no two read the same part. A finder lists what cost something: a lost or
   relaunched agent, a repair round past the first, an `unverified`, `needs-owner` or `blocked` ending, a workaround the
   orchestrator ran by hand, a question the skill should have answered, a statement in it that proved false, wall clock
   spent queued on the cap. Each item names its evidence (run id and journal line, or transcript timestamp) and how
   often it recurred.
3. **Merge, then verify with one agent**: the evidence exists and shows the cost; the current skill does not already
   remove it (read the skill at the pin and `CHANGELOG.md` since the range began).
4. **Draft and critic**: a ranked list, the costliest first, each with the smallest change that removes it and where
   it belongs (the reference it concerns, `scripts/` with a self-test assertion, a step in SKILL.md), and whether it
   touches a protected invariant.

Record the plan range each survey covered in the ledger; the next one starts where it ended. The survey changes
nothing. You take each proposal you accept through "Improving this skill" (SKILL.md) as its own change with its own
`CHANGELOG.md` entry and review; one that crosses a protected invariant goes to the owner. A transcript can quote a
live-run pack: no finder copies a host name, URL, key or token from one.

## The skill review

`references/skill-review.md`'s one reviewer is started with the Agent tool (Opus, `high`) and the fixed prompt, and
each CHANGES-NEEDED is answered with SendMessage to that agent's id, so the same reviewer judges every pass, as SKILL.md
step 4 asks. It is no workflow agent, so `references/environment.md`'s "Never message an agent a workflow runs" does
not touch it. A workflow re-run with `resumeFromRunId` starts a new agent for each pass: `wf_c8aa15ec-1d4`'s three
passes on 2026-10-14 were three agents, after one lost launch and one refused for a quoting error.

## Cost and duration, as observed

A bundle took one to three hours end to end with separate verify and merge stages (before 2026-10-07); most passed on
the first or second verification; a few needed five. Thirty bundles took about a day on two lanes; a 25-bundle repair
phase another day.
