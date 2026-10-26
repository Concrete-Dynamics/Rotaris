# ADR-0035 — The bundled code-intelligence runtime: an argv pass-through and a build-generated manifest — First execution — 2026-09-06, Part T (the two spikes, the bundle, the branch, the manifest, the client's owed halves, the setup) (continued)

Part 8 of 10 of [ADR-0035](../0035-the-bundled-code-intelligence-runtime.md), which indexes every part.

**The fix round, 2026-09-29.** The whole proof was run three more times, and run 2 went red in section 5's
`setup-again`. The product was not at fault. The open's `No model provider is authenticated yet` notice, raised at
the 800 ms slot, landed at the same instant as the capture seam's fixed-time press on the `MCP Servers` category. It
moved the list two rows, so Settings opened on Instructions and Start was never on screen. The setup launches now wait
for what they press. Start is pressed once it is drawn enabled, Cancel once it is drawn, and `MCP Servers` is pressed
again at 3 s and 6 s if it is not selected
(`../../../defects/fixed/code-intel-proofs-setup-launches-press-at-fixed-offsets.md`). The shared seam's press stays as
it is, and its note stays open, since nine other proofs use it
(`../../../defects/fixed/the-capture-seams-settings-category-press-can-be-deflected-by-a-notice.md`). *(Reported back 2026-09-30 under R-067: the seam's press is now verified — read
again and pressed again until the category carries `is-selected`, or logged as never selected at 5 s — and the note is
repaired.)* With the correction
forced (the seam pointed at Instructions), section 5 passed. The whole proof then passed three runs in a row (522 s,
521 s, 524 s), with another agent's proofs sharing the host in two of them. In one launch the banner deflected the
seam's press again, and the correction put Settings back. *(Corrected by the next section: that correction did not hold, and the
three runs in a row were not what the branch does.)*

