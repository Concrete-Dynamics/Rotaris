# Spike — the wedged presenter, and the single-instance claim on Windows

- **Date:** 2026-09-02
- **Questions:** two, deliberately kept in one record because one measurement turned out to answer both.
  1. **The wedged presenter.** Constraint **T-31** states as HARD, citing `REQ-TOOLS-064` – `REQ-TOOLS-066`,
     that a session with no presenter routes every `ask` through a headless policy and that there is
     **never a silent allow and never a hang**. ADR-0019 conceded that a run started while main is
     *wedged* rather than crashed sees a live registration and posts requests that never resolve, with
     `runtime.approval_timeout_seconds` the only backstop — and `REQ-TOOLS-055` / `REQ-TOOLS-178` make
     `0` (wait without limit) a supported, user-writable value. ADR-0019 added a channel-level liveness
     heartbeat to close this, and states three obligations on it, the third being that **the poll must
     be answerable while a dialog is open.** An earlier measurement was judged not to discharge this
     because it established a floor with main **idle** and never showed a dialog.
  2. **The single-instance claim.** SR-1 / `REQ-STARTUP-161` make a second launch surface the running
     instance. ADR-0055 chose Electron's `app.requestSingleInstanceLock()` and recorded a **verification
     obligation**: three observations that must hold on all three platform keys, and the explicit rule
     that *"if any of the three does not hold, alternative I is adopted for the claim and the platform
     primitive is dropped, not wrapped in a timeout."*
- **Scope:** measurement only. No product code was written and none is authorised. Every harness is
  throwaway and lives in the session scratchpad; nothing was added to this repository except this file.

---

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| Host Node / npm | v24.11.0 / 11.12.1 |
| Electron | **44.1.0**, reused from `spike-base` per its `README-FOR-SPIKES.md`; not reinstalled |
| Electron internals at run time | Chromium `152.0.7977.65`, Node `24.19.0`, V8 `15.2.124.18-electron.0` |
| Platform / arch | `win32` / `x64` |
| Bundle mode | **unpackaged** — `electron.exe <appdir>`; no `electron-builder` artifact was produced |
| Shell | Git Bash (POSIX `sh`) for orchestration; PowerShell 5.1 for the Win32 probes |
| Display | one interactive desktop session; native dialogs were shown on the real desktop |

**Uncontrolled background load, disclosed.** During the SPIKE-16 runs an unrelated Electron process tree
with a window titled `ipc-hop-spike` was observed on this host (five `electron.exe` processes, all with
`StartTime 02.09.2026 00:39:46`). It is not part of this harness. It carries a different application
name and therefore a different single-instance record, so it cannot have contended for the claim under
measurement, but it was competing for CPU. No SPIKE-16 figure below is a latency percentile, so the
exposure is limited to the two 20-second blocks in §5.3, whose magnitude leaves no room for doubt. The
SPIKE-14 percentiles in §4.1 were taken earlier, before that process appeared; at the end of the session
`Get-Process -Name electron` returned **0**, so no harness process leaked.

**Safety of the dialog scenarios.** Every native dialog raised by this spike was driven by an external
PowerShell watcher that posts `WM_CLOSE` after a fixed hold, each Electron launch had its own quit
timer, each utility process had its own watchdog, and the driver force-killed the whole process tree
after a hard timeout. No dialog was left on screen without a way out.

---

## 2. The requirement text, read before measuring

Quoted rather than paraphrased, because in every case the conditions attached to a threshold turned out
to matter more than the number.

| Id | The part that binds this spike |
|---|---|
| **T-31** (constraints, HARD) | "A session with no presenter routes every ask through a headless policy; with no resolver wired at all a built-in fail-safe denies. **Never a silent allow, never a hang.**" |
| `REQ-TOOLS-064` | A session for which no approval presenter is registered "resolves every `ask` through the headless approval policy of `REQ-TOOLS-065`: never a silent allow, never a hang." |
| `REQ-TOOLS-053` (amended) | "A session counts as interactive exactly when **an approval prompt for that session can be put in front of a person.**" — a **capability** test, not a registration test. |
| `REQ-TOOLS-069` (amended) | "A run is attended exactly when its session **can put an approval prompt in front of a person**." |
| `REQ-TOOLS-055`, `REQ-TOOLS-178`, `REQ-CONFIG-126` | One budget, `runtime.approval_timeout_seconds`, any float ≥ 0, **default 300.0**, and **"A value of 0 means the wait never expires by itself"** — released only by cancellation, shutdown or host teardown. |
| `REQ-TOOLS-063` | The desktop approval prompt is **a modal dialog** of minimum 560×380 logical px with three buttons and a monospace detail box — i.e. an application window, not a platform message box. |
| `REQ-SHELL-164` | Names the product's **platform-native** dialogs: "the folder choosers of `REQ-SHELL-011`, `REQ-SHELL-021` and `REQ-SHELL-163`, and the native message boxes of `REQ-SHELL-119`". |
| `REQ-WORKSPACE-009` | "Choosing a project folder SHALL use the operating system's **native folder chooser**" — reached from the title-bar control of `REQ-WORKSPACE-016`. |
| `REQ-SHELL-119` | Window-close guards raise dialogs, including **"Quit while run is active?"** — raised, by construction, *while a run is active*. |
| `REQ-STARTUP-161` | One instance per user account. The deciding record is one per user account, outside every workspace, not a preference key, "created by the launch that becomes the instance and released when that instance's process ends", creatable/readable/removable without elevation. |
| `REQ-STARTUP-162` | The hand-over is silent, surfaces a window, and "SHALL write nothing to the preference store … and nothing to any per-user or per-workspace state". |
| `REQ-STARTUP-163` | "A workspace directory a launch carries SHALL be honoured, whether that launch becomes the instance or is handed to one." |
| `REQ-STARTUP-164` | Claim → hand-over → **"Where the hand-over is not acknowledged within 5 seconds** … the launch SHALL reclaim the record and retry the exclusive claim exactly once." At most one reclaim, two claim attempts, no spin. "Probing whether the recorded process is running SHALL have no effect on that process." And: **"Every path therefore ends with exactly one instance running and a window on screen."** |
| `REQ-STARTUP-155` | 5 s to paint the main window; a handed-over launch "paints no window of its own, **is bounded instead by the hand-over interval of `REQ-STARTUP-164`**". |
| ADR-0055, verification obligation | (1) a record left by a process killed without cleanup must not make the application unlaunchable; (2) **"A recorded process that is running but not answering must be resolved within the stated interval, with at most one reclaim, and without spinning"**; (3) the probe must leave the probed process unaffected. |

