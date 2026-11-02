## `artifacts-proof`'s publish launch reads the empty Library in a window a startup stall closes

The publish launch of `artifacts-proof` (scenario 1, REQ-LIBRARY-136: the Library is shown empty, the run publishes,
the view is left and returned to, and the row appears on the next refresh) drives the first half of that sequence by
four appointments: Ctrl+6 at 1200 ms, a click on the Artifacts tab at 1400 ms, a probe of the empty state and of the
rows at 1600 ms, and Ctrl+2 at 2000 ms (the prompt seam presses Ctrl+2 again at 2600 ms and submits). The reading has
to land between the tab press and the leave, a window of about 400 to 600 ms that the launch does not control.

The renderer is not answering on a schedule at that moment. Initialization starts the code-intelligence setup in the
background (a second Electron process) about 0.7 s before the first view switch, and the run's start follows the
prompt. In the acceptance round's run 1 (2026-10-03, load average 1.40 to 1.42) the renderer answered the click's
lookup about 1.5 s late: `capture: view 6 at 1200` at 03:43:29.908, `capture: view 2 at 2000` at 30.414,
`capture: no "[data-testid="library-tab"][data-tab="artifacts"]" control on screen` at 31.612, and both 1600 ms
probes at 31.768 reading `[]`. The key events had been processed before the queued lookups, so the click looked for
the tab in the Workspace view and the probes read the Workspace view, and the proof failed on "the empty state was
not shown before the run published". The run alone (load average 0.50 to 0.84) passed.

No long-task measurement of the renderer exists for that second, so a renderer stall during startup is not claimed
here as the product's defect.

## Specs

None broken by the product. The launch is the evidence for REQ-LIBRARY-136; a reading taken after the view was left
makes it a false red.

## Relevant files

- `apps/desktop/scripts/artifacts-proof.mjs`: scenario 1's `ROTARIS_CAPTURE_VIEWS`, `ROTARIS_CAPTURE_CLICKS`,
  `ROTARIS_CAPTURE_PROBE_AT` and `ROTARIS_CAPTURE_PROMPT_MS`, and the two assertions on the 1600 ms probes.
- `apps/desktop/src/main/capture/host.ts`: the step grammar, whose waiting form (`@from~ms`) a click and a probe-at
  already honour.
- `apps/desktop/src/main/capture/probe.ts`: the prompt seam, which presses Ctrl+2 itself at `ROTARIS_CAPTURE_PROMPT_MS`.

Found by the acceptance round of 2026-10-03 (finding F5), on merged main; evidence in that round's
`accept1/artifacts-r1-evidence/publish.log`.

## Outcome

Repaired 2026-10-03 in the acceptance round's repair loop (bundle `finacc-accept1-1`), in the proof; no product code
changed. Confirmed first with origin/main's schedule through a scratch copy of the launch that injects a renderer stall
(`ROTARIS_CAPTURE_EVAL_AT`, a 1.5 s busy loop in the renderer at 1300 ms), as root under Xvfb, Node 24, `--skip-build`,
load average 1.6 to 1.7: red 2 of 2 with run 1's signature, `capture: view 2 at 2000` logged before
`capture: no "[data-testid="library-tab"][data-tab="artifacts"]" control on screen`, and both 1600 ms probes `[]`.

- **The schedule follows the Library** (`apps/desktop/scripts/lib/library-refresh.mjs`, `PUBLISH_SCHEDULE`). Ctrl+6 is
  still an appointment at 1200 ms; the Artifacts tab is pressed when it is drawn (`@1200~5800`); the reading is one
  waited-for probe (`@1200~5800`) of the LOADED tab's empty state or rows,
  `[data-testid="library-artifacts"][data-loaded="yes"] :is([data-testid="library-artifacts-empty"], tr[data-artifact-id])`,
  so "no row" and "the empty state" are one instant's reading, and an empty state drawn before the tab's read answered
  no longer counts. The separate Ctrl+2 at 2000 ms is gone: the leave is the prompt seam's own Ctrl+2, now at 6000 ms,
  after the reading's deadline, and the run that publishes starts only from that submit. The return's tab press waits
  for the tab the same way (`@14000~15800`).
- **A missed step is the proof's red by name.** The proof asks `unpressedClicks` for the tab press, and
  `emptyBeforePublish` reads the probe back: a row before the publish, an empty state not shown (saying when the loaded
  tab was not drawn within the deadline), or a reading never taken.

The window a startup stall must exceed grew from about 0.4 s to 4.6 s. Whether the renderer stalls for about 1.5 s
during startup is still unmeasured, and not claimed as the product's defect.

Pinned by `apps/desktop/scripts/lib/library-refresh.test.ts` (10 cases): the click and the reading wait from the view
switch and give up before the leave, the reading is one probe of the loaded tab, the only views are the two Ctrl+6, the
return's press waits, the log reader names each way the reading can fail, and the proof's publish launch spreads
`PUBLISH_SCHEDULE` with no capture timing of its own and reads its press back; that last case fails on origin/main's
proof.

Shown in the built app through the same scratch copy with the stall injected: 6 of 6 green (1.5 s at 1300 ms three
times, 3 s at 1300 ms, 1.5 s and 3 s at 1100 ms, before the view switch, which is run 1's order: the tab pressed and the
reading taken just after the stall, with 1.5 to 3.1 s to spare), load average 1.4 to 1.6. The whole `artifacts-proof`
then passed twice in a row, 111 s and 110 s, load average 0.6 to 1.0, nothing else running.
