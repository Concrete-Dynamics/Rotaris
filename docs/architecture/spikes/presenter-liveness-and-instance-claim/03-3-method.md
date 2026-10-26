# Spike — the wedged presenter, and the single-instance claim on Windows — 3. Method

Part 3 of 9 of [the spike report](../presenter-liveness-and-instance-claim.md), which indexes every part.

## 3. Method

Two harnesses, both throwaway, both under
`…\scratchpad\spike-liveness\`. Neither is a prototype of anything.

### 3.1 Harness A — presenter liveness (`s14/`)

Reproduces ADR-0002's topology as far as it needs to: **main**, one **`utilityProcess`** standing in for
the run host (ADR-0002 role 2, which is where `PendingApprovals` and the attendedness boolean live), and
one **renderer**. Three transports are instrumented at once, in the same process tree, in the same run:

1. **run host → main**, over the `utilityProcess` parent channel (`process.parentPort` ⇄
   `child.postMessage` / `child.on('message')`) — this is the channel ADR-0019's liveness poll rides.
2. **run host → renderer**, over a `MessageChannelMain` port pair, `port1` transferred to the utility
   process and `port2` to the renderer — the direct-port option ADR-0002 records as verified viable.
3. **renderer → main → renderer**, over Chromium IPC (`ipcRenderer.send` → `ipcMain.on` →
   `webContents.send` → `ipcRenderer.on` → `ipcMain.on`).

Plus a bare **`setInterval` on main** and a **pid liveness poll** (`process.kill(mainPid, 0)`) from the
utility process. Every channel is polled at **250 ms**; every send, every reply with its round-trip time,
every 250 ms tick with the time since the last reply on each channel, and every crossing of the lapse
thresholds `{500, 1000, 2000, 3000, 5000, 10000}` ms is appended as one JSON line to a shared file. The
file, not stdout, is the transport — per `spike-base` gotcha 5.2, and because a wedged main cannot flush
anything.

Nine scenarios, each a **separate Electron launch** so that one wedged main cannot contaminate the next:

| scenario | what main does 4 s after the run host reports ready |
|---|---|
| `idle` | nothing (control) |
| `busy` | `while (Date.now() < end) {}` for 8,000 ms |
| `msgbox-sync` | `dialog.showMessageBoxSync(win, …)` |
| `msgbox-async` | `dialog.showMessageBox(win, …)` (promise) |
| `filedialog-sync` | `dialog.showOpenDialogSync(win, { properties: ['openDirectory'] })` |
| `filedialog-async` | `dialog.showOpenDialog(win, …)` (promise) |
| `modal-window` | `new BrowserWindow({ parent: win, modal: true, width: 560, height: 380 })` — the shape `REQ-TOOLS-063` specifies |
| `crash` | `process.crash()` |
| `kill` | the driver issues `taskkill /F /PID <main>` (no `/T`) |

An **external PowerShell observer** runs alongside every scenario, polling every 250 ms and recording,
for each visible top-level window of the Electron process: `GetClassNameW`, `GetWindowTextW`,
**`IsHungAppWindow`**, and **`SendMessageTimeout(hwnd, WM_NULL, SMTO_ABORTIFHUNG, 300 ms)`** with its
elapsed time. It is also the dismisser: it posts `WM_CLOSE` to any window carrying the marker title once
that window has been open for 6,000 ms. Its records carry a Unix-ms wall clock so they correlate with
the Electron log.

Repetitions: **3 per scenario** for the seven live scenarios and for `crash`/`kill`, each repetition kept
as its own raw log under `out/rep1|rep2|rep3/`. The callback-survival probes of §4.4 were added later and
were run **once** each over `busy`, `msgbox-sync` and `filedialog-sync`; that run is reported separately
and is labelled n=1 wherever it is cited.

### 3.2 Harness B — the instance claim (`s16/`)

A minimal Electron app whose **first act, at module scope, before `app.whenReady()`**, is
`app.requestSingleInstanceLock({ workspace, label, sentAt })` — ADR-0055's phase 0. A `false` return
logs and calls `app.exit(0)` immediately. A `true` return registers `second-instance`, opens a window,
and starts a 500 ms `setInterval` heartbeat so the primary's own responsiveness is visible in the same
log. Application name `rotaris-spike16`, so the record is this harness's own.

Four scenarios, driven by a Node script that spawns real processes and records wall-clock timings:

- **`basic`** — P1 claims; P2 launches from a *different* working directory carrying a *different*
  workspace; P3 launches carrying none; `taskkill /F` P1 without cleanup; P4 launches as fast as the
  driver can spawn it. A full recursive snapshot (size + mtime of every file) of the per-user data
  directory is taken immediately before P2 and immediately after it exits.
- **`wedge-busy`** — P1 enters a synchronous busy loop; P2 launches 2.8 s into it; the wedge then ends
  and the primary is watched for a further 25 s.
- **`wedge-modal`** — P1 opens `dialog.showMessageBoxSync`; P2 launches 2.6–2.9 s into it.
- **`release-timing`** — a second Electron process (the *poller*) calls `requestSingleInstanceLock()` in
  a loop every ~62 ms; P1 is then `taskkill /F`ed while the poller runs, so the moment the claim becomes
  available is bracketed to one poll interval rather than to one process launch.

`basic`, `wedge-modal` and `release-timing` were run **twice**; `wedge-busy` twice (once with a 40 s
wedge, once with a 25 s wedge so the post-wedge behaviour could be observed).

---
