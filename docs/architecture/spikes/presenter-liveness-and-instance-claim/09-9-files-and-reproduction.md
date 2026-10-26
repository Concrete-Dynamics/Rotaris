# Spike — the wedged presenter, and the single-instance claim on Windows — 9. Files and reproduction

Part 9 of 9 of [the spike report](../presenter-liveness-and-instance-claim.md), which indexes every part.

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
