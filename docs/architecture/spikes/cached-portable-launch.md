# Spike — the cached launch of the Windows `onefile` portable

- **Date:** 2026-09-02
- **Question:** SR-7 ruled that the single-file Windows portable **prepares itself once into a cache and
  launches from that cache afterwards**, keeping `REQ-STARTUP-013`'s single-executable observable and
  `REQ-STARTUP-031`'s closed artifact set unchanged and giving `REQ-STARTUP-155` a first-run-of-a-version
  exemption (`REQ-STARTUP-165`). SR-7 makes a measurement of that cached launch a **gate condition** and
  records that the only evidence the target is reachable is spike 17's **0.7 s file-copy baseline — which
  is a baseline and not a result.** This spike measures the mechanism.
- **Scope:** measurement only. No product code was written and none is authorised. Everything built here
  lives in the session scratchpad; nothing was added to this repository except this document.
- **Verdict, in one line:** **the warm-cache launch meets the 5,000 ms bound with a wide margin — 575.5
  to 723.1 ms over 12 launches at spike 17's anchor bundle weight, and 897.3 to 1,414.6 ms with the
  operating-system file cache dropped** — the exempted preparing run also lands inside the bound at
  1,634.7 to 2,091.3 ms, the version check on the fast path costs **0.13 to 0.49 ms**, and SR-7's ruling
  is sound. Two defects were found in the mechanism as ADR-0054 currently describes it, both fixable and
  both stated in §8 and §15.