**The second fix round, 2026-09-29.** The verifier ran the same build seven times (three whole, four `--steps=5`) and
`setup-cancel` went red three times, always the same way. Start was pressed at the instant of the notice and of the
seam's category press. The seam's press, read before the notice and delivered after it, moved Settings to a category
above, so Cancel had left the screen when it was pressed, and the press gave up. The 3 s correction came after `create`
had already succeeded (about 1.8 s), and there was nothing left to cancel. The product was again not at fault. The
setup launches now leave the shared seam alone. They open Settings with the `Ctrl+7` chord, and every press, the
category's included, waits until the notice has been drawn (`body:has([data-testid="notice"])`), so no point is read
before the launch's one layout shift. No assertion changed
(`../../../defects/fixed/code-intel-proofs-setup-launches-press-at-fixed-offsets.md`, reopened and repaired again; the
seam's note stays open). **Measured** as root under Xvfb, Node 24, `--skip-build`: four `--steps=5` runs in a row
passed (238 to 242 s). All 20 setup launches pressed Start 31 to 123 ms after the notice, and all four `setup-cancel`
launches pressed Cancel while `create` ran and read `Cancelled`. Then three whole runs in a row passed (529 s, 528 s, 524 s), with another agent's proofs on the host for parts of
all three: Start 41 to 128 ms after the notice in all 15 setup launches, Cancel pressed and `Cancelled` read in each
`setup-cancel`, the window check recorded not measured on linux, and the drift refused. **What it could not show:** anything on
Windows; the packaged branch and section 7 (IC-3 — *corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts*), as before.
*"Not measured: Windows" reported back 2026-10-21 (the Windows ARM64 session's F2):* the development half ran there, three whole runs green, the setup launches among them (below, "The proof on Windows 11 ARM64"); the packaged branch and section 7 are still owed.

**The setup at the run host's shutdown, and what a step started (2026-10-01).** REQ-MCP-099's termination (ask, 5 s
grace, force-kill) reached only the step itself on POSIX. `child.kill` signals one process, and the step was spawned
without a process group, so a process the step had started outlived its cancellation. The run host's `shutdown` never
reached the setup at all: the host exited with the step running, and the step and what it had started were orphaned.
REQ-WORKSPACE-092 says nothing the step launched, "neither the command the step itself started nor anything descended
from it", may still run 5 s after a cancellation or after the application closes
(`../../../defects/fixed/an-orderly-quit-during-the-background-setup-warns-its-cancellation-could-not-be-delivered.md`).

Each step now leads a process group of its own (`processGroup`), and the ask and the force-kill go to the group. The
grace ends when no member of the group still runs; a zombie that nobody reaps does not count, because a container's pid 1
may never reap one. The run host's `shutdown` calls `McpHost.endSetup`: the step is stopped as a cancellation is, but
with a 2 s grace (`SETUP_SHUTDOWN_GRACE_MS`, the build's figure inside REQ-WORKSPACE-109's 5000 ms close), and that
grace also shortens a cancellation's grace already under way. The host exits only once the step has gone. Windows keeps
`taskkill /T`. At an orderly quit the window's close cancels the run a few milliseconds before the shutdown arrives, so
REQ-MCP-099's 5 s cancellation grace is never given at a close: the build reads REQ-WORKSPACE-109's 5000 ms and
REQ-WORKSPACE-092's 5 s as binding there, a conflict between the requirements raised as
[OQ-172](../../open-questions.md) (2026-10-01, on the verifier's finding).

*Ruled 2026-10-06 ([R-071](../../../product/requests.md#r-071)): the owner took OQ-172's recommendation, and
[`PD-MCP-003`](../../../product/directives/pd-mcp-003.md#pd-mcp-003) gives every stop of a step the same 2 s grace — a Cancel, a
workspace switch's cancellation and an exhausted budget as well as the close. `SETUP_TERMINATE_GRACE_MS` is 2 s and
`SETUP_SHUTDOWN_GRACE_MS` equals it, so the 5 s cancellation grace this round kept outside a close is gone; it had left a
switch's step running 5.489 s and a Cancel's 5.603 s on Windows (`workspace-proof`, 2026-10-02). Pinned in
`packages/mcp/src/setup.test.ts`, red on the 5 s before it.*

**Measured** on the built app at an orderly quit (`driver.quit()`), as root under Xvfb, Node 24, with two kinds of step.

A stand-in `code_intelligence` launch held `project create` and started a descendant. On the build before, both were
still running 5 s after the application exited, which took 169 ms. With the repair:

- a step that ends on SIGTERM: both were gone, and the quit took 419 ms;
- a step and descendant that both ignore SIGTERM: both were force-killed, and the quit took 2234 ms.

The bundled runtime, quit during `index` on a 400-file Python project: its sentinel and Python process were gone 5 s
later on the build before as well. ~~The runtime ends itself when its pipes close, so the bundled runtime alone never
showed the defect.~~ With the repair the quit took 473 ms and nothing was left.

*Corrected 2026-10-15 (fin47, acceptance finding A5,
[`settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md`](../../../defects/fixed/settings-proofs-no-workspace-launches-open-the-repositorys-apps-desktop-and-index-it.md)):*
the struck sentence is falsified for an index that pyright serves. Two `settings-proof` launches at `3c03287` ended
through the capture seam's immediate exit, which kills the run host without its `shutdown`, while the runtime indexed
`apps/desktop`. The serena `python3` process and `uv` / `pyright-langserver` were still running more than 6 s after the
application's group had ended, until the harness ended them with SIGKILL. The measurement above was taken
through the orderly quit, while the step was still spawned undetached. Why nothing was left then was not measured, and
it does not show that the runtime ends itself. The orderly quit is unaffected: the run host's `shutdown` ends the setup. A run host that ends without it leaves the step,
in its own group and session, running. That is OQ-169's ruled case (PD-WORKSPACE-006).

Unit cases: two in `packages/mcp/src/setup.test.ts` (descendant ended with the step; shutdown grace shortening a
cancellation's), both red on the code before; one in `apps/desktop/src/run-host/mcp.test.ts` for `endSetup`; one in
`apps/desktop/src/run-host/dispatch.test.ts` (added on the verifier's finding) that `shutdown` ends the setup before it
closes a store or schedules the exit, red with the call replaced by `Promise.resolve()`. `workspace-proof` scenario 8f
(added on the same finding) quits the built app in order while a stand-in step and a process it started both ignore
SIGTERM, and asserts the quit ends within 5000 ms through the shutdown ending the setup, with neither process running 5 s
after the exit; on the build with the call replaced it failed (quit in 138 ms, both pids still running). `init-proof`
passed all five scenarios with the bundle present, and `workspace-proof` passed (44 passed, 0 failed, 2 skipped; with 8f,
46 passed, 0 failed, 2 skipped). **Not measured:** Windows; a run host killed by a signal, whose step's group still
survives it (OQ-169); a step that exits by itself and leaves a process it started running in its group: `endSetup`
reaches only a step still running, so at a quit nothing ends such a process (the fixed note's "Not reached").
*Windows, 2026-10-20 (the Windows ARM64 session's B8; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `9f898a00`): measured. Scenario 8f quit the app in 2,706 and 2,713 ms,
both processes gone 5 s after the exit, in two `workspace-proof` runs (49 passed, 0 failed, 5 skipped each); "Windows keeps
`taskkill /T`" holds as the ask, which neither stand-in answers, so `/T /F` after the 2 s grace is what ends them. The
5.489 s and 5.603 s misses read 2.441-2.604 s from request to stopped step under PD-MCP-003. Still not measured there: a run
host killed by a signal (OQ-169).*

**The manifest carries the product's own words for one tool — 2026-10-06 (fin21; `PD-MCP-001`, the owner's ruling of OQ-115
under R-071).** The manifest was the runtime's answer and nothing else; it now also carries `productDescriptions`, written by
the product and keyed by capability, which `manifest.mjs` holds beside the tier map and checks only to name a capability of
the tiers (the runtime is not asked for them, so `--check` still compares a fresh generation byte for byte). The one entry is
the usage-instruction tool's, whose own description told every agent to read the manual first, so each did and re-sent its
7,000-plus characters with every later request (live-run finding L8). `filterServerTools` puts the product's text on the
bundled server's tool, so REQ-MCP-101's section and the tool definition both read it; the tool keeps its place in the read
tier. Regenerated against the bundled runtime here (serena-agent 1.7.0, Python 3.13.15, 24 tools listed), and
`code-intel-proof`'s discovery step asserts the section carries the product's sentence and not the runtime's imperative.

**The manifest carries a warm-up the runtime did not answer — 2026-10-14 (fin43; `PD-MCP-004`, OQ-273 ruled 2026-10-13 under
R-072).** *The reading this replaces, kept beside it:* the product drove the runtime as it is — every call forwarded as the
model made it and the runtime's result taken as the call's effect (OQ-273's "what the build proceeds under"), and the manifest
"**is** the runtime's answer" (the Decision above). Both were falsified for one capability by `code-intel-proof`'s eleventh
launch (fin42): the pinned runtime (serena-agent 1.7.0) answers a symbol rename before its TypeScript language server has loaded
the project, and renamed the declaring file alone while saying it succeeded. The manifest now also carries `warmUps`, a product
choice keyed by capability (the rename warmed by the referencing-symbol search, with the two arguments they share), which
`manifest.mjs` checks against the server's listing as strictly as the tiers (`warmUpRefusals` in
`scripts/lib/code-intelligence-warm-ups.mjs`: both tools listed, both arguments in both input schemas, or no module is written),
so an upstream rename still fails a build. The run host's MCP executor sends the search before every rename to the bundled server
and discards it, inside the rename's one allowance. Regenerated here against the bundled runtime (24 tools listed, `--check`
equal); `code-intel-proof` launches 10 and 11 green at load 0.7 to 2.7 on four CPUs (launch 11: "(2 changes applied)", both files,
no search row, 37.6 s), and launch 11 red with the warm-up switched off in the same build ("(1 changes applied)", the declaring
file alone). **Revisit with every pin change:** the warm-up rests on the runtime's internals, so a later pin may make it
unnecessary or insufficient; launch 11 is its acceptance gate and is re-run whenever `pins.json` moves.
*Found insufficient 2026-10-15 (fin47), the same pin:* the warm-up helps only where a `tsconfig.json` or `jsconfig.json` covers the
files. In a workspace with none (the live run's `todo-app` fixture, a Vite React shape) the TypeScript language server holds only
the open files, the runtime opens the declaring file alone, and the search answers `{}`: the live `rename` scenario at `3c03287`
renamed one file of three. The remedy is open as [OQ-362](../../open-questions/65-spikes-and-later-questions-32.md#oq-362); `code-intel-proof` launch 13
(`child-rename-cold-js`) is red on it until a ruling is built, and joins launch 11 as a gate re-run on every pin change.
*Revision 2, built 2026-10-20 (loc1, `loc1-rename`; `PD-MCP-004` revision 2, OQ-362 ruled 2026-10-20 under R-072), the same pin:*
the manifest also carries `projectFiles`, a product choice keyed by capability beside `warmUps` — the symbol rename's project file:
the runtime's `typescript` language, the twelve extensions the runtime serves with it (read from the runtime's own file-name
matcher, as the indexed extensions are), the two names that count as a project file (`tsconfig.json`, `jsconfig.json`) and the one
the product writes (`jsconfig.json`) — checked by `projectFileRefusals` beside `warmUpRefusals` (a capability of the tiers, a
language the runtime names with an extension, or no module is written; regenerated here, `--check` equal). **The run host now
writes into the person's workspace for one call:** for a rename whose declaring file that language serves and no project file
covers up to the project root, the MCP executor places a `jsconfig.json` of the product's own there (one constant of the build,
`CODE_INTELLIGENCE_PROJECT_FILE_BYTES`, created exclusively) for the search and the rename and removes it when the call ends, only
while its bytes are still the constant — the measured remedy that leaves the pinned runtime unpatched (OQ-273 and OQ-362 rejected a
patched distribution), so "the pinned release is the tree that runs" stays true. Measured over the bundled runtime's stdio server
(the file placed inside a live server session, four cases, every importer reached) and in the built app: `code-intel-proof`
launches 13, 14 (`child-rename-opened-js`) and 15 (`child-rename-cold-ts`) green, launch 11 green with no `jsconfig.json` written,
red without the clause in the same build. **Revisit with every pin change:** the clause rests on the TypeScript language server's
project discovery and the runtime's language names, so launches 11, 13, 14 and 15 are its gates and are re-run whenever
`pins.json` moves.