Two readings follow directly from that text and are used throughout.

- **`REQ-TOOLS-063`'s dialog is not a platform dialog.** A minimum size in logical pixels, three
  specifically-styled buttons, a monospace detail box with an accessible description, and a
  buttons-disabled status-line state are not things a platform message box offers. `REQ-SHELL-164`
  enumerates the product's native dialogs and the approval prompt is **not** among them. So the approval
  prompt is an application window, and the native-dialog result in §4.4 is not about the approval prompt
  itself — it is about every *other* dialog the product raises on the same thread.
- **`REQ-STARTUP-155` hands the handed-over launch's budget to `REQ-STARTUP-164`.** The number to test
  the second launch against is therefore **5 seconds**, not 5 seconds of paint plus something else.

---

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

## 4. Raw results — presenter liveness

### 4.1 The floor: what an unblocked main costs

Aggregated over the **12 runs in which main was never deliberately blocked** (`idle`, `msgbox-async`,
`filedialog-async`, `modal-window`, 3 repetitions each), **258.1 s** of heartbeating at a 250 ms interval:

| | run host → main (`parentPort`) | run host → renderer (`MessagePort`) |
|---|---|---|
| replies | n = 1,003 | n = 1,001 |
| round-trip p50 / p95 / p99 / max | 1.174 / 2.157 / 3.231 / **18.382** ms | 1.098 / 2.045 / 8.272 / **291.602** ms |
| inter-reply gap p50 / p95 / p99 / max | 263 / 266 / 267 / **303** ms | 263 / 266 / 269 / **545** ms |
| gaps > 400 ms | **0** | **1** |

The single 545 ms renderer gap occurred once, in one `msgbox-async` run, 3.4 s after the dialog appeared;
the other two repetitions of that scenario showed a maximum gap of 267 ms. **No cause was determined and
none is asserted.** It is recorded because it is the only false-lapse candidate in 258 s and it was on
the renderer channel, not on main's.

Per-scenario, per-repetition (baseline RTT is over the ~15 replies before the action begins):

```
scenario          rep   baseP50  baseMax   maxGapM   maxGapR   det500ms   IsHungAppW      SMTfail
idle              rep1    1.123    1.542       267       266          -        never        never
idle              rep2    1.124    1.451       283       267          -        never        never
idle              rep3    1.980    3.670       268       267          -        never        never
busy              rep1    1.246    1.541      8148       266       +386        +5176         +309
busy              rep2    0.874    1.383      8122       267       +406        +5407         +528
busy              rep3    1.241    1.404      8109       268       +421        +5435         +547
msgbox-sync       rep1    0.828    1.304      6491       267       +451        never        never
msgbox-sync       rep2    1.092    1.478      6405       267       +435        never        never
msgbox-sync       rep3    1.554    3.346      6280       268       +408        never        never
msgbox-async      rep1    1.337    2.480       303       545          -        never        never
msgbox-async      rep2    1.142    2.992       267       267          -        never        never
msgbox-async      rep3    1.373    1.640       267       267          -        never        never
filedialog-sync   rep1    1.175    1.887      7351       267       +418        never        never
filedialog-sync   rep2    1.051    1.353      7556       279       +404        never        never
filedialog-sync   rep3    1.482    3.594      7453       267       +468        never        never
filedialog-async  rep1    1.025    1.723       267       268          -        never        never
filedialog-async  rep2    1.309    1.837       267       268          -        never        never
filedialog-async  rep3    1.175    2.900       267       267          -        never        never
modal-window      rep1    1.257    1.987       267       269          -        never        never
modal-window      rep2    1.132    1.572       266       267          -        never        never
modal-window      rep3    1.228    2.357       267       332          -        never        never
```

`maxGapM` / `maxGapR` are the largest inter-reply gap on the main and renderer channels in ms;
`det500ms` is when the 500 ms lapse threshold was first crossed, relative to the start of the action;
`IsHungAppWindow` and `SMTfail` are when the Win32 signals of §4.6 first fired, same origin.

### 4.2 Does the channel look alive while main is blocked?

