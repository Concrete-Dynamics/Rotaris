---
name: orchestrated-build
description: 'Drive a very large implementation (a release backlog, every open defect, a whole feature set) through a multi-agent workflow: bundles of two tasks per builder, an independent reviewer per bundle that repairs what it can in place and lands it from its own tree, repair rounds until it passes, then acceptance rounds (full proof sweep, live run against a real model, autopsy) whose findings go back through the same loop. Survives container restarts and usage limits by resuming from the workflow journals. Use when the owner asks to "fix everything before release", "do all open defects", "implement the whole backlog", "plan it and delegate with a workflow", or names this skill. The skill improves itself: read "Improving this skill" before finishing.'
argument-hint: '[scope, e.g. "every open defect and unimplemented feature except signing"]'
---

# Orchestrated build

You are the orchestrator. You plan, launch, watch, recover and report; agents build, review, repair, land and
accept. Quality rests on two things you never trade away: **every bundle is checked by an agent that did not build
it** (a reviewer's own repairs are checked by the gate, the acceptance sweep and the live runs, as the owner confirmed
on 2026-10-07), and **nothing lands unless the repository's gate is green on the exact head that lands**. A bundle lands on main
as a rebase and a fast-forward push, never a merge commit (`references/repository.md`, Worktrees and branches).

| File (relative to this skill) | What it holds |
| --- | --- |
| `scripts/workflow.template.js` | The one workflow every run uses: lanes → build → review (repair in place, land) → repair, then acceptance |
| `scripts/orchestration.mjs` | `render` a plan (fresh, or resumed from journals), `status`, `dry-run`, `self-test` |
| `profiles/<repo>.json` | One repository's commands and places (gate, setup, proofs, live runs, worktrees) |
| `references/environment.md` | The host: toolchain, long jobs, load, restarts, limits, pause and backup, blocked shell forms |
| `references/workflow-tool.md` | The Workflow tool as it behaves: journals, labels, resume, concurrency, surveys |
| `references/live-runs.md` | Live runs: authorization, permission rules, refusals, running them |
| `references/repository.md` | This repository's process in one page, pointing at its authorities |
| `references/skill-review.md` | The fixed prompt for reviewing a change to this skill |
| `CHANGELOG.md` | Every change to this skill, with the evidence that prompted it |

`pnpm check` runs the self-test (`tools/orchestrated-build-skill.test.ts`). Read `references/environment.md` and
`references/workflow-tool.md` before the first launch of a session.

## 1. Scope

1. Survey read-only: open defect notes, unimplemented requirements, the release plan, open questions that bind
   work, and what the owner excluded. Fan a wide survey out to read-only agents; keep their conclusions
   (`references/workflow-tool.md`, A read-only survey).
2. Classify every item: **repairable by an agent**, **needs the owner** (a ruling, a permission, a platform this
   host lacks), or **excluded**. Only the first kind becomes a task; the others go in the report.
   **An open question is no longer the owner's** (R-072, 2026-10-07; `references/repository.md`): rule it with the
   consortium before planning — two independent advocate agents, one arguing from the user's view and one from the
   system's, each read the entry and the requirements it names and recommend, and a ruling agent weighs both and rules,
   all as one dynamic workflow. Each ruling goes into its entry ("Ruled <date> under the owner's delegation (R-072)",
   naming both recommendations) and becomes a directive where it departs from a requirement, on a docs-only branch
   landed before the plan that builds it. An escalation, or reversing a clause the owner ruled personally, stays the
   owner's; the consortium's own recommendation goes with it.
3. Ask the owner, in ONE message, everything that would stop the run later: may live runs happen, against which
   endpoint, and may you add the permission rules for agents (`references/live-runs.md`); model and effort (default:
   Opus, `high`); what is excluded. Settle from the code, the record or a default anything that can be settled so.
   An authorization the owner made standing is quoted in every later plan and asked about no further; what its
   words leave out (another endpoint, a metered one) is asked (`references/live-runs.md`, Authorization).
4. Record the owner's requests and rulings where the repository requires (`references/repository.md`, Owner
   requests) on a docs-only branch merged before launch; the brief cites them by id.

## 2. Plan

Write `plan.json` in the scratchpad:

