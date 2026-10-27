# ADR-0056 — The build toolchain — Fourth execution — 2026-09-11, the seams stop shipping, and the build is made to say so

Part 9 of 10 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

## Fourth execution — 2026-09-11, the seams stop shipping, and the build is made to say so

The build gained one assertion and one flag, and ran end to end under both.

**The flag.** `electron.vite.config.ts` defines `__ROTARIS_SEAMS__`, and `scripts/package.mjs` builds with
`ROTARIS_BUILD=package`, which makes it false. Rollup then removes every branch behind it from main's bundle: the
scripted clicks, the typed text, the chords, the renderer `eval`, the notices, the drags, the OS input, the persona
seams, the theme proof's whole capture pass, and `apps/desktop/src/main/driver.ts` in its entirety. What survives is
the three seams this script's own packaged probe drives — `ROTARIS_CAPTURE_PNG`, `_PROMPT`, `_AFTER_MS`. Main goes
from 325,694 to 273,691 bytes.

Until this ran, the shipped binary carried the whole surface, gated on an environment variable **at launch**: about
240 lines able to click, type and evaluate script in a window the user had signed into, reachable by anything that
could set a variable in the app's environment. A build-time constant is the difference between a surface that is
switched off and a surface that is absent, and only the second survives an attacker who controls the environment.

**The assertion — the seam check, and why it carries no number.** After the build, the bundle is read and asserted
to contain the probe's three names and none of the scriptable ones. It is deliberately **not** numbered into N3's
five rules: those are the native-module obligation and rule 5 there is a swallowed failure at runtime, so calling
this one "6" would imply an amendment to a set it does not belong to. Its reasoning is rule 1a's, though, exactly: a
`define` that silently stopped applying, or a guard moved outside the block by a later edit, would leave the surface
in the product and change **nothing that a reading of the source would notice**. The artifact is the evidence.

**What it found.** Its author's own first attempt. The guards were placed on the `if` and not on the environment
**read**, so `process.env['ROTARIS_THEME_PROOF_DIR']` and the driver's endpoint read survived into the shipped
bundle, names and all, with only their bodies removed. The check refused the build; both reads went behind the flag;
the second run passed. This is a defect of the change being made, not of the toolchain — **the toolchain's count
stays at four** and this is not a fifth.

**The run.** `ROTARIS_PACKAGE_DIR_ONLY=1 pnpm package`, **PASSED in 277 s**: the code-intelligence bundle and its
manifest check, the seam-free `electron-vite build`, the seam check at 3 ms, `electron-builder --win --dir` at 246 s
(the cold rebuild of both bindings inside it, 190 s, "which is not evidence of anything" as rule 1a says), rule 1a on
five compiled binaries, the bundled runtime answering Python 3.13.15 from inside the artifact, rule 4 loading two
files from `app.asar.unpacked` at SQLite 3.53.4, and the packaged application — built **without** the seams — opening
a store at v15 and settling a terminal call. Nothing in rules 1a or 4 moved.

**Owed, and named so it is not mistaken for done.** The strip covers **main only**. The renderer bundle still carries
Part AA's `rows-proof` role; it is a fixture surface with no input injection, and leaving it is a decision recorded
here rather than an oversight. A second trap was closed on the way: this script leaves `out/` holding the seam-free
build, and every `*-proof` launches `out/main/index.js` expecting the seams, so it now says on exit that `pnpm build`
must come before the next proof. *Since 2026-09-27 it says so only when the build ran: a run refused before
`electron-vite build` had left `out/` as it was and said otherwise
(`docs/defects/fixed/pnpm-package-announced-a-seam-free-build-it-had-not-made.md`).*

> **2026-10-13, plan fin42 — the list above was not the whole surface.** "Rollup then removes every branch behind it …
> the scripted clicks" held for the seams behind the flag, but one scripted click in main was never put behind it: the
> approval dialog's answer (`ROTARIS_CAPTURE_APPROVAL`, read in `presentNext` behind the run-time `capturing` test alone),
> which can press "Approve for this session" in a permission dialog. A `ROTARIS_BUILD=package` build of `6de2a67` carried the
> name in `out/main/index.js`, and the seam check passed because its `forbidden` list did not name it. The reads now sit
> behind the flag and the check names them
> ([`../../../defects/fixed/the-approval-dialogs-scripted-answer-survives-a-packaged-build.md`](../../../defects/fixed/the-approval-dialogs-scripted-answer-survives-a-packaged-build.md)).
> The rest of main's dialog answers read behind `capturing` alone are recorded, not repaired:
> [`../../../defects/fixed/a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md`](../../../defects/fixed/a-packaged-build-keeps-capture-seams-that-answer-mains-dialogs.md).