**Yes, in every blocked case, and that is the whole point.** In all nine blocking runs (`busy`,
`msgbox-sync`, `filedialog-sync` × 3):

- the utility process's `parentPort` **never emitted `close`** (`portClosed: false` on every one of the
  ~90 ticks per run);
- `process.kill(mainPid, 0)` from the utility process **returned true throughout**;
- sends never failed — `postMessage` accepted every heartbeat while main was blocked;
- and **nothing was lost.** After the 8,000 ms busy loop ended, all 84 outstanding replies arrived, the
  last with a measured round-trip of **7,885.330 ms**.

So the two states ADR-0019 needs to distinguish behave exactly as it assumes: **"the channel is closed"
and "the channel is open but nothing answers" are different, and the second is the one that occurs.** A
liveness check written as "did a reply ever arrive for sequence N" would report success 8 seconds late
and never fire. The check has to be **the gap since the last reply**, evaluated on a clock the run host
owns. That is what was implemented and what the `det500ms` column reports.

### 4.3 Detection latency

Time from the start of the block until the run host crossed each lapse threshold, in ms, on the
run-host → main channel:

| scenario | rep | 500 | 1000 | 2000 | 3000 | 5000 | block length |
|---|---|---|---|---|---|---|---|
| `busy` | 1 | 386 | 911 | 1969 | 3007 | 5094 | 8000 |
| `busy` | 2 | 406 | 932 | 1975 | 3033 | 5105 | 8001 |
| `busy` | 3 | 421 | 952 | 1985 | 3045 | 5121 | 8000 |
| `msgbox-sync` | 1 | 451 | 980 | 2011 | 3043 | 5145 | 6412 |
| `msgbox-sync` | 2 | 435 | 964 | 2009 | 3041 | 5159 | 6310 |
| `msgbox-sync` | 3 | 408 | 934 | 1980 | 3011 | 5117 | 6170 |
| `filedialog-sync` | 1 | 418 | 933 | 1974 | 3006 | 5095 | 7256 |
| `filedialog-sync` | 2 | 404 | 933 | 1964 | 3010 | 5100 | 7444 |
| `filedialog-sync` | 3 | 468 | 996 | 2027 | 3084 | 5179 | 7405 |

Detection latency is `threshold + up-to-one-poll-interval`, as expected, and is the same for all three
block causes. **The heartbeat does not care why main stopped answering** — which is the correct
behaviour for a capability test.

The false-lapse floor from §4.1 and this table bracket the lapse window on both sides. On this host, with
this workload, a threshold anywhere in **[400 ms, ∞)** produced no false lapse in 258 s and detected every
real one. That is a *floor*, not a size: it says nothing about main under the frame load ADR-0019 cites
from the `ipc-hop-latency` spike (**22,777 ms of event-loop lag while dropping and reordering nothing**),
and the window has to clear that too. **This spike does not size the lapse window; OQ-39 stays open.**

### 4.4 The decisive measurement — which main-process callbacks survive a native modal

This is the case the earlier measurement missed. All five probes ran concurrently in one process tree; n=1
per scenario. "during-action" counts the probe events that fired between `action-begin` and `action-end`.

| probe | `msgbox-sync` (6,489 ms) | `filedialog-sync` (7,339 ms) | `busy` (8,000 ms) |
|---|---|---|---|
| `setInterval(250 ms)` on **main** | **0** — max gap 6,742 ms | **0** — max gap 7,621 ms | **0** — max gap 8,061 ms |
| `ipcMain.on` from the renderer | **0** — max gap 6,648 ms | **0** — max gap 7,571 ms | **0** — max gap 8,957 ms |
| main → renderer → main round trip | **0** — max gap 6,666 ms | **0** — max gap 7,587 ms | **0** — max gap 8,964 ms |
| `utilityProcess` `parentPort` reply | **0** — max gap 6,601 ms | **0** — max gap 7,417 ms | **0** — max gap 8,149 ms |
| run host ⇄ **renderer** `MessagePort` | **25** — max gap 267 ms | **28** — max gap 267 ms | **31** — max gap 267 ms |

**Read this plainly. While a synchronous platform-native dialog is open on main, no JavaScript of any
kind runs on main.** Not a timer, not a Chromium-IPC handler from the renderer, not the utility-process
channel. A native modal is indistinguishable, from the run host's side, from a main process spinning in
an infinite loop. The only transport that survives is the one that never touches main: the run host's
direct `MessagePort` to the renderer, which kept answering at full cadence throughout.

Two further results bound the damage:

- **The dialog `REQ-TOOLS-063` actually specifies is harmless.** `modal-window` — a
  `BrowserWindow({ parent, modal: true, 560×380 })`, window class `Chrome_WidgetWin_1` — produced a
  maximum main-channel gap of **266–267 ms across three repetitions**, i.e. no lapse at all. Main's loop
  is not blocked by its own modal child window. **ADR-0019's third obligation is satisfiable for the
  approval prompt.**
- **The asynchronous forms of the native dialogs are harmless too.** `msgbox-async` and
  `filedialog-async` produced maximum main-channel gaps of **267–303 ms** while the very same
  `#32770` native dialog was on screen for ~6 s. The blocking is a property of the **`Sync` call**, not
  of the native dialog.

