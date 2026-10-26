# Open-Question Resolutions — Session Persistence, Resume, and Background Sessions — Cross-domain schema reconciliation

Part 2 of 4 of [domain 07's resolutions](../07-sessions-persistence.md), which indexes every part.

## Cross-domain schema reconciliation

Both additions decided in domain 06 are **adopted**:

- The session lock file gains a `host` field (REQ-GIT-020). REQ-SESSION-046 now fixes the lock
  content as `{"pid", "host", "acquired_at"}`; REQ-SESSION-047 reaps only a lock that parses, names
  this machine, and records a pid that is dead here; REQ-SESSION-056 counts a foreign-host or
  unreadable lock as live. This closes open questions 3 and 13 and removes the cross-machine
  limitation from REQ-SESSION-054.
- The session record gains `last_restored_sequence` (REQ-GIT-155). REQ-SESSION-195 states it on this
  domain's schema, and it is listed in the resumable-state key inventory with default null, so a
  drift check after a restore cannot demand a force.