> **2026-10-14, plan fin43 — the rest of main's seams.** Twenty-two reads in main — the hook review's press, the pause
> window's and every message box's answer, the backup, restore, export, directory and skill-file choosers' paths, the
> provider dialog's fill, the external-link swallow, the stale question answer, the subscription's delay and hold, the
> theme, the scale, the network log and the resume timing — sat behind `capturing` alone, and a `ROTARIS_BUILD=package` build
> carried twenty of their names in `out/main/index.js`; the bundle's review found two more not named `ROTARIS_CAPTURE_*`,
> `ROTARIS_ROWS_PROOF` (behind `capturing` alone) and `ROTARIS_INIT_TEST_TASK` (behind nothing), repaired the same way. Each read now carries the flag on its own line, the seam check's lists
> live in `scripts/lib/seam-check.mjs` and name them all, and two tests hold source and list together
> (`main/capture/seam-reads.test.ts`, `scripts/lib/seam-check.test.ts`); the same build then carries none, and the check
> passes over it. **Still owed:** the packaged probe answers more than its three variables, and the run host and the workspace
> service read two home-directory seams with no guard
> ([`../../../defects/fixed/a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md`](../../../defects/fixed/a-packaged-build-still-answers-capture-variables-beyond-the-probes-three.md)).
>
> **2026-10-14, plan fin44 — the owed rest.** Repaired: the packaged probe's six verification seams (`_WAIT`, `_WAIT_MS`,
> `_END_VIEW`, `_END_VIEW_MS`, `_PROBE`, `_PROMPT_MS`) and the children's two home seams are read behind the flag, the seam check
> names them, and `seam-check.test.ts` now holds the converse too: a capture variable read OFF the flag in any module a packaged
> build keeps fails unless it is one of the probe's three. A `ROTARIS_BUILD=package` build then carries `_PNG`, `_PROMPT` and
> `_AFTER_MS` alone. One thing the first such build taught: a JSDoc comment survives into the bundle, so a seam's full name
> written in a doc comment of a module a packaged build keeps is a name the check finds; `probe.ts`'s comments name the seams
> by their suffixes.
>
> **2026-10-14, plan fin45 — the scripted model client's variables.** The seam check named only capture variables, and the run
> host read the dialect switch (`ROTARIS_MODEL_DIALECT`: every model of every run answered by the stand-in, no credential asked)
> and twelve script variables with no flag, so a packaged build answered them all while the check passed
> ([`../../../defects/fixed/a-packaged-build-still-answers-the-scripted-model-clients-variables.md`](../../../defects/fixed/a-packaged-build-still-answers-the-scripted-model-clients-variables.md)).
> Each is read behind the flag now, the list names them, and `seam-check.test.ts` holds every `ROTARIS_*` read off the flag in a
> module a packaged build keeps to the product's own seven and the probe's three. Rule 4 (b) keeps running on the scripted client:
> its launch names the `scripted` provider in the scratch workspace's configuration, sets no model or script variable, and the
> packaged build's client answers with one fixed `git status` call (`PACKAGED_SCRIPT`). Whether a person's configuration may
> select that client in a shipped build is OQ-312. The first seam-free build taught the JSDoc lesson's sibling: a string literal
> in a log line survives too, so the tool step's log no longer spells its variable.
>
> **2026-10-14, plan fin46 — rule 4 (b) proves the shipped model client (OQ-312, ruled the same day under R-072 with no
> directive).** The consortium ruled that a packaged build answers no `provider: scripted` entry: the scripted client is
> compiled out with the other verification seams, and a `scripted` entry with no `base_url` gets the refusal any provider the
> build knows no endpoint for gets (REQ-EVENTS-021/019). `host.ts` now builds the client only behind the flag, so rollup leaves
> `scripted-client.ts` out of the packaged `run-host.js`; `configuration.ts`'s `isScriptedProvider` answers the provider with it
> only where the seams are compiled in; `PACKAGED_SCRIPT` is gone; and the seam check names the client's own log line
> (`scripted model call:`). Rule 4 (b)'s launch is re-based on a loopback OpenAI-compatible stub `package.mjs` starts itself
> (`scripts/lib/stub-model-endpoint.mjs`, 127.0.0.1, a port the system picks), configured as `provider: openai` at the stub's
> `base_url` with a placeholder key, which the packaged application reaches through `AiSdkModelClient` exactly as it reaches a
> person's provider. The step keeps its store assertions and adds one: the stub served at least one tools request and sent its
> `git status` call. **The reason it ran on the scripted client, kept beside its replacement:** rule 4 (b) needed "a model that
> makes one terminal call without a provider, a key or a network", and the stand-in was the one at hand; that reason held, but it
> made the packaged build ship the stand-in and answer a person's `provider: scripted` entry with it
> ([`../../../defects/fixed/a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md`](../../../defects/fixed/a-packaged-build-answers-a-scripted-provider-entry-with-the-scripted-client.md)).
> A loopback stub needs no provider, key or external network either, and it measures the client that ships. **First execution
> (Linux, load 3 to 5):** a `ROTARIS_BUILD=package` build's `out/main` carries no `scripted model call:` and the seam check reads
> PASS (the same build of the unrepaired source reads FAIL, `scripted model call: (run-host.js)`); rule 4 (b)'s launch shape run
> against that `out/main` under `xvfb-run` — `package.mjs` itself is Windows-only — recorded one session `completed` and one
> `terminal` call settled `ok`, the window photographed, with the stub serving five requests (three classifications, two tools
> requests, one terminal call) and no scripted model call in the log; the old configuration (`provider: scripted`, no
> `base_url`) against the same build started no session and logged "No usable model is configured for the entry role … (provider
> scripted) has no base_url and this build knows no endpoint for that provider". `pnpm package`'s own run of the re-based step is
> owed to the next Windows package (a Windows x64 host, deferred with the release pipeline under R-071; IC-3 binds Linux and macOS
> artifacts).