So the finding is not "the heartbeat cannot cross a modal dialog, therefore ADR-0019's remedy fails".
It is narrower and more actionable: **the heartbeat cannot cross a *synchronous* native dialog, and the
product specifies native dialogs on ordinary paths.** `REQ-WORKSPACE-009` requires the OS folder chooser
for choosing a project, reached from the title bar (`REQ-WORKSPACE-016`), from the first-launch prompt
(`REQ-SHELL-011`), from the workspace chip (`REQ-SHELL-021`) and from diagnostics (`REQ-SHELL-163`); and
`REQ-SHELL-119` raises a native message box asking **"Quit while run is active?"** — by construction,
while a run is active. If any of those is opened with a `…Sync` call, then for as long as the user leaves
it open the whole application looks wedged, the lapse fires, `REQ-TOOLS-177` cancels every waiting
approval (`cancelled` → deny, source `cancelled`, `REQ-TOOLS-052`), and every subsequent `ask` routes to
`runtime.headless_approval_policy`. A user picking a folder would silently deny their own agent's tool
calls. A user answering "Quit while run is active?" would deny the very run they are being asked about.

### 4.5 A crashed main: the channel never closes, because the run host does not outlive main

Three repetitions each of `crash` (`process.crash()` on main) and `kill` (`taskkill /F` on main's pid
only, no `/T`):

| | `crash` r1 / r2 / r3 | `kill` r1 / r2 / r3 |
|---|---|---|
| main exit code | 4294930435 (all three) | 1 (all three) |
| last main-channel reply, relative to main's death | −122 / −64 / −93 ms | −141 / −268 / −182 ms |
| run-host records written **after** main's death | **0 / 0 / 0** | **0 / 0 / 0** |
| `parentPort` `close` observed | **never** | **never** |
| run-host pid still present when probed | `false` at +341 / +207 / +241 ms | `false` at +279 / +242 / +211 ms |

**The `utilityProcess` dies with main, inside about a quarter of a second, and never observes the
channel closing.** In one of six runs (`kill`, rep 2) the run host managed a single tick 3 ms before the
driver's `taskkill` call returned: it recorded `main-pid-gone` with `gapMain_ms: 263` and, in the same
record, **`portClosed: false`** — the pid was already gone and the port still had not reported closed.
Two milliseconds later the run host was gone too.

This does not produce a hang — nothing survives to hang. But it means ADR-0019's sentence *"it is revoked
automatically when the channel to main closes … That is the correct direction and it is reached **without
a timeout**"* describes a path that, in this topology on this platform, **the run host never executes for
the main-died case.** What actually happens is that the run and its host cease to exist along with main.
Whatever else that is, it is not "route every ask to the headless policy". Anything the design expects to
happen on the way down — settling pending approvals, flushing the session, writing a terminal timeline
entry — has to be somewhere other than the run host, or it does not happen at all.

### 4.6 What signal Electron itself gives, and whether a utility process can use it

- **Electron's `unresponsive` / `responsive` events are `webContents` events.** They report on a
  *renderer*, and they are emitted **by main**. A wedged main emits nothing. They are structurally
  unusable for this question and no measurement can change that.
- **`utilityProcess` exposes no observer of its parent.** The child has `process.parentPort` (no `close`
  before it dies, §4.5), `process.ppid`, and nothing else that bears on main's liveness.
- **The operating system does have a signal, and it is the wrong one.** From an external process, for
  the main window (`Chrome_WidgetWin_1`, title marker), measured every 250 ms:

  | main is… | `IsHungAppWindow` | `SendMessageTimeout(WM_NULL, SMTO_ABORTIFHUNG, 300 ms)` |
  |---|---|---|
  | idle (3 runs) | never true | never failed |
  | in a **busy loop** (3 runs) | **true from +5,176 / +5,407 / +5,435 ms** | **failed from +309 / +528 / +547 ms** |
  | showing a **sync native message box** (3 runs) | **never true** | **never failed** |
  | showing a **sync native folder chooser** (3 runs) | **never true** | **never failed** |
  | showing an async native dialog, or a modal `BrowserWindow` | never true | never failed |

  The native dialog itself was also probed while open (class `#32770`, 23 samples per run):
  `IsHungAppWindow` was `0` on every sample.

  The interpretation is the obvious one and is stated as an inference: a native dialog runs a nested
  message pump on main's thread, so the thread keeps servicing window messages while running no
  JavaScript — the OS's definition of "hung" is *not pumping messages*, and by that definition main is
  perfectly healthy. **The one case the OS detects is the one case a heartbeat also detects trivially,
  and the case the OS misses is exactly the case this spike was commissioned to find.**

- **Reachability from a utility process was not measured.** `IsHungAppWindow` and `SendMessageTimeout`
  are `user32` exports; calling them from a Node `utilityProcess` needs a native addon or an FFI binding,
  neither of which was built. The figures above were taken from PowerShell with P/Invoke, i.e. from a
  third process. **No claim is made that a run host can reach them, and given the table above there is no
  reason to try.**

---

## 5. Raw results — the single-instance claim on Windows

### 5.1 Second launch refused, hand-over delivered, workspace carried

Two runs of `basic`. P1 holds the claim; P2 launches from working directory `ws-beta` carrying
`--workspace=<ws-beta>`; P3 launches carrying nothing.

