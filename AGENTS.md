# Agents working in this repository

`CLAUDE.md` states what governs this repository: the clean-room boundary, the approved inputs, the process
state, the architecture views and the design language. Read it first — nothing here relaxes any of it.

[`CONTEXT-MAP.md`](CONTEXT-MAP.md) is the vocabulary those documents fix: one `CONTEXT.md` per context, every
term derived from `docs/spec/` and citing the requirement that owns it. Read it before naming anything new,
and prefer its word over a synonym you would otherwise reach for.

[`docs/module-map.md`](docs/module-map.md) is the shallowest map — which package owns a thing, the file to
open first, and where its tests are. Read it when the question is *where*; the proof index below answers
*what re-verifies it*.

This file covers the two checks `CLAUDE.md` does not spell out: **`pnpm app:drive`** (free, interactive
debugging of the built app) and **`pnpm live-run`** (the only check that spends real money) — and indexes the
proof scripts, so the evidence for an area can be found without reading forty script headers.

## The proof scripts — which one covers what

`pnpm check` (symbols, typecheck, lint, tests) is the gate every commit passes. Beside it sit the **proof
scripts**: each launches the **built** application against a scratch profile and measures a mechanism in the
product rather than in a unit test. Every one is a first execution's evidence, and the area it covers is the
area it re-verifies.

Two rules about them. **Run the whole suite a part touches, not the one script named after it** — a change
that moves a shared seam breaks a neighbour's proof, and that is the point of having them. And a proof is
**evidence, not a test of the harness**: a red is a defect of the product until the harness is shown to be
wrong.

No proof hangs on a launch that overruns. Every launch a script starts itself goes through
`lib/bounded-launch.mjs`'s `spawnBounded`, and a driven one through the driver's `stopApp`. Two launches are neither,
and `lib/launch-sites.test.ts` names them with their reasons: `code-intel-proof`'s branch, a stdio server whose RPC
client fails every request when it dies or hangs, and `live-run`'s `runElectron`, whose bound is SIGKILL reported as
a signal, never as a clean exit. Any other bare `spawn` of Electron fails that test. At its bound the
application is sent SIGTERM with its pipes still open, and it answers: its quit path runs and it exits within a
fraction of a second. SIGKILL follows a grace only if it does not. The proof then fails with the launch's last log
lines. `lib/launch-sites.test.ts` refuses a `spawnSync` launch of Electron: its timeout closes the pipes as it signals,
so the quit path's lines are lost, and it reports the overrun as exit status 0 with only `error.code` `ETIMEDOUT` to
show it, which a check of the status passes as a clean exit. (Before the application's EPIPE loop was repaired on
2026-09-29 it did not return at all.)
([note](docs/defects/fixed/proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md)).

