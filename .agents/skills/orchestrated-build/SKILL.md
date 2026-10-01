---
name: orchestrated-build
description: 'Drive a very large implementation (a release backlog, every open defect, a whole feature set) through a multi-agent workflow: bundles of two tasks per builder, an independent verifier per bundle, repair rounds until it passes, serialized merges, then acceptance rounds (full proof sweep, live run against a real model, autopsy) whose findings go back through the same loop. Survives container restarts and usage limits by resuming from the workflow journals. Use when the owner asks to "fix everything before release", "do all open defects", "implement the whole backlog", "plan it and delegate with a workflow", or names this skill. The skill improves itself: read "Improving this skill" before finishing.'
argument-hint: '[scope, e.g. "every open defect and unimplemented feature except signing"]'
---

# Orchestrated build

You are the orchestrator. You plan, launch, watch, recover and report; agents build, verify, repair, merge and
accept. Quality rests on two things you never trade away: **every bundle is checked by an agent that did not build
it**, and **nothing lands unless the repository's gate is green on the merged result**.

| File (relative to this skill) | What it holds |
| --- | --- |
| `scripts/workflow.template.js` | The one workflow every run uses: lanes → build → verify → repair → merge, then acceptance |
| `scripts/orchestration.mjs` | `render` a plan (fresh, or resumed from journals), `status`, `dry-run`, `self-test` |
| `profiles/<repo>.json` | One repository's commands and places (gate, setup, proofs, live runs, worktrees) |
| `references/environment.md` | The host: toolchain, long jobs, load, restarts, limits, blocked shell forms |
| `references/workflow-tool.md` | The Workflow tool as it behaves: journals, labels, resume, concurrency |
| `references/live-runs.md` | Live runs: authorization, permission rules, refusals, running them |
| `references/repository.md` | This repository's process in one page, pointing at its authorities |
| `references/skill-review.md` | The fixed prompt for reviewing a change to this skill |
| `CHANGELOG.md` | Every change to this skill, with the evidence that prompted it |

`pnpm check` runs the self-test (`tools/orchestrated-build-skill.test.ts`). Read `references/environment.md` and
`references/workflow-tool.md` before the first launch of a session.

## 1. Scope

1. Survey read-only: open defect notes, unimplemented requirements, the release plan, open questions that bind
   work, and what the owner excluded. Fan a wide survey out to read-only agents; keep their conclusions.
2. Classify every item: **repairable by an agent**, **needs the owner** (a ruling, a permission, a platform this
   host lacks), or **excluded**. Only the first kind becomes a task; the others go in the report.
3. Ask the owner, in ONE message, everything that would stop the run later: may live runs happen, against which
   endpoint, and may you add the permission rules for agents (`references/live-runs.md`); model and effort (default:
   Opus, `high`); what is excluded. Settle from the code, the record or a default anything that can be settled so.
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
  end of its lane, and balances lanes. A `pins` set (bundles editing the same file) must sit in one lane.
- **A task body is self-contained**: the note or requirement to read, the evidence (file:line, proof output, pack),
  the proof or live scenario that shows the repair, and the rulings that apply. A task only the owner can close is
  no task: record it and report it. A builder that meets one inside a bundle lists it in `ownerBlocked` with the
  record it made, and finishes the rest; the verifier judges that task on its record.
- Optional per bundle: `title`, `branch`, `short`, `effort`, `efforts` (per stage), `reopen` (§4).

## 3. Render, dry-run, launch

```bash
# Agents read this skill from this orchestration's own detached reference worktree; the owner's checkout is never touched.
git -C <repo> fetch origin main
git -C <repo> worktree add --detach <repo>-wt-skillref-<id> origin/main 2>/dev/null || git -C <repo>-wt-skillref-<id> checkout -q --detach origin/main
K=<repo>-wt-skillref-<id>/.agents/skills/orchestrated-build
S=<scratchpad>/orchestration; mkdir -p $S
node $K/scripts/orchestration.mjs render --plan $S/plan.json --profile $K/profiles/<repo>.json --out $S/run-1.js
```

`render` validates the plan (keys, a fresh id, unique branches and worktrees, dependencies, cycles, pins, live
authorization), checks that the reference worktree's copy of this skill matches the one rendering, embeds the plan
in the template, and dry-runs the result against stub agents; it refuses to write a script
that leaves a bundle unsettled. Launch with `Workflow({ scriptPath: "$S/run-1.js" })` and write the run id as the
first line of `$S/RUNS.txt`. The first merge agent creates the integration worktree.

