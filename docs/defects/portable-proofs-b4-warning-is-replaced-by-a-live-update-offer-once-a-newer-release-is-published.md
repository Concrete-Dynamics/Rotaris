## portable-proof's B4 warning is replaced by a live update offer once a newer release is published

Seen 2026-11-24 in `pnpm worktree:land`'s proof run on the Linux host (landing tree of the R-122..R-124 branch). B4
launches the real stub into a root that refuses every write and waits up to 8 s for REQ-STARTUP-165 (c)'s warning
(`[data-testid="notice"][data-severity="warning"]`). Main raised it after the show, and 8 ms later raised notice #2:
`update check: Rotaris 0.1.0rc8 is available; offered with Open release page`. That was a real release on the public
feed. There is one current notice (REQ-NOTIFY-024), so the offer replaced the warning before the probe's first reading,
and B4's two warning checks read "(no warning)": 41 of 43 passed, the same alone as beside the other suites.

The branch touches neither the updater nor the notices. The red follows from the outside world: B4's launch classifies
as an updatable artifact and checks the real feed, which by design reads no configuration, environment or preference
(REQ-STARTUP-111). It was green while no newer release was published and will be red on `main` while one is.

**Repaired 2026-11-24 (the proof's side).** The B launches go through `--proxy-server` to a listener the script owns that
refuses every connection, as `updater-proof` routes its launches. A check whose request fails is silent
(REQ-STARTUP-110), so no offer reaches the screen. The launch logged `update check failed silently:
net::ERR_CONNECTION_RESET`, and `portable-proof` passed 43 of 43 with 0.1.0rc8 still published. The product question
below stays open.

## Specs

Possibly REQ-STARTUP-165 (c) against REQ-NOTIFY-024: a person launching an artifact that cannot prepare itself, while an
update is published, sees the warning for one frame before the offer replaces it. Whether the warning should outrank or
outlast the offer is not ruled; an open question, not this note's to decide.

## Relevant files

- `apps/desktop/scripts/portable-proof.mjs` — B4's launch, `ROTARIS_CAPTURE_PROBE_AT` on the warning `@100~8000`.
- `apps/desktop/src/main/index.ts` — the update classification and the check from `MainWindows`' post-show activation.
- `apps/desktop/src/main/updater/` — the feed and the offer notice.
