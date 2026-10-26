# Agents working in this repository

`CLAUDE.md` states what governs this repository: the clean-room boundary, the approved inputs, the process
state, the architecture views and the design language. Read it first — nothing here relaxes any of it.

[`CONTEXT-MAP.md`](CONTEXT-MAP.md) is the vocabulary those documents fix: one `CONTEXT.md` per context, every
term derived from `docs/spec/` and citing the requirement that owns it. Read it before naming anything new,
and prefer its word over a synonym you would otherwise reach for.

[`docs/module-map.md`](docs/module-map.md) is the shallowest map — which package owns a thing, the file to
open first, and where its tests are. Read it when the question is *where*; the
[proof registry](docs/proofs/README.md) answers *what re-verifies it*.

A document of the record holds at most **500 lines and 32 KiB**, and one over that is split into an index at its own
path and parts in a folder of the same name ([`docs/README.md`](docs/README.md), "The document budget";
`tools/check-doc-budget.mjs` fails `pnpm lint` on a new one). The open questions, the directives and the views'
reconciliation log are split that way: open the index, then the one part it names.

This file covers two checks `CLAUDE.md` does not spell out: **`pnpm app:drive`** (free, interactive
debugging of the built app) and **`pnpm live-run`** (the only check that spends real money) — and states the
rules the proof scripts obey; which proof covers what is the [proof registry](docs/proofs/README.md).

A **scratchpad** outlives the conversation: `.scratchpad.md` in the primary checkout (git-ignored, so a fresh
clone has none) carries the owner's standing asks, decisions and dead ends a compacted session would lose —
read it when picking up work, and keep it current when something must not get lost.

Every closing report uses the **handoff** shape [`docs/clean-room/agent-workflow.md`](docs/clean-room/agent-workflow.md)
fixes: a heading and four lines — **Zustand** (what is now true), **Beweise** (what ran and what it said),
**Offen** (what remains), **Nächster Schritt** (the one action that follows). It closes an agent's work to the
owner, a lane's report to the next lane, and every landed `pnpm worktree:land` run.

## The proof scripts — the rules they obey

`pnpm check` (symbols, typecheck, lint, tests) is the gate every change passes before it lands on main: an agent
working alone runs it before each commit; in an orchestrated build it runs on the exact head each landing
pushes, its builders committing on the quick checks (the owner, 2026-10-07; the skill's CHANGELOG). Beside it
sit the **proof scripts**: each launches the **built** application against a scratch profile and measures a
mechanism in the product rather than in a unit test. Every one is a first execution's evidence, and the area it
covers is the area it re-verifies.

Two rules about them. **Run the whole suite a part touches, not the one script named after it** — a change
that moves a shared seam breaks a neighbour's proof, and that is the point of having them. And a proof is
**evidence, not a test of the harness**: a red is a defect of the product until the harness is shown to be
wrong.

`pnpm verify:plan` prints that list for a diff (working tree, index and untracked against the merge-base with
`main`, or `origin/main` if `main` is missing): the gate, the complete affected proof suites, and the architecture
documents. An unmapped path requires explicit review — it is never "no proofs". Run it before deciding which
proofs to skip.

`pnpm preflight [proof-id …]` checks the machine before a suite launches: node, git, Electron, the desktop build
(and whether it is older than its sources), the code-intelligence bundle, `.proof/`'s writability, exported
`ROTARIS_*` variables (every launch strips them) and the display — plus, for each named proof, what its registry
record needs beyond the harness. It launches nothing; a red is the machine, not a proof result.

No proof hangs on a launch that overruns. Every launch a script starts itself goes through
`lib/bounded-launch.mjs`'s `spawnBounded`, and a driven one through the driver's `stopApp`. Two launches are neither,
and `lib/launch-sites.test.ts` names them with their reasons: `code-intel-proof`'s branch, a stdio server whose RPC
client fails every request when it dies or hangs, and `live-run`'s `runElectron`, whose bound is SIGKILL reported as
a signal, never as a clean exit, and whose wait settles on the main process's exit and a bounded drain of its pipes
(`lib/settle-launch.mjs`), so a process of a killed main that keeps them open cannot hold the run past its bound. A
live-run launch that overruns or exits non-zero is a failed check of its scenario, its session preserved, and the run
ends through `lib/run-ending.mjs`, which writes `results.json` and the manifest whatever ends it
([note](docs/defects/fixed/a-live-run-launch-overrun-leaves-no-results-or-failed-session-export.md)). Any other bare
`spawn` of Electron fails that test. At its bound the
application is sent SIGTERM with its pipes still open, and it answers: its quit path runs and it exits within a
fraction of a second. SIGKILL follows a grace only if it does not. The proof then fails with the launch's last log
lines. `lib/launch-sites.test.ts` refuses a `spawnSync` launch of Electron: its timeout closes the pipes as it signals,
so the quit path's lines are lost, and it reports the overrun as exit status 0 with only `error.code` `ETIMEDOUT` to
show it, which a check of the status passes as a clean exit. (Before the application's EPIPE loop was repaired on
2026-09-29 it did not return at all.)
([note](docs/defects/fixed/proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md)).

A launch ends with its whole process group, not with its main process alone. Since 2026-10-07 a driven launch leads a
process group of its own as a `spawnBounded` one does, and both drain it once the main process has exited
(`drainGroup`): whatever of that group is still running three seconds later, an Electron helper or a child the app started
in it, is ended with SIGKILL and named on the proof's standard error as `bounded-launch: … outlived it …`. Since fin34 the
drain also reaches a child the app puts in a process group of its own (a project-setup step, `packages/mcp/src/setup.ts`),
on Linux, by an `XDG_DATA_HOME` the launch was given in its environment (since `3c54f02` never one it inherited from the
proof's own shell, so a launch given none is not swept this way): it is given REQ-WORKSPACE-092's 5 s and a second's margin to
end by itself, then ended with SIGKILL and named as `bounded-launch: … in group(s) of their own outlived …`
([note](docs/defects/fixed/a-proof-can-exit-while-a-setup-step-the-app-started-in-its-own-process-group-is-still-ending.md)). A proof that exits or is
signalled takes every live group with it. Before that, `layout-proof`, `driver-proof` and `workspace-proof` exited beside
their own zygotes and a Git view's `git diff`
([note](docs/defects/fixed/a-proof-exits-while-processes-of-the-app-it-launched-still-run.md)).

Which proof covers what is the **proof registry**: [`docs/proofs/README.md`](docs/proofs/README.md). Its rows are
rendered from [`tools/proof-registry/registry.mjs`](tools/proof-registry/registry.mjs) — `pnpm proofs:index` writes
the page and `pnpm lint` fails when it is stale — and each row names the entry's area, what it measures, the
neighbours sharing a mechanism with it (the second script a shared seam needs), what it needs beyond the standard
harness, the hosts it runs on, and its flags. The detail behind a row — what the proof measures, version by version —
is the record its name links to under [`docs/proofs/`](docs/proofs/). The registry answers what a proof covers; it is
not how the suite a diff touches is chosen — `pnpm verify:plan` prints that plan, and it is followed rather than
reconstructed from the registry's rows. `tools/proof-registry/registry.test.ts` holds the registry to the tree,
failing when a proof script has no record or a record has no entry, a neighbour does not resolve, or the flags
column and the script's own argv disagree.

## A branch, a worktree, a landing — `pnpm worktree:new` / `pnpm worktree:land`

The two wrappers around the workflow `docs/clean-room/agent-workflow.md` states; that file is still the rule text,
and it is read before the first edit. **`pnpm worktree:new <branch> [--dir=<path>]`** fetches `origin/main`, adds a
worktree beside the primary checkout on a new branch (`<checkout>-wt-<branch>`, the same naming a person uses by
hand) and runs the setup it replaced: `pnpm install --prefer-offline`, electron's `install.js` (its `dist/` is not
carried into a worktree) and `pnpm preflight`. **`pnpm worktree:land`** runs the landing sequence: fetch, rebase
onto `origin/main` — a conflict **aborts the rebase and hands back**, its files named; conflicts are resolved by
reading both sides, never by the tool — a **landing worktree** of its own at the rebased head, `pnpm verify:plan`
against `origin/main` and obeyed (`--reviewed` confirms the review its unmapped paths demanded), `pnpm check` on
that exact head (a red stops it; the gate is never retried), the proof suites the plan names (`--skip-proofs`
skips them with a warning that says so; `pnpm preflight` runs first), then `git push origin HEAD:main` —
fast-forward only, never a force, never a merge — re-rebasing while `main` moves under it (`--max-attempts=`,
3 by default). It then removes both worktrees and deletes the branch (`--keep` leaves them); on Windows a shell
sitting in the branch tree makes that removal the printed commands to run once out of it. `--worktree=<path>`
names the branch's tree when the command runs from somewhere else.

`pnpm worktree:overlaps` is the same tool's report over everything running beside the checkout: every
registered worktree's branch, the files it touches against its fork from `origin/main` (committed, staged,
unstaged and untracked — an agent's in-flight edits count), the files `origin/main` has moved since that fork
in which the branch also works, and the files two or more branches both touch. `pnpm worktree:land` prints
the branch-side overlap — branch ∩ `origin/main` since the fork — before the rebase: a rebase can merge
those files textually while both sides have rewritten them, the collision no conflict listing shows. Both
read `origin/main` as last fetched and are reports, never gates; `--json` is the machine form.

A failure before the push changes nothing on the remote and names the step to repair — the conflict's files, the
review list, the red suite, the dirty tree. Both wrappers and the report are exercised end to end against a
scratch repository by `tools/worktree/`'s tests: real git, only the pnpm steps stubbed (`new.test.ts`,
`land.test.ts`, `overlaps.test.ts`).