Schedule a fallback check-in (`send_later`, ~120 minutes) whose message says: read the last run of `RUNS.txt`, run
`status`, recover if it stopped, else re-arm silently. Re-arm at every check-in. It survives restarts; background
tasks do not.

## 4. While it runs

**Bundle endings** (in the completion result, and in `status`):

| Ending | Meaning | What you do |
| --- | --- | --- |
| `merged` | On main, gate green | Nothing |
| `blocked` | No task could proceed | Report it; or `reopen` it (below) |
| `needs-owner` | Two repair budgets spent, findings survive | Report the last findings to the owner |
| `unverified` | One budget spent | Re-render: it gets a fresh budget at `max` with a root-cause note |
| `merge-failed` | The merged result was green but the push failed | Re-render: the merge is retried (its step 0 finds a landing that did happen) |
| `*-lost`, `halted`, `error` | An agent came back empty, or three in a row did | Recover (below) |

The run's own `status`: `complete`; `incomplete` (a plan bundle did not settle, so acceptance was skipped: re-render);
`halted` (lost agents: a usage limit or an outage); `acceptance-incomplete` (an acceptance agent was lost).

**Recovering** from a restart, a usage limit or a halt:
1. Make sure the previous run has stopped (a restart notice says so; otherwise stop it). Never run two runs of one
   `RUNS.txt` at once.
2. After a usage limit, wait for its stated reset and probe with one trivial agent.
3. Refresh the reference worktree to origin/main (§3), so a skill improvement merged meanwhile reaches the agents.
4. `render --plan … --runs $S/RUNS.txt --out $S/run-N.js`, launch, append the run id to `RUNS.txt`. `render` reads
   every journal and starts each bundle where it stopped, with a note telling the agent what an interrupted
   predecessor may have left. Never resume a lane script with `resumeFromRunId`.

**Reopening a blocked bundle** that holds good work: add `"reopen": "<the accepted outcome of the blocked task>"`
to it in the plan and render; every later stage of it sees that scope, and it is verified again and merged.
Acceptance results are not replayed while a plan bundle still has to land.

**Verifiers' optional findings** come back per bundle (`optional`). One that is a real defect elsewhere is recorded
(repository.md says how) on a docs-only branch merged with the gate green.

**Status to the owner**: a short paragraph per event worth knowing (merges, a stuck bundle, a decision needed),
numbers first; no narration of routine steps.

## 5. Acceptance

When every plan bundle has settled, the workflow runs acceptance on merged main: the full proof sweep in two
serialized halves, the authorized live runs, then an autopsy listing what still does not work. Actionable findings,
paired by area, go through the same loop; then the next round. A cached acceptance result is replayed only while
nothing but its own repairs merged after it; `"acceptance": { "fresh": true }` forces a fresh round.

- A live run refused by the permission system is yours: run it (a long one as a background task with an explicit
  `timeout`, `references/live-runs.md`), have an agent autopsy the packs, and feed the findings in as a new plan.
- **Record every finding left unrepaired** when the rounds end: a defect note, or an open question for one that needs
  a ruling. While actionable findings remain, plan another round.
- **Done** means: an acceptance round with the gate green, every proof passing or stated not-applicable with its
  reason, the authorized live runs passing, and nothing open that an agent could repair. The rest is the owner's.

## 6. Final report and cleanup

Report what merged (counts, notable repairs), what remains open and why (owner rulings, platform-bound, excluded),
each decision waiting on the owner in one line, collisions the owner must know about, and where the evidence is.
Then remove the integration, acceptance and reference worktrees and the merged branches (`git branch -d`), stop leftover
`Xvfb`, and delete the check-in.

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
- the verifier never built what it verifies, reads the full diff and the requirement texts itself, and runs the
  gate itself; no step of its checklist or of the builder's rules is removed or loosened; a bundle passes only
  with zero blocking findings and lands only after it passes;
- the record obligations and boundaries `references/repository.md` states may be added to, or corrected toward
  their authorities, never dropped;
- the gate runs on the merged result before every push; nothing is forced, reset or rewritten;
- the verify and merge stages' model and effort, the repair budget and the needs-owner cap are never lowered;
- the acceptance sweep, the autopsy, the record-every-finding step and the Done criteria are never reduced; the
  profile's `gate` is never narrowed;
- live runs need the owner's quoted authorization; nothing grants permissions, spends, rules an owner's decision,
  or stores a secret;
- this section, its invariants, `references/skill-review.md`, and every self-test assertion: removing or loosening
  one is itself a change that needs the owner.

A change that would cross one is a proposal to the owner, not an edit. Keep this file under ~250 lines.