| | run 1 | run 2 |
|---|---|---|
| P1 `requestSingleInstanceLock()` → | `true`, **7.147 ms** | `true`, **4.894 ms** |
| …called at | t = 8 ms into the process | t = 6 ms |
| P2 → | `false`, **4.242 ms** | `false`, **3.495 ms** |
| P2 total process lifetime | **182 ms** | **190 ms** |
| P2 exit code | 0 | 0 |
| P3 → | `false`, **3.325 ms** | `false`, **3.378 ms** |
| P3 total process lifetime | **184 ms** | **180 ms** |

The primary's `second-instance` handler fired **in the same millisecond** as the second launch's `false`
return, in both runs and for both P2 and P3.

**The record.** `app.getPath('userData')` is `C:\Users\ganga\AppData\Roaming\rotaris-spike16`; the
directory listing taken at the primary's first `ready` on a fresh profile contained exactly one entry:
**`lockfile`**. It is one per user account, outside every workspace, not a preference key, and was
created and read without elevation. After the primary was killed with `taskkill /F`, `lockfile` was
**still present** and did not prevent the next launch from claiming (§5.2) — so the file is not itself the
exclusion, and "released when that instance's process ends" is satisfied by the mechanism rather than by
the file disappearing.

**The workspace path arrives, and `argv` is exactly as untrustworthy as ADR-0055 says.** The
`second-instance` payload delivered:

- `additionalData` = `{ "workspace": "<…\\ws-beta>", "label": "P2-second", "sentAt": 1788302182913 }` —
  the declared field, verbatim, byte-for-byte the string the launch passed.
- `workingDirectory` = `<…\ws-beta>` — correct.
- `argv` — contained `--workspace=<…\ws-beta>`, but Chromium had **appended
  `--allow-file-access-from-files`** and **moved the application-path argument to the end** of the array.
  This is precisely the "parameters appended or ordering altered by the platform" that ADR-0055 cites as
  its reason for putting the directory in `additionalData`. **Confirmed by measurement, not by
  documentation.**

**The handed-over launch writes nothing.** A recursive snapshot of the 49-file per-user data tree taken
immediately before P2 and immediately after it exited: **0 added, 0 removed, 0 changed.** P2 emitted no
`ready` record at all — it never reached `app.whenReady()`, which is the structural reason rather than a
discipline. (The primary was running concurrently and could in principle have written during the 191 ms
window; it did not, so the observation is clean, but the isolation is circumstantial rather than
designed.)

### 5.2 The claim is released when the holder is killed without cleanup

`taskkill /F /PID <primary>` — no `/T`, no cleanup, no chance to run an exit handler.

**Fresh-launch measurement** (`basic`, 2 runs). The driver spawns P4 as soon as `taskkill` returns:

| | run 1 | run 2 |
|---|---|---|
| P4 spawned, after `taskkill` returned | +29 ms | +27 ms |
| P4 process reached its first line | +181 ms | +181 ms |
| P4 `requestSingleInstanceLock()` → `true`, on the **first attempt** | +187 ms, taking 4.831 ms | +187 ms, taking 5.046 ms |
| P4 window shown | +345 ms | +373 ms |

Electron's own floor, from `spawn` to the first line of `main.js`, was **137–154 ms** across the four
launches of run 2, so **the 187 ms is dominated by process startup, not by the claim.**

**Bracketed measurement** (`release-timing`, 2 runs). A separate Electron process calls
`requestSingleInstanceLock()` every ~62 ms across the kill:

| | run 1 | run 2 |
|---|---|---|
| consecutive `false` results before the kill | **65** (each 0.97–2.11 ms) | **65** |
| last `false` | `taskkill` − **38 ms** | `taskkill` − **37 ms** |
| first `true` | `taskkill` + **31 ms**, taking 5.42 ms | `taskkill` + **30 ms**, taking 5.86 ms |
| release bracketed to | **69 ms** | **67 ms** |

**The claim becomes available within about 70 ms of the holder being force-killed**, and a fresh launch
cannot get there faster than its own ~150 ms of startup. A crashed instance does not make the product
unlaunchable, and nothing close to `REQ-STARTUP-155`'s 5 s is consumed.

Incidentally measured: `requestSingleInstanceLock()` is safe to call repeatedly from one process — 65
calls, no error, no crash — and every failed call delivered a `second-instance` event to the primary,
which absorbed all 65 without any change in its own behaviour.

### 5.3 A primary that is running but not answering — this is where it breaks

`wedge-busy`, 2 runs. The primary enters a synchronous busy loop 4.9 s after start. The second launch is
spawned 2.85 s into the wedge, well before the OS decides anything is wrong.

| | run 1 (40 s wedge) | run 2 (25 s wedge) |
|---|---|---|
| `IsHungAppWindow` on the primary's window | — | true from **+5.03 s** into the wedge |
| second launch: `app.requestSingleInstanceLock()` **blocked for** | **20,004.604 ms** | **20,010.890 ms** |
| …and returned | **`false`** | **`false`** |
| second launch total lifetime | 20,190 ms | 20,192 ms |
| second launch exit code | 0 | 0 |
| windows shown by the second launch | **none** | **none** |
| primary's `second-instance` handler | not observed | **never fired**, including the **25 s after the wedge ended** |

Run 2 was designed to settle the "delayed or lost" question and settles it: the wedge ended at +29,954 ms,
the primary went on running normally for 25 further seconds, and **the hand-over never arrived**. It was
not queued behind the block. It was dropped.

Against `REQ-STARTUP-164`:

- **the 5-second bound** — the call blocked **20.0 s**, four times over, twice, with a spread of 6 ms
  between the two samples (consistent with a fixed 20-second timeout inside the platform primitive; the
  constant is inferred from two samples and is not claimed from any source);
- **"reclaim the record and retry the exclusive claim exactly once"** — no reclaim happened and no second
  claim attempt was made; the launch simply reported `false`;
- **"Every path therefore ends with exactly one instance running and a window on screen"** — one instance
  was running and **no window was on screen**. The user double-clicks the icon, waits twenty seconds, and
  gets nothing at all;
- and the failure is **invisible by construction**. `false` means "you have been handed over", and
  `REQ-STARTUP-162` requires a handed-over launch to be silent — no window, no dialog, no banner, no
  error. The launch cannot tell a successful hand-over from a failed one, and the requirement forbids it
  from reporting the difference even if it could.

**The other kind of "not answering" behaves in the exact opposite way.** `wedge-modal`, 2 runs — the
primary is blocked in `dialog.showMessageBoxSync`, so it runs no JavaScript but does pump messages:

| | run 1 | run 2 |
|---|---|---|
| modal open for | 8,338 ms | 8,540 ms |
| second launch `requestSingleInstanceLock()` → `false` in | **4.067 ms** | **4.82 ms** |
| primary's `second-instance` handler ran | **+2,742 ms into the modal** | **+2,870 ms into the modal** |
| primary's own `setInterval(500 ms)` during the modal | **0 firings** (largest tick gap 8,840 ms) | **0 firings** |

So the primary's `second-instance` JavaScript callback executed **while its own timers were dead**. The
inference — stated as an inference — is that Chromium's Windows process-singleton notification is handled
in the hidden window's window procedure, which the modal's nested message pump dispatches synchronously,
whereas Node timers and the utility-process channel are driven from the outer loop that is not running.
Whatever the mechanism, the observable is not in dispute and it is uncomfortable: **a hand-over can be
delivered into a process that is otherwise entirely stopped**, which means the handler will run at an
arbitrary point inside a nested loop, not at a quiescent point of main's own event loop.

### 5.4 The probe leaves the probed process unaffected

Across `basic` (2 probes per run) and `release-timing` (65 probes per run):

- the primary's pid was unchanged and `tasklist` reported it alive after every probe;
- its 500 ms `setInterval` heartbeat continued with no gap attributable to a probe;
- its window remained;
- no signal, no termination, no state change other than the specified `second-instance` emission itself.

**ADR-0055 observation 3 holds on Windows.**

### 5.5 macOS and Linux — a platform blocker, stated as one

**This host runs Windows 11 only. macOS and Linux could not be measured, at all, in any part.** No macOS
machine and no Linux environment was available to this session, and neither behaviour can be inferred
from the Windows result:

- ADR-0055 itself records that **macOS is a different shape** — "a second launch of the same bundle does
  not create a second process; the system activates the running one" — and that the instance must also
  register `open-file` **before** `ready`, and handle `activate` with `hasVisibleWindows: false`. None of
  that exists on Windows and none of it was exercised.
- On Linux, Chromium's process singleton is a filesystem-based construction (a socket and a symlink in
  the profile directory), with stale-record detection, hostname comparison and reclaim rules that are
  entirely different code from the Windows hidden-window-and-`WM_COPYDATA` path measured here. The 20 s
  block of §5.3 is a property of the Windows path and says nothing about the Linux one — it could be
  better or worse.

**ADR-0055's verification obligation is explicitly "on all three platform keys of `REQ-STARTUP-030`".
One third of it has been discharged. Two thirds have not, and the Windows result must not be recorded as
if it generalised.** The Windows result is on its own sufficient to trigger the ADR's rule (§6), so the
missing two thirds do not block the *decision* — but they do block any claim that the alternative adopted
in their place is correct on those platforms, and `REQ-STARTUP-152` makes SR-1 a release-checkable claim
per platform.

---

## 6. Verdicts

