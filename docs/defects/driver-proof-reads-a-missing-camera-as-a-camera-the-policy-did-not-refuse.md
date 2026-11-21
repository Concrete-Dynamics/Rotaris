## driver-proof reads a missing camera as a camera the policy did not refuse

`driver-proof`'s OQ-459 check requires `getUserMedia({ video: true })` from the application's own page to reject with
`NotAllowedError`. On a host with no camera Chromium rejects it with `NotFoundError` before any permission is asked, so the
check is red on the Linux agent host whatever the policy does — on `main` at `5777bd13` and on the `auto-update-surfaces`
branch alike (measured 2026-11-21, 42 passed, 1 failed, the same line each time). The same check's permission query already
reads `camera: denied`, so the policy itself is shown to hold; only the second reading depends on the hardware.

Found while running the proofs R-117's Stage 2 touches; not repaired here.

## Specs

None contradicted by the product: OQ-459's policy (camera refused to the own page) holds by the permission query. The
proof's second reading cannot tell a refused camera from an absent one, so it is a false red on camera-less hosts.

## Relevant files

- `apps/desktop/scripts/driver-proof.mjs` — the check `OQ-459: a display capture and a camera are refused to the own page`
  (`camera === 'NotAllowedError'`); it could accept `NotFoundError` where `navigator.mediaDevices.enumerateDevices()` lists no
  `videoinput`, saying so as a note.
- `apps/desktop/src/main/secure-web-preferences.ts` — the permission policy the check measures.
