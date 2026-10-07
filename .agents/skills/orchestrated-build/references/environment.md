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

## Load

- **4 CPUs, 15 GB.** A workflow run executes two agents at a time, the tool's cap for four CPUs
  (`references/workflow-tool.md`). Four agents at once put the load average at 5 to 10: two runs overlapping on
  2026-09-29 (5 to 7, once 9.65; all eleven merge gates green, one verifier's gate red on a timing bound that passed
  alone), and on 2026-10-01 a run beside the orchestrator's own agents and gates (about 5, later 8 to 10; two full
  gates red on timing, each passing alone). Expect timing reds at that load and re-run them alone (next point).
- **Timing-sensitive tests and proofs flake under load.** Every prompt carries the rule: re-run a timing red once
  alone and say what else was running. A red reproduced alone is real; "flake" is never a root cause.

## Restarts

- **The container restarts without warning**, from every few hours to twice in twenty minutes. A restart kills every
  background task, every running workflow, every launched app and every detached job. It keeps the disk: worktrees,
  branches, journals, the scratchpad (under `/tmp/claude-0`), `~/.rotaris`. The host itself reboots too (uptime 0, at
  23:28 UTC on 2026-10-02 and again during the owner's pause of 2026-10-03 to 04); the disk survived every time, and
  after a reboot no orphaned `Xvfb` is left (one after a container restart at 19:35 UTC on 2026-10-02 left `:111` and
  `:112`).
- **What survives:** scheduled check-ins (`send_later`), workflow journals
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
- **A reviewer lost mid-landing** (a merge agent, before 2026-10-07) leaves its bundle branch rebased but unpushed
  (the rebased head detached in `<repo>-wt-integ-<id>`), or a rebase in progress in the bundle worktree. Nothing is
  lost: the re-rendered review's landing step 0, which it runs first, finds a landing that did happen (the rebased
  branch is part of origin/main); otherwise it aborts a rebase left in progress, reviews, rebases again, gates the head
  and pushes. Before rebase landing (2026-10-04), the same limit left fin3's `c6e5d96` and fin4's `bfc3f33`, merge
  commits unpushed in `<repo>-wt-integ-<id>`, and the re-rendered merge stages merged again from origin/main.

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

## Shell forms the harness blocks

- `sleep N; cmd` chains are refused: wait as Long jobs says.
- `git branch -f main …` is refused as destructive: `git checkout main && git merge --ff-only origin/main`.
- Never disable TLS verification or unset the proxy; outbound HTTPS goes through it.

## Places

- **The scratchpad** holds the plan, `RUNS.txt`, rendered scripts, logs and evidence notes, outside the repository.
- **The primary checkout** is the owner's and other sessions' merge point: never write in it, not even a
  fast-forward. Agents read this skill from the orchestration's own detached reference worktree `<repo>-wt-skillref-<id>`
  (SKILL.md §3).
  The local permission file `.claude/settings.local.json` is git-ignored, so it leaves the checkout clean.
