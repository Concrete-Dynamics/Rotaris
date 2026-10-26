# Spike — the store and exclusive-create locking on remote and synchronised storage — 10. What this harness does not model

Part 10 of 12 of [the spike report](../remote-and-synchronised-storage.md), which indexes every part.

## 10. What this harness does not model

- **No second machine. This is the single largest gap and it is the one ESC-21 turns on.** Every
  "remote" figure is one SMB client talking to one SMB server that happen to be the same computer. Two
  clients against one server, two machines against one synced folder, and any WAN latency are all
  untested.
- **No synchronisation client was exercised.** Sections 6 and 7 are reasoning plus a labelled
  single-machine analogue. No OneDrive, Dropbox, Google Drive or Synology Drive path was written to, and
  the reconciliation behaviour of all four is unmeasured. In particular, exclusive create against a
  **dehydrated Cloud-Filter placeholder** is a code path I did not exercise and cannot speak to.
- **No Electron.** All measurements are host Node v24.11.0 with an npm prebuild of `better-sqlite3`.
  ADR-0058 requires the module be rebuilt against the Electron ABI (ADR-0056), and the owner has already
  recorded `better-sqlite3` "failing silently under an Electron runtime" through an ABI mismatch. That
  failure mode is orthogonal to everything here and is **not** covered. The Electron toolchain at
  `…\scratchpad\spike-base` was deliberately not used, because the questions are SQLite-and-OS
  questions; a rebuilt-for-Electron confirmation run is still owed.
- **One SQLite version, one binding.** SQLite 3.53.4 via `better-sqlite3@13.0.3`, MSVC-1944 build. The
  named fallback `node:sqlite` was not tested and may differ.
- **The SMB dialect is unknown.** `Get-SmbConnection` and `Get-SmbSession` require elevation and were
  denied. Loopback SMB may also differ from wire SMB in oplock, lease and caching behaviour in ways
  that bear directly on section 4.5. I could not rule that out.
- **Loopback is not a network.** No latency, no packet loss, no reconnection, no server-side contention,
  no signing or encryption cost. The 12 ms p50 rename in section 8 is a floor.
- **`\\localhost\C$` succeeded, which is unusual for a non-elevated caller** and I did not establish why.
  Every headline figure therefore uses the non-administrative `Users` share instead.
- **No power-loss or crash testing.** Nothing here says whether a committed WAL frame survives a power
  cut. `synchronous` was `NORMAL` throughout except where stated.
- **Anti-malware was not controlled or enumerated.** The 17.0 ms outlier in the detection timings and
  the 48.0 ms rename outlier are consistent with scanner activity; I did not establish that.
- **Synthetic writers.** Rows are a tag, a sequence number, a filler payload and a checksum, committed
  one per transaction. They are not wire events, not transcript rows, and carry none of ADR-0008's
  ordering machinery or `REQ-MONITOR-219`'s coalescing. Section 7.2 deliberately runs a writer far
  faster than the product ever would, to give the experiment power; section 7.1 shows what the realistic
  cadence produces, which is nothing.
- **The "mixed spelling" pairing is a mechanism model, not the two-machine case.** It creates two
  independent mappings of one file, which is the condition SQLite's documentation blames. It does not
  prove two machines behave the same way.
- **Detection was measured against two providers on one machine.** `SynologyDrive` and `CrossDevice`.
  OneDrive is present as an environment variable (`ONEDRIVE=C:\Users\ganga\OneDrive`) but registered
  **no** sync root under `SyncRootManager` on this machine, so OneDrive's own detection path is
  **untested here**.
- **The detection timings include PowerShell interop overhead** and are upper bounds, not the cost of
  the raw Win32 call.
- **No repetition of the section 7.3 writeback beyond one trial per variant.** Four variants, one trial
  each. All four failed identically, but four is not a distribution.

---
