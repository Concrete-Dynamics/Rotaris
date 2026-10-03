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
