# The host

What a cloud container session is like for a long orchestration, learned by paying for it. When a fact here
proves false on your host, correct it (SKILL.md, "Improving this skill").

## Toolchain

- **Node.** The repository needs Node ≥ 24; the container's default `node` was 22, under which tests fail on a
  newer regular-expression feature. Node 24 lives at `/opt/node24/bin`. Every agent shell starts with the profile's
  `shellPrefix` (`render` resolves `{node24}` to the PATH export, or a no-op where 24 is the default).
- **A fresh worktree** needs the profile's `setup` (here: `pnpm install --prefer-offline`, the Electron binary,
  `pnpm symbols`) before `pnpm build`; a build without the generated symbols fails on a missing module.
- **Headless app launches** run under `xvfb-run -a -s "-screen 0 1600x1000x24"`. As root, Chromium needs
  `--no-sandbox`; the proof harness passes it (`hostSwitches` in `apps/desktop/scripts/lib/harness.mjs`). A restart
  can leave an orphaned `Xvfb`; `pgrep -a Xvfb` and kill only leftovers no live agent owns.
- **Electron proofs need a display.** A proof or `app:drive` launch with no X server exits at once with `SIGTRAP` and
  "Missing X server or $DISPLAY" in its log, which reads like a crash of the product. Run every proof under `xvfb-run` as the
  bullet above gives it; the scripts do not start one themselves.

## Long jobs

- **A foreground command** may run at most ten minutes. **A background task** (`run_in_background`) given no
  `timeout` is stopped after thirty minutes; one given `timeout: 5400000` ran 53 minutes and ended on its own
  condition. Give every long background job an explicit `timeout` (milliseconds; the tool accepts up to 7,200,000)
  that covers the longest it may run: its own `timeout` wrapper, where it has one. A Monitor is capped at thirty
  minutes.
- **Waiting on a job**: the Bash tool's own `timeout` on the job itself (in the foreground up to ten minutes; past that
  in the background, and the completion notice says when it ends), or the Monitor tool. The harness gates a `sleep`
  loop: on this host a polling loop runs without a prompt only in the shapes the owner approved on 2026-10-03, as one
  command with nothing before it: `until grep -q <pattern> <log>; do sleep <n>; done; grep|tail|cat …`, or the same
  with `while ! grep -q`. Any other `sleep` loop may stop on a permission prompt the owner has to answer: fin10's
  `verify:strip-notices-and-listing#3` (`wf_add7be78-430`) waited on its gate and proof logs with that very shape at
  01:20 and 01:27 UTC on 2026-10-03, before any rule existed, and the owner was prompted. Others have run unprompted
  (a `cd …; until curl …; do sleep 1; done` at 01:44:46 in the same run; an `L=…; until grep …` at 03:19:09 in
  `wf_d1cca861-c77`), so the harness's judgement is not to be relied on either way.
- **A permission rule for agents is the owner's to add.** Ask once, with the exact text. The orchestrator's first edit of
  `.claude/settings.local.json` for those shapes was refused by the classifier as "[Self-Modification]" at 01:38 UTC,
  and went through at 01:39 on the owner's explicit instruction.