| Id / obligation | Threshold and its conditions | Verdict |
|---|---|---|
| **T-31** / `REQ-TOOLS-064` — *never a hang*, detection of a live-but-unresponsive presenter | a wedged main must be distinguishable from a slow person, at `approval_timeout_seconds: 0` | **PASS, conditional.** The channel stays open and delivers nothing; a 250 ms poll with a gap threshold detected all nine blocked runs at +386…+468 ms (500 ms threshold), with zero false lapses in 258 s of unblocked running. Conditions: the check must be **gap-based**, because queued messages arrive late rather than never (one reply measured at **7,885 ms** RTT); and §4.4's constraint must hold. |
| **T-31** / `REQ-TOOLS-064` — *never a silent allow* | — | **Not exercised.** This spike measured detection, not the decision path. The direction of the failure is a property of the gate, not of the channel. |
| ADR-0019, obligation 3 — *"the poll must be answerable while a dialog is open"* | the dialog of `REQ-TOOLS-063` | **PASS.** A modal `BrowserWindow` at 560×380 left the main channel at a 266–267 ms maximum gap over three repetitions — indistinguishable from idle. |
| ADR-0019, obligation 3 — same, for the product's **other** dialogs | `REQ-SHELL-164`'s native folder choosers and message boxes (`REQ-WORKSPACE-009`, `REQ-SHELL-011`, `-021`, `-119`, `-163`) | **FAIL as ordinarily written.** While a **synchronous** native dialog is open, **no** main-process JavaScript runs — not timers, not `ipcMain`, not the utility-process channel (§4.4). The lapse fires and the application declares itself unattended while the user picks a folder. **Passes if and only if every such dialog uses the asynchronous form**, which measured a 267–303 ms maximum gap with the same native dialog on screen. This is a hard implementation constraint, not a defect in ADR-0019's remedy. |
| ADR-0019 — *"revoked automatically when the channel to main closes … without a timeout"* | main crashed or killed | **INCONCLUSIVE — the path is not exercisable.** The run host dies with main within **207–341 ms** (6/6 runs) and **never** observes `parentPort` close; in the one run that got a sample in, the pid was already gone while `portClosed` was still `false`. Nothing hangs, because nothing survives. The described mechanism is not the mechanism that operates. |
| Is there an Electron signal that main is unresponsive, usable from a utility process? | — | **No, none found.** `unresponsive`/`responsive` are `webContents` events emitted by main. The OS signals exist but detect the wrong case: `IsHungAppWindow` fired at **+5.18/+5.41/+5.44 s** for a busy loop and **never** for a native modal; `SendMessageTimeout(SMTO_ABORTIFHUNG)` failed at **+0.31/+0.53/+0.55 s** for a busy loop and **never** for a native modal. Reaching either from a Node utility process needs a native addon or FFI and **was not measured**. |
| ADR-0055 observation **1** — a record left by a process killed without cleanup must not make the application unlaunchable, and the next launch must reach a window within 5 s | `taskkill /F`, then relaunch | **PASS.** Claim reacquired on the **first attempt** at **+187 ms** after `taskkill` returned (2/2), window shown at **+345 / +373 ms**; the release itself bracketed to a **69 ms / 67 ms** window by a 62 ms poller. Note the window is this harness's trivial one, not a product first paint. |
| ADR-0055 observation **2** — a running-but-not-answering primary resolved within the stated interval, at most one reclaim, no spin | `REQ-STARTUP-164`: **5 s**, one reclaim, two attempts; **"every path ends with … a window on screen"** | **FAIL, on Windows, for a primary that is not pumping messages.** `requestSingleInstanceLock()` blocked **20,004.6 / 20,010.9 ms**, returned `false`, performed no reclaim and no retry, and the hand-over **never reached the primary — not even after it recovered.** The launch ended with no window. **PASS** for a primary that is pumping but JS-blocked (4.07 / 4.82 ms, event delivered *during* the modal). One sub-case failing is enough. |
| ADR-0055 observation **3** — the probe must leave the probed process unaffected | — | **PASS.** 65 consecutive probes plus 4 discrete ones; primary alive, pid unchanged, timers uninterrupted, window intact, no signal. |
| `REQ-STARTUP-163` — a workspace directory a launch carries is honoured when handed over | the path must arrive intact | **PASS for the transport.** `additionalData.workspace` arrived verbatim; `workingDirectory` arrived correct; `argv` arrived **reordered with `--allow-file-access-from-files` appended**, confirming ADR-0055's reason for not trusting it. What the primary *does* with the directory was not measured. |
| `REQ-STARTUP-162` — the handed-over launch writes nothing | preference store and per-user/per-workspace state | **PASS.** 49-file tree, **0 added / 0 removed / 0 changed**; the launch never reached `app.whenReady()`. |
| `REQ-STARTUP-161`'s observable record properties | one per account, outside workspaces, not a preference key, no elevation | **PASS on Windows.** A single file `lockfile` under `%APPDATA%\<appName>`, created without elevation. Note it **survives a force-kill** and is not itself the exclusion. |
| macOS, Linux — all of the above | ADR-0055 requires all three platform keys | **BLOCKED — not measurable on this host.** See §5.5. |

**The single sentence this spike exists to produce:** ADR-0055's stated rule — *"if any of the three does
not hold, alternative I is adopted for the claim and the platform primitive is dropped, not wrapped in a
timeout"* — **fires.** Observation 2 does not hold on Windows. And it cannot be rescued by wrapping,
because the call is **synchronous**: it blocked the launching process's own main thread for twenty
seconds, and the call as invoked takes no timeout argument. There is nothing to put a timeout around
without moving the claim off the launch's main thread entirely, which was not measured.

---

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

## 8. Impact on ADRs — reported, not applied

No ADR, `constraints.md`, `README.md` or `open-questions.md` file was edited by this spike. The following
is what the measurements say about those records.

**ADR-0019 — approvals and the presenter capability.**
1. The channel-level liveness heartbeat **works as designed** for detection, and the state it detects is
   real and reproducible. The record's existing sentence that the `ipc-hop-latency` spike "did not measure
   a main that was showing a dialog" can now be closed for the dialog `REQ-TOOLS-063` specifies: a modal
   `BrowserWindow` costs the poll nothing (§4.4).
2. Obligation 3 needs to be **restated more strongly and more narrowly**. It currently reads as a
   constraint on how the approval dialog is shown. The measurement says the exposure is not the approval
   dialog at all — it is every **synchronous native** dialog the product raises anywhere, most of which
   belong to other domains (`REQ-WORKSPACE-009`, `REQ-SHELL-011`, `-021`, `-119`, `-163`). The obligation
   that actually protects the design is: *no synchronous platform-dialog call may ever be made on main.*
   That is an application-wide rule, and nothing in the current text puts it where the people writing the
   workspace chooser or the close guard would read it.
