## artifacts-proof's timed click and the probe that reads its effect change order on a loaded host

`artifacts-proof`'s "children" launch schedules a screenshot at 10 200 ms, a click on the inspector's artifact link at
11 000 ms and three probes of the click's effect at 12 500 ms, all as fixed offsets from the launch. On a host under
load (2026-11-17, Linux under X11, a load average of 3.5 to 4.7 from other applications) the three do not keep their
order or their distance: the launch log showed the 12 500 ms probe written 157 ms **before** the 11 000 ms click in one
run, and the click, the screenshot and the probe all within 300 ms of each other in four others. The proof then fails
with "following the link did not open the artifact in the Library: view workspace, tab undefined, inspectors []", and
in other runs of the same build at a later fixed offset ("the inspector did not open", "the child-report inspector did
not open", "the dialog was not re-raised").

Seen on `main` at `2fb19824` and on `feat/r-101-experience-redesign` alike, four reds of four on each within the same
half hour, at varying steps, and the same first error on both. The same proof was green on both builds on a quieter
host on 2026-11-14 and 2026-11-16. It is the harness's reading and not the product's: the click is logged and the
Library opens (the launch's later probes at 16 400 ms read the artifact's inspector open).

The repair the driver's own record names is a condition instead of an offset: the probe waits for the click's effect
(`waitFor`) instead of for a moment.

## Specs

None: a proof harness's timing. `AGENTS.md`, "Driving the built app": "a step that needs a condition should `waitFor`
it rather than sleep, because the reason this seam exists is that fixed offsets have produced false reds three times."

## Relevant files

- `apps/desktop/scripts/artifacts-proof.mjs` — the "children" launch's `ROTARIS_CAPTURE_PROBE_AT`, `ROTARIS_CAPTURE_CLICKS` and `ROTARIS_CAPTURE_PNG_AT` offsets, and the check that reads `.app-shell@12500`.
- `apps/desktop/src/main/capture/seams.ts` — the capture seams that fire each timed step.