| Area | Script | What it measures |
|---|---|---|
| **The run** | `part-h-proof` | the loop supervisor and `continue` (ADR-0059) |
| | `part-j-proof` | the control channel: a queued message at the iteration boundary, a steer, a graceful pause (its rest's summary, and the session lock the Continue holds for its run, sampled while the app runs), a steer still pending at a pause reaching the resumed root, which carries on with its next scripted step rather than its first (the scripted client reads where a resumed agent stood from its record), the message-limit pause |
| | `plan-gate-proof` | the plan gate held, edited, answered (ADR-0062); since 2026-09-29 a fresh session whose plan cycle root called a tool is reopened at its gate, and the inspector's run-level agent must mark that tool `used` (`docs/defects/fixed/the-run-level-agents-tool-history-is-empty-at-a-plan-gate-no-iteration-precedes.md`); since 2026-10-01 the same reading after an iteration, with `plan` chosen and the entry persona switched before the plan cycle, must mark the plan cycle root's tool `used` and not the iteration root's (`docs/defects/fixed/a-plan-cycle-after-an-iteration-reads-the-tool-history-of-the-iterations-root.md`) |
| | `resilience-proof` | the model ladder, the waits, the fallbacks, against scripted faults; the `override` launch is driven (the chooser the wait header draws), every launch is bounded (`lib/bounded-launch.mjs`: an overrun is ended by SIGTERM, a grace, then SIGKILL and reported with its log tail), and every scenario runs to its end with failures listed in `results.json` |
| | `compression-proof` | context compression and its timeline entries (ADR-0060) |
| | `checkpoint-proof` | the capture at iteration close through to the desktop restore (ADR-0039); the `live` launch's lock is probed dead the moment it returns (`lib/lock-holder.mjs`), so a lock that outlives the application fails there and is not blamed on the `repaired` step (`docs/defects/fixed/checkpoint-proofs-repaired-step-blames-the-repair-for-a-lock-its-live-launch-left-held.md`); since 2026-09-29 the `loaded-restore` launch restores a session still loaded after its run, once a second holder has taken its lock, and fails on a restore that writes under that holder (`docs/defects/fixed/a-write-through-a-loaded-sessions-writer-outside-a-run-claims-no-lock.md`) |
| | `sessions-proof` | the session browser's actions: repair, delete with ref cleanup, the exports; its planted locks read the machine identifier where the product mints it on the running platform (`machineIdFileFor`; `docs/defects/fixed/sessions-proof-reads-the-machine-identifier-at-the-windows-path-on-every-platform.md`); the delete's cascade premise is the schema's shape, never a count of tables (`lib/session-cascade.mjs`; `docs/defects/fixed/sessions-proof-pins-sixteen-cascading-tables-where-the-store-has-twenty.md`) |
| **Tools** | `fetch-proof` | `fetch` and its egress policy, read from saved configuration at **every** call |
| | `questions-proof` | `ask_questions`, the trailer row, the stepper, the two control operations |
| | `todo-proof` | the todo source priority, write-through edits, the pane |
| | `attachments-proof` | content validation, ceilings, the capability gate, durable metadata |
| | `artifacts-proof` | the session artifact store, the Artifacts tab, the inspector; since 2026-09-29 (live-run finding K1) item 2 also reads the agent inspector while the delegating run is still active — the run-level agent's chips (its live root port's resolution) marked from its history, the link to what it published — and follows the link into the Library's artifact inspector (first written "at rest", which it never was), and item 5 reads it at rest in a reopened session, the declared tools standing in; since 2026-10-01 (acceptance A20) item 2 also holds the run-level agent's meta line to at least one call per tool its chips mark used, which read `0 tool calls` while its turn ran |
| | `mcp-proof` | MCP declared three ways, against a real fixture server (ADR-0033/0034); launches 6 and 7 are driven, each step waiting for its condition (`<name>.steps.json`); launch 7's `.cmd`-runner check (REQ-MCP-113's wrap) is asserted on win32 only and **stated not applicable elsewhere**, the rest of the launch measured on every platform |
| | `code-intel-proof` | the bundled code-intelligence runtime and its manifest (ADR-0035); it builds by platform; its window sampler is Windows-only, and elsewhere section 1 records the no-window check **not measured** (the instrument is missing, not the requirement), with its reason, in `results.json`; its setup launches open Settings with the Ctrl+7 chord rather than the shared category seam, and every press waits for the open's notice to have drawn and then for the control it presses (`docs/defects/fixed/code-intel-proofs-setup-launches-press-at-fixed-offsets.md`); a press step that never matches logs `never matched`, which is expected for the `MCP Servers` step whenever Settings already opens there; its branch launch is the product's order, the token first and `hostSwitches` between it and `--`, which `lib/launch-sites.test.ts` holds for every token launch (`docs/defects/fixed/code-intel-proofs-branch-launch-puts-the-sandbox-switch-ahead-of-the-token.md`); its branch client (`lib/line-rpc-client.mjs`) fails every pending request when the child exits, errors or is killed, with the exit status and standard error's tail, so it no longer hangs (`docs/defects/fixed/the-code-intelligence-server-dies-when-the-app-runs-as-root.md`, `docs/defects/fixed/code-intel-proofs-branch-client-waits-forever-on-a-child-that-has-exited.md`) |
| | `skills-proof` | portable skill discovery, with a scratch home and a scratch machine-wide root (ADR-0063; `ROTARIS_CAPTURE_SKILLS_MACHINE`, off Windows only); the `/skills` listing written as one saved system row and read back after a reopen (REQ-CHAT-162) |
| | `injection-proof` | workspace-context injection as the model port **received** it — order, the per-file switches, OQ-64, a worktree's execution root — and REQ-WORKSPACE-049's cold-cache p95 over 20 separate processes (`--skip-latency` skips it; cold only on Linux) |
| | `sandbox-proof` | OS-level confinement (ADR-0022). The proof reads the host's own verdict (`process.platform`, the launcher on `PATH`, its own trial) and asserts the product's answer for that case (`docs/defects/fixed/sandbox-proof-asserts-the-windows-verdict-on-every-platform.md`). On `win32` and on Linux without `bwrap` it proves the refusal path. On every host it reads REQ-SANDBOX-130's disclosure on both surfaces, the settings card and the launch dialog (scenario 2b), and expects it only where no mechanism exists. **Where the backend is available it also runs REQ-SANDBOX-127's six effects (IC-8)** with `.git` present, plus a third confined launch with `.git` absent: REQ-SANDBOX-077's case (c). On Linux with `bwrap` that launch expects every command refused (`sandbox_unavailable`, 126, read from `tool_calls`) and `.git` still absent afterwards (`docs/defects/fixed/the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md`, OQ-140). Read `results.json` → `effects` |
| | `terminal-stream-proof` | the stream in the run host against a **real PTY** (ADR-0021), each command spelled in the host's shell: PowerShell on Windows, the POSIX shell elsewhere (REQ-TOOLS-104). Before 2026-09-28 it spoke PowerShell everywhere and measured nothing off Windows (`docs/defects/fixed/terminal-stream-proofs-real-pty-half-speaks-powershell-to-a-posix-shell.md`). Since 2026-09-29 the deltas carry what the command wrote and no marker (`deltasCarryOnlyTheCommand`, live-run L9), and a second command on the same stream starts on its own row of the renderer's display (`reopenedStreamStartsOnAFreshRow`) |
| **Configuration and startup** | `config-proof` | hand-authored, commented files surviving every write (ADR-0036/0037) |
| | `init-proof` | project initialization resolved once per workspace open (ADR-0064); scenario 3 reads the dialog **before** its Escape (the reading marks the document and the key waits for the mark), and asserts that the background task starts and completes beside the consent prompt. Before the repairs it failed on Linux in both orders: a skip landing ahead of the resolution swallowed the background task (`docs/defects/fixed/a-skip-answered-before-the-open-resolves-swallows-the-background-task.md`), and the background run drew itself in the dialog, which then refused Escape when the resolution came first (`docs/defects/fixed/the-setup-dialog-takes-a-background-run-as-its-own.md`) |
| | `workspace-proof` | reaching a project folder from inside the application: resolution, gates, switch; scenario 8b switches away from a workspace whose initialization run is under way — its two projects point `code_intelligence` at a stand-in runtime written into the evidence directory, whose `project create` holds for 90 s and takes 2 s to end once asked — and asserts the outgoing run is cancelled, its step's process ended within 5 s, nothing recorded for it, the replacement's own setup followed to its recorded outcome once the outgoing one has ended, and a return to it resolved again (REQ-WORKSPACE-013/084/092/102/109; `docs/defects/fixed/a-workspace-switch-never-cancels-the-outgoing-initialization-run.md`, `docs/defects/fixed/a-closed-workspaces-run-can-clear-the-reopened-workspaces-setup-listener.md`) |
| | `settings-proof` | the Settings categories and the save bar; the About page's two files (`build-id.txt`, `THIRD-PARTY-LICENSES.txt`), absent and present (it stages them in `apps/desktop/resources/` and gives back what was there); the Runtime category's run-start mode hint, with no session followed and over a released session (PD-ORCH-003) |
| | `updater-proof` | the updater on the one path a development host can execute: a launch that is not a released artifact performs no check and issues no request (REQ-STARTUP-106/114/150) — the log's one `info` line, and a proxy sink every request of Chromium's stack would reach that records none for the feed and **none at all** from launch to first paint and quit (REQ-STARTUP-160, REQ-SHELL-005 — the spellchecker's dictionary download it once caught), with a net-log naming the URL of any connection it does record; and a second launch, started with both artifact variables set, whose one scripted `terminal` call finds neither in its shell's environment (REQ-STARTUP-147); the check, the download, the apply and the restart are unit-tested over fakes and their run against a real artifact is owed to the next Windows package (IC-3) |
| **Surfaces** | `overview-proof` | the Overview painted from the run and the store |
| | `transcript-proof` | the projection, the caches, the empty state (ADR-0045/0046), and REQ-CHAT-055's append comparison — alternating launches pooled to thirty a side, in frames and milliseconds with their spread, plus one traced launch of each fixture read back by `lib/trace-summary.mjs`, which since 2026-09-29 also carries V8's CPU profile: `append.json`'s `profile` names the script per increment by function and by source module, loaded minus empty; stage 3b also expands the planted activity line and reads the twelve frames after the click, opens a planted user row's image attachment (a growth under an unchanged measurement key) and reads the twelve painted frames after it, and holds a pair of rows already drawn to 1 px (2026-10-01); stage 3c (`capacity`, 2026-10-01) resizes the window to 1440x4300 over 400 one-line notices and holds every row on screen bound — Xvfb with no window manager does not clamp the window, so the standard `-screen 0 1600x1000x24` asks it, and a host that clamps the window records the stage NOT ASKED in the verdict; `--only=<stages>` runs named stages after the `empty` launch |
| | `rows-proof` | the one row renderer, in both of its surfaces at once |
| | `composer-proof` | the composer's chips, drafts, history recall and run header |
| | `slash-proof` | the composer's slash-command catalogue; every eval is read by offset AND expression (`lib/capture-evals.mjs`), and REQ-CHAT-027's ground is the first opaque background from the input up, asserted to be the palette's `--rt-surface` (the dock's, `COMPOSER_GROUND` in `highlight.ts`); ~~**red on the product** since the composer dock: the partial shade is corrected against `--rt-bg` and painted on `--rt-surface`~~ green again 2026-09-29, the colours derived on the dock's ground (`docs/defects/fixed/the-slash-token-colours-clear-their-floor-on-a-ground-the-composer-no-longer-paints.md`) |
| | `chat-controls-proof` | manual compression, the transcript clear, the prompt-file commands |
| | `palette-proof` | one action vocabulary reaching the screen three ways. ADR-0048's **host-input** reading (`os-input.ps1`: a real Win32 click and keystrokes, and `IsWindowEnabled`) runs on `win32` only. Elsewhere `results.json` → `modality.hostInput` states it not applicable and why, and the application's own `isEnabled` reading is still asserted (`docs/defects/fixed/palette-proof-reads-the-win32-host-input-on-every-platform.md`) |
| | `notice-proof` | the notice store and its chain (ADR-0049) |
| | `library-proof` | the Library shell and its Prompts tab |
| | `mission-proof` | the Mission view, the per-agent inspector, the persona windows; since 2026-09-29 a waiting agent's clock (item 1b: two children waiting behind a slot cap of one show their elapsed time, advancing — REQ-MONITOR-107/111, OQ-124); item 6 reads the running run-level agent's chips — its run's resolution, a coordinator's withheld tools absent (REQ-MONITOR-060/061, live-run finding K1); item 3 reads the still-mounted view's Pause once the session rests `paused` — `Pause`, not `Pausing…` (REQ-MONITOR-296, 2026-09-29); item 4 records the rows just after the confirmed cancel (REQ-MONITOR-128's optimistic cancel, not asserted: it depends on the host's timing) and asserts the engine's record has overwritten them by 9 s (REQ-MONITOR-296, 2026-09-29); item 4b cancels the run from the Mission view's run row and asserts that every snapshot taken after the confirm was handled (one selector list per sample, counted once the confirmation has closed) reads the subtitle, the run row and the strip `Cancelling` or the run at rest, never `Running` nor another active status; item 4c pops the run-level agent out from the inspector, confirms its window's Cancel (`ROTARIS_CAPTURE_PERSONA_CLICKS`) and asserts the same of the instance's state label — `cancelling` or at rest, never `running`; how many samples land inside the `Cancelling` window is host timing, recorded as `cancellingSamples` and not asserted (REQ-MONITOR-127/130, acceptance A35, OQ-165) |
| | `git-proof` | the Git view and the worktrees |
| | `terminal-proof` | the terminal grid, the pop-out window, the transcript preview (ADR-0047). Its live section spells the size probe, the motion command and the flood in the shell its harness reports (REQ-TOOLS-104). Before 2026-09-28 they were PowerShell everywhere, and off Windows four checks measured nothing (`docs/defects/fixed/terminal-proofs-live-section-drives-a-posix-shell-with-powershell.md`) |
| | `improvements-proof` | the reviewed-improvement lifecycle end to end |
| | `retrospective-proof` | the retrospective pass, driven from its surfaces against the built app (PD-LIBRARY-002) |
| | `theme-proof` | the themes and scales, rendered — plus two counterfactuals that must stay red; since 2026-09-30 a text's contrast is read only from the part of it left on screen by the window and by every ancestor whose `overflow` is not `visible` (scroll, `hidden` and `clip` alike), and a fragment under one em is skipped with its size (`lib/text-sample.mjs`), so a status-strip item scrolled 1.2 px onto the screen no longer decides the verdict |
| | `layout-proof` | the Workspace view's grid, **measured** at the sizes the specification names |
| **Requirements** | `requirements-proof` | the delivery store and the board (ADR-0041) |
| | `requirements-runs-proof` | runs started from the board, against a real scratch repository |
| | `traceability-proof` | the traceability engine, including spike 7's scale store (ADR-0040) |
| **The record itself** | `directive-proof` | that a directive's precedence over a requirement is machine-checked, not asserted in prose |
| **Whole product** | `slice-proof` | sign-in through the product and one run on a real model |
| | `driver-proof` | the driver seam `pnpm app:drive` depends on — and that its `quit` brings a live run to rest, its shot straight after a navigation shows the new view, and it answers an approval in its dialog and probes a persona window |
| | `ui-audit` / `ui-review` | what the browser **built** at every size; the deterministic pack a report-only critic reads |
| | `live-run` | the built product against a real endpoint and a real key — **money; never automatic** |

