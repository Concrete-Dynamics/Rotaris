# The codebase — how the architecture is laid out in code — The driver — a step that waits instead of guessing (2026-09-11)

Part 11 of 22 of [the codebase record](../codebase.md), which indexes every part.

## The driver — a step that waits instead of guessing (2026-09-11)

Two changes to how this repository verifies itself, taken together on 2026-09-11. Neither is product behaviour and
no requirement names either; both are listed here because the proofs are the evidence and a change to how they
work is a change to what the evidence means.

**The extraction.** `apps/desktop/scripts/lib/harness.mjs` holds what twenty-eight `*-proof` scripts each carried a
copy of: `cleanEnvironment` (twenty-eight copies, twenty-seven of them identical and the twenty-eighth differing
only in the name of a loop variable), `findDatabases` (twenty-one) and `oneDatabase` (twelve of the fifteen; the
other three close over their own `local` and keep it). The bodies moved unchanged — a proof green before the move
is green for the same reason after it, which is why the move was made mechanically and verified by re-running
`part-j-proof` rather than by reading. About 430 lines of duplication went. **`launch` was deliberately NOT
extracted**: twenty-six scripts define one and twenty are genuinely different, so a common form would be a rewrite
of the evidence rather than a move of it, and the driver below removes the pressure that produced the variants.

**Every launch a proof starts itself is bounded (2026-09-29, R-067).** Each script still keeps its own `launch`; what
changed is the one call inside it. `spawnSync(electron|exe, …, { timeout })` stood at thirty-five sites in thirty-four
scripts (`terminal-proof/packaged.mjs` among them). ~~Its timeout could not end a launch: Node signals the child and
closes its ends of the pipes at the same moment, then waits for an exit without a bound.~~ That was true until the
application's EPIPE loop was repaired (2026-09-29); re-measured on 2026-09-30, the timeout does end the launch (SIGTERM,
and the quit path runs), but `spawnSync` then reports the overrun as `status` 0 with only `error.code` `ETIMEDOUT` to
show it, having closed the pipes before the quit path wrote, and every `launch` checked only `status`, so an overrun
passed as a clean exit with no log tail. Every one of them is now
`lib/bounded-launch.mjs`'s `spawnBounded` (SIGTERM with the pipes open and read, a grace, SIGKILL to the launch's process
group), and an overrun is a failure named by `overrunMessage` with the launch's last thirty log lines — thrown by a
`launch`, recorded as a failed check by `updater-proof`, `terminal-proof` and the packaged terminal launch, which report
rather than throw. The packaged section's checks threw on its other early return — a launch that found no workspace store,
which carried no `terminal` or `probe` field — and lost both launches' evidence until 2026-09-29; its checks are
`packagedChecks`, which reads either field absent or `null` as absent evidence
([note](../../defects/fixed/the-packaged-terminal-streaming-checks-throw-on-a-launch-that-found-no-store.md)). Each `launch` became `async` and each call site awaits it (`transcript-proof`'s `appendRun`,
`package.mjs`'s app step as `stepAsync`, and `terminal-proof/packaged.mjs`'s `packagedTerminalStreaming` with it).
`lib/launch-sites.test.ts` fails a `spawnSync` launch of Electron anywhere under `scripts/` (its rule 4), and a launch
with `ELECTRON_RUN_AS_NODE`, which starts no application, stays exempt
([note](../../defects/fixed/proofs-launched-through-spawnsync-cannot-end-an-overrun-launch.md)). Three launches that were
never `spawnSync`'s had bounds of their own that passed an overrun the same way or not at all, and are `spawnBounded`'s
since 2026-09-30: `fetch-proof`'s (a bare `child.kill()` at 150 s, whose SIGTERM the application answers with exit
status 0), `workspace-proof`'s hand-over launch (SIGTERM alone at 30 s, no log) and `mcp-console-spike`'s (no bound).
Since then the same test also fails a bare `spawn` of Electron outside three it names with their reasons: the driver's,
`code-intel-proof`'s branch (a stdio server guarded by its RPC client) and `live-run`'s `runElectron` (SIGKILL at its
bound, reported as a signal). And it checks each `spawnBounded` site, not each file, for its `.overran`.
Since 2026-10-07 (finacc3 A2-19) a launch ends with its whole process group: `spawnBounded` and the driver's `stopApp` and
`endLaunch` drain the group once the main process has exited (`drainGroup`: three seconds for it to leave by itself, then
SIGKILL, each straggler named on standard error), a driven launch leads a group of its own as a bounded one does
(`startApp`, `trackLaunch`), and a proof that exits or is signalled ends every live group. ~~`driver-proof`'s workspaces carry
`GIT_CEILING_DIRECTORIES` at the evidence directory, so the app's git no longer climbs into the checkout they lie in~~
([note](../../defects/fixed/a-proof-exits-while-processes-of-the-app-it-launched-still-run.md)) — false: the product deletes that
variable from every git invocation (REQ-GIT-031). Since fin34 the harness writes a `.git` file naming no repository at `.proof/`
when it is loaded (`barEnclosingRepository`), so no proof workspace below it reads the enclosing checkout, whichever proof
made it ([note](../../defects/fixed/proof-workspaces-under-the-checkouts-proof-directory-read-the-enclosing-repository.md)).

