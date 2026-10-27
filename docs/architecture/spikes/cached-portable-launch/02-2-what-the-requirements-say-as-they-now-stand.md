# Spike — the cached launch of the Windows `onefile` portable — 2. What the requirements say as they now stand, and what that forced the method to measure

Part 2 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

## 2. What the requirements say as they now stand, and what that forced the method to measure

`REQ-STARTUP-155` and `REQ-STARTUP-165` were read in full from `docs/spec/11-startup-distribution-updates.md`
before anything was built. Seven clauses decided the experiment.

1. **The bound and its clock are unchanged.** "The main window SHALL be painted within 5 seconds of the
   application being launched … That bound is on the launch that becomes the running instance." So the
   clock still starts at the artifact the user double-clicks, and everything the launcher does is inside
   the budget. The harness timestamps immediately before `CreateProcess` on the artifact.
2. **The exemption is narrow and it is per artifact version, not per flavour.** "Where an artifact
   published in `onefile` mode prepares itself for launching under `REQ-STARTUP-165`, the run that
   performs that preparation is exempt … for the preparation it performs and for nothing else … Once an
   artifact has prepared, **every later run of that same artifact SHALL paint within the 5 seconds this
   requirement fixes**." The requirement closes with "there is no per-flavour budget, only a
   per-artifact-version first run." **The cached run is therefore judged against 5,000 ms with no
   allowance whatsoever**, and the preparing run is measured anyway so the exemption is priced rather
   than assumed.
3. **A redo counts as a first run.** "a run that prepares again because the existing preparation is
   incomplete, unreadable, or not the one belonging to this artifact (`REQ-STARTUP-165` (c)) is a first
   run of that version for this purpose, so recovering from an unusable preparation never makes a build
   non-conformant." So the redo is exempt — but §8 shows the interesting question is not its cost, it is
   whether the damage is detected at all.
4. **Clause (c) forbids failure.** "A preparation that is incomplete, unreadable, or not the one
   belonging to this artifact SHALL cause the artifact to prepare again, and **SHALL NOT cause the launch
   to fail**, to warn, or to report anything at all to the user. Preparing is the recovery path and SHALL
   never be the failure path." That makes "was it detected" a conformance question, not a performance
   one, and §8 tests it directly.
5. **Clause (a) fixes where the preparation lives and what the artifact's own medium may suffer.** It
   must sit in the per-user data directories of `REQ-STARTUP-145` in machine-local storage; "Starting the
   artifact SHALL write nothing to that directory and nothing to that medium", and the artifact must
   still run from read-only and removable media. §10 tests both.
6. **Clause (e) and `REQ-STARTUP-106` fix the update target.** "A run started from a preparation SHALL be
   able to identify the artifact file the launch started from. That file, and never the preparation, is
   the update target." `REQ-STARTUP-106` adds that the classification "SHALL never be taken from a copy
   the artifact made of itself in order to run", and `REQ-STARTUP-125` requires the replacement to
   "succeed while the application that is being replaced is still running". §9 measures all three.
7. **No percentile is stated.** As in spike 17, verdicts below are taken against the **maximum** observed
   in each group, with min and median given so a softer reading is available. No verdict changes under
   either reading.

The measured event, **first paint**, is spike 17's definition unchanged: the second
`requestAnimationFrame` callback in the renderer *after the window was shown*, relayed to the main
process and thence over a loopback socket to the timing parent, which timestamps it on arrival. The
headline `paintAtParentMs` therefore involves **no cross-process clock assumption**.

---