```json
{
  "id": "r3",
  "trailers": "<this session's commit attribution lines, verbatim>",
  "extraPushTargets": ["<the session branch, if the session has one>"],
  "live": { "authorized": true, "ownerWords": "<the owner's authorization, quoted>" },
  "brief": "What every agent must know this round: rulings by id, evidence files, exclusions.",
  "pins": [["bundle-x", "bundle-y"]],
  "bundles": [
    { "key": "child-exec", "lane": "B", "after": [], "notes": "…",
      "tasks": [ { "title": "…", "body": "…" }, { "title": "…", "body": "…" } ] }
  ],
  "acceptance": { "rounds": 2 }
}
```

- **`id`** (1-8 lower-case letters or digits) prefixes every branch and worktree; a fresh `render` refuses one an
  earlier orchestration left branches or worktrees under. Keys are letters, digits, `-` and `+`; `accept<n>-<m>` is
  reserved for acceptance repairs.
- **`live`** is present only when the owner authorized live runs; quote their words (`render` refuses the
  placeholder). Without it agents are told never to launch one, and acceptance runs no live-runner.
- **A bundle is two tasks that touch the same area**, built on one branch by one builder.
- **Lanes are dependency chains.** Bundles editing the same functions share a lane, ordered with `after`.
  `render` sorts each lane by its dependencies, moves a bundle waiting on another lane (and what waits on it) to the
  end of its lane, and balances lanes. A `pins` set (bundles editing the same file) must sit in one lane. A run
  executes at most min(16, CPUs − 2) agents at a time (two on four CPUs), so lanes past that queue; to go faster,
  split the bundles over two plans, within the ceiling `references/workflow-tool.md`, Concurrency, sets.
- **Number ranges.** The brief gives each plan its own range of open-question numbers (and directive or request
  numbers where it may need them), and each bundle a disjoint sub-range of it that its reviewer raises in too, so
  neither plans nor sibling bundles collide; one that lands on a number main already holds takes the next free one (`references/environment.md`, Parallel plans; `references/repository.md`, Merge conflicts).
- **A task body is self-contained**: the note or requirement to read, the evidence (file:line, proof output, pack),
  the proof or live scenario that shows the repair, and the rulings that apply. A task only the owner can close is
  no task: record it and report it. A builder that meets one inside a bundle lists it in `ownerBlocked` with the
  record it made, and finishes the rest; the reviewer judges that task on its record.
- Optional per bundle: `title`, `branch`, `short`, `effort`, `efforts` (per stage), `reopen` (§4).

## 3. Render, dry-run, launch

```bash
# Agents read this skill from this orchestration's own detached reference worktree; the owner's checkout is never touched.
git -C <repo> fetch origin main
git -C <repo> worktree add --detach <repo>-wt-skillref-<id> origin/main 2>/dev/null || git -C <repo>-wt-skillref-<id> checkout -q --detach origin/main
K=<repo>-wt-skillref-<id>/.agents/skills/orchestrated-build
S=<scratchpad>/orchestration-<id>; mkdir -p $S
node $K/scripts/orchestration.mjs render --plan $S/plan.json --profile $K/profiles/<repo>.json --out $S/run-1.js
```

`render` validates the plan (keys, a fresh id, unique branches and worktrees, dependencies, cycles, pins, live
authorization), checks that the reference worktree's copy of this skill matches the one rendering, embeds the plan
in the template, and dry-runs the result against stub agents; it refuses to write a script
that leaves a bundle unsettled. Launch with `Workflow({ scriptPath: "$S/run-1.js" })` and write the run id as the
first line of `$S/RUNS.txt`. Each reviewer lands from its bundle's own landing worktree (`<integ>-<short>`: the profile's
`integ`, a dash, the bundle's short name), which it creates when missing and removes after the landing.

Schedule a recurring fallback check-in bound to this session (`create_trigger`, every two hours, its minute jittered)
whose message says: read the last run of `RUNS.txt`, run `status`, look for another writer on main
(`references/repository.md`), recover if it stopped, else end the turn silently. It survives restarts and a turn a
usage limit refused (`references/environment.md`, Limits); background tasks and a one-shot `send_later` do not.

## 4. While it runs

**Bundle endings** (in the completion result, and in `status`):

| Ending | Meaning | What you do |
| --- | --- | --- |
| `merged` | On main, gate green | Nothing; but with `landedWithBlocking`, its reviewer landed it with the findings in `lastBlocking` unrepaired: record each (repository.md) and report it |
| `blocked` | No task could proceed | Report it; or `reopen` it (below) |
| `needs-owner` | Two repair budgets spent, findings survive | Report the last findings to the owner |
| `unverified` | One budget spent | Re-render: it gets a fresh budget at `max` with a root-cause note |
| `merge-failed` | The rebased head was green but the push failed | Re-render: a review retries the landing (its step 0 finds one that did happen) |
| `*-lost`, `halted`, `error` | An agent came back empty, or three in a row did | Recover (below) |

