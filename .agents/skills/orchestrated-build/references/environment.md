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
- **Only if a long `timeout` is refused**, run the job detached and poll it (a detached launch never matches the
  live-run allow rules, so for a live run it is the orchestrator's):
  `setsid nohup bash -c '<command> > <log> 2>&1; echo "exit=$?" >> <log>' > /dev/null 2>&1 < /dev/null & disown`,
  then a background `until grep -q "^exit=" <log>; do sleep 30; done`, re-armed when it is stopped.

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
  branches, journals, the scratchpad, `~/.rotaris`.
- **What survives:** scheduled check-ins (`send_later`), workflow journals
  (`~/.claude/projects/<project>/<session>/subagents/workflows/<run>/journal.jsonl`), and the branches agents
  committed to. An agent stopped mid-step leaves commits and sometimes an uncommitted edit.
- **Recovery** is a `render` with `--runs RUNS.txt` (SKILL.md §4 gives the whole command, `--profile` included) and
  a relaunch: minutes, where hand-written continuations took hours.
- MCP tools disconnect and reconnect around a restart; load them again with ToolSearch when needed.

## Limits

- **A usage limit** makes agents come back empty with a message naming the reset time; three in a row halt the run.
  While it holds, the orchestrator's own turns are refused with the same message, so the first turn of yours that
  can act is the signal: probe with one trivial agent then, and recover from the journals once it succeeds. That
  can be long before the stated reset: fin3 (`wf_27c648a2-1f5`) and fin4 (`wf_27b2ef63-c36`) halted about 20:10 UTC
  on 2026-10-01 (fin3 20:10, fin4 20:16) on "weekly limit · resets Oct 5, 9pm (UTC)"; the "Continue from where you
  left off." turns at 21:16 UTC that day and 01:06 UTC the next were answered by the limit message; and a probe sent
  when the owner wrote "Continue" succeeded at 06:43 UTC on 2026-10-02.
- **A merge agent lost after its merge commit and before its push** leaves that commit, unpushed, as the detached
  HEAD of `<repo>-wt-integ-<id>`. Nothing is lost: the re-rendered merge stage checks out origin/main there and
  merges again (fin3's `c6e5d96` and fin4's `bfc3f33`, both lost to that limit).

## Shell forms the harness blocks

- `sleep N; cmd` chains are refused: wait with a background until-loop or the completion notice.
- `git branch -f main …` is refused as destructive: `git checkout main && git merge --ff-only origin/main`.
- Never disable TLS verification or unset the proxy; outbound HTTPS goes through it.

## Places

- **The scratchpad** holds the plan, `RUNS.txt`, rendered scripts, logs and evidence notes, outside the repository.
- **The primary checkout** is the owner's and other sessions' merge point: never write in it, not even a
  fast-forward. Agents read this skill from the orchestration's own detached reference worktree `<repo>-wt-skillref-<id>`
  (SKILL.md §3).
  The local permission file `.claude/settings.local.json` is git-ignored, so it leaves the checkout clean.
