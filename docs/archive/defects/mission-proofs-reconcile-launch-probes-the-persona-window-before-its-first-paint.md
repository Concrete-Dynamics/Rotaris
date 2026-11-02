## mission-proof's reconcile launch probes the persona window before its first paint

`pnpm mission-proof` item 8 (reconciliation, REQ-MONITOR-211/213) clicks the inspector's Pop out at 5.0 s and reads the
persona window's `persona-agent-name` and `persona-agent-state` once, at 6.5 s. Under load the window is not painted by
then, both probes read `[]`, and the proof fails with "the persona window: undefined undefined against done
(REQ-MONITOR-213)" although every other surface the item reads agreed. Seen twice on 2026-10-01 on
`fin3-run-agent-readings` (load average about 15 from other agents' launches on the host): the window was created
1.6 to 1.7 s after the click, probed 12 ms and 190 ms after its creation, and logged its first paint 1967 ms and 2093 ms
after show — after the probe both times. The item reads one fixed instant where it means "once the window has painted":
the same class as item 4b's sampling race, corrected there by reading snapshots gated on the state they need.

Noticed while running mission-proof for the inspector's meta line repair; not repaired (not that bundle's task). A third
run of the same build, at a load average of about 6 to 11, went green whole: the window logged its first paint 795 ms
after show and the probe 700 ms later read `zombie` / `done`. So the item passes when the host is less loaded, and the
fixed instant is the margin that host load spends.

## Outcome — repaired 2026-10-02

The probe, not the item, is repaired, so every fixed-instant persona read — item 8's, the open-on launch's name, count and
tabs at 6.5 s, item 4c's snapshots and palette-proof's — reads a painted window without moving its instant:

- `apps/desktop/src/main/capture/seams.ts`: a fixed-instant `ROTARIS_CAPTURE_PERSONA_PROBE_AT` step, from its instant, waits
  until the first persona window exists and has painted a frame carrying a whole-session update (`__rotarisPersonaPainted`,
  the mark main's paint measurement reads), bounded at 5 s like that measurement. The paint check and the reading are one
  evaluation, so a window already painted is read at its instant as before. When it had to wait it logs
  `persona-probe-at <ms> <selector> waited <n> ms for the window's first paint` (or `…: not observed` at the bound) beside
  the unchanged reading line, so the instant a reading was really taken is in the log.
- `apps/desktop/scripts/mission-proof.mjs` item 8: asserts the window painted within the bound, records
  `personaFirstPaintAfterShowMs` and `personaProbeWaitedForPaintMs` in its results, and ends its capture at 12 s instead of
  7.5 s, so a late first paint is waited for rather than cut off by the exit.
- Pinned by `apps/desktop/src/main/capture/seams.test.ts`: a window created and painted after the 6.5 s instant is read
  once painted, with the wait reported (red before: the seam logged `null` at the instant); a window already painted is
  read at its instant with no wait reported; a window that never paints is read at the 5 s bound.
- Shown by `pnpm mission-proof`, green whole twice on the repair: once beside the other plan's agents (load average 4 to
  10; item 8's window painted 374 ms after show, the probe read `zombie` / `done` — on a first cut of the seam that
  reported the reading's own 2 ms round trip as a wait, corrected before the second run to report a wait only when the
  first evaluation found the window unpainted), and once, on the final seam, beside eight CPU-bound loops
  at a load average of 13.5 to 15.4 through item 8 (the window was created 0.8 s after the click and painted 1116 ms after
  show, 270 ms before the 6.5 s probe, which read `zombie` / `done` without having to wait). Neither run met the late paint
  the note saw, so the built app did not exercise the deferral itself; the seam test does.

## Specs

None contradicted by the product: REQ-MONITOR-213 is what the item asserts, and nothing shows the window drawing another
state. The defect is the proof's: a fixed probe instant that host load can move the window's first paint past.

## Relevant files

- `apps/desktop/scripts/mission-proof.mjs`: item 8, `ROTARIS_CAPTURE_PERSONA_PROBE_AT` at 6500 and the
  `expect(pName === 'zombie' && pState === settled, …)` that reads it.
- `apps/desktop/src/main/capture/seams.ts`: the persona probe seam, which read the window whether or not it had painted
  (now: from its instant, once painted).
- `apps/desktop/src/main/capture/seams.test.ts`: the persona probe's paint wait, pinned.
