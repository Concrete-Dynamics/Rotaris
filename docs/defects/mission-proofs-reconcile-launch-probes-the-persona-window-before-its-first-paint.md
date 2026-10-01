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

## Specs

None contradicted by the product: REQ-MONITOR-213 is what the item asserts, and nothing shows the window drawing another
state. The defect is the proof's: a fixed probe instant that host load can move the window's first paint past.

## Relevant files

- `apps/desktop/scripts/mission-proof.mjs`: item 8, `ROTARIS_CAPTURE_PERSONA_PROBE_AT` at 6500 and the
  `expect(pName === 'zombie' && pState === settled, …)` that reads it.
- `apps/desktop/src/main/capture/seams.ts`: the persona probe seam, which reads the window whether or not it has painted.
