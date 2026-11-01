## A reclaim leaves the dead instance's socket behind

When an instance ends without its closer running (a crash, a force-quit, a power loss), its record and, off Windows, its
hand-over socket stay on disk. The next launch reclaims the record (REQ-STARTUP-164 (3): `rmSync` of the record file in
`claimInstance`) but leaves the socket the record names: nothing ever reads it again, since every socket name carries a
per-attempt nonce, so each crash adds one `instance-<pid>-<nonce>.sock` for good — in the data directory where
`XDG_RUNTIME_DIR` is unset (always on macOS), where it persists across reboots. Read from the code by advocate B of OQ-248's
ruling (R-072, 2026-10-13, risk 2); recorded by fin36 before the repair.


**Repaired 2026-10-13 (fin36), under [OQ-248](../../archive/architecture/open-questions/53-spikes-and-later-questions-20.md#oq-248)'s ruling (R-072).**
`removeDeadEndpoint` (`packages/platform/src/instance.ts`) runs before a reclaim removes a record whose process is dead on this
host: it unlinks the endpoint the record names when that is a socket owned by this user named
`instance-<recorded pid>-<8 hex>.sock`, and the per-attempt `rotaris-XXXXXX` directory it sat in once empty; a live but silent
process's endpoint, and anything not so named, are left alone. Pinned by `instance.test.ts`'s reclaim case (all three branches;
red on the code before). Not driven in the built app: no proof crashes an instance.

## Specs

- REQ-STARTUP-164 (3), the reclaim of a record naming a process that is gone. OQ-248's ruling makes the endpoint part of the
  record, so the reclaim that removes the record removes the dead process's endpoint with it. No requirement's text is
  contradicted as written; the file is clutter, not a failure.

## Relevant files

- `packages/platform/src/instance.ts`: `claimInstance`'s reclaim, `readRecord`, `isLockLive` (`liveness.ts`).