**The driver.** `apps/desktop/src/main/driver.ts`, reached only when `ROTARIS_DRIVER` names an endpoint file at
launch, opens a loopback listener and answers newline-delimited JSON: `waitFor`, `click` (by selector, optionally
by the name on screen), `type`, `chord`, `inspect`, `probe`, `eval`, `screenshot`, `resize`, `command` (relayed to
main's own `runCommand`, never around it) and `quit`. The client is `scripts/lib/driver.mjs`; `pnpm app:drive` is
the one-command-at-a-time CLI over it and `pnpm driver-proof` is its proof. Since 2026-09-28 the client also carries
`until` (a wait on a condition that is not one selector — a store row, an attribute), `choose` (either chooser kind: a
native `<select>` confirmed once the control shows the value, or the design system's `SearchableSelect` by two real
clicks) and `stopApp` (the closing picture and the quit, each within a bound, then SIGTERM, a grace and SIGKILL
through `lib/bounded-launch.mjs` for an application that does not exit, reported rather than absorbed), and `startApp`
ends a launch whose driver never answers before it throws (`lib/driver.test.ts`); `mcp-proof`'s launches 6 and 7 were
the first to use them.

**Why it exists, stated as the thing it replaces.** The sixty-seven `ROTARIS_CAPTURE_*` seams share one shape: a
step scheduled at a wall-clock offset, fired at whatever the window is showing then, read back by grepping the
log. That shape cannot wait, so every proof using it encodes a guess about how fast the machine will be. Three
recorded reds were that guess being wrong and nothing else — `git-proof` probing 1.2 s after a create still in
flight is the clearest, and the 2026-09-08 sweep's "three of the four were measurement defects" is the same
disease in its other form. `waitFor` is the whole mechanism; the rest of the ops are what replies made possible.
The first run reports what the wait was worth rather than asserting it: the shell arrived **411 ms** after the
connection, a number no fixed offset could have known.

**A secret per launch, and why.** The listener carries an `eval` that runs script in a window the user may have
signed into, so a request without the per-launch secret written into the endpoint file is refused and the
connection dropped. The proof asserts both halves — the refusal, and that the refusal does not take the window
down with it.

**What the first execution found.** The endpoint file **outlived the process it described**. Cleanup hung on
`app.on('will-quit')`, and `app.exit()` — how the `quit` op ended the process until 2026-09-29 (it is now the
immediate exit the op sends only when asked; see below), and how every capture seam beside it ends one — emits neither
`will-quit` nor `quit`. The next `pnpm app:drive` command therefore read a live-looking
port nothing was listening on and failed with a connection error where it should have said "no app is being
driven". The falsified assumption is kept beside its replacement in `driver.ts`: an Electron exit path is not one
path, and a cleanup that matters is called by the op that knows it is ending as well as hung on the event that
usually fires. Fixed, re-run, fourteen checks green.

**Not a row in `first-executions.md`, and the reason is checkable.** That register is for a mechanism **the
architecture record decided**; no ADR decided this one, and its own tail excludes proof and harness findings on
exactly that principle. If the driver is later given an ADR — the open question is whether a verification seam of
this reach deserves one — its first execution is recorded here and the register would point at this section.

**The seams stop shipping — the same day.** Until now the packaged application compiled the whole capture surface
in, gated on an environment variable **at launch**: about 240 lines of main that could click, type and evaluate
script in a window the user had signed into, available to anything that could set a variable in the app's
environment. The gate is now at **build time**. `electron.vite.config.ts` defines `__ROTARIS_SEAMS__`;
`scripts/package.mjs` builds with `ROTARIS_BUILD=package`, which makes it false, and rollup removes every branch
behind it — the scripted clicks, the typed text, the chords, the renderer `eval`, the notices, the drags, the OS
input, the persona seams, the theme proof's whole capture pass, and `driver.ts` in its entirety. What survives is
the three the packaged probe itself drives (`ROTARIS_CAPTURE_PNG`, `_PROMPT`, `_AFTER_MS`). Main's bundle goes from
325,694 to 273,691 bytes. **An environment variable cannot turn the seams back on in a binary built without them**,
which is why the gate is a build-time constant and not a run-time check.

`package.mjs` asserts it on the artifact rather than on the source — **the seam check**, deliberately un-numbered
because ADR-0056's five rules are the native-module obligation and its own rule 5 is a different subject. The
reasoning is rule 1a's: a `define` that stopped being applied, or a guard someone moved outside the block, would
leave the surface in the product and change nothing a source reading would notice.

**What that check found, immediately, in its author's own work.** The first attempt guarded the `if` and not the
environment **read**, so `const proofDir = process.env['ROTARIS_THEME_PROOF_DIR']` and the driver's endpoint read
survived into the shipped bundle with their variable names. Both reads are behind the flag now. The check failing
its author before it ever failed anyone else is the argument for having written it as an assertion about the
artifact.

**Its lists live in `apps/desktop/scripts/lib/seam-check.mjs` since 2026-10-14** (fin43): the check is one function there,
which `package.mjs` calls and which runs alone over a seam-free `out/main` (`node apps/desktop/scripts/lib/seam-check.mjs`).
Until then its `forbidden` list named none of main's dialog answers — the hook review's press, the message boxes', the
choosers' — which were read behind the run-time `capturing` test alone and shipped
(`docs/defects/fixed/a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md`). Two tests now hold the source and
the list together: `apps/desktop/src/main/capture/seam-reads.test.ts` (every capture read in main carries the flag on its line,
the probe's own excepted, and so does every other `ROTARIS_*` read but ADR-0059's `ROTARIS_CIRCUIT_BREAKER`: the rows proof's
`ROTARIS_ROWS_PROOF` and the initialization proof's `ROTARIS_INIT_TEST_TASK` were found unguarded at review) and `apps/desktop/scripts/lib/seam-check.test.ts` (every flagged read in main, the run host and the
workspace service is named by the list). `vitest.config.ts` defines the flag `true`, as the ordinary build does. *Owed until 2026-10-14, then repaired by fin44:* the packaged probe's `_WAIT`, `_WAIT_MS`, `_END_VIEW`, `_END_VIEW_MS`, `_PROBE` and
`_PROMPT_MS` and the children's `_SKILLS_HOME` and `_INSTRUCTIONS_HOME` now sit behind the flag too, the list names them, and
`seam-check.test.ts` fails any capture variable read off the flag in a module a packaged build keeps, the probe's three aside
(`docs/defects/fixed/a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md`). *Repaired by fin45 the same day:* the
scripted model client's variables — the dialect switch and the twelve script variables, read in the run host with no flag —
are behind it too, the list names them, and `seam-check.test.ts` fails any `ROTARIS_*` read off the flag in a module a packaged
build keeps unless it is a product variable or one of the probe's three (`docs/defects/fixed/a-packaged-build-still-answers-the-scripted-model-clients-variables.md`). *Since 2026-10-15 (fin46)* its rules read a variable in every form a read takes — the bracket and dot forms, a read keyed by a
string constant of the app's or the packages' sources, and a destructured environment — where until then they read
`env['ROTARIS_X']` alone (`docs/defects/fixed/the-seam-checks-source-test-reads-only-the-bracket-form-of-a-variable-read.md`).
*Built by fin46 the same day (OQ-312, ruled under R-072 with no directive):* the scripted client itself does not ship. `host.ts`
builds it only behind the flag, so rollup leaves `scripted-client.ts` out of the packaged `run-host.js`; `isScriptedProvider` answers
a `provider: scripted` entry with it only where the seams are compiled in; the list names the client's own log line
(`scripted model call:`); and rule 4 (b)'s launch runs against a loopback OpenAI-compatible stub `package.mjs` starts itself
(`scripts/lib/stub-model-endpoint.mjs`), reached through the shipped `AiSdkModelClient`. *(Until then a packaged build's scripted
provider — rule 4 (b)'s launch — answered with a fixed `PACKAGED_SCRIPT`;
`docs/defects/fixed/a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md`.)*

**A trap closed on the way:** `pnpm package` leaves `out/` holding the seam-free build, and every `*-proof` script
launches `out/main/index.js` and drives those seams — so the next proof run after a package would have failed for a
reason nobody would have guessed from its output. The script now says so on exit — since 2026-09-27 only when the
build ran (`docs/defects/fixed/pnpm-package-announced-a-seam-free-build-it-had-not-made.md`).

Verified on 2026-09-11: `pnpm package` (`ROTARIS_PACKAGE_DIR_ONLY=1`) **PASSED** in 277 s with the seam check as
its fourth step — rule 1a and rule 4 holding as before, and the packaged app, built without the seams, opening a
store and settling a terminal call at store v15; `driver-proof` 14/14 and `part-j-proof` green against a normal
build afterwards.

**What the driver found the day it was built — the eighty-second, eighty-third and eighty-fourth defects.** The
owner opened the Workspace view maximized and asked whether a layout fault could be seen. It could, and the seam
turned "it looks wrong" into three named faults in about twenty minutes, two of them in code that had shipped for
weeks and appeared in every wide-window screenshot any proof had ever taken.

**The eighty-second — a dead class name winning on specificity.** `shell.css` carried
`.workspace:not(.workspace--with-agents):not(.workspace--narrow)` for "the workspace with no agents column", and
**`workspace--with-agents` is set nowhere in this codebase**. Three class selectors (0,3,0) therefore beat
`.workspace--with-sidebar` (0,1,0) on the very element that rule was written for, so the two-column template won in
every wide window while `.agents` kept `grid-area: agents` — a name that template does not declare. A named area
that does not exist is not an error: the browser invents implicit tracks for it. Measured, `.workspace` computed to
**four columns and seven rows against a two-by-five template**: at 1920×983 a 259 px column and a 167 px row of dead
space with the agents pane stranded where they crossed; at 1000×680 the invented tracks overflowed the box by 144 px
and pushed the composer, the inspector and the agents pane past the bottom of the window, **taking `Start run` with
them**. The rules are removed rather than repaired, with the falsified reason kept where they stood.

**The eighty-third — a breakpoint that worked once and never again.** `useNarrow` built its `MediaQueryList` during
render, and `matchMedia` returns a NEW object on every call, so the effect's dependency changed on every render and
the listener was torn down and re-attached continuously; `matches` was read only to seed the state. A `change`
delivered while nothing was attached was therefore lost **for ever**. At 1000 px wide the query reported `true`
while the component still rendered the wide layout — at the exact size **REQ-MONITOR-051** says the workspace must
remain usable. A listener armed by hand in the same window received the event, which is what cleared the platform
and convicted the hook. The list is made once now, and the effect re-reads `matches` when it attaches: state written
only by an event cannot recover from one that never arrives.

**The eighty-fourth — in the driver itself.** Its `resize` op called `setContentSize`, which is a **no-op on a
maximized window**, and returned the unchanged size as though it had worked; a three-size sweep was measured at one
size and read as three. It leaves the maximized state first now, and refuses loudly when the host will not give the
size asked for.

**The eighty-fifth — a modal painted under the composer, and the repair of the eighty-second is what reached it.**
`chat-controls-proof` went red on the corrected layout and green without it, so the layout repair was the suspect;
driving the app to the dialog and asking the document what was at the confirm button's own centre answered it
otherwise. The button's box was right, the backdrop was correctly `position: fixed; inset: 0` over the whole
viewport, no ancestor carried a transform or a `contain` — and `document.elementFromPoint` at that centre returned
**the composer's textarea**. The design system's `.dialog-backdrop` carries no `z-index`, and the dialog is
rendered from the transcript toolbar, an EARLIER grid item than the composer; a later sibling therefore paints over
an application-modal dialog. Removing the dead row moved the composer down across the button, and what had been
operable by luck stopped being operable at all. **This is a defect of the product, latent since the dialog was
built and shared by every `ConfirmDialog` in it** — not of the repair that exposed it. `shell.css` lifts the
backdrop to 50, above the slash popup and the artifact inspector and below the acknowledgement toast, in the same
place the session browser's backdrop was already lifted for the same reason.

The lesson it carries is the one this whole day is about: **a presence assertion cannot see a stacking defect**.
Every proof that touched this dialog asserted that it was there, that its text was verbatim and that its buttons
were named — and the one that clicked it did so through a seam that reports "clicked" whether or not anything
received the click.

**`pnpm layout-proof` is the assertion whose absence let all this live.** Nothing had ever asserted that the grid a
stylesheet DEFINES is the grid the browser BUILDS. It measures the Workspace at 1400×900, at REQ-MONITOR-051's
1000×680 floor and maximized, and asserts: no implicit tracks (computed track count against declared area count),
every child's `grid-area` naming a declared area (the cause, not the symptom), nothing leaving the window with the
run control checked by name, the rows fitting their box, and the narrow layout engaging **after a live resize**
rather than at startup — which is the one form in which the eighty-third defect is visible. Run before the repair it
failed **thirteen of seventeen**; after it, seventeen of seventeen. Two more checks came with the eighty-fifth —
the modal's hit test and its confirmation — and the second of those failed on its own first execution against
correct behaviour, asserting an empty transcript where the product had legitimately rewritten the record under a
live run. The assertion is the user row's absence now, and the reason is kept beside it.

**The quit and the shot, repaired (2026-09-29, R-067).** Two claims this section made by omission were falsified by
use. *The `quit` op ended the process the way a person's quit does*: it did not — it was the immediate exit
(`exitCleanly`), which asks the run host nothing, so a driven quit during a live run left the session `running` with no
stop reason, as a crash does (phase 7's rehearsal of `PD-ORCH-005`, and the duress live run's deadline quit through the
capture seam's same exit; re-measured on the build before the repair: `running`, `stop_reason` NULL). `quit` now sends
`app.quit()` — the close guards, then `window-all-closed`'s `shutdown` — and the seam stays up until `will-quit`, so a
quit a close guard keeps can still be seen and answered; `{ immediate: true }` (`pnpm app:drive stop --crash`) is the old
exit, kept for a drive that means to leave a crash. A capture whose wait timed out ends through the same quit
(`CaptureHost.quit`), one whose wait was satisfied by the immediate exit as before. *A shot shows the window as it
is*: `capturePage()` copies the frame last submitted, and straight after the first navigation to the Workspace it
returned the Overview's bytes although the document already showed the Workspace — in 16 launches of 20 after one
frame, 12 of 52 after two, 1 of 20 after three with three cores busy, none of 55 after four. `screenshot` now waits
four of the renderer's frames (`PAINT_FRAMES`), bounded at 1 s for a window that presents none, and says in its reply
whether the paint was confirmed; `theme-proof`, which measured a view's texts and then shot it, now reads the texts on
both sides of the shot and retakes it until they agree, because a surface mounting in those four frames (the startup
notice) moved the picture away from the metadata. `driver.test.ts` and `capture/probe.test.ts` pin both; `driver-proof` adds a live run
quit through the driver (the session at rest, `application_shutdown`) and shots straight after each navigation. The
register row is in `first-executions.md`
([`the-drivers-quit-skips-the-applications-shutdown.md`](../../defects/fixed/the-drivers-quit-skips-the-applications-shutdown.md),
[`the-drivers-shot-can-return-a-stale-frame.md`](../../defects/fixed/the-drivers-shot-can-return-a-stale-frame.md)).

**The windows beside a main window (2026-09-29, R-067).** A4 gave the driver main windows and nothing else, so the
revision 4 drive read persona windows' `paused` state from X11 captures and answered approvals through
`session.control` rather than in their dialog. A selector may now name a role — `persona:<persona>`, `approval`,
`terminal` — resolved over `DriverDeps.auxiliary`, which main fills from each main window's registries; `windows`
lists them, and a selector naming no open window is refused with what is open. The per-request `window` A4's comment
promised was read by no op until now; each op resolves `request.window ?? selected`. `pnpm app:drive` gains
`useWindow` and `--window=`. `driver.test.ts` pins the resolution; `driver-proof`'s second launch answers both of its
run's approvals with the dialog's own button and probes the child's persona window
([`the-driver-cannot-address-persona-or-approval-windows.md`](../../defects/fixed/the-driver-cannot-address-persona-or-approval-windows.md)).

**A click known to have landed (2026-10-06, acceptance finding A3).** `click` measured once and pressed at that box's
centre, and nothing read what the press met: driver-proof's 13c lost its Pop out when the provider notice filled the
notice slot between the measurement and the press and moved the Mission table 75 px down. `click`'s `settle` presses
only once the box has held across two of the renderer's frames and the element at its centre is the match, then reads
what a one-shot `mousedown` listener saw and refuses a press that met something else; `scripts/lib/driver.mjs`'s
`clickLanded` presses again only after such a refusal; 13b and 13c open the persona window that way on the child's own
row, and a press that landed and opened nothing fails as REQ-SHELL-072's. `driver.test.ts` and `scripts/lib/driver.test.ts`
pin it ([`driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md`](../../defects/fixed/driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md)).

**What is still owed.** No existing proof has been rewritten onto the driver — the protocol is proved by its own
proof and not yet by a migrated one. And the strip covers **main only**: the renderer bundle still carries Part AA's
`rows-proof` role, which is a fixture surface with no input injection, named here so its survival is a decision
rather than an oversight.