## Repository UI skills

Three portable workflows live under `.agents/skills/`, where REQ-WORKSPACE-051 makes them discoverable from
this repository: **`build-ui`** for creating or substantially restyling a surface, **`debug-ui`** for a bounded
rendered defect, and **`review-ui`** for a report-only external critique. Their `.claude/skills/` entries are thin
compatibility routers; the portable files are canonical.

A fourth, **`orchestrated-build`**, drives a large body of work (a release backlog, every open defect) through a
multi-agent workflow: independent verification per bundle, repair rounds, serialized merges, acceptance with the
proof sweep and live runs, and recovery from container restarts out of the workflow journals. It improves itself
under the guardrails its `SKILL.md` states; `pnpm check` runs its self-test.

`build-ui` and `debug-ui` may change source within the authority of the current task. `review-ui` writes only
evidence under `.ui-review/`. Its critique is proposed evidence and reaches implementation through a separate,
authorized build or debug pass. A complete review loop has at most three iterations.

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

An owner's yes is not always enough in an agent session. On the Linux agent host, the harness's automatic permission
classifier has refused some `live-run.mjs --confirm` launches as a real-world transaction even where the owner authorised
the run (R-066, R-067; `docs/defects/no-live-run-has-executed-on-merged-main.md`). On 2026-09-30 it refused the launch
over the default scenarios and the long `duress` launch, while it admitted targeted `--only=ask` and `--only=ask,edit`
runs on repair branches the same day. Which launches it admits is not established, so an agent does not predict it. An
agent that meets that refusal stops, and it does not reach the run by another route, such as splitting the refused
launch into admitted `--only=` pieces. It records the refusal where its task lives and says so in its report. Only the
owner can close the gap: by allowing `node apps/desktop/scripts/live-run.mjs --confirm` for agent sessions in the
harness's permission rules, or by running the command by hand.

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
| `sign-in` | Settings → Models → Add endpoint, filled and pressed in the product's dialog | the credential file, the snapshot's authenticated record, the catalogue, the bootstrapped `agents.yaml`, no credential in any log, the outcome's model count worded with no literal "(s)" (REQ-SHELL-044; live-run L11) |
| `ask` | one real run: read `src/todos.js`, answer | the leased bearer, a request to the endpoint, a completed session, settled tool rows, usage figures, an answer naming the real exports |
| `edit` | one real run: implement `REQ-103` through two scoped children, each told to run the suite in the terminal (the orchestrator holds none: `coordinator_only`, REQ-TOOLS-006) | `clearCompleted` exported and tested, a child's terminal call running `node --test` and none by the orchestrator, the session's tool-call total agreeing with the ring across every agent (`REQ-MONITOR-102`), `git diff` non-empty, and **`node --test` run again by the script itself** — the agent's own report is never the evidence |
| `resume` | one real delegating run, paused through the composer's Pause while a child runs and continued through its Continue (`PD-ORCH-005`) | the paused composer drew its children `paused` with the Continue action's count; the timeline's `iteration_paused` by `pause` and `iteration_resumed` for the same iteration; every child paused by the pause resumed under its own task id; each one's `agent_messages` continue across the pause, and its next request carried what it recorded last; the iteration closed `succeeded`, the session completed, and **both notes it asked for are read back from disk** |
| `requirements` | the board: `REQ-104` selected, the move control pressed, the release confirmed, the run watched to review and its decision taken | the card's own trail `backlog → running → review → done`, exactly one release and an accept in the delivery history, the run record carrying its session identifier and the permissions it was granted (`REQ-TRACE-464/472`), real usage from the endpoint, the run confined to a worktree of its own, `completedCount` exported and tested **inside that worktree**, and **`node --test` run there by the script itself** |
| `shell` | a relaunch with no prompt | Overview painted from the store: the sessions the runs left, the repository card's branch |
| `frictions` | one real run engineered to trip the inducible autopsy frictions, read back from the store | first-use `write_file` with no operation repair, every settled create reporting the lines its content holds (a final newline ends a line; live-run L6), SIGINT delivered with no platform refusal — **red by design until the fixes land**; the exit-trace friction is recorded but not inducible on demand, and the stall-abort one moved to `faults` |
| `faults` | two runs against an endpoint the proxy makes misbehave: a 429-then-500 ladder, and a stream that stops mid-answer with the socket open | the ladder run still completes, and each injected refusal left the trace of the layer that retried it — the session log's dispatch-layer line or the ladder's own issue (OQ-110), never the call count alone; the stalled run does **not** report `user_cancelled` with nobody having pressed anything (defect 82's shape), **and the product is shown to have noticed the stall** in its own `issues` row — the negative alone would pass on a run that met no fault at all; and, since 2026-09-30, the entry agent's own stall watch wrote REQ-MONITOR-119's `stall` issue (`agent appears stalled: …`) before the idle bound, with a photograph taken between the two (`faults-stall.stalled.png`, OQ-153) |
| `terminal` | one run issuing the commands the record names verbatim: a multi-line here-string, forty long lines, off Windows an `exec bash` that replaces the session's shell (acceptance A9, OQ-144), off Windows a bash-ism `/bin/sh` cannot expand (live-run L1), a wedge with no `timeout` and one empty poll of it (live-run L2), then `C-c` with `is_input` and one poll after it (OQ-147), an exit-0 output carrying docker's lower-case `failed to connect` line, a `git diff` exiting 1, a pipeline through a pipe | the here-string terminated; all forty lines arrived, none concatenated, none carrying an escape sequence; the shell replacement ended at once as an `execution_error` with no exit code, never a soft pause, the session was restarted on its own shell (`kill_status` `session_reset`), and the next command the same agent issued met `/bin/sh` again (a next command from another agent, whose foreground session is its own under REQ-TOOLS-187, is a NOTE); the bash-ism ended at once with the shell's own error status, never a soft pause; a call with no `timeout` was still bounded; the poll stated no more waiting than had passed and did not claim the no-output window; the poll after `C-c` handed the wedge over as ended without an exit status of its own, never as still running; the docker line printed at exit 0 was neither `suspicious_success` nor given a failure-marker warning (`PD-TOOLS-003`); exit 1 from `git diff` was not `shell_failure`; **no end marker in anything the model read**. The pipeline is a NOTE — its deny fires as its requirements specify — and a shape the model never issued is a NOTE too |
| `duress` | **opt-in** (`--only=duress`): one delegating run of **three dependent waves, six children**, under `LIVE_RUN_DURESS_MS` (default 40 min) against `--duress-fixture` | the result inside the wait, with **where the time went** (endpoint, tools, launch, the product with nothing in flight) — an overrun the endpoint held while the run progressed — read only from requests and tool calls that ended on their own, never one the quit cut off — is a NOTE that the window was the bound; the autopsy's coherence section is clean (no null summary on a stopped run — `unasked`, a NOTE, for a session that never stopped — and no tokens against a zero cost where a request had a figure — the reader reads `cost_qualifier`); no child ended `failed` with nothing to say (`final_response`, `last_response` and `cut_off` each count, REQ-ORCH-110; an error entry alone does not — the product writes one on every failed child, and the eighty-second defect's children carried nothing else); a child that ran commands, found by its canonical name, reported them; the `compressions` aggregate agrees with the timeline. Length, children and compressions are **reported** — a run that never compressed names its largest prompt against the REQ-CONFIG-134 trigger — so a run that was not duress says so. Readings in `scripts/lib/duress-checks.mjs` |