The run's own `status`: `complete`; `incomplete` (a plan bundle did not settle, so acceptance was skipped: re-render);
`halted` (lost agents: a usage limit or an outage); `acceptance-incomplete` (an acceptance agent was lost);
`live-handoff` (acceptance ran, but the permission system refused the live launches: they are yours, §5).

**Recovering** from a restart, a usage limit or a halt:
1. Make sure the previous run has stopped (a restart notice says so; otherwise stop it). Never run two runs of one
   `RUNS.txt` at once.
2. After a usage limit, probe with one trivial agent at the first turn of yours it lets through (the owner saying to
   continue, or the stated reset), which can be days early (`references/environment.md`, Limits); recover once the
   probe succeeds.
3. Refresh the reference worktree to origin/main (§3), so a skill improvement merged meanwhile reaches the agents.
4. Render from the journals, launch, and append the run id to `RUNS.txt`:
   ```bash
   node $K/scripts/orchestration.mjs render --plan $S/plan.json --profile $K/profiles/<repo>.json --runs $S/RUNS.txt --out $S/run-N.js
   ```
   `render` reads every journal and starts each bundle where it stopped, with a note telling the agent what an
   interrupted predecessor may have left. Never resume a lane script with `resumeFromRunId`.

**Pausing** at the owner's request: stop every task, disable the check-in and write `RESUME.md`; offer to push what
lives only in the container, which needs the owner's word (`references/environment.md`, Pause and backup). Resuming is
Recovering, above.

**Reopening a blocked bundle** that holds good work: add `"reopen": "<the accepted outcome of the blocked task>"`
to it in the plan and render; every later stage of it sees that scope, and it is reviewed again and lands.
Acceptance results are not replayed while a plan bundle still has to land.

**A refused live scenario** in a bundle comes back as not verified, with the exact command its builder or reviewer
sent: run that scenario yourself on merged main once the bundle has landed (`references/live-runs.md`, Running).

**Reviewers' optional findings** come back per bundle (`optional`), beside what they repaired in place (`repaired`). One
that is a real defect elsewhere is recorded (repository.md says how) on a docs-only branch merged with the gate green.
An optional becomes a task only when it is a real defect (recorded first) or touches the next plan's area anyway;
once fewer than five remain, or none is a defect, they go to the final report's Offen and no plan is made for them.
One about this skill is never a plan task: it goes through "Improving this skill" as its own change.

**A friction survey** every three or four plans, in a free plan slot: a report-only read of the runs since the
last one for what cost a round, a relaunch, a workaround or a question (`references/workflow-tool.md`, A friction
survey). Each proposal you accept goes through "Improving this skill" on its own.

**Status to the owner**: a short paragraph per event worth knowing (merges, a stuck bundle, a decision needed),
numbers first; no narration of routine steps.

## 5. Acceptance

When every plan bundle has settled, the workflow runs acceptance on merged main: the full proof sweep in two
serialized halves, the authorized live runs, then an autopsy listing what still does not work. Actionable findings,
paired by area, go through the same loop; then the next round. A cached acceptance result is replayed only while
nothing but its own repairs merged after it; `"acceptance": { "fresh": true }` forces a fresh round.

