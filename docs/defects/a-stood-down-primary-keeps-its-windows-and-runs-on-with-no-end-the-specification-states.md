## A stood-down primary keeps its windows and runs on, with no end the specification states

Since 2026-10-31 a process the instance record was reclaimed from stops acting as the instance (ADR-0055 consequence 14;
`docs/defects/fixed/a-primary-resumed-after-a-reclaim-goes-on-acting-as-the-instance.md`). It no longer acknowledges a
hand-over or surfaces a window for one, and its close leaves the new holder's record alone. Nothing else about it
changes. Its main windows stay open and usable, its runs go on, its post-show activation (including the update check)
still fires for any window it builds, and it ends only when its own windows are closed. So after a wedge longer than the
5 s interval, the user can be left with two processes of the application, each with windows on screen, for as long as
they keep using the old one.

This was found while repairing the stand-down. *Measured 2026-10-31 by the C6 re-run (Windows 11 ARM64, Node 26.13.0 arm64, Electron 44.3.0, built app at `1cb6e96d`): 8 s after the resume both
processes were still up, and the log shows the workspace's code-intelligence setup started twice for the same directory.
What becomes of that shared setup was not read.* Until then it was not measured: the Windows run that measured the original defect
ended both processes with its driver. It is not repaired, because there is no rule to repair it to:
- ADR-0055 states the stand-down and nothing further;
- the specification does not say what a reclaimed-from process does with its windows: close them, keep them, or say
  something to the person;
- any of those would be a new user-visible behaviour.

## Specs

- REQ-STARTUP-164: a reclaim "is the one path by which two processes of the application can **briefly** exist", and
  "every path therefore ends with exactly one instance running". Nothing bounds "briefly" for the process reclaimed from.
- REQ-STARTUP-161: at most one instance. Whether a process that no longer acts as the instance but keeps windows is
  "an instance" is not stated.
- Sessions stay protected by their own locks whichever process reaches them (REQ-SESSION-046/047), which is what
  REQ-STARTUP-164 relies on for the interval.

## Relevant files

- `packages/platform/src/instance.ts` — `listen()`'s decline (`onHandOverDeclined`), the only change a stood-down process
  sees.
- `apps/desktop/src/main/index.ts` — the claim's `onHandOverDeclined`, which logs the decline and does nothing else.
- `docs/architecture/adr/0055-startup-sequencing/05-consequences-accepted.md` — consequence 14.
