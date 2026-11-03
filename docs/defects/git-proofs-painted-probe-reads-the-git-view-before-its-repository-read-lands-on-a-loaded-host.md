## git-proof's painted probe reads the Git view before its repository read lands on a loaded host

Seen 2026-11-02 by the builder of plan hrd2's bundle `hrd2-type-aware-lint` (Windows 11 ARM64, Node 26.13.0, CPU load
100 % on 8 cores with another tree's proofs open on the desktop: `C:/dev/Rotaris-wt-hrd1-storeopenint`'s Electron). Its
`painted` launch probes the Git view at fixed offsets (`ROTARIS_CAPTURE_AFTER_MS: '4600'`, the divider click at 3200 ms)
and failed on what the view still showed: `Error: the header branch reads "reading…"` twice on the bundle's head
(`00c62861`), the probe's `git-sync` reading "Refreshing repository state…". The launch log has the workspace service's
read land late: `repository …: git=true repo=true branch=main … in 3934 ms`. The same proof at the bundle's fork point
(`origin/main` at `9b0b5858`, built in a throwaway tree) failed the same way under the same load, once on the hello bound
([the hello-bound note](../archive/defects/a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md)) and once
on `Error: the sync label reads "Refreshing repository state…"`, so the bundle did not cause it.

The view is right to show "reading…" until its read lands; the proof decides from a single reading taken at a fixed
offset, the shape `AGENTS.md` ("Driving the built app") says has produced false reds before. Not repaired (record-only):
waiting for the header to leave "reading…" (`ROTARIS_CAPTURE_WAIT`, or the driver seam's `waitFor`) before the probe would
remove the race. Whether the proof is green on this host when nothing else runs was not measured.

## Specs

None contradicted by the product. REQ-GIT-* governs the view's contents once read; the red is the proof's timing.

## Relevant files

- `apps/desktop/scripts/git-proof.mjs` — the `painted` launch's fixed offsets (`ROTARIS_CAPTURE_CLICKS`, `ROTARIS_CAPTURE_AFTER_MS`) and the header and sync-label checks.
- `apps/desktop/src/main/capture/seams.ts` — the capture seams that schedule the probe at the offset.
