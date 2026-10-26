# Spike — the writer's own handle, and what a follower sees across a compaction — 7. What this harness does not model

Part 7 of 9 of [the spike report](../windows-writer-handle-compaction.md), which indexes every part.

## 7. What this harness does not model

- **No Electron, no IPC, no run host, no session lock.** A bare Node writer and bare Node follower
  processes. ADR-0002's process topology, ADR-0005's lock and ADR-0008's debounce/generation machinery are
  all absent; the measured handle-closed window is the filesystem cost only, with nothing else on the loop.
- **Wrong volume.** Everything ran on `C:` (the session scratchpad), not on a workspace directory on `D:`.
  Both are NTFS. Untested: network shares, ReFS, FAT/exFAT, removable media, and cloud-sync folders
  (OneDrive/Dropbox), which are a known source of exactly this class of handle contention.
- **Anti-malware was not controlled.** Whatever real-time scanning this machine does, it did to every arm.
  The unexplained 64–99 ms outliers in the handle-closed and rename→marker windows are consistent with
  scanner activity on a freshly created staged file, but I did not establish that.
- **No crash or power-loss testing.** Nothing here speaks to whether a replaced file survives a power cut,
  which is the actual content of OQ-12. The directory-`fsync` result is "the call returns success", not
  "the guarantee holds".
- **Synthetic events.** Lines are 40–200 bytes of filler plus an ISO-8601 timestamp and a monotonic `seq`,
  not real wire events. The constant-length worst case in section 5 was **constructed deliberately**; I did
  not observe a real event stream producing it, and I cannot say how often the real catalogue would.
- **One reading of the follow protocol.** The follower implements `REQ-EVENTS-108`–`116` and
  `REQ-SESSION-149` as I read them, including the choice to read the marker before the journal. A different
  but equally conformant reading could shift the windows in section 5.
- **One retry ladder.** 50/100/200/400 ms, the shape `REQ-LIBRARY-043` fixes. `REQ-SESSION-033`'s ladder is
  different and incompatible (OQ-11); it was not tested.
- **One writer process only.** `REQ-EVENTS-098` forbids two, so cross-process write contention was out of
  scope by design. Concurrent *readers* were varied from 0 to 8.
- **The ground-truth instrumentation is not part of the protocol.** The first-line `seq` read and the `ino`
  read exist to check the anomaly counters and would not be present in a conformant follower — except that
  section 5.1 proposes the `ino` read be made part of it.
- **R-A is not a configuration the product would run.** Two followers polling with zero delay is a stress
  bound establishing where the mechanism breaks, not a prediction of production behaviour.

---