## Repository UI skills

Three portable workflows live under `.agents/skills/`, where REQ-WORKSPACE-051 makes them discoverable from
this repository: **`build-ui`** for creating or substantially restyling a surface, **`debug-ui`** for a bounded
rendered defect, and **`review-ui`** for a report-only external critique. Their `.claude/skills/` entries are thin
compatibility routers; the portable files are canonical.

A fourth, **`orchestrated-build`**, drives a large body of work (a release backlog, every open defect) through a
multi-agent workflow: per bundle an independent reviewer that repairs in place and lands it, repair rounds,
acceptance with the proof sweep and live runs, and recovery from container restarts out of the workflow journals.
It improves itself under the guardrails its `SKILL.md` states; `pnpm check` runs its self-test.

A fifth, **`run-autopsy`**, is the post-run forensic skill: it reads a live run's launch log, session store and
transcript as evidence and writes a fixed-schema friction and defect report, and the orchestrated build's acceptance
autopsy follows it (the profile's `autopsy.method`). Every portable skill has its thin `.claude/skills/` router, and
`tools/skill-routers.test.ts` fails on one without (run-autopsy's was added on 2026-10-13).

A sixth, **`verify-plan`**, prints the gate, the complete affected proof suites and the architecture documents for a
diff (`pnpm verify:plan`). Unmapped paths require explicit review — never treat them as no proofs.

`build-ui` and `debug-ui` may change source within the authority of the current task. `review-ui` writes only
evidence under `.ui-review/`. Its critique is proposed evidence and reaches implementation through a separate,
authorized build or debug pass. A complete review loop has at most three iterations.

## Where the time went — the development-time store (R-075)

`pnpm dev-time report` reads `~/.rotaris/dev-time/log.jsonl`: one JSON record per measured span. **Most spans
record themselves**, so no habit is needed and none should be invented — don't wrap timers around what the
store already holds. `pnpm check` runs `pnpm dev-time gate`; each stage script in `package.json` is wrapped
in `dev-time run --quiet gate:<stage>` (the stage records itself, marked `via: check`) and the run records
one `gate:check` total; `pnpm build` records as `build:desktop`; every proof script whose harness imports are
in play records its whole wall time under its name (`proof:terminal-proof`); `pnpm worktree:new` /
`pnpm worktree:land` record their steps (`fetch`, `rebase:onto-main`, `setup:*`, `push`). Everything else is
explicit: `pnpm dev-time run <kind>:<label> -- <command>`, or a `start`/`stop` pair around work no single
command covers. The report also computes **the reds each next green closed** — a repair is the wall time
between the failed run's own end and the green's — and names what is still red. A measurement never fails the
work it measures; `ROTARIS_DEV_TIME_DISABLE` (anything but `''`, `0`, `false`) switches the capture off, and
the worktree wrappers' tests set it while the dev-time tests point `ROTARIS_DEV_TIME_HOME` at a scratch store,
so no test ever writes the operator's store.

## Driving the built app — `pnpm app:drive`

The fastest way to see what a surface actually does without editing a proof script and waiting out a
launch. It spends nothing, talks to no provider by default (the scripted dialect), and runs against a
scratch profile under `.drive/`. Full usage is in the script's own header
(`apps/desktop/scripts/drive.mjs`) — `pnpm app:drive` with no command prints it.

```
pnpm build                                  # it drives the BUILT app, so build first
pnpm app:drive start [--workspace=PATH] [--fresh] [--dialect=scripted]
pnpm app:drive start --env=ROTARIS_APP_LOG_LEVEL=debug   # log every level; an exported variable never reaches it
pnpm app:drive waitFor ".app-shell"         # waits for it; never a fixed sleep
pnpm app:drive click ".nav-item" --text=Git
pnpm app:drive inspect ".composer"          # boxes, attributes, text, what holds focus
pnpm app:drive shot screen.png              # a PNG you can open, or read in a transcript
pnpm app:drive log --tail=40                # what the app printed: info and above unless started as above (PD-MONITOR-002)
pnpm app:drive windows                      # main windows, and each one's persona, approval and terminal windows
pnpm app:drive useWindow persona:coding-agent   # later commands act on that window; no name: the active main window
pnpm app:drive probe "#approval-title" --window=approval   # --window= on any command: that window, that command only
pnpm app:drive stop                         # the application's quit: close guards, then the run host's shutdown
pnpm app:drive stop --crash                 # the immediate exit: a live run is left as a crash leaves it
```

`stop` is a person's quit: a live run comes to rest with the stop reason `application_shutdown`, and `stop` waits for
the process to end; a close guard that keeps the application (unsaved settings) leaves it driven so the dialog can be
answered. `stop --crash` is the immediate exit, for a drive that means to leave a crash for the next launch to repair.

A window is named by its index in `windows`, by a suffix of a main window's workspace path, or by a role:
`persona:<persona>` (that persona's window), `approval` (the open approval dialog, answered with its own buttons) or
`terminal` (the terminal window). A name that matches no open window is refused with the list of what is open.

`click --settle` presses only once the match has held still across two frames and is what its centre would press, and
fails when the press met something else, naming it: use it for a control that a notice, a new row or a resize can move
between the measurement and the press (driver-proof's Pop out, 2026-10-06; a plain `click` is unchanged).
`type` types a line break as Shift+Enter, the composer's newline (REQ-CHAT-001), so a multi-line text keeps its breaks and
is submitted only by `--enter`; the capture seams' typed steps do the same.

`command` is relayed to main's own `runCommand` — the same path the renderer's channel reaches — so driving a
command drives the product, not a stand-in for it. The seam (`apps/desktop/src/main/driver.ts`) exists only
when `ROTARIS_DRIVER` names an endpoint file at launch; it is verification only, and `pnpm driver-proof`
is its proof.

Two habits worth keeping: **`shot` produces a PNG an agent can read directly** (it waits four of the renderer's
frames first, so it is never the frame before a click or a navigation; its reply's `painted: false` says a window
presented none), which is the cheapest way to meet
`CLAUDE.md`'s "match after drawing" obligation; and a step that needs a condition should `waitFor` it rather than
sleep, because the reason this seam exists is that fixed offsets have produced false reds three times.

## The live run — `pnpm live-run`

Every other check in this repository answers the model itself. `pnpm test` uses scripted clients; each
`*-proof` script scripts the dialect or the run host. They prove the mechanism and they cannot prove that the
product works against a real model: a real endpoint, a real key, a real catalogue, real tool calls, a real
workspace changed on disk.

`pnpm live-run` does exactly that, against whichever OpenAI-compatible endpoint the owner registered, in a
throwaway workspace, for a few cents.

### When to run it

After a major feature lands — a part closed, a lane merged, a store migration, anything that touches the run
loop, the tools, the providers or the shell. It is a smoke test of the whole product, not a unit check; it does
not replace the part's own proof, it follows it.

It is **never** automatic. It is not in `pnpm check`, `pnpm test` collects nothing from it, and no hook or CI
step may call it. It runs when the owner asks for it, or when an agent asks the owner and is told yes.
An agent must not run it on its own initiative: it costs money the owner pays.

**Against the registered self-hosted default, that last rule is already answered** ([R-068](docs/product/requests.md#r-068),
2026-10-02). The default endpoint, `katalyst`, is the owner's own server, registered `unmetered`, and the owner's
authorization to run against it is standing: "you may do the live run.never ask for my persmission for it. you always
have my permission." A run against it spends nothing and is not asked about again; it is still never automatic in the
sense above (no `pnpm check`, hook or CI step reaches it). The rule stands unchanged for every **metered** endpoint
(one whose registry entry does not say `unmetered`, OpenRouter among them): such a run spends the owner's money and is
asked for first. `pnpm slice-proof` signs into the same registry since that day and runs on the same terms.

An owner's yes is not always enough in an agent session. On the Linux agent host, the harness's automatic permission
classifier has refused some `live-run.mjs --confirm` launches as a real-world transaction even where the owner authorised
the run (R-066, R-067; [`docs/defects/fixed/no-live-run-has-executed-on-merged-main.md`](docs/defects/fixed/no-live-run-has-executed-on-merged-main.md)).
On 2026-09-30 it refused the launch over the default scenarios and the long `duress` launch, while it admitted targeted
`--only=ask` and `--only=ask,edit` runs on repair branches the same day. Which launches it admits is not established, so
an agent does not predict it. An agent that meets that refusal stops, and it does not reach the run by another route,
such as splitting the refused launch into admitted `--only=` pieces. It records the refusal where its task lives and
says so in its report. Only the owner can close the gap: by allowing `node apps/desktop/scripts/live-run.mjs --confirm`
for agent sessions in the harness's permission rules, or by running the command by hand.

On 2026-10-01 both refused launches ran on merged `main` `71ad8e8` and printed `live-run PASSED`. The orchestrating
session launched them after the owner authorised live runs in its conversation. Since 03:23 that day, the owner's
allow rule for the `--confirm --skip-build` launch forms has stood in the host's git-ignored
`.claude/settings.local.json`. `.agents/skills/orchestrated-build/references/live-runs.md` lists those forms. A
session that does not hold that rule, or a launch in any other form, can still meet the refusal, and the paragraph
above still governs it. `main` has moved past `71ad8e8` since, so a live run of the head that would be released is
still owed, and it is asked for like any other.

### Registering an endpoint, and storing its key

Any OpenAI-compatible endpoint works — a self-hosted or custom model as readily as a hosted one. Register it
once (`pnpm live-run --add-endpoint`; `pnpm live-run --endpoints` lists what is registered). The full flag
list is in the script's own header (`apps/desktop/scripts/live-run.mjs`, `USAGE`) — `pnpm live-run --help`
prints it.

The registry is `~/.rotaris/live-run/endpoints.json`. Keys live beside it, one file per endpoint, never in this
repository and never on a command line: on Windows `~/.rotaris/live-run/<name>.key.dpapi`, encrypted with DPAPI
— readable by **this account on this machine** and by nothing else — with the file's ACL reduced to the owner;
elsewhere `~/.rotaris/live-run/<name>.key` at mode 600. Where DPAPI is unavailable the key goes into
`<name>.key` with an owner-only ACL, and the script says so — the weaker protection is never silent.
`ROTARIS_LIVE_API_KEY` in the environment wins over the stored file, for a one-off or a machine where the hidden
prompt cannot run.

The script substitutes the key out of every log it writes and then asserts that no log holds a bearer or
anything shaped like an API key; the sign-in goes through the product's own dialog, so the credential lands in
the sandbox's credential store the way a person's would.

### Running it

```
pnpm live-run                        # the plan, the endpoint, the ceiling, the key's source — it does not spend
pnpm live-run --confirm              # the run, against the default endpoint
pnpm live-run --confirm --endpoint=openrouter
pnpm live-run --confirm --gui        # the same run, with the window on screen to watch
```

`--confirm` is required. The full flag list (`--endpoint`, `--model`, `--base-url`, `--budget`,
`--max-tokens`, `--only`, `--max-iterations`, `--gui`, `--keep`, `--skip-build`, `--keep-runs`,
`--session-log-level`, `--app-log-level`, `--no-record-traffic`, `--duress-fixture`) is in the script's own header —
`pnpm live-run --help` prints it.

**The bundled code-intelligence runtime is a precondition.** With `--skip-build` a tree without it refuses at once, naming
`pnpm code-intel:bundle`; without `--skip-build` the run builds it before the first launch. Every launch then states
whether its code-intelligence discovery succeeded (a failure, or a listing of no tool, is a FAIL; a launch that starts no run is a NOTE). Until
2026-10-03 a `--skip-build` run on a tree without the bundle passed while code intelligence never ran
(`docs/defects/fixed/the-live-run-runs-without-the-code-intelligence-bundle-and-passes-without-saying-so.md`).

**The default scenarios measure several mechanisms at once, so a feature is proved working beside the others and
costs no scenario of its own.** `edit` splits REQ-103 between two children writing in parallel under declared write
scopes (PD-TOOLS-006), and every scenario that reads a session asserts its price exactly (PD-MONITOR-001 revision 2).
A new mechanism joins an existing scenario where one exercises it; a scenario of its own is the exception.

**One scenario is not in the default set and only runs when named**: `duress`, the long run. The ordinary live
run is a smoke test and stays one; a scenario that trebles its wall clock belongs behind `--only=duress`, and a
scenario nobody can leave out is a scenario people stop running.

The `requirements` scenario waits for the board rather than for a clock: every press after the release
names the state it needs, `LIVE_RUN_BOARD_MS` (900 s) is the deadline for all of them, and the capture
ends when the accept lands. A quick model does not pay the deadline; a slow one fails **once**, saying the
window expired, and the presses it never made are noted rather than reported as faults of the board.

The run is **unattended and the window is hidden** unless `--gui` says otherwise. `--gui` changes one
thing, `windowsHide` on the spawn: the scenarios are driven from inside the main process with
`sendInputEvent`/`executeJavaScript`, which need no focus, so watching cannot disturb the run and the
evidence is byte-identical either way. Typing into a shown window does reach the product, so watch it
rather than use it.

### What it costs, and what stops it

Two bounds always hold: the model the owner chose, and `runtime.max_iterations` written into the sandbox's
`agents.yaml`, so one confused run cannot spend the lot. The third is whatever the endpoint allows, and the
script names which one it used rather than implying a number it cannot know: **nothing** for an endpoint
registered `--unmetered` (the owner's own hardware — tokens counted, nothing stopping on them, unless the
invocation names a ceiling itself); else the **provider's own figure** (OpenRouter's `GET /key`); else the
**registered prices** over the store's token counts; else **tokens alone** against `--max-tokens`.

Crossing whichever ceiling applies stops the run there, records the figure and reports a failure.

**`--max-iterations` defaults to 500, raised from 15 on 2026-09-22 by the owner's decision.** Fifteen was a
bound while every scenario was a short task; the long run made it the thing being measured rather than a bound
on it — a delegating run reaches 15 while it is still commissioning, and then reports its own ceiling as a
result about the product. What the raise gives up is worth knowing before running against a metered endpoint:
the accounting gate between scenarios still holds, and so do `--budget` and `--max-tokens`, but there is no
longer a tight bound **within** one run. The endpoint it was raised for is registered `--unmetered`, where the
cost of a long run is wall clock. Name `--max-iterations` yourself on an endpoint that charges.

`--context=<tokens>` is for an endpoint whose `/models` payload does not declare a context window in a key
discovery reads — vLLM's `max_model_len` is one such. The number is written into the sandbox's `agents.yaml` as
`max_input_tokens` on a `models:` entry that **replaces** the snapshot layer's entry for the same model as
a whole (provider, `model_id`, `auth_provider`, `base_url` with it), which is what keeps the leased bearer
reaching the right endpoint.

### What it does

The workspace is a copy of `apps/desktop/scripts/fixtures/todo-app` in the system temp directory — a small
React todo application, its `docs/requirements/`, pure list functions in `src/todos.js` and a `node --test`
suite that needs nothing installed. It is committed to a fresh Git repository before the app opens it, so the
change can be read back from `git diff`. Its store is the conventional shape of `REQ-TRACE-002` — an epic at the
root and its children in the sibling directory — and its identifiers are `REQ-TRACE-022` identifiers, so the
requirements board can read it as readily as the agent can. Two requirements are approved and deliberately
unimplemented, one per path: `REQ-103` (clear the completed todos) is the work the third scenario hands over in
the composer, and `REQ-104` (count the completed todos) is the work the fourth releases from the board, so
neither path depends on what the other did.

| Scenario | What runs | What is asserted |
| --- | --- | --- |
| `sign-in` | Settings → Models → Add endpoint, filled and pressed in the product's dialog | the credential file, the snapshot's authenticated record, the catalogue, the bootstrapped `agents.yaml` read by its starter content (since 2026-10-03, acceptance F3: the file's existence alone, which initialization's record satisfies, was checked before), no credential in any log, the outcome's model count worded with no literal "(s)" (REQ-SHELL-044; live-run L11) |
| `ask` | one real run: read `src/todos.js`, answer; since fin42 (N58) the Improvement analysis timeout first set to `LIVE_RUN_ANALYST_TIMEOUT_S` (default 300 s, the control's 10–600) through Settings › Runtime and Save, the capture held until the run's post-run analysis has ended, then `ask-retrospective`: the Library's retrospective gesture pressed (Ctrl+6, Proposals) and let finish, then `ask-retrospective-unauth`: the same gesture with the credential file moved aside for one launch and put back after; `agents.yaml` restored after | the leased bearer, a request to the endpoint, a completed session, settled tool rows, usage figures, an answer naming the real exports; the post-run analysis seen and ended, one artifact for the run with proposals or the timed-out notes (a NOTE names a timeout, and one that proposed nothing is a NOTE), and the notice that outcome owes (REQ-LIBRARY-124, REQ-NOTIFY-100); one retrospective artifact with no session that read the ask session, its notice, and the run host's "at the workspace root" line listing `workspace:` files alone (PD-LIBRARY-002 revision 2, OQ-235) (`lib/analysis-reading.mjs`); since fin43 (the live run at `ce5f952`, F2/F4) the retrospective's launch starts no run first, no model request of either launch is logged "(no authorization header)", and a "collector crashed" artifact fails the artifact and notice checks (and the post-run verdict); since fin44 (PD-LIBRARY-005, OQ-285) the notice a crashed or unparseable collector owes is its pass's failure warning naming the artifact, so the notice check passes on that warning while the artifact check and the post-run verdict still fail a crash, and an answer unreadable twice is a NOTE; since fin45 (PD-LIBRARY-002 revision 5, OQ-300) the withheld-credential press shows one "Provider authentication required" notice whose body is "Authenticate at least one configured provider before running a retrospective." with "Open Models settings", stores no artifact and sends no model request; since fin46 (finding L6) that press is held until the open's "No model provider is authenticated yet" banner is on screen, and a check reads from the log that it came after it, so the refusal is the notice standing in the single slot (REQ-NOTIFY-024) |
| `edit` | one real run: implement `REQ-103` through two scoped children, each told to run the suite in the terminal (the orchestrator holds none: `coordinator_only`, REQ-TOOLS-006), the plan closed with one `replace` once both have reported (`PD-TOOLS-008` revision 3, OQ-255) | `clearCompleted` exported and tested, a child's terminal call running `node --test` and none by the orchestrator, the session's tool-call total agreeing with the ring across every agent (`REQ-MONITOR-102`), `git diff` non-empty, and **`node --test` run again by the script itself** — the agent's own report is never the evidence |
| `resume` | one real delegating run, paused through the composer's Pause while a child runs and continued through its Continue (`PD-ORCH-005`) | the paused composer drew its children `paused` with the Continue action's count; the timeline's `iteration_paused` by `pause` and `iteration_resumed` for the same iteration; every child paused by the pause resumed under its own task id; each one's `agent_messages` continue across the pause, and its next request carried what it recorded last; the iteration closed `succeeded`, the session completed, and **both notes it asked for are read back from disk** |
| `requirements` | the board: `REQ-104` selected, the move control pressed, the release confirmed, the run watched to review and its decision taken | the card's own trail `backlog → running → review → done`, exactly one release and an accept in the delivery history, the run record carrying its session identifier and the permissions it was granted (`REQ-TRACE-464/472`), real usage from the endpoint, the run confined to a worktree of its own, `completedCount` exported and tested **inside that worktree**, and **`node --test` run there by the script itself** |
| `shell` | a relaunch with no prompt | Overview painted from the store: the sessions the runs left, the repository card's branch |
| `frictions` | one real run engineered to trip the inducible autopsy frictions, read back from the store; since 2026-10-13 its write is asked with only `path` and `content` (PD-TOOLS-007's inferred create, fin42) | first-use `write_file` with no operation repair, every settled create reporting the lines its content holds (a final newline ends a line; live-run L6), SIGINT delivered with no platform refusal, every call the tool gate refused as `invalid_request` referenced by a `tool_error` issue (REQ-SESSION-136, live-run a71-6) and PD-TOOLS-007's and PD-TOOLS-008's readings — since fin23 these three are read at the end over **every session the run kept**, not this one alone, a refused call's arguments read from the cut string the record stores them as, and a shape no session held is a NOTE naming the sessions read; since fin25 each session's create-shaped refusals are judged by the fence its own record names (a requirements run's worktree, not the workspace) and the create shape is the product's own (`createOnlyTarget` and the schema the gate applies) — **red by design until the fixes land**; the exit-trace friction is not induced here (it needs a crash: since 2026-10-13, fin42, `pnpm exit-trace-proof` fires its crash handlers in the built app), and the stall-abort one moved to `faults`; since 2026-10-06 (K3 of the live run at `c2fdd6a`) the root's requests — those carrying the direct-work statement, read from the recorded traffic — give its ROUTE slot the entry role's wording, never "the coordinator routed it to you"; since 2026-10-06 (M3 of the live run at `c2a9444`) a launch of its own after the probe (`frictions-cut`) runs one command that fails with about 5,000 characters of output, whose record must be cut to 2,000 characters ending with REQ-SESSION-194's `...`, and every session's error-path records are read at the end the same way (a result over 2,000 or unmarked at 2,000, or arguments stored as a string, is a FAILURE; `lib/error-record-cuts.mjs`); the probe's write with no operation read as a create, its result saying so and its record storing the create (PD-TOOLS-007; a write that named its operation anyway is a NOTE). The exit trace's crash handlers are fired by `exit-trace-proof`, not here |
| `faults` | three runs against an endpoint the proxy makes misbehave: a 429-then-500 ladder, a stream that stops mid-answer with the socket open, and a tool call whose arguments stream slowly | the ladder run still completes, and each injected refusal left the trace of the layer that retried it — the session log's dispatch-layer line or the ladder's own issue (OQ-110), never the call count alone; the stalled run does **not** report `user_cancelled` with nobody having pressed anything (defect 82's shape), **and the product is shown to have noticed the stall** in its own `issues` row — the negative alone would pass on a run that met no fault at all; and, since 2026-09-30, the entry agent's own stall watch wrote REQ-MONITOR-119's `stall` issue (`agent appears stalled: …`) before the idle bound, with a photograph taken between the two (`faults-stall.stalled.png`, OQ-153); and, since 2026-10-06, every stall wrote that issue no more often than its throttled warning (PD-MONITOR-005 revision 2: at entry, then no sooner than REQ-MONITOR-120's repeat; `lib/stall-issue-cadence.mjs`), where an issue at every evaluation passed before; and, since 2026-10-07, a third run (`faults-args`) whose tool-call arguments the proxy streams slowly under a 10 s stall threshold: no agent is reported stalled while it streams them, and the paced span must outlast the threshold for the run to count (`lib/paced-arguments.mjs`) |
| `terminal` | one run issuing the commands the record names verbatim: a multi-line here-string, forty long lines, off Windows a here-document of about 4.7 KB, longer than the PTY's input line (live-run M1, since 2026-10-06), off Windows an `exec bash` that replaces the session's shell (acceptance A9, OQ-144), off Windows a bash-ism `/bin/sh` cannot expand (live-run L1), off Windows an `exit 3` that ends the session's shell (OQ-144's sibling case), a wedge with no `timeout` and one empty poll of it (live-run L2), then `C-c` with `is_input` and one poll after it (OQ-147), a second wedge and a command issued while it is soft-paused (OQ-164), an exit-0 output carrying docker's lower-case `failed to connect` line, a `git diff` exiting 1, a pipeline through a pipe, and last (since 2026-10-13, fin42) `steady`, a command printing every 2 s for 130 s with no `timeout` | the here-string terminated; all forty lines arrived, none concatenated, none carrying an escape sequence; the long here-document ended inside the no-output window at exit 0 with its own byte count, never a soft pause with `>` (a copy the model sent shorter than 4,096 bytes is a NOTE: the line may have fit); the shell replacement ended at once as an `execution_error` with no exit code, never a soft pause, the session was restarted on its own shell (`kill_status` `session_reset`), and the next command the same agent issued met `/bin/sh` again (a next command from another agent, whose foreground session is its own under REQ-TOOLS-187, is a NOTE); the bash-ism ended at once with the shell's own error status, never a soft pause; the `exit 3` ended at once as an `execution_error` with no exit code, never a soft pause, the shell was respawned (`kill_status` `session_reset`), and the same agent's next command reported `session_reinitialized` true; a call with no `timeout` was still bounded; the poll stated no more waiting than had passed and did not claim the no-output window; the poll after `C-c` handed the wedge over as ended without an exit status of its own, never as still running; the command issued behind the second wedge named it and how it ended, with what it wrote (`slept`), never only its own exit; the docker line printed at exit 0 was neither `suspicious_success` nor given a failure-marker warning (`PD-TOOLS-003`); exit 1 from `git diff` was not `shell_failure`; **no end marker in anything the model read**. The pipeline is a NOTE — its deny fires as its requirements specify — and a shape the model never issued is a NOTE too, **but a run that ended `failed` before any terminal call fails the scenario** (one stopped otherwise before any is a NOTE), so a dead run is never green (`terminalRunEndReading`); `steady` was ended by the 100 s default hard cap (REQ-TOOLS-097's `hardMs`, REQ-CONFIG-116) between 100 and 130 s, never by the soft pause or its own end, with `session_reset`, its printed lines kept and the reset's report (the silent wedge soft-pauses 70 s before the cap, so the cap is read here; a `timeout` the model supplied anyway is a NOTE); since fin46 (finding L7) the wait is `terminalWaitMs`: the common wait plus the `steady` shape twice and one follow-up turn (800 s at the default), since the `coordinator_only` root delegates the shapes and may have its child run that shape again |
| `cut` | since fin42 (N51): one run asked for a single foreground `terminal` call, `echo started > CUT-STARTED.txt && sleep 60` with a 90 s timeout; once its record is open and the file marked, the harness quits the application by SIGTERM (`lib/cut-scenario.mjs`) | PD-TOOLS-013 against a real model: the cut call recorded failed with failure and outcome kind `interrupted`, no exit code, `"timeout":false` and a session reset, its result saying the run cancelled it and never that it exceeded its timeout; no `terminal_timeout` or `tool_error` issue; `summary.md`'s Tool outcomes counting it under `interrupted` with Timeouts 0; the run not `failed`. A model that never ran the sleep, or ran it with no timeout (soft-paused, so no longer in flight), is a NOTE: nothing was cut |
| `crlf` | since fin42 (N52): three CRLF, tab-indented files generated into the sandbox and removed after, and four edits asked for with the tool named — a two-line `haet_edit`, a three-line `write_file` window edit, a `write_file` insert, a `replace_all` whose `new_string` is two lines (`lib/crlf-scenario.mjs`) | no line of a file only edits and inserts touched lost its `\r`; an insert and a multi-line replace-all that landed say they wrote the file's CRLF endings wherever the tool had a `\r` to add (a `new_string` or `content` the model wrote CRLF itself owes no sentence); a run that completed. Which shapes the model sent, the near-miss reading (misses, retried, probed, ambiguous) and the level the window edit reached are NOTEs, except that since fin43 (`PD-TOOLS-019`) a level-4 window edit whose `old_string` was a uniform indent off FAILS, a level-3 one must land at the file's depth, and a level-3 `haet_edit` near miss with an LF `old_string` must name the line endings; a file the model overwrote, or touched from the terminal, is a NOTE. *First run, 2026-10-20, on Windows ARM64 (`docs/architecture/live-runs/live-00957641-windows-terminal-frictions-crlf-autopsy.md`): passed, the window edit at level 2* |
| `cutoff` | **opt-in** (`--only=cutoff`, a few minutes, since fin42): Settings › Runtime › Per-agent timeout set to `LIVE_RUN_CUTOFF_MIN` (default 1, whole minutes 1–240) through the control and its Save (`lib/settings-runtime-field.mjs`); one run delegating a child more work than that; then the session reopened from the Sessions browser and a follow-up asking for the continuation offer to be taken. `agents.yaml` is restored after | the control's Save stored `child_timeout: <min×60>` and the run read it; a child cut off at it ended `failed` with "Child timed out after <N>s" and, making progress, the offer; the sidebar's timed-out tag reads PD-CONFIG-003's line in the minutes form (revisions 3 and 4, CN1); each cut-off child's summarising request opened its facts with OQ-217's "Outcome of this agent, not of the session: failed — Child timed out after <N>s.", its summary's first sentence states the limit and never opens "The run failed", and no `child_result` entry of a completed session relays "The run failed" (D9); a continuation taken was delegated by the later run's root (PD-ORCH-004 revisions 3 and 4) (`lib/cut-off-reading.mjs`). No child reaching the limit, and an offer the follow-up's root does not take, are NOTEs |
| `delegation` | (since 2026-10-13, fin42, N57) three launches: `delegation`, the orchestrator's `delegates_to` set to `codebase-analyst` and `docs-writer`, asked to delegate one child, attach its report artifact to a second through `attach_artifacts`, and follow the first up by `session_id`; `delegation-edit`, that session reopened, its latest artifact edited and saved in the Library's inspector (since fin44 the saved document's frontmatter checked to be the record's rendering with `edited_at`), and the session continued; `delegation-swarm`, `rotaris.delegation_strategy: swarm` on a three-part change | the root's `delegate` catalogue narrowed to its list and any delegation outside it refused naming it (OQ-229); an attachment given whole, the observation and the child's `context_selection` entry agreeing (PD-TOOLS-006 revision 5); the follow-up accepted under the child's own task id with its `child_resumed` entry (PD-TOOLS-006 revision 3, PD-ORCH-005 clause 22); the edit stamped `edited_at` and kept `key_findings`, and the continued run's first root request carried the edited document marked `edited` with no frontmatter (PD-LIBRARY-003 (c), (e)); the swarm root told and offered what the mapping in force says (PD-ORCH-006 revision 3, REQ-ORCH-025). What the model did not ask (no attachment, no follow-up, an edit the Library timing missed) is a NOTE, and so, since fin46 (acceptance finding L8 at `b9e3005`), is a `delegation-swarm` overrun the duress run's reading lays at the window — still progressing, the product holding at most a tenth of the wait (`overrunReading`; `LIVE_RUN_EDIT_WAIT_MS` widens it); PD-MCP-002's agents in different trees cannot arise as built and are not asked |
| `rename` | **opt-in** (`--only=rename`, a few minutes, since fin42, N59): one coding-agent child asked to rename the fixture's `remaining` to `countRemaining` with the code-intelligence `rename_symbol`, then run `node --test` | the first rename row `ok`; `src/todos.js`, `src/App.jsx` and `src/todos.test.js` no longer calling or importing `remaining`; the renaming child's stored report and child-report artifact listing every one of the three that changed (OQ-245); `node --test` green, run by the harness; the workspace's three files restored afterwards. No rename call is a NOTE, "not reached"; a rename with no reference search of the agent's own before it that left the importing files behind, or had them mended by another tool, is a FINDING against `PD-MCP-004` (until fin43 a NOTE naming OQ-273; `lib/rename-reading.mjs`); since `PD-MCP-004` revision 2 (OQ-362, 2026-10-20) a `jsconfig.json` standing at the workspace root after the run FAILS ("the product's project file was removed": the fixture has none, and the run host places its own only for the rename's call), and the application log's placements and removals of it are a NOTE |
| `plan-open` | **opt-in** (`--only=plan-open`, a few minutes, since fin42, N56): two runs whose prompt has the coordinator write a three-item plan and answer with the third item `PENDING`; `plan-held` also tells it to answer a correction with one word | `plan-open`: one "a correction is sent" warning, the correction in the root's own conversation saying the answer was shown, no answer re-prompt, one iteration `succeeded`, `completed` / `tasks_complete`; `plan-held`: PD-ORCH-015's held `system` row and the next fresh root's first request carrying the marker and an answer of the session labelled as the one the person was shown, its outcome noted. A root that closed its plan before answering is a NOTE, "not reached" (`lib/plan-open-reading.mjs`) |
| `empty-answer` | **opt-in** (`--only=empty-answer`, a few minutes, since fin42, N56): the recording proxy's `empty` rule answers the coordinating root's completions (`You are the orchestrator.`, the classifier excluded) with no content and no tool call, `stop` — both of them (`empty-answer`), then the first only (`empty-once`); since fin45 (`PD-ORCH-009` revision 5, OQ-296) a third launch, `empty-wait`, empties only the root's request right after an admitted background delegation (every `when` of `[You are the orchestrator., task_id: bg_]`, no report) | exactly one re-prompt sent and logged in each; `empty-answer`: "The run ended without an answer: …" and one warning `incomplete_execution` issue (`reprompted`, `run_ended`); `empty-once`: neither (PD-ORCH-009 revision 2); in each, since fin43 (revision 3, OQ-282), no classifier request reading `Trigger: stuck` and no root stuck `loop_supervisor_activation`; `empty-wait`: the child's report the final message of the request that resumes the silent root, nothing behind it, no stuck classification or root stuck activation, not `agent_session_aborted` (a root that delegated nothing is a NOTE, not reached) |
| `duress` | **opt-in** (`--only=duress`): one delegating run of **three dependent waves, six children**, under `LIVE_RUN_DURESS_MS` (default 40 min) against `--duress-fixture`, its Per-agent timeout at `LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN` (default **45 min**; OQ-214 re-ruled 2026-10-07, PD-CONFIG-003) | the run host's `child_timeout=<s> s` equal to the Per-agent timeout the harness wrote (`duress/agents.yaml` in the pack, `childTimeoutS` in `results.json`, a NOTE naming any value but the 1200 s default); the result inside the wait, with **where the time went** (endpoint, tools, launch, the product with nothing in flight; since 2026-10-06 a wait on children — `wait_for_tasks`, a `delegate` that waits — counts as what the children were doing, never as tools, so a pack recorded before then reads a higher tools figure and a lower product figure than the same run would now: 18 s and 2 s at `27a5127`, 12.1 s and 7.9 s re-read, `docs/defects/fixed/the-duress-time-split-counts-a-parents-wait-on-its-children-as-tools.md`) — an overrun the endpoint held while the run progressed — read only from requests and tool calls that ended on their own, never one the quit cut off — is a NOTE that the window was the bound; the autopsy's coherence section is clean (no null summary on a stopped run — `unasked`, a NOTE, for a session that never stopped — and no tokens against a zero cost where a request had a figure — the reader reads `cost_qualifier`); no child ended `failed` with nothing to say (`final_response`, `last_response` and `cut_off` each count, REQ-ORCH-110; an error entry alone does not — the product writes one on every failed child, and the eighty-second defect's children carried nothing else); a child that ran commands, found by its canonical name, reported them; the `compressions` aggregate agrees with the timeline; every call the tool gate refused as `invalid_request` is referenced by a `tool_error` issue (REQ-SESSION-136, live-run a71-6; `scripts/lib/refusal-issues.mjs`). Length, children and compressions are **reported** — a run that never compressed names its largest prompt against the REQ-CONFIG-134 trigger — so a run that was not duress says so. Readings in `scripts/lib/duress-checks.mjs` |

**Over every session the run kept, at the end** (besides the tool-record readings under `frictions`): since fin27 (OQ-213,
live-run finding K2) no coordinator's second work item ran before it wrote a todo list of its own, and every session whose
root ran two or more stores an agent plan (`lib/coordinator-todo.mjs`); each call the gate refused for want of a list is a
NOTE. By the K2 finding, the edit, resume and frictions sessions of the packs at `c2fdd6a` and `c2a9444` would have failed both.
Since fin32 (PD-TOOLS-014, OQ-231, live-run finding D5) a NOTE counts the `haet_edit`/`haet` misses that named a match level,
those followed by a terminal call of the same agent before its next edit (the directive's target is 0) and those whose next
edit succeeded on the same path (`lib/near-miss-edits.mjs`); a run with none says so. Since fin36 (PD-TOOLS-014 revision 2,
OQ-252) it also counts those whose next edit on the same path was refused "Found N occurrences" (target 0).
Since fin33 (`PD-TOOLS-008` revision 2, `PD-TOOLS-006` revision 7, OQ-249) no coordinator's plan records a running child's item
`PENDING` and none closes an item an implementation child still holds (`heldItemReading`, `lib/coordinator-todo.mjs`; since fin46 a
child holds its item during each run of it the timeline records, from its admission or a follow-up's `child_resumed` to its
`child_end`, not from spawn to `completed_at`, finding L2), with single-active refusals in coordinating sessions a NOTE; since fin37 (`PD-TOOLS-008` revision 3, OQ-255) no closing `replace` leaves an
item IN_PROGRESS once every child serving it has ended (`restoredOverClose`, target 0; since fin41 a NOTE that the close is
unasked when no coordinator sent one, `closes`, and the `edit` prompt asks for one closing `replace`), and a `replace` that named a task it kept
over a different state is a NOTE (`namedRestores`); since fin47 (`PD-TOOLS-008` revision 4, `PD-TOOLS-006` revision 11, OQ-333)
the single-active refusals' target of 0 has no accepted cause left, and three NOTEs read the wait results carrying the line that a
reported child's item is still IN_PROGRESS (`resumeLines`), the delegated items still IN_PROGRESS in the stored plan when the
coordinator answered (`openAtAnswer`) and the seconds from each child's end to its item's close (`closeLatencies`), read from the
arguments and the stored plan; since fin47 (finding A7) the Todo state those three checks read is read under any task id, not
only an eight-hex one, and a held item, or one a closing `replace` sent, that the Todo state does not show fails a check of its own
(`unread`, target 0; `docs/defects/fixed/the-live-runs-todo-state-reader-reads-only-eight-hex-task-ids.md`), whose detail
since 2026-10-20 says of each whether no line of the Todo state carried it (`not shown`: the plan no longer held it, or never
did) or a line carried it in a shape the reader does not take (`not parsed`, a gap of the reader's), after looking the item up
by its exact rendered suffix (`todoItemState`;
`docs/defects/fixed/the-live-runs-todo-state-reader-calls-an-item-it-was-not-shown-unparsed.md`); since 2026-10-20 every phase
and task id in a coordinating session's stored plans, the root's agent plan and each child's own, must be eight-hex
(`planIdReading`, REQ-TOOLS-144), so a recurrence of fin47's finding A6, a `replace` storing an id its model chose
(`docs/defects/fixed/a-todo-replace-stores-the-id-a-model-sent-for-a-new-task.md`), fails the run, and a run whose coordinators
stored no plan id says so in a NOTE; and (`PD-TOOLS-006` revision 8, OQ-250) a NOTE counts `delegate` calls
refused for a `write_scope` given to a persona that cannot write files and child calls of a tool they do not hold
(`lib/routing-misses.mjs`; OQ-216's target is 0 for each, the duress run at `a68f121` had one of each). Since fin38 (`PD-TOOLS-006`
revision 9, OQ-257) the write-scope refusals are read against a bound, each re-routed by the coordinator's next `delegate`, the
seconds to it printed; since fin47 (OQ-331) the bound is counted per task — at most one refusal for each task of the scenario's
request routed to a persona that writes no files (`NON_WRITER_FILE_TASKS`: 2 in duress, 0 elsewhere), no work refused twice, each
re-routed within 60 s, where OQ-257's falsified "at most one a run" stood — and a scenario over it is a NOTE of its own; since fin47
(`PD-TOOLS-006` revision 10, OQ-334) a NOTE in every run prints children's calls of an `artifact_write` they do not hold and briefs
asking a persona whose entry lacks "publishes artifacts" to publish an artifact (target 0 each; the default run at `3c03287` had one
of each); and (OQ-256) a NOTE counts each hand-off answer
a child received cut, by the block's marker in its recorded messages (`lib/hand-off-cuts.mjs`; target 0 for answers of 100,000
characters or fewer; the duress run at `552d346` had two, under the 4,000-character block revision 9 replaced).
Since fin41 (item N67; OQ-258, `PD-ORCH-011` revision 2) a NOTE gives the intent classification per launch — category,
confidence and rung, or the fallback and its reason, from each session's launch audit; the seconds from the session's start to
its `intent:` line (`run_intent` has no elapsed field); each cut's bytes received from the recorded traffic, 0 being a queueing
endpoint's — and counts the fallbacks and cuts, naming OQ-258's reopening limb where 3 in 10 launches were cut after bytes
arrived (`lib/intent-reading.mjs`). Read over the `0bc3eee` pack it gives what that pack's autopsy found by hand: 10 launches,
1 fell back, the requirements cut at 12.0 s after 91,112 bytes, the other nine 2.4 to 9.8 s on the strict rung. Since OQ-332's ruling
(2026-10-15, R-072) each cut also prints the last 300 or so characters of the reasoning it had streamed (`reasoningTail`), so
OQ-258's first reopening limb — a cut after the reasoning named its category and did not reopen it — is read from the NOTE; over
the `3c03287` pack it shows faults-args reopening `single_file_change` against `explicit_trivial` and edit still weighing
`moderate_feature` when the bound cut them.

An endpoint that discovers no model catalogue is not a dead end. The sign-in takes the dialog's own "Continue
anyway" (the zero-model recovery), the catalogue check is recorded as a **NOTE** rather than a silent pass, and
the script writes the `models:` entry the run needs into the sandbox's `agents.yaml` by hand — provider,
`model_id`, `auth_provider`, `base_url`, and the prices if they were registered — which is the same shape the
snapshot layer would have produced (`REQ-CONFIG-082..097`, `REQ-PROVIDER-091`).

### The evidence pack, and what it is for

Evidence lands in `.live-run/runs/<stamp>/` (gitignored). **Packs accumulate** — `.live-run/latest.txt` names the
newest and `--keep-runs` (default 10) prunes the oldest — so two runs can be compared, which they could not be
while each run emptied the directory.

At the pack's root — whatever ended the run, a launch that overran or threw and a signal included (`results.json`'s
`ended` says which, `lib/run-ending.mjs`) — `results.json` with every check, the accounting kind and the spend; `agents.yaml` as the run
saw it; `build.log`; **`workspace.db`, the store copied out of the sandbox before it is deleted**; and
**`evidence-manifest.json`** — the platform, node and Electron, the git head and dirty flag, the measured build's
freshness against its sources, and every file's size and sha256, written last so `results.json` itself is covered
(`pnpm evidence verify <dir>` re-hashes a pack; `pnpm evidence write <dir>` writes one for any other evidence
directory). Then one directory per scenario:

| file | what it holds |
|---|---|
| `app.log` | the launch verbatim, key substituted out and asserted free of a bearer, at `--app-log-level` (`debug` or `info`; default: the product's own, `info`; `warning` and `error` are refused before any launch, since the run's readings read the `info` lines they drop) |
| `app.filtered.log` | the same log with consecutive repeats collapsed and the sandbox path shortened, and a child MCP server's stderr dropped where the log holds any — two thirds of a launch log used to be one language server booting. Since `PD-MONITOR-002` the product's own log records `info` and above and that stderr is `debug`, so a live-run log carries none of it unless the run names `--app-log-level=debug` or a scenario sets `ROTARIS_APP_LOG_LEVEL=debug`, the one switch that restores it |
| `autopsy.txt` | `apps/desktop/scripts/autopsy.mjs` over that scenario's session |
| `session.log` | the product's own per-session log, at `--session-log-level` (default `INFO`) |
| `summary.md` | the product's own human-readable summary of the session (REQ-SESSION-140), as it stood when the scenario ended; the run checks it carries the requirement's sections in their order and that its Tool errors line agrees with its Issues line (`lib/summary-sections.mjs`; since finacc3's F10 the line reads `at least N` past the issues record's cap, and the agreement is read in either form); since fin25 a summary step that throws (the credential guard, the write, the check itself) records a failed check rather than none |
| `transcript.md` | every transcript row in full, not the 400 characters `results.json` keeps |
| `model-traffic.jsonl` | **what the model was sent and what came back** — request and response bodies, status and duration per call, in the file of the scenario that made the call, each naming how it ended (`outcome`: `complete`, `aborted` when the product let go — the endpoint is let go with it — `in-flight at close`, `stalled`, `released`, `cut`, `upstream-error`, `unreachable`). The product logs a method and a URL and nothing else, so this exists nowhere else |
| `*.png` | the end of the scenario, plus one a fifth and one three fifths through its wait |
| `node-test.log`, `diff.txt`, `changed/` | where the scenario produces them |

**That shape is the run-autopsy skill's input.** `.agents/skills/run-autopsy/SKILL.md` asks for a launch log, the
session store and a session id; the live run produced all three and used to delete two of them with the sandbox,
which is why every defect that skill has found came from a session somebody drove by hand. Read a pack with
`pnpm autopsy .live-run/runs/<stamp>/workspace.db <session-id>`, or point the skill at the pack directory.
The pack stays out of the repository; an autopsy the record cites is kept in
[`docs/architecture/live-runs/`](docs/architecture/live-runs/README.md) (since 2026-10-13), with no host, URL, key or token in it.

The sandbox itself is deleted at the end unless `--keep`. The record of what happened in it is not.

### The `faults` scenario — the endpoint misbehaving, on purpose

The proxy is in the path, so it can also be told to misbehave on a **named call**. Three launches:

- **`faults-ladder`** — a 429 on the second completion and a 500 on the third, neither of which reaches the
  endpoint, so the injected calls cost nothing. It asks whether the run survives both and whether each refusal left
  the trace of the layer that retried it: OQ-110 puts REQ-CONFIG-086's dispatch-layer retries before the ladder's
  (`REQ-ORCH-091..094`), so with the default budget of 5 the trace is the session log's WARNING line, and the check
  reads it (or the ladder's `model_wait`/`transient_llm_error` issue) for every injected status. `results.json`'s
  `traffic.faultsFired`/`faultsDeclared` are the run's figures (`proxy.totals()`), never the last launch's.
- **`faults-stall`** — the bytes stop mid-answer and the socket stays **open**. It asks the eighty-second
  defect's question: a model timeout once collapsed into the same `aborted` flag a user's stop sets, and the run
  reported `user_cancelled` with nobody having pressed anything. The check is that it does not do so again.
- **`faults-args`** (since 2026-10-07) — the proxy's `pace` rule holds every piece of every tool call's streamed
  arguments `LIVE_RUN_ARGS_PACE_MS` (120 ms) behind the one before it, and the stall threshold is lowered to
  `LIVE_RUN_ARGS_STALL_S` (10 s) for this launch alone, so one `write_file` of a 120-line list streams for several
  thresholds. It asks the question of L2 at `c2fdd6a` and N1 at `c2a9444`: is any agent reported stalled while it streams
  a tool call's arguments (`lib/paced-arguments.mjs`, `stallsWhileStreaming`)? A paced span shorter than the threshold and
  one evaluation is no evidence, and fails as such
  (`docs/defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md`). Unlike the other two it names no call:
  the rule acts on every call of its path and fires on each that carried a piece. **First executed 2026-10-07 against
  `katalyst`:** red on the product before the repair (three `stall` issues inside paced spans, pack
  `2026-10-07T00-21-02-195Z`), green on the repaired head (220 pieces over 26.4 s, no `stall` issue, pack
  `2026-10-07T00-26-10-472Z`); its very first run, at a 60 ms pace, cleared the threshold and one evaluation by under two
  seconds, so the default became 120 ms.

This makes the first of the two frictions the `frictions` scenario reports as uncoverable inducible on demand;
that row's note points here. A rule names the **1-based index** of the call it fires at, deliberately: "the
second completion" is a reproduction, "some completion" is a coincidence.

**Both were executed against a real endpoint on 2026-09-22 and both passed on the product's side**
(`docs/architecture/first-executions.md`; pack `.live-run/runs/2026-09-22T09-05-35-955Z`). The ladder made five
calls against two refusals and completed *(falsified 2026-09-29: the two refusals were retried by the model client's
dispatch layer — REQ-CONFIG-086's `num_retries`, default 5 — before the ladder saw them, and the ladder was never
reached; the owner ruled that order as the specification's, OQ-110, R-067, so `faults-ladder` shows that a run survives
the refusals and not that the ladder handled them; each retry the dispatch layer absorbs is now a WARNING line in the
session log, so a pack's `faults-ladder/session.log` names both refusals with the delay waited)*; the stalled stream was noticed by the **idle bound at 120.5 s**,
classified `transient_llm_error`, retried at 121.5 s and finished — the first live evidence that the
eighty-second defect's repair holds.

Two things about the scenario itself were wrong and are repaired: the stalled call was **absent from the pack**
(its record was written only when the proxy let the socket go, and the product recovered first —
`docs/defects/fixed/the-stalled-call-was-the-one-call-missing-from-the-pack.md`), and
`stop_reason !== 'user_cancelled'` is a check that **cannot fail**, since a run that met no fault ends
`tasks_complete` too. It now carries a positive half: the product's own `issues` row must show it noticed, and
what it classified must not be fatal. `LIVE_RUN_STALL_HOLD_MS` must outlast the product's `llm_response_timeout`
(120 s) or the scenario measures the proxy letting go instead.

`faults-stall` holds the socket for `LIVE_RUN_STALL_HOLD_MS` (default five minutes) before letting go, so the
scenario is the slow one — it is opt-in with the others under `--only=`.

### The two duress scenarios, and the rule they obey

`terminal` and `duress` exist to enter one gap `docs/architecture/codebase.md` names: the live run "runs short
tasks against an unmetered endpoint, so it holds **no generation near the model timeout, no multi-line command,
and no re-spawn**" — and all seven defects one hand-driven session found lived in exactly that gap.

**The rule both obey is from the same page: replay the shape the record names, never a plausible family
resembling it.** Sixty real-PTY runs at four geometries could not reproduce a concatenation the live run had
shown, because the trigger was an *empty write between two non-empty ones* and none of the sixty carried it.
Sixty negative runs are not a negative result when none of them carries the input that failed. So `terminal`
issues the recorded commands verbatim, and asserts from `tool_calls` — what the agent passed, what came back —
rather than from what the model says it did.

**One of the shapes is a NOTE, on purpose.** The pipe-to-shell deny fires exactly as `REQ-TOOLS-036/038`
specify; its note exists to measure what it costs, not to accuse the product. A shape the model never issued is
also a NOTE. Reporting a faithful behaviour as a fault is how a scenario teaches its reader to ignore it — the
mistake the board scenario made twice. The `FAILED`-marker shape was the second NOTE until 2026-09-27: it now
replays the record's own lower-case docker line and checks that `PD-TOOLS-003` keeps it from warning, as
`diff-exit-1` guards ESC-41 — a regression guard, not a cost note.

`duress` asserts **coherence, not correctness**: a long run's failures are mostly records disagreeing with each
other, and `apps/desktop/scripts/autopsy.mjs` already computes most of them. What the model produced is never
asserted — a weak model doing the work badly is a fact about the model. Whether the run was long *at all* is
reported rather than assumed, including a note when it stopped at `--max-iterations` and was therefore bounded
by the harness rather than by the work.

**Since 2026-10-13 its launch carries the `pendingLanes` trap of finding D8** (`scripts/lib/lanes-trap.mjs`, the instrument
`pnpm update-depth-proof` runs on the scripted provider): installed before the prompt and read every two minutes, it gives a
NOTE with the commits it counted, the high of React's simulated nested-update count against the 50 at which React throws
error 185, the fibers holding the pending work and the components the commit re-rendered, and every `rotaris-lanes-trap:` line
the console relay carried into `duress/app.log` (one at each new high from 10, and one at any update-depth error). A pack
whose `reactUpdateDepthErrors` is not 0 is read beside those lines.

**Since OQ-278's ruling (2026-10-13, R-072) both are checks, not NOTEs.** Every launch, not only `duress`, FAILS when a relayed
renderer console line names React's update-depth error (React error 185), naming each line ("<name>: no relayed renderer
console line names React's update-depth error (D8, OQ-278)"); and the `duress` launch FAILS when its trap did not install or
its `rotaris-lanes-trap: installed` line did not reach `duress/app.log` through the console relay. What the trap saw stays a
NOTE. The first guarded duress pack is the D8 note's closing evidence under `docs/defects/README.md`'s rule for a note that was
never reproduced: trap installed and relayed, and `reactUpdateDepthErrors` 0 on every launch. *That pack came on 2026-10-14 at
`a3be56c` (duress `2026-10-14T05-15-42-589Z`: 78,343 commits, high 11 of 50, 0 errors; default `2026-10-14T04-30-51-088Z`: 0 on all
24 launches), and the note closed under the guard (`docs/defects/fixed/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md`);
both checks stay, and a recurrence opens a new note.*

**Its length comes from the work asked for, not from the fixture's weight** — ruled 2026-09-22, when a larger
fixture was considered and not taken. A five-file repository and a five-hundred-file one delegate exactly as
much as the prompt commissions, and a second fixture is a second tree to keep in step with five other
scenarios' prompts. So the prompt is **three dependent waves** — three children, then two that reconcile what
the three produced, then one that verifies all of it — because the parent's conversation grows monotonically
across waves, which is what reaches compression and re-spawn. A single wave of parallel children finishes in
minutes and measures the short path under a longer deadline. `--duress-fixture` remains for the question that
is about size specifically.

The shapes and the readers (`diagnosticOf`, `longOutputReading`, `outputOf`, `hereStringLinesReturned`, `unexpandableReading`, `replacedShellReading`) live in `apps/desktop/scripts/lib/terminal-shapes.mjs`, pinned by
`terminal-shapes.test.ts` — a pattern that stopped matching its own command would turn every check in the
scenario into "never attempted" without anybody being told, so the test asserts the round trip in both
directions: every shape matches its own command, and none matches another's. Each shape is read from the first send that
reached execution (`shapeSends`, `reachedShape`): a send REQ-ORCH-029's todo gate or the schema check refused before it ran
(`todo_list_owed`, `invalid_request`) is counted beside the shape in the "what the model attempted" NOTE and never read, a
shape whose every send was refused is a NOTE ("not reached: refused at the todo gate"), and a permission block is read, since
`pipe-to-shell` is measured by it (fin40; the confirming run at 0bc3eee failed "all 40 lines" by reading the refused send,
`docs/defects/fixed/the-live-runs-terminal-shapes-read-a-call-the-todo-gate-refused-before-it-ran.md`).

**`terminal` was executed against a real endpoint on 2026-09-22 and every check passed**: all six shapes were
issued, the here-string terminated, forty distinct lines arrived with none concatenated and no escape sequence
surviving, `git diff` exiting 1 read as `outcome success` rather than `shell_failure` — ESC-41's carve-out
proven live on the same machine whose unit test for it is red for an unrelated timeout — and no `__rot_` marker
reached the model. One shape did not reach its question: the wedge **soft-paused before the hard cap**, so
`hardMs`'s own bound is still unmeasured live, and the scenario says so rather than implying otherwise.
**The `failed-word` guard has not run against a real endpoint**: it was written on 2026-09-27, after that run,
and the next live run of `terminal` is its first.

~~**`duress` has not been executed.** It owes its row in `docs/architecture/first-executions.md`.~~ **`duress` was
executed against a real endpoint on 2026-09-29** (pack `.live-run/runs/2026-09-29T03-06-14-929Z`; its row is in
`docs/architecture/first-executions.md`): eight children commissioned, 309 tool calls, and two checks failed. The deadline
check is genuine — 2,406 s of 2,400 s, about 98 % of it the endpoint generating — and the "failed with nothing to say"
check is the harness's false positive on a child cut off with a continuation offer. What the run let through is recorded
as notes in `docs/defects/` carrying "Live-run finding: D…" and "H-…" lines.

**Five of the scenario's own readings were wrong on that run, and were repaired on 2026-09-29 (R-067).** They now live in
`apps/desktop/scripts/lib/duress-checks.mjs`, pinned by `duress-checks.test.ts` against the recorded shapes, and in the
autopsy reader's null-summary line (`lib/autopsy-coherence.mjs`). A cut-off child's `last_response` and `cut_off` are
something to say (H-a); an error entry alone is not, because the product writes one on every failed child (corrected
2026-09-30 in the verifier's fix round 1, where the first repair had counted it and so passed the eighty-second defect's
shape). A child's terminal calls are found under its canonical name, the one `tool_calls`
records (H-b). A session that never stopped answers `unasked`, a NOTE, where it used to pass (H-c). A run that never
compressed names its largest prompt against the REQ-CONFIG-134 trigger rather than its iteration count (H-d). And the
deadline check says **where the time went** (H-h): endpoint, tools alone, launch, and the product with nothing in flight,
each from the traffic and the store. The notes are in `docs/defects/fixed/`. **Run again on 2026-09-30** (pack
`.live-run/runs/2026-09-30T05-29-56-712Z`, `katalyst`), the repaired checks read as they claim: the overrun was a NOTE
(2,406 s of 2,400 s, 99 % the endpoint generating, 1 s of the product with nothing in flight); the session came to rest
`paused`, `application_shutdown`, with its summary, so the null-summary question was asked and passed; no child
failed; the no-compression note named a largest prompt of 77,043 tokens against a trigger of 157,286; and the prompt
arrived with its line breaks (H-e). The commands question, asked at last, **failed falsely once more**: `f`, paused by
the deadline quit after 26 terminal calls, had no report yet. It is now asked only of a child with a report, and
an unsettled one is a NOTE — replayed over that pack, `b` is asked (6 commands) and `f` is noted. **Run a third time
the same day, after the verifier's fix round 1** (pack `.live-run/runs/2026-09-30T06-33-14-401Z`), the scenario
**passed**: the overrun a NOTE naming the one request the quit cut off (the last to end on its own 68 s before the
launch did), a cut-off child (`w2d`, `last_response` and `cut_off`) met live and not counted silent, the commands
question asked of the one settled child that ran commands and the paused `w3` noted.

**`LIVE_RUN_DURESS_MS` — the default stays 40 minutes, and the check says when the window was the bound (decided
2026-09-29).** The figure is the owner's of 2026-09-22, taken for this endpoint, and a harness repair does not reverse it.
What the first execution falsified was the check's reading, not the figure: 2,406 s of 2,400 s was a FAIL, and replayed
through the attribution it reads 99 % endpoint generating (200 requests, 178,627 reasoning tokens), 6 s of tools alone,
5 s of launch, 3 s of the product with nothing in flight, and a request ending 2 s before the quit. A verdict that
blames the product for the endpoint's throughput teaches its reader to ignore it (the rule above), so an overrun in
which the run was still progressing (the last request or tool call **to end on its own** ended within 120 s of the
launch's end) and the product had nothing in flight for at most a tenth of the wait is a **NOTE, "bounded by the window,
not by the product"**. "On its own" is a request the endpoint completed, or anything that ended before the instant the
wait ran out (the seam's timed-out line): a request the quit cut off ends at the quit whatever it was doing, and the
first form of this reading let a stream hung from early in the wait pass as progress (corrected 2026-09-30, the
verifier's fix round 1); such a request is named in the detail instead. The four figures are **occupancy, not a
critical path**: a request open while the run's next step waits on something else still counts to the endpoint. Any other overrun, or one with no traffic to attribute, stays a FAIL naming the shares. To ask for the
result on a reasoning endpoint like `katalyst`, give the run the time: `LIVE_RUN_DURESS_MS=5400000`, for example (90 minutes; the first
execution on `katalyst` was still in its third wave at 40, and the launch's own bound is the wait plus 180 s, so a
`timeout` around the command must sit above that).

**`LIVE_RUN_DURESS_CHILD_TIMEOUT_MIN` — duress launches with the Per-agent timeout at 45 minutes (OQ-214, reopened and
ruled again 2026-10-07 under R-072).** The duress run at `a68f121` cut a verifier and its continuation off at the product's
1200 s while each worked on its own task (finding D2), meeting OQ-214's reopening condition (a). The ruling keeps the
ceiling, the 30 s landing and "continued once, never chained", and takes the relief its earlier ruling counts on:
PD-CONFIG-003's Per-agent timeout, which the harness sets for the duress launch alone as a user on a slow reasoning model
would, writing `runtime.child_timeout: <min×60>` into the workspace's `agents.yaml` (`lib/runtime-key.mjs`, the stored value
Save writes) and restoring it after. Whole minutes from 1 to 240, the control's range; anything else stops the harness
before any launch. `=20` measures the product's default. Every other scenario keeps 1200 s. A pass at a raised limit is
never a pass at the default: the NOTE says which it was. With the children's limit raised the run needs more time: on a
reasoning endpoint like `katalyst` run it with `LIVE_RUN_DURESS_MS=7800000` (130 minutes; at `a68f121` wave three began
about 1,550 s in, and a 45-minute life cut off, its continuation and both summaries take about 5,700 s more) under a
`timeout` above the wait plus 180 s. An overrun while the run is still progressing stays a NOTE.

**The traffic is recorded through a loopback proxy**, so the sandbox's `base_url` is the proxy and the endpoint
is one hop further on. Two consequences worth knowing before reading a pack: a `model request POST` line in
`app.log` names the proxy rather than the endpoint, and it is `model-traffic.jsonl` that says the call reached
the endpoint and what it answered. The proxy forwards chunks as they arrive and buffers nothing — a streamed
completion reaches the product exactly as the endpoint sent it, which
`apps/desktop/scripts/lib/model-traffic.test.ts` pins with a case that fails if it ever stops being true.
`--no-record-traffic` takes the proxy out of the path for the run where the proxy itself is the suspect.
Credentials never reach the file: `authorization` and the api-key spellings are replaced before it is written,
and the live run asserts that in `ask`.

The sandbox holds a **real credential** — the app writes the leased key into its own store, as it would on the
owner's machine — so the credential directory is deleted on every exit path there is: the normal end, `--keep`,
a thrown error, and a Ctrl-C. `--keep` keeps the workspace and the store to read and marks the directory `KEPT`;
the next run sweeps every unmarked leftover, and takes the credentials out of the marked ones too. Live runs may
**overlap** on one host: each writes `OWNER` (its pid and start) into its sandbox as it makes it, and the sweep leaves
a sandbox whose owner is still running — its key included — and one with no `OWNER` for twelve hours
(`apps/desktop/scripts/lib/sandbox-sweep.mjs`;
[fixed](docs/defects/fixed/a-live-run-sweeps-a-concurrent-live-runs-sandbox.md)).

### Reading a failure

Each check prints `PASS`, `FAIL` or `NOTE` with its own sentence, so a red names the assertion rather than the
run. `results.json` holds the same list plus the per-scenario detail — iterations, tokens, tool names, the
answer, the diffstat. A failure in `edit` is usually worth reading beside `edit/changed/` and `edit/diff.txt`:
what the agent wrote is as informative as what the app did with it. A weaker or smaller model failing `edit`
while `ask` passes is a fact about the model, not necessarily about the product — say which you think it is.

Read the scenario's **`autopsy.txt` first** and its `app.filtered.log` second; `transcript.md` and the verbatim
`app.log` are there for the question the first two raise. A check that went red without the autopsy showing a
cause is itself worth reporting — it means the store recorded nothing about the failure.

A live-run failure is a **defect of the product**, not of the harness, until the harness is shown to be wrong.
Record what it found where the mechanism was decided, as the standing policy in `CLAUDE.md` requires.

### What the first execution found — 2026-09-11

Twenty-six checks, all green, against the owner's own vLLM endpoint (unmetered, the discovered model): sign-in
through the product's dialog, a run that read a file and answered, a run that implemented `REQ-TODO-003` — the
identifier it carried that day; the store was renumbered to `REQ-101`..`REQ-104` on 2026-09-11 so the board could
read it, and this record is left saying what it said — two
delegated children, twenty-five tool calls, the suite green when this script ran it itself — and the Overview
painted from the store afterwards. The credential reached no log.

### What the fifth scenario's first execution found — 2026-09-11

Twenty-one checks, all green, against the same endpoint: `REQ-104` selected on the board, released, and the run
that followed watched `backlog → running → review` and accepted into `done` — the product's own timestamps putting
the run at **101.6 s**, 82,786 tokens in and 2,005 out over one iteration, twelve distinct tools including a
delegated child and the terminal, the run confined to `rotaris-req-req-104-u1`, and `node --test` green inside that
worktree when this script ran it. The scenario itself found nothing; the defect it exists to catch was found by the
hand-driven precursor it was written from — the **eighty-first**, recorded in `codebase.md`'s live-run section: a
store whose every document the engine rejected read exactly like an empty store, because this fixture's own
identifiers were not identifiers and no surface but the board had ever parsed them.

It still found a defect, in the way this record says it would, and not through a red check — the persisted
tool-call total was the entry agent's own, not the session's (`REQ-MONITOR-102`), recorded in
`docs/architecture/first-executions.md`'s live-run row. The `edit` scenario now compares the session's counter
with the ring, by agent — the assertion that would have failed before the fix.

Two things it surfaced that are **not** defects, recorded so they are not re-investigated: the Overview metric
cards read the *attached* session, so they are zero in the `shell` scenario by design; and `iterations_completed`
counts run-loop passes, not model turns, so one prompt is one iteration however many tools it dispatched.

One thing left alone: an MCP server whose handshake predates `server/discover` logs a wall of validation errors to
stderr while the client recovers and connects (`packages/mcp/src/client.ts`). Nothing breaks and the fallback is
measured; the noise is the server's own, and quieting it is a decision for `REQ-MCP-048`'s record, not this one.

### The fixture

`apps/desktop/scripts/fixtures/todo-app` is checked in and is part of the repository's own `pnpm check` surface
only as text — nothing installs or builds it. Keep it dependency-free: the suite must run with a bare
`node --test`, because the sandbox has no network and nothing installed. Its `AGENTS.md` is the instructions
the agent under test reads, and the live run exercises that path too; change it deliberately.

Its requirement store is read by the **board** as well as by the agent, so two things about it are load-bearing:
the identifiers stay `REQ-TRACE-022` identifiers — the prefix, a hyphen, decimal digits and nothing else — and the
layout stays `REQ-TRACE-002`'s conventional shape. A store that breaks either is not a smaller store; it is a store
the engine rejects wholesale, which is what the board reads as empty. Renaming a requirement there also changes what
the `edit` prompt and the `requirements` scenario name: change the three together.
