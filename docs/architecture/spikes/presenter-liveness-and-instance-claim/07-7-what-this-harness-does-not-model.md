# Spike — the wedged presenter, and the single-instance claim on Windows — 7. What this harness does **not** model

Part 7 of 9 of [the spike report](../presenter-liveness-and-instance-claim.md), which indexes every part.

## 7. What this harness does **not** model

- **No product code, and no product-shaped load.** The main process here paints one `<h1>`. It has no
  renderer framework, no transcript pipeline, no session writer, no workspace service, no MCP client and
  no Git invocation. Every main-channel latency in §4.1 is a floor for an idle Electron main and a
  prediction for nothing. In particular it does **not** reproduce the 22,777 ms of event-loop lag the
  `ipc-hop-latency` spike measured under frame load, which is the state the lapse window must survive.
- **The lapse window is not sized.** §4.3 gives detection latency for a set of thresholds and §4.1 gives
  a false-lapse floor on an idle main. Sizing needs the loaded case. **OQ-39 is untouched.**
- **The decision path was not exercised.** No permission gate, no `PendingApprovals` map, no
  `headless_approval_policy`, no `approval.requested` event, no session state. This spike shows that a
  revocation *signal* is available and when; it shows nothing about what the gate does with it, and
  nothing at all about *never a silent allow*.
- **Only `…Sync` blocking was measured for native dialogs.** Whether every native dialog the product
  needs has a non-blocking form on every platform was not established. Electron's `showMessageBox` and
  `showOpenDialog` promise forms were verified non-blocking on Windows; nothing else was.
- **Unpackaged only.** Everything ran from `electron.exe <appdir>`. No `electron-builder` artifact, no
  portable `onefile` extraction, no ASAR. `spike-base` §5.3 records that the portable flavour changes
  `process.execPath`; whether it changes the single-instance record's location was **not measured** and
  should not be assumed.
- **One machine, one user account, one desktop session.** No fast-user-switching, no Remote Desktop, no
  second logged-on user, no service/session-0 context, no roaming profile, no `%APPDATA%` on a network
  share. `REQ-STARTUP-161` says "per user account on a machine"; only one was tested.
- **No macOS, no Linux.** See §5.5. This is the largest single gap in the record.
- **The `crash`/`kill` result is about `utilityProcess` specifically.** A run host hosted some other way
  — a detached child process, a separate executable — might well outlive main and would then have the
  channel-close event ADR-0019 assumes. That alternative was not built and not measured.
- **The mechanism explanations are inferences.** Why a native dialog leaves `IsHungAppWindow` false, and
  why `second-instance` runs while timers do not, are labelled as inferences in the text. Only the
  observables are measured.
- **Statistics.** Three repetitions for the SPIKE-14 scenario matrix, one for the §4.4 probe run, two for
  each SPIKE-16 scenario. Percentiles appear only in §4.1, where n ≈ 1,000 samples over 12 runs. Nothing
  else here has statistical content and none of it should be quoted as if it did.

---