---

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| CPU | Intel Core i7-10875H @ 2.30 GHz, 8 physical / 16 logical cores |
| RAM | 16,953,679,872 B (15.79 GiB) |
| Storage | `C:` NTFS 1,022,726,901,760 B total / 51,263,311,872 B free; `D:` NTFS 1,000,202,039,296 B / 708,655,611,904 B free. Physical: `CT1000P310SSD8` (SSD) and `WDC PC SN530 SDBPNPZ-1T00-1002` (SSD) |
| Node (host) | v24.11.0, npm 11.12.1 |
| Rust | `rustc 1.91.1 (ed61e7d7e 2025-11-07)`, host `x86_64-pc-windows-msvc`, LLVM 21.1.2; `cargo 1.91.1` |
| Electron | `electron@44.1.0` — Chromium `152.0.7977.65`, Node `24.19.0`, V8 `15.2.124.18-electron.0` (read from the running packaged app, not from a changelog) |
| Packaging of the payload tree | `electron-builder@26.15.3`, `dir` target (the `onedir` tree only) |
| Launcher | written for this spike in Rust, 330,752 B, `#![windows_subsystem = "windows"]`, one third-party crate (`flate2` with the pure-Rust `miniz_oxide` backend) plus `sha2` for the check benchmark |
| Anti-malware | **Microsoft Defender was on and was not disabled.** `AMServiceEnabled=True`, `RealTimeProtectionEnabled=True`, `AntivirusEnabled=True`, `AMEngineVersion=1.1.26070.7`, `AntivirusSignatureVersion=1.457.442.0`. This matters — see §11 |
| Artifact location | the session scratchpad on `C:` |
| Preparation location | the real `%LOCALAPPDATA%` on `C:` — `C:\Users\ganga\AppData\Local\rotaris\launch\<token>\`. Removed at the end of the spike |
| Concurrency | **other agents were working on this machine throughout.** CPU busy in the 400 ms before each launch was sampled per run and ranged **1.2 %–70.5 %** |

Same machine, same OS build, same Electron and same Node as spike 17 (`packaged-first-paint.md`) and as
the `spike-base` toolchain note, so the figures here are directly comparable with both.

---

## 2. What the requirements say as they now stand, and what that forced the method to measure

`REQ-STARTUP-155` and `REQ-STARTUP-165` were read in full from `docs/spec/11-startup-distribution-updates.md`
before anything was built. Seven clauses decided the experiment.

1. **The bound and its clock are unchanged.** "The main window SHALL be painted within 5 seconds of the
   application being launched … That bound is on the launch that becomes the running instance." So the
   clock still starts at the artifact the user double-clicks, and everything the launcher does is inside
   the budget. The harness timestamps immediately before `CreateProcess` on the artifact.
2. **The exemption is narrow and it is per artifact version, not per flavour.** "Where an artifact
   published in `onefile` mode prepares itself for launching under `REQ-STARTUP-165`, the run that
   performs that preparation is exempt … for the preparation it performs and for nothing else … Once an
   artifact has prepared, **every later run of that same artifact SHALL paint within the 5 seconds this
   requirement fixes**." The requirement closes with "there is no per-flavour budget, only a
   per-artifact-version first run." **The cached run is therefore judged against 5,000 ms with no
   allowance whatsoever**, and the preparing run is measured anyway so the exemption is priced rather
   than assumed.
3. **A redo counts as a first run.** "a run that prepares again because the existing preparation is
   incomplete, unreadable, or not the one belonging to this artifact (`REQ-STARTUP-165` (c)) is a first
   run of that version for this purpose, so recovering from an unusable preparation never makes a build
   non-conformant." So the redo is exempt — but §8 shows the interesting question is not its cost, it is
   whether the damage is detected at all.
4. **Clause (c) forbids failure.** "A preparation that is incomplete, unreadable, or not the one
   belonging to this artifact SHALL cause the artifact to prepare again, and **SHALL NOT cause the launch
   to fail**, to warn, or to report anything at all to the user. Preparing is the recovery path and SHALL
   never be the failure path." That makes "was it detected" a conformance question, not a performance
   one, and §8 tests it directly.
5. **Clause (a) fixes where the preparation lives and what the artifact's own medium may suffer.** It
   must sit in the per-user data directories of `REQ-STARTUP-145` in machine-local storage; "Starting the
   artifact SHALL write nothing to that directory and nothing to that medium", and the artifact must
   still run from read-only and removable media. §10 tests both.
6. **Clause (e) and `REQ-STARTUP-106` fix the update target.** "A run started from a preparation SHALL be
   able to identify the artifact file the launch started from. That file, and never the preparation, is
   the update target." `REQ-STARTUP-106` adds that the classification "SHALL never be taken from a copy
   the artifact made of itself in order to run", and `REQ-STARTUP-125` requires the replacement to
   "succeed while the application that is being replaced is still running". §9 measures all three.
7. **No percentile is stated.** As in spike 17, verdicts below are taken against the **maximum** observed
   in each group, with min and median given so a softer reading is available. No verdict changes under
   either reading.

The measured event, **first paint**, is spike 17's definition unchanged: the second
`requestAnimationFrame` callback in the renderer *after the window was shown*, relayed to the main
process and thence over a loopback socket to the timing parent, which timestamps it on arrival. The
headline `paintAtParentMs` therefore involves **no cross-process clock assumption**.

---

## 3. Method

Throwaway harness, all under the session scratchpad, reusing the verified `spike-base` Electron install
rather than reinstalling it (`README-FOR-SPIKES.md` §5.1).

### 3.1 The payload is spike 17's anchor, rebuilt

`REQ-STARTUP-155`'s figures only mean something against a stated bundle weight. Spike 17 fixed **`W150`**
as its anchor and gave its justification; that reasoning is adopted unchanged here so the two spikes'
numbers sit on the same axis. The tree was rebuilt from spike 17's own surviving `app/payload`
(`typescript@5.9.3`, `shiki@4.4.3` + `@shikijs`, `react@19.2.8`, `react-dom@19.2.8`,
`monaco-editor@0.56.0` as declared ballast for ADR-0035's unchosen runtime, 8 real Windows font files,
a 146-certificate PEM root bundle — 4,609 files, 144.9 MiB) with `electron-builder --dir`:

| | this spike | spike 17 `W150` |
|---|---|---|
| `win-unpacked` tree | 72 files + 2 dirs, **532,573,184 B (507.9 MiB)** | 73 files, 532,679,578 B (508.0 MiB) |
| `resources\app.asar` | 148,184,324 B | — |
| build wall time (`--dir`) | 99.1 s | — |

The 106,394 B difference is the enlarged `main.js` described next. **The payload is materially the same
tree spike 17 measured**, so `onedir` and `onefile` figures across the two spikes are comparable.

### 3.2 The application under test

Spike 17's `fp/app/main.js` and `index.html` copied verbatim, with the report extended to carry
`process.execPath`, `app.getAppPath()`, `app.getPath('userData')`, `PORTABLE_EXECUTABLE_FILE`,
`PORTABLE_EXECUTABLE_DIR`, `PORTABLE_EXECUTABLE_APP_FILENAME` and the launcher's own declared variable.
The paint logic, the window, the 80 generated rows and the socket protocol are unchanged.

### 3.3 The artifact

SR-7 moves this artifact off `electron-builder`'s `portable` target (ADR-0056 records it as a fifth build
output). There is no tool to measure, so a launcher was written. **It is a measuring instrument, not a
proposal, and its numbers are evidence that the target is reachable, not a guarantee for whatever is
eventually built.**

```
artifact.exe  =  [ launcher PE, 330,752 B ] [ archive ] [ 24-byte footer: magic | archive offset | archive length ]
```

The archive is a flat index plus per-chunk blobs: every file is split into fixed-size chunks, each chunk
independently `deflate`-compressed (raw DEFLATE, Node `zlib` at the build end, `flate2`/`miniz_oxide` at
the launch end) or stored where compression does not pay. Directories and file lengths are separate
index entries so the tree can be created and pre-sized before any chunk is written, and the chunks can
then be decompressed and written **in parallel with positional writes**.

The **identity token** is a SHA-256 over the archive bytes, truncated to 32 hex characters, **computed by
the build and compiled into the launcher**, exactly as ADR-0054 specifies ("a build-time identity token
carried in the stub, not a digest computed at launch"). The preparation directory is named for that
token. A three-line marker file `.rotaris-prepared` holding `<launcher format>\n<token>\n<entry point>`
is written **last**, inside a temporary sibling directory, which is then renamed onto the token-named
path — so a directory bearing the token name exists only if it was finished.

**The fast path never opens the artifact file.** It resolves `%LOCALAPPDATA%\rotaris\launch\<token>`,
reads the marker, compares the format, the token and the entry-point name, confirms the entry point is a
non-empty file, sets the artifact's own path into a declared environment variable, spawns the payload
executable detached and exits. §7 shows why not opening the artifact matters.

Two artifacts were built from the identical tree:

| variant | method | artifact bytes | | ratio | chunks |
|---|---|---|---|---|---|
| `deflate` | raw DEFLATE, level 6, 8 MiB chunks | **191,558,344 B** | **182.68 MiB** | 2.785× | 125 |
| `store` | no compression, 8 MiB chunks | **532,914,131 B** | **508.23 MiB** | 1.000× | 125 |

Two further artifacts were built to exercise identity: `deflate` at a 4 MiB chunk size (191,614,173 B,
token `9f167bec…`, same payload, different archive → different token) and a **v1.0.1** artifact whose
tree differs by one appended line in `LICENSE.electron.txt` (191,558,356 B, token `0d791edc…`).

Build wall time for the artifact step (archive + `cargo build --release` + append) was **35.1 s** for
`deflate` and **13.1 s** for `store`, on top of the 99.1 s `--dir` build — against spike 17's
**≈2 m 40 s** for one `electron-builder` `portable` build.

### 3.4 Cold cache

Spike 17's procedure, reused unmodified (`pressure.js`): a child process allocates and touches anonymous
128 MiB buffers until `os.freemem()` — `GlobalMemoryStatusEx`'s `ullAvailPhys`, which counts standby —
falls below 150 MB, then allocates a further 1,536 MB past that point, then exits. Across the 46 cold
runs here it allocated **3,712–13,312 MB**. A 64 MiB random canary on the same volume is read inside
every cold run as a per-run witness; those reads ranged **734–2,678 MB/s** against the 1,965–2,640 MB/s
spike 17 recorded warm, so the drop was working. The same two caveats spike 17 stated apply unchanged:
the separation is modest because the storage is a fast NVMe SSD, and the procedure drains the standby
list but does not erase a Windows Prefetcher trace.

### 3.5 Repetitions

**172 launches were recorded**, 157 through the launcher and 15 directly (the `onedir` and
launch-the-preparation-directly controls of §6). 164 reached first paint; the 8 that did not are all
deliberate damage cases and are the subject of §8. Every launch that painted reported `packaged = true`.
All raw per-run records are in the scratchpad; every headline number below is quoted with its full raw
series.

**One batch was discarded and re-run.** The first damage sweep repaired the preparation between cases by
launching normally — which does not repair a tree whose damage the check does not detect, so three cases
inherited the previous case's damage. Those runs are not reported. The sweep was re-run with an explicit
wipe-and-prepare before each case (§8).

---

## 4. Results — the number that decides the ruling

First paint, milliseconds from `spawn`. **Budget: 5,000 ms.** Verdict against the maximum.

| Artifact | Run kind | OS cache | n | min | median | max | Budget | **Verdict** |
|---|---|---|---|---|---|---|---|---|
| `deflate` (182.7 MiB) | **cached (fast path)** | warm | 6 | 575.5 | 600.6 | **624.2** | 5,000 ms | **PASS** |
| `deflate` | **cached (fast path)** | cold | 6 | 897.3 | 1,115.4 | **1,242.5** | 5,000 ms | **PASS** |
| `deflate` | first run of the version *(exempt)* | warm | 5 | 1,696.2 | 1,704.5 | 1,769.7 | exempt (measured: inside) | PASS |
| `deflate` | first run of the version *(exempt)* | cold | 5 | 1,710.2 | 1,853.2 | 2,037.0 | exempt (measured: inside) | PASS |
| `store` (508.2 MiB) | **cached (fast path)** | warm | 3 | 620.3 | 630.5 | **649.4** | 5,000 ms | **PASS** |
| `store` | **cached (fast path)** | cold | 3 | 605.4 | 864.5 | **948.1** | 5,000 ms | **PASS** |
| `store` | first run of the version *(exempt)* | warm | 3 | 1,459.9 | 1,493.5 | 1,527.6 | exempt | PASS |
| `store` | first run of the version *(exempt)* | cold | 3 | 1,727.3 | 1,811.5 | **31,217.6** | exempt | see §11 |

Every one of those cells was measured twice, once with each of the two launcher builds of §8. The
independent replicate agrees throughout:

| Cell | corrected launcher | replicate (earlier launcher) |
|---|---|---|
| `deflate` cached warm | 575.5 / 600.6 / 624.2 | 581.3 / 593.9 / 723.1 |
| `deflate` cached cold | 897.3 / 1,115.4 / 1,242.5 | 964.0 / 1,153.1 / 1,414.6 |
| `deflate` first warm | 1,696.2 / 1,704.5 / 1,769.7 | 1,634.7 / 1,658.3 / 2,091.3 |
| `deflate` first cold | 1,710.2 / 1,853.2 / 2,037.0 | 1,819.3 / 1,940.2 / 2,001.5 |

Every individual measurement, per repetition:

```
deflate cached warm   600.6, 612.5, 624.2, 590.0, 582.7, 575.5   | replicate 723.1, 593.9, 596.5, 581.3, 585.5, 584.0
deflate cached cold  1115.4, 897.3, 1242.5, 986.1, 1163.0, 1071.6| replicate 1307.3, 1126.6, 1098.7, 1153.1, 1414.6, 964.0
deflate first  warm  1769.7, 1704.5, 1725.9, 1696.8, 1696.2      | replicate 2091.3, 1720.1, 1658.3, 1634.7, 1655.2
deflate first  cold  2037.0, 1710.2, 1884.0, 1747.0, 1853.2      | replicate 1940.2, 1982.1, 2001.5, 1819.3, 1889.6
store   cached warm   649.4, 630.5, 620.3                        | replicate 695.1, 707.6, 699.3
store   cached cold   948.1, 864.5, 605.4                        | replicate 1212.8, 995.3, 1104.5
store   first  warm  1493.5, 1527.6, 1459.9                      | replicate 1637.9, 1721.3, 1575.4
store   first  cold  31217.6, 1727.3, 1811.5                     | replicate 33851.0, 1608.6, 1712.9
```

**The margin is not marginal.** The worst cached launch observed anywhere in this spike, on a cold
operating-system cache, is **1,414.6 ms — 28 % of the budget**, leaving roughly 3.6 seconds for
everything ADR-0055 puts in front of first paint. The worst *exempted* preparing run, excluding the
§11 anomaly, is **2,037.0 ms**, which is inside the bound the exemption releases it from.

For orientation against spike 17, whose `onefile` portable at this same payload weight painted at
**15,342–17,432 ms**: the mechanism removes roughly **14.8 seconds** from the warm case.

### 4.1 The cost of the launcher, isolated

The same application was launched three ways on the same day, warm:

| launched as | n | min | median | max | `timeOrigin` median |
|---|---|---|---|---|---|
| plain `onedir` tree (no launcher) | 6 | 547.2 | 560.3 | 1,319.1 | 33.7 ms |
| the prepared tree, launched **directly**, bypassing the launcher | 4 | 556.2 | 563.7 | 586.4 | 35.7 ms |
| the artifact, **through the launcher**, cache hit | 6 | 575.5 | 600.6 | 624.2 | 51.5 ms |

Raw: `onedir` warm `1319.1, 552.8, 560.9, 553.4, 547.2, 560.3`; prepared-tree-direct
`586.4, 559.8, 563.7, 556.2`. (The 1,319.1 ms is the first launch from a path never launched from
before — the same confound spike 17 identified in §6.3 and controlled for; it is reported, not removed.)

**The whole launcher costs about 37 ms of the 5,000 ms budget** on a warm cache — 600.6 − 563.7. On a
cold cache the gap is larger, `onedir` cold median 738.7 ms against cached cold median 1,115.4 ms, about
**377 ms**, which is the price of paging in a second process and touching the preparation's metadata from
disk. `onedir` cold raw: `613.4, 849.6, 722.1, 738.7, 939.8`.

---

## 5. Where the time goes

Median offsets from `spawn`, in milliseconds, corrected-launcher runs.

| Group | launcher's first instruction | launcher exits | Electron `timeOrigin` | our first JS line | `app.ready` | `ready-to-show` | **first paint** |
|---|---|---|---|---|---|---|---|
| `deflate` cached, warm | 10.0 | 29.9 | 51.5 | 171.9 | 238.3 | 513.0 | **600.6** |
| `deflate` cached, cold | 41.1 | 103.4 | 202.1 | 471.9 | 606.8 | 1,033.7 | **1,115.4** |
| `deflate` first run, warm | 10.0 | 1,080.6 | 1,105.6 | 1,235.3 | 1,304.7 | 1,608.4 | **1,704.5** |
| `deflate` first run, cold | 41.6 | 1,174.5 | 1,236.3 | 1,376.8 | 1,463.7 | 1,765.6 | **1,853.2** |
| `store` first run, warm | 13.4 | 866.4 | 889.3 | 1,021.8 | 1,095.3 | 1,411.8 | **1,493.5** |
| `store` cached, warm | 10.0 | 29.3 | 52.0 | 180.3 | 247.2 | 540.6 | **630.5** |

Inside the launcher itself, medians in **microseconds** from its own first instruction:

| | cached, warm | first run, warm (`deflate`) | first run, warm (`store`) |
|---|---|---|---|
| resolve the preparation root | 47.0 | 47.2 | 45.8 |
| **version check complete** | **303.5** | 149.2 *(a miss)* | 142.7 *(a miss)* |
| displace a stale directory | — | 681.6 | 705.1 |
| footer + index read and parsed | — | 902.6 | 988.7 |
| tree created and pre-sized | — | 67,443.6 | 55,961.2 |
| **payload written** | — | **566,367.3** | **411,401.0** |
| marker written, renamed onto the token path | — | 570,512.1 | 415,365.7 |
| `CreateProcess` on the payload returns | 18,943.7 | 1,070,631.4 | 847,997.6 |
| launcher exits | 18,952.6 | 1,070,636.7 | 848,002.8 |

Read the cached column: **of the ~30 ms the launcher adds, the version check is 0.3 ms and
`CreateProcess` on the 233.9 MB Electron executable is 18.6 ms.** The check is not where the time is and
could not become so.

Read the first-run column: from the start of preparation to the payload being fully written takes
**565.7 ms** with `deflate` on 16 threads (566,367.3 − 682.6 µs) and **410.7 ms** with `store`
(411,401.0 − 705.8 µs). Spike 17's `fs.cpSync` baseline for the same tree was **684, 689 and 722 ms**;
this mechanism writes the tree slightly faster than a plain recursive copy did, because it writes 125
large chunks in parallel rather than 73 files in sequence. **The 0.7 s baseline SR-7 leaned on is met and
beaten by the real mechanism**, which is the specific thing SR-7 said had not been measured.

### 5.1 How much of the first run depends on having 16 cores

The preparing run is exempt, but pricing it on weaker hardware matters. `deflate`, warm, wiped
preparation, n = 2 per point:

| threads | first paint (ms) | launcher exits (ms) |
|---|---|---|
| 1 | **3,798.8 / 3,909.8** | 3,228.1 / 3,311.1 |
| 2 | 2,688.8 / 2,786.9 | 2,008.1 / 1,965.3 |
| 4 | 2,073.1 / 2,302.7 | 1,464.0 / 1,730.8 |
| 8 | 1,805.3 / 1,751.6 | 1,179.5 / 1,151.8 |
| 16 (default) | 1,650.7 / 1,687.4 | 1,055.6 / 1,067.3 |
| `store`, 1 thread | 1,666.2 / 1,804.7 | 1,031.0 / 1,164.0 |

**Even single-threaded, the preparing run painted at 3.8–3.9 s — inside the 5,000 ms it is exempt
from.** The `store` single-thread row isolates the cost: with no decompression at all, one thread writes
the tree in about 1.0–1.2 s, so the 3.8 s figure is roughly 2.7 s of single-threaded DEFLATE inflate
over 507.9 MiB. A machine with fewer cores pays that back proportionally, and at one core it is still
inside the unexempted bound at this bundle weight.

---

## 6. The version check on the fast path, and the alternatives

`REQ-STARTUP-165` (b) requires that "An artifact SHALL start from a preparation only where that
preparation was produced by an artifact of identical content". Something must establish that on every
launch. SR-7 flags the risk plainly: a digest over a large artifact on every launch would eat the budget
it is meant to protect. All the obvious candidates were measured with a dedicated Rust benchmark on the
real 507.9 MiB preparation and the real 182.7 MiB artifact.

**Warm cache**, microseconds, n = 200 except where noted:

| # | Candidate | min | median | max |
|---|---|---|---|---|
| **A** | **the check used here — read the marker, compare format + token + entry name, stat the entry point** | **138.3** | **199.6** | **488.3** |
| A1 | marker read alone | 88.8 | 116.7 | 436.0 |
| A2 | entry-point stat alone | 50.1 | 71.3 | 200.9 |
| A3 | preparation-directory stat alone | 45.5 | 66.8 | 269.4 |
| B | read the 24-byte footer from the artifact (open + seek + read + close) | 80.3 | 115.6 | 563.1 |
| C | stat the artifact — size and mtime only | 50.7 | 71.9 | 308.9 |
| D | SHA-256 over a 1 MiB head + 1 MiB tail of the artifact (n=50) | 15,275.1 | 15,896.3 | 31,548.3 |
| **E** | **SHA-256 over the whole artifact** (n=3) | **1,477,410.5** | **1,824,409.3** | **1,948,246.6** |
| **F** | **SHA-256 over every file of the prepared tree** (n=3) | **4,434,088.7** | **4,516,374.0** | **5,498,226.1** |
| G | stat every file of the prepared tree, 73 files (n=50) | 3,557.0 | 3,840.3 | 5,866.5 |

**Cold cache** — the same benchmark run immediately after the memory-pressure drop, n = 60. The **first**
iteration is given separately because on a cold cache the first touch is the whole story:

| # | Candidate | **first** | min | median | max |
|---|---|---|---|---|---|
| **A** | the check used here | **370.7** | 129.7 | 136.4 | 602.1 |
| A1 | marker read alone | 94.9 | 80.1 | 82.4 | 100.2 |
| A2 | entry-point stat alone | 69.9 | 47.5 | 48.0 | 73.7 |
| A3 | preparation-directory stat alone | 58.8 | 45.5 | 46.2 | 60.3 |
| **B** | **footer read from the artifact** | **342,850.7** | 74.8 | 78.8 | 342,850.7 |
| C | stat the artifact — size and mtime only | 101.4 | 49.1 | 50.6 | 275.2 |
| D | SHA-256 over 1 MiB head + tail (n=50) | 16,288.6 | 15,082.1 | 15,278.3 | 16,288.6 |
| E | SHA-256 over the whole artifact (n=2) | 1,378,989.7 | 1,378,989.7 | 1,385,745.1 | 1,385,745.1 |
| F | SHA-256 over the prepared tree (n=2) | 3,907,591.6 | 3,889,531.1 | 3,907,591.6 | 3,907,591.6 |
| G | stat every file of the prepared tree (n=50) | 4,085.9 | 3,575.2 | 3,656.2 | 4,085.9 |

The SHA-256 above is a pure-Rust `sha2`, which is what a small launcher would realistically embed. To
price the digest option as generously as possible, the same digest was also taken with the fastest
implementation on this machine, Node's OpenSSL 3.5.4 (this CPU has no SHA-NI, so this is the AVX2 path):

| file | bytes | warm ms | MB/s |
|---|---|---|---|
| the `deflate` artifact | 191,555,272 | **804.0, 845.0, 727.4, 709.6** | 227, 216, 251, 257 |
| the `store` artifact | 532,911,059 | **1,929.5, 2,052.1, 2,207.1** | 263, 248, 230 |

(These two, and the warm run of the table above them, were taken against the artifacts built with the
first launcher; the corrected launcher of §8.1 is 3,072 B larger, so the same artifacts measure
191,558,344 B and 532,914,131 B in §3.3 and in the cold table. The difference is 0.0016 % and does not
move any figure here.)

**What this establishes.**

- **The check as ADR-0054 specifies it is effectively free.** 0.14–0.49 ms warm, 0.37 ms on its first
  cold touch. Against a 5,000 ms budget it is 0.01 %. It is not a risk and does not need optimising.
- **The decision not to recompute a digest at launch is correct by a wide margin, and by more than the
  ADR claims.** Even the fastest available SHA-256 costs **709.6–845.0 ms on every launch** for a
  182.7 MiB artifact and **1,929.5–2,207.1 ms** for a 508 MiB one — 14 % to 44 % of the budget, spent to
  answer a question the build already answered. A pure-Rust digest inside a small launcher costs
  **1.48–1.95 s**. Digesting the prepared tree instead is worse still: **3.89–5.50 s**, which alone
  consumes or exceeds the entire bound.
- **There is a second, sharper reason not to read the token from a footer, which the ADR does not
  state.** Candidate B — opening the artifact and reading 24 bytes — costs 78.8 µs once the file has been
  opened before, but its **first open on a cold cache cost 342.9 ms**, four thousand times the steady-state
  figure and nine hundred times candidate A's cold first touch. A metadata-only `stat` of the artifact
  (candidate C) does not pay this; `open` does. **Compiling the token into the launcher, so the fast path
  never opens the artifact at all, is worth about a third of a second on the first launch after a boot** —
  and it is also what keeps the launcher from holding a handle on the file the updater must rename (§9).
- **`stat` of the artifact's size and mtime is cheap but is not a sound identity.** 50–102 µs, but mtime
  is settable by anyone and size collides trivially. It is not offered as an alternative, only priced.
- **Candidate G is the one alternative worth considering on its merits.** Verifying the *presence and
  length of every file* in the preparation against a manifest carried in the marker costs
  **3.56–5.87 ms** — about 0.1 % of the budget — and §8 shows it would close a real gap.

---

## 7. What "cached" means here — the preparation is genuinely reused

Spike 17's §6.2 found that `electron-builder`'s portable stub **deletes** its `%TEMP%` extraction
directory when the application exits, so every launch re-extracts and there is no warm path at all. That
does not happen here, and it was checked rather than assumed. Across 149 launches that went through the
launcher and painted:

- **149 of 149** reported `process.execPath` inside `…\rotaris\launch\<token>\`, i.e. every one ran the
  prepared image.
- After a launch completes, the token-named directory is still present with all 73 files and 507.9 MiB.
- Launching a **different** artifact does not disturb it (§10.3).

---

## 8. An incomplete or corrupt preparation

`REQ-STARTUP-165` (c) is a conformance requirement, not a performance one: damage must cause a redo and
**must not cause the launch to fail**. Each case below starts from a wipe-and-prepare, then damages the
preparation, then launches once. Warm cache, `deflate` artifact.

| damage applied | detected? | reason the launcher reported | outcome | first paint |
|---|---|---|---|---|
| marker file deleted | **yes** | `marker-absent` | redone silently | 1,648.4 ms |
| marker truncated to 6 bytes | **yes** | `marker-malformed` | redone silently | 1,671.7 ms |
| marker replaced with 5 non-UTF-8 bytes | **yes** | `marker-unreadable` | redone silently | 1,683.5 ms |
| marker names a different token | **yes** | `marker-token-mismatch` | redone silently | 1,635.9 ms |
| marker names an unrecognised launcher format | **yes** | `marker-format-mismatch` | redone silently | 1,611.0 ms |
| entry-point executable deleted | **yes** | `entry-absent` | redone silently | 1,698.8 / 1,659.3 ms |
| entry-point executable truncated to 0 bytes | **yes** | `entry-not-a-file` | redone silently | 1,967.5 ms |
| preparation directory absent entirely | **yes** | `marker-absent` | prepared | 1,634.7–2,091.3 ms (§4) |
| **`ffmpeg.dll` deleted from the tree** | **NO** | check reported a hit | **launch produced no window** | — |
| **`resources\app.asar` truncated to 1 KiB** | **NO** | check reported a hit | **launch produced no window** | — |
| `locales\` directory removed (55 files) | **no** | check reported a hit | launch painted anyway | 700.9 ms |

**Every detected case is redone silently and repaints inside 2.0 s**, which is inside the bound it is
exempt from. Nothing was reported to the user on any redo path, as `REQ-STARTUP-150` requires. The redo
cost decomposes as: displacing the damaged directory **2.17–3.18 ms** (one outlier at 82.3 ms), then
preparing **510.9–675.9 ms**, then the ordinary launch.

**The two undetected cases are a genuine gap and they are stated plainly.** With `ffmpeg.dll` removed or
`app.asar` truncated, the check described by ADR-0054 — marker present and well-formed, token matching,
entry point present and non-empty — **returns a hit, the damaged image is launched, and no window ever
appears**. Confirmed independently by running the prepared executable directly and reading its own
report:

| tree state | process exit code | its report |
|---|---|---|
| intact (control) | 0 | `status=ok`, painted |
| `locales\` removed | 0 | `status=ok`, painted |
| `ffmpeg.dll` removed | 3 | `status=watchdog-timeout`, **never painted** |
| `app.asar` truncated | 1 | **no report produced at all** |

Two runs in the discarded first sweep sat in the harness's own 90-second window with a damaged tree and
returned `paintAtParentMs` of **90,198.5 ms and 90,200.4 ms** — the application process started and then
never painted. That is what clause (c)'s "SHALL NOT cause the launch to fail" is written to forbid.

This is not an argument against SR-7 and it is not expensive to fix. **Candidate G of §6 closes it for
3.56–5.87 ms**: carry the path and length of every prepared file in the marker and stat them all. That
catches deletion, truncation, and wholesale removal of a subtree — which is what an antivirus quarantine,
a partial delete, or a disk error actually does — at about one tenth of one per cent of the budget. It
does not catch silent in-place corruption; nothing short of a digest does, and §6 prices the digest at
3.89–5.50 s.

### 8.1 A second defect — the redo must displace, not just rename onto

The first launcher built here implemented ADR-0054's commit exactly as written: prepare into a temporary
sibling, "renamed onto the token-named path as the last step". On Windows, **renaming a directory onto an
existing directory fails**; `MOVEFILE_REPLACE_EXISTING` does not apply to directories. So when the
preparation was damaged rather than absent, the redo prepared correctly, failed to commit, deleted its
own work, and launched from the *still-damaged* directory. Two observed consequences, both from real
runs:

- with the marker deleted but the tree intact, the launch succeeded — **and the preparation was never
  repaired, so every subsequent launch would prepare again, for ever**. That is precisely the degeneration
  `REQ-STARTUP-165` (c)'s notice clause exists to make visible, arrived at silently.
- with the entry point deleted, the redo could not commit, the entry point was still missing, the spawn
  failed, and **the launch produced nothing at all** — a flat violation of clause (c).

The fix is one rename: if the token-named path exists and failed the check, move it aside to a
`.stale-…` sibling first, then commit, and leave the stale directory for reclamation. Measured cost of
the extra rename: **2.17–3.18 ms**. Every result in §4 and §8 above is from the corrected launcher, with
the uncorrected one retained as an independent replicate for the timing cells (§4).

### 8.2 Reclamation

`REQ-STARTUP-165` (b) requires a preparation to be identifiable so it can be removed. After launching
v1.0.0 and then v1.0.1, the root held two token-named directories of **73 files / 507.9 MiB each**, each
with its own marker naming its own token — so **an update that is not reclaimed costs a full payload's
worth of disk per version left behind**. Deleting one, measured three times on a freshly copied tree:
**87.3, 90.6, 86.9 ms**. Reclamation is cheap; not doing it is not.

---

## 9. Identity, and whether self-update still works

This is the item spike 17 flagged (`README-FOR-SPIKES.md` §5.3) and SR-7 escalated.

**What the process reports when launched from the cache**, from a run through the launcher:

| | value |
|---|---|
| `process.execPath` | `C:\Users\ganga\AppData\Local\rotaris\launch\00d9e864…\RotarisCPL.exe` |
| `app.getAppPath()` | `C:\Users\ganga\AppData\Local\rotaris\launch\00d9e864…\resources\app.asar` |
| `PORTABLE_EXECUTABLE_FILE` | **`null`** |
| `PORTABLE_EXECUTABLE_DIR` | **`null`** |
| `PORTABLE_EXECUTABLE_APP_FILENAME` | **`null`** |
| the launcher's own declared variable | `…\scratchpad\cpl\clauseA\Rotaris-1.0.0-windows-x64-portable.exe` — the artifact |
| `app.getPath('userData')` | `C:\Users\ganga\AppData\Roaming\rotaris-fp-probe` |

**Three findings.**

1. **`process.execPath` points into the preparation, exactly as `REQ-STARTUP-106` warns.** Across **149
   launcher launches that painted, 149 reported an `execPath` inside the preparation root.** An
   implementation that reached for `process.execPath` would classify and target a copy the product can
   recreate at will, which `REQ-STARTUP-106` calls out as "the one outcome an update must not produce".
2. **`PORTABLE_EXECUTABLE_FILE` is gone — completely.** Across **all 157 launches through the launcher, it
   was set 0 times.** It is `electron-builder`'s variable, published by `electron-builder`'s portable
   stub; once the artifact is no longer built by that target the variable does not exist. This was
   confirmed from the other direction by running spike 17's own `W150` `electron-builder` portable on the
   same machine on the same day, which still reports it correctly:
   `PORTABLE_EXECUTABLE_FILE = …\fp\rt\W150-portable\RotarisFPW150-1.0.0-windows-x64-portable.exe`,
   `PORTABLE_EXECUTABLE_DIR = …\fp\rt\W150-portable`, with `execPath = C:\Users\…\AppData\Local\Temp\RotarisFPW150\RotarisFPW150.exe`.
   **So the answer to "does the packaging tool's portable-executable environment variable still identify
   the real artifact" is: the variable still works, but only for the tool's own portable target, and SR-7
   moves the artifact off that target — so the launcher must publish its own.** `REQ-STARTUP-147` already
   anticipates exactly this, naming "the variable by which that form names the artifact file a launch
   started from", so the requirement accommodates it without amendment.
   In **149 of 149** launches that painted, the launcher's variable carried the correct absolute artifact
   path.
3. **`app.getPath('userData')` resolves under `AppData\Roaming`.** Measured, not inferred. ADR-0054's
   warning about the roaming trap is confirmed on this machine: the platform layer's default per-user
   data path is replicated storage, and the preparation must not be derived from it. The launcher derived
   its root from `%LOCALAPPDATA%` and landed correctly on `…\AppData\Local\rotaris\launch`.

### 9.1 The update replacement, measured

`REQ-STARTUP-125` requires, for the Windows portable, that "the replacement SHALL succeed while the
application being replaced is still running, the target being the artifact rather than the file the
process is executing". Tested by launching and then attempting `rename(artifact, artifact + '.old')` in a
loop until it succeeded, recording whether the application image was in the process list at that moment.

| launcher | first successful rename | application alive at that moment | failed attempts before it | new file moved into the target path | application still painted |
|---|---|---|---|---|---|
| **this spike's launcher, cache hit** | **189 ms** after launch | **yes** | **0** | yes | yes |
| `electron-builder` `portable` (spike 17's `W150`) | **16,837 ms** | no | **79, every one `EBUSY`** | yes (afterwards) | — |

The `electron-builder` portable's artifact was locked for the entire life of the run: every attempt from
479 ms onward returned `EBUSY`, and the rename first succeeded at 16,837 ms — the same millisecond the
portable's own process exited, i.e. after the application had already finished. **Under
`electron-builder`'s portable target, `REQ-STARTUP-125`'s "while the application being replaced is still
running" cannot be satisfied at all.** Under the preparation it is satisfied on the first attempt, 189 ms
in, because the launcher has already exited and nothing holds the artifact.

That is a second, independent reason SR-7's ruling is the right one, and it is not a timing argument.

---

## 10. The other observables `REQ-STARTUP-165` fixes

### 10.1 Clause (a) — nothing is written beside the artifact

The artifact was placed alone in a fresh directory, which was snapshotted before, after the preparing
run, and after two cached runs:

- entries in the directory: **1 before, 1 after, 1 after** — no marker, no log, no temporary file, nothing.
- the artifact's `size`, `mtime` and `ctime` were **byte-identical** across all three snapshots.
- only `atime` advanced, which is a read side effect and not a write.

### 10.2 Clause (a) — read-only medium

Approximated by denying the running user file-creation and file-deletion rights on the containing
directory with an explicit `icacls` deny ACE, verified by a write probe that failed with
`Permission denied`. With the directory in that state the artifact **prepared** (1,645.1 ms) and then
**launched from the cache twice** (591.6 ms, 579.3 ms), and the directory afterwards contained only the
artifact. This is an approximation and not a genuine read-only volume — see §13.

### 10.3 Clause (b) — a different artifact prepares afresh

v1.0.0 (`00d9e864…`) and v1.0.1 (`0d791edc…`, one line different in `LICENSE.electron.txt`), warm:

```
v1.0.0 first run   1954.9 ms   prepare / marker-absent
v1.0.0 cached       589.4, 581.4 ms
v1.0.1 first run   1961.3 ms   prepare / marker-absent      <- prepared afresh, as clause (b) requires
v1.0.1 cached       588.4, 598.0 ms
v1.0.0 again        591.3 ms   fast / hit                   <- its own preparation intact and still valid
```

Two token-named directories coexisted afterwards, each carrying its own marker naming its own token.
A same-payload artifact built with a different chunk size produced a different token (`9f167bec…`) and
also prepared afresh.

**One residue worth recording.** The token here is a digest of the **archive**, which is what ADR-0054
specifies ("the product version plus a digest of the payload"). Rebuilding the launcher without changing
the payload produced a **byte-different artifact with an identical token**; the preparation was reused.
For the corrected launcher this was handled by bumping the marker's launcher-format field, which the
check compares and which correctly forced a redo (`marker-format-mismatch`, §8). But it means clause
(b)'s "produced by an artifact of identical content" is honoured for everything that lands **inside** the
preparation and not for the launcher bytes themselves — so **a launcher change that alters how the
payload must be laid out, shipped without a format bump, would silently reuse an incompatible
preparation.** The format field is the control; it has to be treated as load-bearing, not cosmetic.

### 10.4 Clause (d) — nothing fetched, nothing elevated

The launcher issues no network request and requires no elevation **by construction**: it reads its own
file and writes under `%LOCALAPPDATA%`. Every preparation in this spike was produced from the artifact
alone. **This was not independently verified with a network monitor or a privilege trace** — see §13.

### 10.5 Two launches racing to prepare

ADR-0054 notes that the preparation happens before the instance claim of `REQ-STARTUP-164` can resolve
anything, so two double-clicks in quick succession produce two launchers both preparing. Tested by
wiping the root and spawning the artifact twice back to back:

```
launcher 0   prepare / marker-absent   committed = true    recheck ok
launcher 1   prepare / marker-absent   committed = false, found the token path already present,
                                       discarded its own work, recheck ok