3. The consequence that registration "is revoked automatically when the channel to main closes … without
   a timeout" is **not reachable from the run host** for a dead main, because the run host dies first
   (§4.5). Either the ADR should say that the main-died case is handled by the run host ceasing to exist,
   or the topology has to change. As written it describes a revocation that never runs.
4. `REQ-SHELL-119`'s **"Quit while run is active?"** is worth calling out by name in the record: it is a
   native message box raised precisely when an approval is most likely to be in flight.

**ADR-0055 — startup sequencing and the instance claim.**
1. The verification obligation is **discharged on Windows and fails**. Observation 2 does not hold: 20.0 s
   against a 5 s bound, no reclaim, no retry, no window, and a hand-over that is dropped rather than
   delayed. By the ADR's own stated rule, **alternative I — our own record file — is adopted for the
   claim, and this is not a decision the ADR left to a later reading.**
2. The reason the primitive cannot be wrapped is now a measurement rather than an argument: the call is
   synchronous on the launching process's main thread and takes no timeout.
3. Everything else the ADR chose the primitive *for* was confirmed and should be carried into
   alternative I as a requirement on the replacement, not lost with the primitive: sub-5 ms claim latency
   (§5.1), release within ~70 ms of a force-kill (§5.2), a probe with no effect on the probed process
   (§5.4), and `additionalData`-style declared-field delivery — because `argv` **was** measurably mangled
   (§5.1) exactly as the ADR predicted.
4. The record's "on all three platform keys" is **two thirds unmet** (§5.5). Adopting alternative I does
   not remove that obligation, it relocates it: a hand-over endpoint and a stale-record protocol we write
   ourselves must be verified on macOS and Linux too, and on macOS must additionally compose with the
   convention that a second launch produces no second process.
5. The 20 s hole and ADR-0019's wedged presenter are **the same host state seen from two sides**. A main
   that stops pumping messages both (a) fails the approval liveness poll and (b) swallows the instance
   hand-over. Whatever detects one is in a position to inform the other, and the two records currently
   reason about it independently.

**ADR-0002 — process topology.** §4.5 is a topology fact the record does not currently carry: a
`utilityProcess` run host **does not outlive main** on Windows (gone in 207–341 ms), so nothing that must
happen after main dies can be placed in the run host. §4.4 adds a second: the run host ⇄ renderer direct
`MessagePort` is the **only** transport in the tree that survives a blocked main, which is a robustness
argument for those ports that is independent of the throughput argument already recorded.

**`constraints.md` T-31 (HARD).** The *never a hang* half is reachable, with the two conditions in §6.
The row as written does not mention that reachability depends on an application-wide prohibition on
synchronous native dialogs, and on this evidence it should.

---

## 9. Files and reproduction

All under
`C:\Users\ganga\AppData\Local\Temp\claude\D--Development-Apps-Rotaris-crw\8ddb8c86-64f1-495f-8cc7-35576c51f79c\scratchpad\spike-liveness\`
(throwaway; nothing was written into the repository except this report):

| Path | What it is |
|---|---|
| `s14/main.js` | main process: forks the run host, transfers a `MessagePort` to the renderer, answers heartbeats, runs one scenario, carries the timer / `ipcMain` / round-trip probes |
| `s14/runhost.js` | the `utilityProcess` stand-in for ADR-0002's run host: dual-channel 250 ms heartbeat, gap accounting, threshold crossings, parent-pid poll |
| `s14/index.html` | renderer: answers the transferred port, pings `ipcMain`, echoes the round trip |
| `s14/watch.ps1` | external observer and dialog dismisser: `IsHungAppWindow`, `SendMessageTimeout(SMTO_ABORTIFHUNG)`, `WM_CLOSE` after a 6 s hold |
| `s14/driver.js` | one Electron launch per scenario, hard timeout, tree kill, run-host survival probe |
| `s16/main.js` | claims before `whenReady`, logs `second-instance` payloads, optional busy/modal wedge, poller mode |
| `s16/driver.js` | the four scenarios of §3.2, including `taskkill /F` and the userData snapshot/diff |
| `s16/watch16.ps1` | enumerates every visible window of every `electron.exe`, closes any `#32770` after an 8 s hold |
| `out/rep1|rep2|rep3/s14-*.jsonl` | raw per-repetition logs, one JSON object per line, Electron and watcher records interleaved by wall clock |
| `out/s16-*.jsonl` | raw single-instance logs |
| `analyse.py`, `report.py`, `summary.py`, `watchsum.py` | the analysis used to produce every table above |

Commands, from the harness directory in Git Bash:

```sh
node s14/driver.js idle busy msgbox-sync msgbox-async filedialog-sync filedialog-async modal-window crash kill
node s16/driver.js basic
node s16/driver.js wedge-busy
node s16/driver.js wedge-modal
node s16/driver.js release-timing
python summary.py            # the §4.1 per-scenario table
python report.py <scenario>  # the correlated per-scenario timeline
```

The Electron binary is `spike-base`'s, referenced by absolute path and **not reinstalled** — per that
directory's gotcha 5.1, `npm install electron` no longer downloads it and the first `require` would
otherwise have been timed with a 150 MB fetch inside it.
