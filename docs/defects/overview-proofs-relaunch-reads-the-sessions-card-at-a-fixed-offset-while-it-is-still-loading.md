## overview-proof's relaunch reads the sessions card at a fixed offset while it is still loading

`pnpm overview-proof`'s third launch (`relaunch`, `apps/desktop/scripts/overview-proof.mjs`) resumes the stored session
with `ROTARIS_CAPTURE_RESUME=latest`, ends on the Overview after `ROTARIS_CAPTURE_END_VIEW_MS=3500`, and probes the view
`ROTARIS_CAPTURE_AFTER_MS=2500` later. Nothing waits for the cards to settle: the probe reads whatever the view shows at
that appointment. On a host where the workspace service's repository read takes longer than usual, the appointment
falls inside the loading state, the sessions card still says "Loading sessions…" with "0 listed", the repository card
"Reading the repository…", and the proof fails with `after the relaunch the sessions card listed 0 row(s)` — a product
red for a view that was still arriving.

Observed 2026-11-02 on `8d438e31`, Windows 11 ARM64, Node 26.13.0, `--skip-build`, while a writing workflow of fourteen
agents shared the host: `relaunch.log` shows the probe at 07:01:54.05 (`[data-testid="overview-sessions"] .ov-session → []`,
`overview-repo-state → []`) and the three repository reads finishing at 07:01:54.43, 07:01:55.74 and 07:01:55.87, 6440,
6870 and 5309 ms each; the samples (7) and the stored split (420) that the same launch asserts were both restored.
`relaunch.png` shows the loading copy in both cards. Launches 1 (`empty`) and 2 (`run`) passed on the same build.
The quit then logged `the run host (pid 16088) was still running 2000 ms after it was ended`, the known shutdown bound.

Not repaired: outside that task's scope (R-093, the record and the skills). The repair shape is the one AGENTS.md
names under `pnpm app:drive` ("a step that needs a condition should `waitFor` it rather than sleep"): the capture should
wait for a session row, or for the sessions card to leave its loading copy, bounded, rather than probe at 2500 ms. The
sibling note `checkpoint-and-sessions-proofs-time-their-steps-by-fixed-offsets-a-slower-git-outruns.md` records the same
shape in two other proofs.

## Specs

None is contradicted by the product. REQ-GIT-102 lets a repository read take up to 15 s and requires the view to stay
usable meanwhile, which is what the loading copy shows; REQ-MONITOR-164..171's cards and REQ-SHELL-069's restored split
are what the launch measures, and the split and the samples were read as stored.

## Relevant files

- `apps/desktop/scripts/overview-proof.mjs`: the `relaunch` launch's environment and the `rowsAgain.length !== 1` assertion.
- `apps/desktop/src/main/index.ts`: the capture seam's `ROTARIS_CAPTURE_END_VIEW_MS` and `ROTARIS_CAPTURE_AFTER_MS` appointments.
- `docs/proofs/overview-proof.md`: the proof's record, where a repaired launch reports back.
