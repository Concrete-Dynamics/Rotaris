## Config-proof's Discard leaves the save status unsaved

Encountered on 2026-10-23 during the release-key verification (branch `release-stage-1-signing-key`, unlanded), in the
worktree based on `a118d59b` with the stage-1 key, version and record changes uncommitted. On the first run with a
working X server (`DISPLAY=:187`), `pnpm config-proof --skip-build` exited 1 at `apps/desktop/scripts/config-proof.mjs:177`:
after the recorded Discard click, `.save-bar__status` read `Unsaved changes`, not `All changes saved`. The seeded
workspace file remained byte-identical. Evidence: `/tmp/stage1-proofs/config-proof.log` and `.proof/config-proof/discard.png`
in that worktree. The earlier attempt exited before the UI could run because its display was unreachable.

The stage-1 diff changes no settings implementation. That does not establish that this is pre-existing or that
the harness is at fault: no clean-baseline comparison has run. The cause is unidentified. Verification stopped
under the owner's one-repeat limit; nothing was committed or pushed, and no further candidate rerun was made.

*(The two paragraphs above are the note as first written, in the signing worktree, before the comparison below.)*

## Specs

None contradicted. REQ-CONFIG-280 is what the proof expects of Discard (the save status settles to `All changes saved`),
and the product meets it; the press that should have exercised it never reached the button.

## Relevant files

- `apps/desktop/scripts/config-proof.mjs`: the Discard scenario, its click evidence and its save-status assertion.
- `apps/desktop/src/main/capture/seams.ts` (`ROTARIS_CAPTURE_CLICKS`) and `apps/desktop/src/main/capture/host.ts`
  (`clickAt`): the capture seam's press, at a box measured once, with nothing checking at the press what it met.
- `apps/desktop/src/main/index.ts` (`NO_PROVIDER_HEADLINE`): the "No model provider is authenticated yet" notice,
  which fills the shell's notice slot above the views.
- `packages/ui/src/settings/`: the settings form and save bar; not implicated, and not changed.

## Comparison and cause — 2026-10-23

**A clean baseline passed.** A detached worktree at the unmodified `a118d59b`, built there, ran `pnpm config-proof
--skip-build` once on the same display (`DISPLAY=:187`): exit 0, Discard included, the status probe reading
`All changes saved`.

**The two Discard logs differ in one ordering.** In both, the capture seam's three presses land about 25 ms apart (the
`@~` markers are deadlines, not delays), and the provider notice is raised about 1.1 s after the window loads:

| run | Discard measured | `notice: No model provider is authenticated yet` | Discard pressed | status |
|---|---|---|---|---|
| failing (stage-1 tree) | 09:00:49.322 | 09:00:49.347 | 09:00:49.348 | `Unsaved changes` |
| baseline (`a118d59b`) | 09:17:17.183 | 09:17:17.238 | 09:17:17.210 | `All changes saved` |

**What is observed and what is inferred.** Observed: those log timestamps; the failing run's screenshot, which still
shows Save and Discard; and the source, in which the capture press is a `sendInputEvent` pair at a point measured
before it (`clickAt`), and Discard is a single state update that restores the saved values (`onDiscard`,
`apps/desktop/src/renderer/main.tsx`), with the status a pure reading of the dirty flag. Inferred, not logged: that the
notice filled the slot in the instant between the measurement and the press, pushing the save bar down, so that the
press met the banner rather than Discard. No event delivery was recorded at the press: the capture seam logs
"clicked" when it sends the events, not what they met. The same shift was measured frame by frame for another proof in
[`driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md`](driver-proof-clicks-pop-out-at-a-box-the-notice-banner-moves.md).
Two other readings were weighed and are not supported: a Discard state defect (the baseline passed the same build
inputs, and the update cannot leave the form dirty), and a cause in the stage-1 version or key (neither reaches
Settings).

## Repaired — 2026-10-23

`config-proof`'s Discard scenario alone is driven rather than captured: it launches through `startApp`
(`apps/desktop/scripts/lib/driver.mjs`) and presses Runtime, the Keep going toggle and Discard with `clickLanded`, the
driver's settled click, which presses a box only once it has held still and is the element at its own centre, and
reads afterwards what the press met. Every step waits for the state the one before produced: the toggle's
`aria-checked` before the change; `Unsaved changes` with Discard offered after it; `All changes saved`, the toggle back
where it was and no Discard offered after Discard. Every press must report `landed: true`. The seed, the no-initialization
check and the byte comparison of the workspace file are unchanged. No shared library, seam or product file changed;
the other scenarios still use the capture seam.

**What the repaired run showed — directly, from the driver's receipts** (`.proof/config-proof/results.json`, one run,
`DISPLAY=:187`, exit 0): Runtime pressed at (212, 148), the toggle at (459, 459), Discard at (531, 84), each `landed:
true` with no missed press; Keep going `false`, then `true`, then `false`; the status `All changes saved`; the file
byte-identical. Discard's box sat at y = −118 when the save bar first offered it and was pressed at y = 84 (the settled
click brought it into view).

**What it could not show.** The banner race itself was not met: the driven launch pressed Discard 0.98 s after its window
loaded and quit before the provider notice was raised (no `notice:` line in `discard.log`; the notice slot 0 px high
both times it was read). One pass does not prove the cause. The guarantee against a moving control rests on the
settled click's contract, which the driver-proof repair measured, not on this run; no deterministic way to raise the
notice between a measurement and a press exists without a fixed offset, so no focused regression was added. Windows
and macOS were not run.

**Three more runs on the finished change** (rebuilt, `DISPLAY=:187`, load 2.5 to 5.6 on 4 cores from other worktrees):
two exited 0 and one exited 1. In all three, Discard passed with every press `landed: true`. The red run failed at
scenario 5 (`fatal-corrected`, "the corrected file did not run to completion"): MCP discovery took 7.8 s under that load,
which is the CPU-bound red already recorded for this proof on 2026-10-21. Scenario 3 does not reach that path. None of
the three met the banner either (no `notice:` line; slot 0 px).

**Run beside it, not required by the plan.** `pnpm verify:plan` named `pnpm config-proof` alone for this change. The
other five proofs of the Configuration and startup area were asked for anyway, once each, on the same tree and display:
`updater-proof` 15/15 and `settings-proof` exit 0; `exit-trace-proof` exited 1, 2 of 37 failing ("the renderer crashed:
main writes render-process-gone … at error — no line", and "one more GONE line at error than before the renderer
crashed"), after which the sequence stopped, so `workspace-proof` and `init-proof` did not run. That red is in a proof
this change does not touch, and is not diagnosed here.