- **Only if a long `timeout` is refused**, run the job detached and poll it (a detached launch never matches the
  live-run allow rules, so for a live run it is the orchestrator's):
  `setsid nohup bash -c '<command> > <log> 2>&1; echo "exit=$?" >> <log>' > /dev/null 2>&1 < /dev/null & disown`,
  then a background `until grep -q "^exit=" <log>; do sleep 30; done; tail -5 <log>`, re-armed when it is stopped.
- **The duress live run outlasts a background command.** At `LIVE_RUN_DURESS_MS=7800000` (AGENTS.md's recipe) its launch
  is bounded at 8,100 s, past the 7,200,000 ms cap (runs took 2,820 to 4,219 s on 2026-10-14 and 15), so it is launched
  detached (`setsid nohup … &`, the form above) and waited on only by its log's `exit=` line, in the loop shape above or
  with the Monitor tool. Never wait with `pgrep`: the waiter's own command line holds the pattern, so it finds itself
  and never ends, or finds its launching shell and ends at once (2026-10-13, then 23:40 UTC on 2026-10-13 and 05:15 on
  2026-10-14, after this sentence had landed).

## Load

- **4 CPUs, 15 GB.** A workflow run executes two agents at a time, the tool's cap for four CPUs
  (`references/workflow-tool.md`). Four agents at once put the load average at 5 to 10: two runs overlapping on
  2026-09-29 (5 to 7, once 9.65; all eleven merge gates green, one verifier's gate red on a timing bound that passed
  alone), and on 2026-10-01 a run beside the orchestrator's own agents and gates (about 5, later 8 to 10; two full
  gates red on timing, each passing alone). Expect timing reds at that load and re-run them alone (next point).
- **Timing-sensitive tests and proofs flake under load.** Every prompt carries the rule: re-run a timing red once
  alone and say what else was running. A red reproduced alone is real; "flake" is never a root cause.
- **Concurrent reviewers each run the full gate.** Two plans' reviewers landing at once, each with `pnpm check`, its proofs
  and its builders beside it, put the load at 10 to 17 on four CPUs (2026-10-06 to 13): a review then took up to three hours,
  and timing proofs went red on load alone (the board's axis switch read 144 to 181 ms loaded, and 0 ms in three runs alone at load 0.3 to 1.1).
  Run a timing proof alone, and record the load beside every figure it gives.
- **Disk is the session's allowance, not the device's.** `df` reports a 252 GB `/dev/vda`, but the session's effective limit
  is far smaller: on 2026-10-07 at about 09:44 UTC (fin30) it reached 0 bytes free at about 38 GB used, which emptied a proof
  log and stopped tool output until space was freed; on 2026-10-13 `df` showed 7.9 GB free at 30 GB used. Every worktree
  with its `node_modules`, `out/` and `.proof/` costs gigabytes: remove a landed bundle's worktree, a proof's evidence once
  it is reported, and scratch files under `/tmp` a run created, and read `df -h /` before a long proof.
- **A full disk reads as ENOSPC test failures**, not as a disk problem: tests that write a store or a temporary file fail
  first. Every worktree shares the one allowance, so remove each landed plan's worktrees (bundle and landing) and the stale
  `.proof/` and `.live-run/` directories of trees no one is judging. Unit tests' temporary directories add up as well
  (about 29,900 `rotaris-*` directories, 360 MB, in `/tmp` on 2026-10-13, until fin38 made the tests remove theirs).
- **Cleanup needs the owner's standing word.** During the full disk of 2026-10-07 the classifier refused a `/tmp` sweep
  and even a plain `git worktree list` as "[Shared Scratch Sweep]" (09:39 and 09:40 UTC), and the run waited about 24
  minutes on the owner. Ask for it at planning (SKILL.md §1.3); then each check-in removes the landed bundles'
  worktrees and reads `df -h /`.

## Restarts

- **The container restarts without warning**, from every few hours to twice in twenty minutes. A restart kills every
  background task, every running workflow, every launched app and every detached job. It keeps the disk: worktrees,
  branches, journals, the scratchpad (under `/tmp/claude-0`), `~/.rotaris`. The host itself reboots too (uptime 0, at
  23:28 UTC on 2026-10-02 and again during the owner's pause of 2026-10-03 to 04); the disk survived every time, and
  after a reboot no orphaned `Xvfb` is left (one after a container restart at 19:35 UTC on 2026-10-02 left `:111` and
  `:112`).
- **What survives:** scheduled check-ins, workflow journals
  (`~/.claude/projects/<project>/<session>/subagents/workflows/<run>/journal.jsonl`), and the branches agents
  committed to. An agent stopped mid-step leaves commits and sometimes an uncommitted edit.
- **Recovery** is a `render` with `--runs RUNS.txt` (SKILL.md §4 gives the whole command, `--profile` included) and
  a relaunch: minutes, where hand-written continuations took hours.
- MCP tools disconnect and reconnect around a restart; load them again with ToolSearch when needed.

## Limits

- **A usage limit** makes agents come back empty with a message naming the reset time; three in a row halt the run. It
  ends every running workflow at once, and a session limit does it as well as the weekly one: "You've hit your
  session limit · resets 7:40am (UTC)" (HTTP 429) took five agents of finacc (`wf_6c39b5ac-be8`, halted) and fin12
  (`wf_c3ee62dd-7c1`, incomplete) within minutes before 07:45 UTC on 2026-10-03; both resumed from the journals after the
  reset with nothing lost.
  While it holds, the orchestrator's own turns are refused with the same message, so the first turn of yours that
  can act is the signal: probe with one trivial agent then, and recover from the journals once it succeeds. That
  can be long before the stated reset: fin3 (`wf_27c648a2-1f5`) and fin4 (`wf_27b2ef63-c36`) halted about 20:10 UTC
  on 2026-10-01 (fin3 20:10, fin4 20:16) on "weekly limit · resets Oct 5, 9pm (UTC)"; the "Continue from where you
  left off." turns at 21:16 UTC that day and 01:06 UTC the next were answered by the limit message; and a probe sent
  when the owner wrote "Continue" succeeded at 06:43 UTC on 2026-10-02.
- **On a limit's reset**, nothing resumes by itself: the limit stopped every agent mid-step. Probe with one small agent; once
  it answers, `render --runs RUNS.txt` (SKILL.md §4) and relaunch each plan, which resumes from its journal where it stopped
  (2026-10-06 to 13, every time with nothing lost).
- **A one-shot check-in is used up by a limit.** The `send_later` check-in that fired at 16:30 UTC on 2026-10-15 met
  "You've hit your weekly limit · resets Oct 19, 9pm (UTC)", was refused, and was never re-armed: nothing ran from the
  reset until the owner wrote at 07:18 UTC on 2026-10-20, about ten hours later. A recurring check-in (SKILL.md §3) is
  expected to fire again after a refused turn; record what the first limit it meets shows.
- **A reviewer lost mid-landing** (a merge agent, before 2026-10-07) leaves its bundle branch rebased but unpushed
  (the rebased head detached in its landing worktree, `<repo>-wt-integ-<id>-<short>`), or a rebase in progress in the
  bundle worktree. Nothing is lost: the re-rendered review's landing step 0, which it runs first, finds a landing that
  did happen (the rebased branch is part of origin/main); otherwise it aborts a rebase left in progress, reviews,
  rebases again, gates the head and pushes. Before rebase landing (2026-10-04), the same limit left fin3's `c6e5d96`
  and fin4's `bfc3f33`, merge commits unpushed in `<repo>-wt-integ-<id>`, and the re-rendered merge stages merged
  again from origin/main.

## Parallel plans

- **Never message an agent a workflow runs.** Sending a message to it resumes a second copy of that agent beside the
  workflow's own, and both act on one worktree. Steer a plan through its workflow (a relaunch, a next round), never through
  its agents.
- **Numbers collide when a builder takes one it was not given.** Two plans running at once each took the next free open
  question, directive or request number from the same `origin/main`, and the second to land had to renumber its entry
  and every citation (four entries raised as OQ-240 or OQ-241 landed as OQ-247 to OQ-250, and one OQ-254 as OQ-255,
  2026-10-07 to 13). Assign every number a plan may need in its prompt, as a disjoint sub-range of open questions per
  bundle (directive numbers are assigned exactly, since the register refuses a gap, and request rows are the
  orchestrator's): fin41's seven bundles shared OQ-261 to OQ-270, and four of their questions were renumbered at landing
  (`wf_b643b682-d3c`, journal lines 20 to 27). The one that lands second renumbers, as `references/repository.md` says.

## Pause and backup

- **The owner's pause** ("Please Pause all tasks. I will continue another time.", 2026-10-03): `TaskStop` every workflow task and
  background agent, disable the check-in (`update_trigger` with `enabled: false`), stop leftover proof processes and
  orphaned `Xvfb`, and write the resume steps to `<scratchpad>/RESUME.md`: what stopped, each plan's render command with
  its reference worktree, what is unpushed. Resuming is SKILL.md §4's recovery, with the check-in re-armed.
- **What lives only in the container**: unmerged branches, a builder's uncommitted edits, the journals and the
  scratchpad. A reboot kept them; a reclaimed host would not. Offer to push them: pushing anything but `main` and the
  session's designated branch needs the owner's word. Branches go under their own names; an uncommitted edit as a
  commit built through a temporary index, which leaves the builder's worktree and index untouched
  (`GIT_INDEX_FILE=<scratchpad>/x.index git read-tree HEAD`, then with the same variable `git add -A` and
  `git write-tree`, `git commit-tree <tree> -p HEAD -m …`, `git push origin <sha>:refs/heads/backup/<name>`); the
  scratchpad's plans, ledger, notes and unfinished journals on an orphan branch
  (`git worktree add --orphan -b backup/orchestration-state-<date> <path>`), scanned first for the endpoint's host, the
  key file's content and token shapes. Restore steps go in `RESUME.md`, and the backup branches are deleted once
  everything lands. A `backup/*` branch is no landing: what it holds reaches main only through a bundle, reviewed and
  landed with the gate green.

## Handing over

An orchestration handed to another session or host (the Windows ARM64 session on 2026-10-14, a local session for the
host-independent remainder on 2026-10-20) is a pause (Pause and backup, above) plus a prompt that stands
alone. It carries:
- its own reserved open-question, directive and request number ranges, disjoint from every other session's and plan's,
  written to the ledger too (OQ-400 to OQ-449 went to the Windows session);
- the standing live-run authorization quoted word for word (R-068), which the other session's classifier may still
  refuse until the owner confirms it there (`references/live-runs.md`, Authorization), R-072 and how the consortium
  rules, and the clean-room boundary, which every agent the other session starts inherits;
- the open notes and unfinished plans by name, and what each other session owns, so no two repair one note;
- that this file's figures (the two-agent cap, `/opt/node24/bin`, the disk allowance, the classifier's refusals, the
  `xvfb-run` wrapper) describe this container, for the other host to measure and correct;
- what does not travel: journals, `RUNS.txt`, the ledger, rulings' advocate texts and any list only the scratchpad holds
  (copy those into the prompt), so an unfinished plan's acceptance is redone fresh on the merged head.

## Shell forms the harness blocks

- `sleep N; cmd` chains are refused: wait as Long jobs says.
- `git branch -f main …` is refused as destructive: `git checkout main && git merge --ff-only origin/main`.
- `git -C <repo>-wt-skillref-<id> checkout -q --detach origin/main` was refused as "[Modify Shared Resources]" (19:54
  UTC on 2026-10-14), so a merged skill change never reached fin46's resumed run: refresh the reference worktree by
  removing it and adding it again (SKILL.md §3), between runs only.
- Never disable TLS verification or unset the proxy; outbound HTTPS goes through it.

## Places

- **The scratchpad** holds the plan, `RUNS.txt`, rendered scripts, logs and evidence notes, outside the repository.
- **The ledger**, `<scratchpad>/TASKS.txt`, holds one line per event (a launch, a landing, an ending, a ruling, the
  owner's word, a survey's range), appended with its stamp in the same command:
  `echo "$(date -u +%FT%H:%MZ) <event>" >> <scratchpad>/TASKS.txt`. A line is never stamped by estimate or inserted
  out of order.
- **The primary checkout** is the owner's and other sessions' merge point: never write in it, not even a
  fast-forward. Agents read this skill from the orchestration's own detached reference worktree `<repo>-wt-skillref-<id>`
  (SKILL.md §3).
  The local permission file `.claude/settings.local.json` is git-ignored, so it leaves the checkout clean.