preparation root afterwards: exactly one directory, 73 files, 507.9 MiB, no leftover temporary
both launchers exited 0
```

Resolves exactly as the ADR predicts. The loser pays one wasted preparation; nothing is corrupted,
nothing is reported, no partial directory survives.

---

## 11. An anomaly that is not about the launch mechanism, and is decision-relevant

**The first cold execution of a newly built 508 MiB executable cost 31–34 seconds before any of our code
ran.** Observed three times, each on the first cold launch after `mkartifact.js` wrote a fresh `store`
artifact:

| occurrence | first paint | of which, before the launcher's first instruction |
|---|---|---|
| `store`, first cold run after build (uncorrected launcher) | **33,851.0 ms** | **32,331.1 ms** |
| `store`, first cold run after rebuild (corrected launcher) | **31,217.6 ms** | **29,681.7 ms** |
| `store` rebuilt at a different chunk size, first cold run | **32,159.5 ms** | **30,457.0 ms** |

In every case the launcher's own internal timeline was normal — 1.26 ms, 1.77 ms and 2.34 ms
respectively from its first instruction to the start of preparation — so the time was spent by Windows
creating the process, before anything of ours existed. The second run of each artifact was normal
(1,914.2 ms, 1,727.3 ms).

**Controls.** Three fresh *copies* of the same `store` content, each to a new path, each launched cold
exactly once: **2,527.3, 2,593.9, 2,985.4 ms** — no penalty. Three fresh copies of the `deflate` content:
**2,018.4, 1,986.4, 2,196.4 ms**. Two newly *built* `deflate` artifacts, cold, first run: **2,057.3,
1,798.2 ms** — no penalty at 182.7 MiB.

**What can be said and what cannot.** The condition that reproduces it is *new content* at *508 MiB* on a
*first* cold execution; a copy of already-seen content does not trigger it, and the same first-execution
condition at 182.7 MiB does not either. Microsoft Defender was enabled throughout and its on-access scan
of a large unfamiliar executable is the obvious candidate. **That explanation was not verified, and it is
not offered as a finding** — this session had no elevation, Defender was deliberately not disabled or
reconfigured, and no scan trace was captured. What is a finding is the observation itself: it reproduced
three times out of three under one condition and zero times out of eight under the controls.

Two consequences regardless of cause:

- It lands entirely inside the run `REQ-STARTUP-155` exempts, so **it does not threaten the ruling.**
- It is a strong argument against shipping the artifact uncompressed. A 508 MiB "single executable file"
  already sits badly with `REQ-STARTUP-032`/`-038` and with the download of `REQ-STARTUP-124`; a
  reproducible half-minute on the user's very first launch is a third reason. The `deflate` artifact at
  182.68 MiB shows none of it, prepares in 566 ms, and reaches paint in 1,696–2,091 ms warm.
- Nothing comparable was observed on any **cached** launch of either artifact at any cache state. 68
  launches took the fast path; the slowest that reached paint from an undamaged preparation was
  1,414.6 ms. (Six fast-path launches did not paint at all, and two more sat in the harness's 90-second
  window; every one of those is a deliberately damaged preparation from §8 or from the discarded sweep,
  not a timing observation.)

---

## 12. Threats to validity

- **The machine was not quiet.** Other agents were building and launching throughout; CPU busy in the
  400 ms before each launch ranged 1.2 %–70.5 % and is recorded per run. The cached-launch margin is
  3.6 s wide and cannot be explained by scheduling noise; a quieter machine would make these numbers
  smaller, not larger, so the PASS verdicts are conservative.
- **`spawn` is not a double-click.** The clock starts at `CreateProcess` from a Node parent. A launch
  from Explorer adds shell overhead this does not capture, so every figure here is a **lower bound** on
  what a user experiences. This is the same caveat spike 17 recorded, and the comparison between the two
  spikes is unaffected by it.
- **The launcher is mine.** It was written for this measurement in a few hours. It is not the product's
  launcher, it has had no review, no fuzzing and no error-path hardening beyond what §8 exercised, and
  §8.1 shows that a straightforward reading of ADR-0054 already contained one defect that only appeared
  under test. **These numbers show the target is reachable with a conventional implementation; they do
  not certify any particular implementation.**
- **`fsync` discipline is weak and its consequence is unmeasured.** Only the marker is flushed before the
  commit rename. NTFS journals the rename but not the payload data, so a power loss between writing the
  tree and its data reaching the disk could leave a torn tree behind a valid marker — the §8 undetected
  class, arrived at by accident rather than by damage. Not measured, and flushing 507.9 MiB before the
  commit would change the first-run figures by an unknown amount.
- **The cold procedure drains the standby list, not everything.** It does not erase a Prefetcher trace.
  The single 1,319.1 ms `onedir` warm outlier in §4.1 is the same first-launch-from-a-new-path effect
  spike 17 identified, reported rather than removed.
- **One machine, one architecture, one storage class, one anti-malware configuration.** n is 3–6 per
  cell for the headline cells. §5.1 gives the only hardware sensitivity measured, and it is a thread
  sweep on one CPU, not a second machine.
- **The read-only test is an ACL deny, not a read-only volume.** See §13.

---

## 13. What this harness does **not** model

- **It contains no product.** The application is spike 17's probe: one `BrowserWindow`, 80 `<div>`s,
  report, exit. No renderer framework, no bundler output, no IPC contract, no preload, no persistence,
  no native module, no `better-sqlite3` (ADR-0058), no `node-pty` (ADR-0020), no MCP client, no theme
  system. `REQ-STARTUP-040`'s icon, font registration and theme restore — which ADR-0055 puts before any
  window exists — are absent. **Everything the product does before first paint is additional to the
  575.5–1,414.6 ms measured here.** The usable figure is the headroom: **roughly 3.6–4.4 s.**
- **The bundle weight is real bytes but not the real bundle.** It is spike 17's `W150` anchor, with
  `monaco-editor` as declared ballast for a component ADR-0035 has not chosen. Nothing is *loaded* from
  the payload at startup, so this measures the cost of **carrying** weight, not of **executing** it.
- **The launcher's own design is one of several.** Raw DEFLATE at level 6 with 8 MiB chunks and a
  thread-per-core pool is a conventional choice, not an optimal or a recommended one. LZMA, which is what
  `electron-builder` uses and what would produce the smallest artifact, was **not** measured: no
  pure-Rust LZMA decoder was brought into the harness. Spike 17's LZMA figures were for a different
  mechanism and must not be transplanted.
- **`store` first-run figures are not a recommendation.** They exist to isolate the write cost from the
  decompression cost.
- **No `.dmg`, no AppImage, no macOS, no Linux.** `REQ-STARTUP-155` binds those too, and `REQ-STARTUP-165`
  reaches only `onefile` artifacts, of which the Windows portable is the only one (`REQ-STARTUP-013`).
- **No SmartScreen, no Mark-of-the-Web, no signing, no notarisation.** Every artifact here was written
  locally and carries no zone identifier, so the first-launch reputation prompt of `REQ-STARTUP-021`
  never fired. §11 is an on-access-scan observation, not a SmartScreen one. A real download adds a cost
  that is not measured here and that lands on the first run.
- **The read-only medium test is an approximation.** An `icacls` deny ACE on the containing directory,
  with the write probe verified to fail. It is **not** a read-only volume, a CD, a write-protected USB
  stick, or a network share. The stronger claims in clause (a) about removable media remain untested.
- **Clause (d) was not independently verified.** No network capture and no privilege trace was taken; the
  claim that preparing fetches nothing and elevates nothing rests on the launcher's source.
- **Clause (c)'s "no usable preparation at all" branch was not exercised.** A full disk, a refused write,
  or unavailable storage — and the persistent warning notice `REQ-STARTUP-165` (c) requires for exactly
  that case — were not tested. That is the one preparation outcome the product reports, and it is
  unmeasured.
- **`REQ-STARTUP-164`'s hand-over interval, `REQ-STARTUP-066`'s 100 ms empty-plan fast path, and
  `REQ-STARTUP-155`'s setup-pass bound are all untouched**, exactly as in spike 17. §10.5 measures the
  preparation race only, not single-instance resolution.

---

## 14. Verdicts

| Requirement | Bound and conditions | Measured | Verdict |
|---|---|---|---|
| `REQ-STARTUP-155` | main window painted within **5 s**, **`onefile` Windows portable, later run of an artifact that has already prepared**, no exemption available — *the gate condition SR-7 named* | 575.5–624.2 ms warm (n=6), 897.3–1,242.5 ms cold (n=6); independent replicate 581.3–723.1 / 964.0–1,414.6 ms | **PASS** |
| `REQ-STARTUP-155` | same, `store` variant (508.2 MiB artifact), cached | 620.3–649.4 ms warm, 605.4–948.1 ms cold | **PASS** |
| `REQ-STARTUP-155` first-run exemption | the preparing run, priced not assumed | 1,696.2–2,091.3 ms warm, 1,710.2–2,037.0 ms cold (`deflate`); 3,798.8–3,909.8 ms single-threaded | **PASS — and inside the bound it is exempt from**, except the §11 anomaly |
| `REQ-STARTUP-165` (b) | a different artifact prepares afresh; each preparation identifiable | v1.0.1 prepared afresh, v1.0.0's preparation intact and still used; two token-named directories, each with its own marker | **PASS**, with the launcher-bytes residue of §10.3 |
| `REQ-STARTUP-165` (c) | incomplete / unreadable / foreign preparation → **redo, never fail, never report** | all 8 marker-and-entry classes detected and redone silently; the 7 injected ones repainted in 1,611.0–1,967.5 ms, the absent-directory case in 1,634.7–2,091.3 ms | **PASS for those classes** |
| `REQ-STARTUP-165` (c) | same, for damage to the **interior** of the preparation | `ffmpeg.dll` deleted and `app.asar` truncated were **not detected**; the damaged image was launched and **no window appeared** | **FAIL as ADR-0054 specifies the check** — closed by §6 candidate G at 3.56–5.87 ms |
| `REQ-STARTUP-165` (a) | preparation in local per-user storage; **nothing written beside the artifact**; artifact unchanged | preparation at `%LOCALAPPDATA%\rotaris\launch\<token>`; launch directory gained 0 entries; artifact size/mtime/ctime unchanged over 3 launches | **PASS** |
| `REQ-STARTUP-165` (a) | artifact runs from read-only media, medium unchanged | prepared and launched twice with file creation denied on the containing directory | **PASS on an ACL approximation only** — not a read-only volume |
| `REQ-STARTUP-165` (e) / `REQ-STARTUP-106` | a run from a preparation can identify the artifact the launch started from | `execPath` inside the preparation in 149/149; launcher's declared variable carried the artifact path in 149/149; `PORTABLE_EXECUTABLE_FILE` set in **0 of 157** | **PASS** for the mechanism; **the tool's variable is unavailable and must be replaced** |
| `REQ-STARTUP-125` | Windows portable replacement succeeds **while the application is still running**, targeting the artifact | rename succeeded at 189 ms, 0 failed attempts, application alive, new file moved in, application still painted. Contrast: `electron-builder` portable — 79 consecutive `EBUSY`, first success only at 16,837 ms when its own process exited | **PASS** under the preparation; **FAIL** under `electron-builder`'s portable target |
| `REQ-STARTUP-165` (c) | the "no usable preparation at all" branch and its warning notice | not attempted | **INCONCLUSIVE — not attempted** |
| `REQ-STARTUP-165` (d) | preparing issues no network request and raises no elevation | true by construction of the launcher; no network capture or privilege trace taken | **INCONCLUSIVE — not independently verified** |
| `REQ-STARTUP-155` | macOS `.dmg`, Linux AppImage; hand-over interval; empty-plan fast path; setup-pass bound | not built, not attempted | **INCONCLUSIVE — not attempted** |

---

## 15. ADR impact

**SR-7's ruling is sound and the gate condition it attached is met.** The remaining options SR-7 held in
reserve — amending `REQ-STARTUP-155` to 17.5 s, or giving up the single-file artifact — are not needed.
Nothing below reopens ADR-0054's decision; the points are corrections and additions inside it.

1. **ADR-0054's launch-preparation design works, and the 0.7 s baseline it rests on is now a result.**
   The mechanism writes the same 507.9 MiB tree in **410.7 ms (`store`) to 565.7 ms (`deflate`)**, faster than the `fs.cpSync` baseline
   of 684–722 ms that SR-7 called "a baseline and not a result", because it writes large chunks in
   parallel. The cached launch is **575.5–624.2 ms warm and 897.3–1,242.5 ms cold**, against 5,000 ms.
   The whole launcher costs about **37 ms** over launching the tree directly.

2. **The version-check decision is correct and is now priced.** ADR-0054's "one directory probe and one
   small read … reads none of the payload and hashes nothing" costs **0.14–0.49 ms warm, 0.37 ms on its
   first cold touch**. The alternative it rejects — a launch-time digest — costs **709.6–845.0 ms** for
   the 182.7 MiB artifact with the fastest implementation on this machine, **1.48–1.95 s** with a
   pure-Rust one, and **3.89–5.50 s** if the prepared tree is digested instead. The ADR should carry
   these figures; they are the difference between a defensible choice and an asserted one.

3. **A reason to compile the token in that ADR-0054 does not state, and should.** The ADR justifies
   compiling the token into the stub on cost-of-hashing grounds. There is a second reason worth more on a
   cold machine: **opening the artifact file at all cost 342.9 ms on its first cold open**, against 0.37 ms
   for a check confined to the preparation. A footer-reading fast path would pay that on the first launch
   after every boot. The ADR's phrase "reads none of the payload" should become "does not open the
   artifact".

4. **ADR-0054's commit step is wrong as written and must say "displace, then rename".** "written into a
   sibling directory … and then **renamed onto the token-named path as the last step**" cannot work on
   Windows when the token-named path already exists, which is exactly the case clause (c) is about.
   Measured consequences: with the marker deleted the launch succeeded but the preparation was never
   repaired, so it would re-prepare on every launch for ever; with the entry point deleted the launch
   produced nothing at all. The correction — rename the damaged directory aside first — costs
   **2.17–3.18 ms** and is in every result reported here. **This is a correction to the record, not a
   reopening.**

5. **ADR-0054's completeness check is too weak for `REQ-STARTUP-165` (c), and the fix is affordable.**
   "token-named directory absent, marker absent, marker unreadable, marker naming a different token or an
   unrecognised format, or the payload's own entry point missing" catches an interrupted preparation and
   a wrong version — all eight such classes were detected here and redone silently in 1.6–2.0 s. It does
   **not** catch damage to the interior: with `ffmpeg.dll` deleted or `app.asar` truncated the check
   reported a hit and **the launch produced no window**, which clause (c) forbids in terms. Carrying the
   path and length of every prepared file in the marker and stat-ing them all costs **3.56–5.87 ms**
   (0.1 % of the budget) and closes every damage class tested. Recommended as an addition to the ADR's
   check.

6. **ADR-0054's identity token needs its scope stated, and the launcher-format field needs to be called
   load-bearing.** The token is a digest of the payload; **a launcher-only change produced a
   byte-different artifact with an identical token and the preparation was reused.** That is defensible —
   the launcher is not in the preparation — but it means clause (b)'s "identical content" is carried by
   the *marker's launcher-format field*, not by the token, for anything about the launcher that affects
   layout. The ADR should say so, because a maintainer who treats that field as cosmetic reintroduces the
   failure clause (b) exists to prevent. The format check itself was exercised and works
   (`marker-format-mismatch` → silent redo, 1,611.0 ms).

7. **ADR-0056's fifth build output is cheap, and cheaper than what it replaces.** Archive assembly plus
   `cargo build --release` plus append took **35.1 s** for the `deflate` artifact and **13.1 s** for the
   `store` one, on top of a 99.1 s `--dir` build — against spike 17's **≈2 m 40 s** per
   `electron-builder` `portable` build, which the record advises not to expect caching to help. The
   launcher is **330,752 B** with two pure-Rust dependencies. ADR-0056 can budget this as roughly
   **35 s and one small Rust crate**, and it removes an NSIS/7z compression step rather than adding one.

8. **`REQ-STARTUP-125` is not merely preserved by SR-7's ruling — it is rescued by it.** Under
   `electron-builder`'s portable target the artifact is locked for the entire run: 79 consecutive
   `EBUSY` failures, the rename succeeding only at 16,837 ms when the portable's own process exited.
   `REQ-STARTUP-125`'s "the replacement SHALL succeed while the application being replaced is still
   running" was **not satisfiable** on that target. Under the preparation, the rename succeeded on the
   **first attempt at 189 ms** with the application running. ADR-0054's rule that "the stub must close
   its handle on the artifact file before the application starts" and "must not remain as a supervising
   parent" is not a precaution — it is the whole difference, and it is now measured.

9. **ADR-0054's roaming trap is confirmed on this machine, not merely anticipated.**
   `app.getPath('userData')` resolved to `C:\Users\…\AppData\Roaming\rotaris-fp-probe`. A preparation
   derived from the platform layer's default user-data path would put 507.9 MiB per version into
   replicated storage, violating clause (a) and `REQ-STARTUP-166`. The ADR's instruction to derive the
   preparation root from the **local** application-data location is doing real work.

10. **Reclamation is cheap and skipping it is not.** Two versions left **2 × 507.9 MiB** behind. Deleting
    one costs **86.9–90.6 ms**, so ADR-0054's "after the window is shown and off the critical path"
    placement is comfortable. The disk cost of not doing it is one full payload per version.

11. **A finding for ADR-0056 and for the artifact-size discussion, independent of the launch budget.**
    The first cold execution of a newly built **508 MiB** executable cost **31.2–33.9 s before any of our
    code ran**, three times out of three, with none of it attributable to the launcher; a **182.7 MiB**
    artifact showed nothing comparable in eight control runs, and no cached launch of either size ever
    did. The cause was not established (§11) and the cost falls inside the exempt run — but it is a third
    reason, alongside `REQ-STARTUP-032`/`-038` and the update download of `REQ-STARTUP-124`, not to ship
    the payload uncompressed. **Compress the archive.**

12. **ADR-0055's budget arithmetic can now be restated for the flavour that previously had none.** On the
    Windows portable running from its preparation, packaging and runtime consume **0.58–1.41 s** of the
    5,000 ms, leaving roughly **3.6–4.4 s** for the sequence ADR-0055 fixes — preference scoping, branded
    icon, bundled font registration, theme restore, all before any window exists. That is the same order
    of headroom spike 17 measured for the installed flavour (0.66–1.56 s consumed, 3.4–4.4 s left), which
    is the point: **the portable is no longer a special case.**

---

## 16. Reproducing this

Harness, raw data and logs are in the session scratchpad under `…\scratchpad\cpl`:

- `stub/src/main.rs` — the launcher; `stub/src/checkbench.rs` — the version-check benchmark of §6;
  `stub/src/token.rs` is generated per build.
- `mkartifact.js` — builds the archive, computes the token, invokes `cargo build --release`, appends and
  writes the footer.
- `app/` — the application under test (spike 17's probe with the extended report) and its
  `electron-builder.yml` (`dir` target).
- `runner.js` — spawn, loopback-socket timing, cold-cache control, damage injection, reporting;
  `pressure.js` — spike 17's cache drop, copied unmodified; `summarise.js`, `summarise2.js`.
- `renametest.js` (§9.1), `racetest.js` (§10.5), `snapdir.js` (§10.1), `rmbench.js` (§8.2),
  `shabench.js` (§6), `deny.ps1` (§10.2).
- `runs/` — `v2.jsonl` (headline, corrected launcher), `main.jsonl` (replicate), `onedir.jsonl`,
  `fresh.jsonl`, `threads.jsonl`, `damage2.jsonl`, `damage3.jsonl`, `version.jsonl`, `ro.jsonl`,
  `clauseA.jsonl`, `checkbench-warm.jsonl`, `checkbench-cold.jsonl`, plus `damage.jsonl` and
  `repair.jsonl`, which are the discarded first sweep and the housekeeping runs, retained but not
  reported.

None of it is product code and none of it was written into this repository. The preparation root created
under `%LOCALAPPDATA%\rotaris\` and the multi-hundred-megabyte intermediate artifacts were deleted at the
end of the spike.