An endpoint that discovers no model catalogue is not a dead end. The sign-in takes the dialog's own "Continue
anyway" (the zero-model recovery), the catalogue check is recorded as a **NOTE** rather than a silent pass, and
the script writes the `models:` entry the run needs into the sandbox's `agents.yaml` by hand — provider,
`model_id`, `auth_provider`, `base_url`, and the prices if they were registered — which is the same shape the
snapshot layer would have produced (`REQ-CONFIG-082..097`, `REQ-PROVIDER-091`).

### The evidence pack, and what it is for

Evidence lands in `.live-run/runs/<stamp>/` (gitignored). **Packs accumulate** — `.live-run/latest.txt` names the
newest and `--keep-runs` (default 10) prunes the oldest — so two runs can be compared, which they could not be
while each run emptied the directory.

At the pack's root: `results.json` with every check, the accounting kind and the spend; `agents.yaml` as the run
saw it; `build.log`; and **`workspace.db`, the store copied out of the sandbox before it is deleted**. Then one
directory per scenario:

| file | what it holds |
|---|---|
| `app.log` | the launch verbatim, key substituted out and asserted free of a bearer, at `--app-log-level` (default: the product's own, `info`) |
| `app.filtered.log` | the same log with consecutive repeats collapsed and the sandbox path shortened, and a child MCP server's stderr dropped where the log holds any — two thirds of a launch log used to be one language server booting. Since `PD-MONITOR-002` the product's own log records `info` and above and that stderr is `debug`, so a live-run log carries none of it unless the run names `--app-log-level=debug` or a scenario sets `ROTARIS_APP_LOG_LEVEL=debug`, the one switch that restores it |
| `autopsy.txt` | `apps/desktop/scripts/autopsy.mjs` over that scenario's session |
| `session.log` | the product's own per-session log, at `--session-log-level` (default `INFO`) |
| `transcript.md` | every transcript row in full, not the 400 characters `results.json` keeps |
| `model-traffic.jsonl` | **what the model was sent and what came back** — request and response bodies, status and duration per call, in the file of the scenario that made the call, each naming how it ended (`outcome`: `complete`, `aborted` when the product let go — the endpoint is let go with it — `in-flight at close`, `stalled`, `released`, `cut`, `upstream-error`, `unreachable`). The product logs a method and a URL and nothing else, so this exists nowhere else |
| `*.png` | the end of the scenario, plus one a fifth and one three fifths through its wait |
| `node-test.log`, `diff.txt`, `changed/` | where the scenario produces them |

**That shape is the run-autopsy skill's input.** `.agents/skills/run-autopsy/SKILL.md` asks for a launch log, the
session store and a session id; the live run produced all three and used to delete two of them with the sandbox,
which is why every defect that skill has found came from a session somebody drove by hand. Read a pack with
`pnpm autopsy .live-run/runs/<stamp>/workspace.db <session-id>`, or point the skill at the pack directory.

The sandbox itself is deleted at the end unless `--keep`. The record of what happened in it is not.

### The `faults` scenario — the endpoint misbehaving, on purpose

The proxy is in the path, so it can also be told to misbehave on a **named call**. Two launches:

- **`faults-ladder`** — a 429 on the second completion and a 500 on the third, neither of which reaches the
  endpoint, so the injected calls cost nothing. It asks whether the run survives both and whether each refusal left
  the trace of the layer that retried it: OQ-110 puts REQ-CONFIG-086's dispatch-layer retries before the ladder's
  (`REQ-ORCH-091..094`), so with the default budget of 5 the trace is the session log's WARNING line, and the check
  reads it (or the ladder's `model_wait`/`transient_llm_error` issue) for every injected status. `results.json`'s
  `traffic.faultsFired`/`faultsDeclared` are the run's figures (`proxy.totals()`), never the last launch's.
- **`faults-stall`** — the bytes stop mid-answer and the socket stays **open**. It asks the eighty-second
  defect's question: a model timeout once collapsed into the same `aborted` flag a user's stop sets, and the run
  reported `user_cancelled` with nobody having pressed anything. The check is that it does not do so again.

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
directions: every shape matches its own command, and none matches another's.

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
