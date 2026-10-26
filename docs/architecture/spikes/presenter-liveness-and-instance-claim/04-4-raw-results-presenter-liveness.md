# Spike — the wedged presenter, and the single-instance claim on Windows — 4. Raw results — presenter liveness

Part 4 of 9 of [the spike report](../presenter-liveness-and-instance-claim.md), which indexes every part.

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