- **Triage again before acceptance.** Builders keep recording defect notes (each bundle's `notesRecorded`), and the
  autopsy lists only what its runs observe. With split plans, re-run §1's survey over origin/main before the
  acceptance-only plan (`references/workflow-tool.md`, Concurrency) and plan the repairable notes it finds ahead of
  it; a single plan runs acceptance inside its own workflow, so triage when it ends and plan what remains. While
  another plan still builds, a short triage of only the notes the last plan recorded can fill the free plan slot.
- **Accept a head nothing else is about to change.** When repair work remains outside the acceptance plan (another
  plan still building, notes the last repairs recorded), finish it first: a round on a head later plans change owes
  another round anyway. An acceptance plan overtaken so is superseded, not re-rendered: a new plan finishes its open
  repair bundle from its pushed branch, and one acceptance-only plan runs last on the final head (finacc, 2026-10-04).
- **A refused live launch is handed to you.** After a refusal the live-runner launches nothing more and returns every
  run's exact command; no later round of that run starts a live-runner, the autopsy records the hand-off as one
  `live-check-failed` finding that goes to no builder, `status` lists the commands at a check-in, and the run ends
  `live-handoff`. Run them yourself at the head you judge (`references/live-runs.md`, Running: the tree built and
  bundled, duress in a dedicated tree), have an agent autopsy the packs beside the round's autopsy report, and feed its
  findings in as a new plan. The Done criteria count them.
- **Record every finding left unrepaired** when the rounds end: a defect note, or an open question for one that needs
  a ruling, which the consortium then rules (§1.2) before the next round plans it. While actionable findings remain,
  plan another round.
- **Done** means: an acceptance round with the gate green, every proof passing or stated not-applicable with its
  reason, the authorized live runs passing, and nothing open that an agent could repair. The rest is the owner's.

## 6. Final report and cleanup

First run a friction survey over the plans since the last one (§4); its proposals that cross a protected invariant
go in the report as proposals to the owner. Report what merged (counts, notable repairs), what remains open and why
(owner rulings, platform-bound, excluded), each decision waiting on the owner in one line, collisions the owner must
know about, and where the evidence is. It names the acceptance run and round that met Done at the reported head (its
sweep, live verdict and autopsy), or says plainly that Done is not met. That report is the handoff shape (`docs/clean-room/agent-workflow.md`): what
merged is its Zustand, the evidence's places its Beweise, what remains and the decisions waiting on the owner its
Offen, and the owner's first action its Nächster Schritt.
Then remove the landing worktrees left by bundles that did not land (`<integ>-<short>`), the acceptance, live,
survey and reference worktrees and the landed branches (`git branch -d`), stop leftover `Xvfb`, and delete the check-in.

## Improving this skill

This skill updates itself. An improvement needs evidence and an independent review, not the owner's approval.

**When.** Something cost an agent round, a relaunch, a manual workaround or a question the skill should have
answered; a statement in it proved false; a measured alternative proved better.

**How.**
1. Make the smallest change that removes the friction, where it belongs: a fact in the reference it concerns; a
   mechanism in `scripts/` WITH a self-test assertion that fails without it; a step here. Delete what became false.
2. Add a `CHANGELOG.md` entry: date, what prompted it (run id, journal line, output), what changed, how verified.
3. `node scripts/orchestration.mjs self-test` and `pnpm check` pass.
4. One reviewer agent (Opus, `high`) reviews the diff with the fixed prompt in `references/skill-review.md`. Answer
   its findings to the same reviewer until it passes; never ask a fresh reviewer instead.
5. Land it like any change (`references/repository.md`); mention it in one line in your next status update.

**Protected invariants**: an improvement never weakens them without the owner's explicit approval:
- `CLAUDE.md`'s hard boundary binds every agent the skill starts;
- the reviewer never built what it reviews, reads the full diff and the requirement texts itself, may repair
  blocking findings in place in its own commits, and lands only with zero blocking findings remaining and the gate,
  which it runs itself, green on the exact head it pushes; the builder runs the quick checks, and the full gate runs
  once per landing, on the pushed head (the owner, 2026-10-07: "Maybe one implementer, one fix, and then merge." and
  "Uh, yes, go ahead and make the change. I approve it."); no step of its checklist or of the builder's rules is
  removed or loosened;
- the record obligations and boundaries `references/repository.md` states may be added to, or corrected toward
  their authorities, never dropped;
- the gate runs on the exact head that is pushed, before every push; main's history stays linear, a rebase and a
  fast-forward push and never a merge commit (the owner, 2026-10-04: "please always use rebase instead of a merge
  commit for main."); nothing is forced or reset, and no branch is rewritten but a bundle's own unlanded one, by its
  rebase onto main;
- the review stage's model and effort, the repair budget and the needs-owner cap are never lowered;
- the acceptance sweep, the autopsy, the record-every-finding step and the Done criteria are never reduced; the
  profile's `gate` is never narrowed;
- live runs need the owner's quoted authorization; nothing grants permissions, spends, rules an owner's decision,
  or stores a secret;
- this section, its invariants, `references/skill-review.md`, and every self-test assertion: removing or loosening
  one is itself a change that needs the owner.

A change that would cross one is a proposal to the owner, not an edit. Keep this file under ~250 lines.
