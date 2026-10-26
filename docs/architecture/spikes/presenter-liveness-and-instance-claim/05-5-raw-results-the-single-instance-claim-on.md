# Spike — the wedged presenter, and the single-instance claim on Windows — 5. Raw results — the single-instance claim on Windows

Part 5 of 9 of [the spike report](../presenter-liveness-and-instance-claim.md), which indexes every part.

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
