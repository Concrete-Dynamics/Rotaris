## A reclaim leaves the dead instance's socket behind

When an instance ends without its closer running (a crash, a force-quit, a power loss), its record and, off Windows, its
hand-over socket stay on disk. The next launch reclaims the record (REQ-STARTUP-164 (3): `rmSync` of the record file in
`claimInstance`) but leaves the socket the record names: nothing ever reads it again, since every socket name carries a
per-attempt nonce, so each crash adds one `instance-<pid>-<nonce>.sock` for good — in the data directory where
`XDG_RUNTIME_DIR` is unset (always on macOS), where it persists across reboots. Read from the code by advocate B of OQ-248's
ruling (R-072, 2026-10-13, risk 2); recorded by fin36 before the repair.

## Specs

- REQ-STARTUP-164 (3), the reclaim of a record naming a process that is gone. OQ-248's ruling makes the endpoint part of the
  record, so the reclaim that removes the record removes the dead process's endpoint with it. No requirement's text is
  contradicted as written; the file is clutter, not a failure.

## Relevant files

- `packages/platform/src/instance.ts`: `claimInstance`'s reclaim, `readRecord`, `isLockLive` (`liveness.ts`).
