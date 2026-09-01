# Spike — launch to first paint on the packaged Windows artifacts

- **Date:** 2026-09-01
- **Question:** `REQ-STARTUP-155` gives the main window **5 seconds from launch** and says the bound
  "SHALL be the same for every published artifact and every bundle mode — the `onefile` Windows portable
  executable of `REQ-STARTUP-013` is given no larger budget than the `onedir` flavours, and no
  per-flavour differential is specified." ADR-0054 chose `electron-builder`'s `portable` target for that
  artifact; ADR-0055 assumes the budget is reachable; ADR-0040 consequence 3 and ADR-0035 both add
  bundle weight the budget "must absorb". Nothing in the record measures it. The Windows portable
  self-extracts an entire Electron runtime *before any of our code runs*, so the first part of that 5
  seconds is spent by machinery we do not control.
- **Scope:** measurement only. No product code was written and none is authorised. Everything built here
  lives in the session scratchpad; nothing was added to this repository except this document.
- **Verdict, in one line:** the Windows `onefile` portable **fails** `REQ-STARTUP-155` by a factor of
  roughly three at every bundle weight measured, including an empty one; the `onedir` flavours **pass**
  with about 3.4 seconds of headroom on the same payload.

---

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` |
| CPU | Intel Core i7-10875H @ 2.30 GHz, 8 physical / 16 logical cores |
| RAM | 15.79 GiB (16,977,182,720 B), no elevation available to this session |
| Storage | NVMe SSD (`CT1000P310SSD8`) and a second SSD; `D:` NTFS 1,000,202,039,296 B total / 708,661,809,152 B free, `C:` NTFS 1,022,726,901,760 B total / 59,355,246,592 B free |
| Node (host) | v24.11.0 (`process.versions.uv` = 1.51.0) |
| npm | 11.12.1 |
| Electron | `electron@44.1.0` — Chromium 152.0.7977.65, Node 24.19.0, V8 15.2.124.18-electron.0 |
| Packaging | `electron-builder@26.15.3`, `portable` and `nsis` Windows targets |
| Harness location | the session scratchpad, which resolves to `C:\Users\…\AppData\Local\Temp\claude\…` |
| Portable extraction target | `%TEMP%` on `C:` — fixed by the NSIS stub, not choosable |
| Anti-malware | not disabled, not enumerated, not measured |
| Concurrency | **other agents were building and measuring on this machine throughout.** CPU busy in the 400 ms before each launch was sampled and recorded per run; it ranged 2.9 %–48.4 %. See §8. |

Same machine and same Node build as ADR-0004's DATA spike and as the `spike-base` toolchain note, so
the figures are comparable to both.

---

## 2. What the requirement actually says, and what that forced the method to measure

`REQ-STARTUP-155`, read in full, fixes four things that decide the experiment:

1. **The clock starts at "the application being launched"**, not at the moment our process begins. For
   the `onefile` portable the self-extraction happens between those two points, so it is inside the
   budget. The harness therefore timestamps immediately before `CreateProcess` on the artifact the user
   would double-click, and everything after that is inside the measurement.
2. **The bound is on "the launch that becomes the running instance."** Every run here is a first
   instance; no hand-over case is measured, and `REQ-STARTUP-164`'s separate interval is out of scope.
3. **"On every published artifact and every bundle mode … no per-flavour differential."** So the
   portable cannot be excused by being a portable, and a pass on the installer is not a pass on the
   product. Both flavours were measured on **byte-identical payloads** (§3).
4. **No percentile and no averaging is stated.** The requirement says the window "SHALL be painted
   within 5 seconds", full stop. This report therefore judges against the **maximum** observed in each
   group and also gives min/median so a product owner can apply a softer reading if they choose. The
   verdicts below do not change under either reading — nothing is near the line except the `store`
   variant in §7.

The measured event, "first paint", is the second `requestAnimationFrame` callback in the renderer *after
the window was shown*, reported back to the main process and thence over a loopback socket to the
timing parent. A second `rAF` firing establishes that the first one's frame was produced and presented;
`ready-to-show` alone was rejected as too generous because Chromium raises it for a window that is still
hidden. `ready-to-show` and `show()` are recorded separately in §6 so the difference is visible.

---

## 3. Method

Throwaway harness, all under the scratchpad, reusing the verified `spike-base` Electron install rather
than reinstalling it.

**The application under test** is a deliberately trivial Electron app: one `BrowserWindow` created
hidden, a three-column shell layout with 80 generated rows so the first frame is not an empty document,
shown on `ready-to-show`, reporting and exiting 0. Its own paint work is near zero *by design* — see §9.

**Bundle weight.** The ADRs name what must ship but fix no total. `REQ-STARTUP-013` and ADR-0054 fix the
form; ADR-0001 consequence 1 and ADR-0040 consequence 3 put a **TypeScript syntax-tree parser** inside
the product; ADR-0035 puts a **pinned code-intelligence runtime** inside it, whose identity
`REQ-CONFIG-181` deliberately leaves open; ADR-0057 and ADR-0051 add a renderer framework and syntax
highlighting; `REQ-STARTUP-040` / `REQ-SHELL-008` add bundled fonts; `REQ-STARTUP-083` adds a CA root
bundle. **Because the total is not fixed by any approved input, no single weight is claimed to be *the*
answer and a four-point curve was measured instead.** The payload at each point is real installed
package trees, not random filler, so its compressibility is realistic:

| Point | Payload contents | Payload | `win-unpacked` tree | Portable artifact |
|---|---|---|---|---|
| `W000` | none (Electron runtime only) | 0 MB | 367 MB | 99,819,351 B (95.2 MiB) |
| `W050` | `typescript@5.9.3`, `shiki@4.4.3` + `@shikijs`, `react@19.2.8`, `react-dom@19.2.8`, 8 real Windows font files (5,926,628 B), a 146-certificate PEM root bundle (218,899 B) | 56 MB | 415 MB | 106,134,727 B (101.2 MiB) |
| `W150` | `W050` **+ `monaco-editor@0.56.0`** | 154 MB | 509 MB | 112,944,890 B (107.7 MiB) |
| `W320` | `W150` **+** `playwright-core`, `pdfjs-dist`, `three`, `@babel/standalone`, `prettier`, `sass`, `codemirror`, `esbuild` (+ their native `@napi-rs` / `@esbuild` binaries) | 327 MB | 674 MB | 137,908,995 B (131.5 MiB) |

`W150` is treated as the **anchor** and given the most repetitions. Its justification, stated plainly so
it can be disputed: `typescript` is the real component ADR-0001 consequence 1 names; `shiki` and
`react`/`react-dom` are real components ADR-0051 and ADR-0057 imply; the fonts and the CA bundle are
real files of the kind `REQ-STARTUP-040` and `REQ-STARTUP-083` require. `monaco-editor` is **ballast** —
it stands in for the bundled code-intelligence runtime of ADR-0035, whose real weight is unknown because
the distribution has not been chosen. It is honest ballast (real code, real compressibility, ~98 MB) but
it is ballast, and if the eventual runtime is much smaller the right row to read is `W050`, and if it is
larger, `W320`. **The verdict is the same on all four rows.**

**Flavours.** Each build emits both artifacts from the same tree, so the comparison is exact:
- **`onefile` portable** — `electron-builder` `portable` target, `unpackDirName` pinned per point (the
  default is a fresh KSUID per build). Launched from a directory containing nothing else.
- **`onedir`** — the `win-unpacked` tree the portable compresses, copied to a fresh directory. This is
  byte-for-byte the payload the Windows installer deposits.
- **Real installed build** — for `W150` only, the `nsis` target (`oneClick: true`, `perMachine: false`)
  was **actually installed** silently to `%LOCALAPPDATA%\Programs\rotaris-fp-probe`, measured there, and
  then silently uninstalled. The install directory and every uninstall registry entry naming this probe
  were verified gone afterwards.

**Cold cache.** This was the hard part, and the procedure and its verification are given in §4.

**Repetitions.** `W150` n = 5 per cell (n = 4 for the installed build), curve points n = 3, plus three
single-shot never-launched-from-this-path runs (§6.3). **82 launches in total.** All 82 exited 0, all
82 reported `packaged = true`, and all 82 reported a paint; there were no watchdog timeouts and no
discarded runs. Median `spawn` call overhead was 14.5 ms.

**Timing.** The parent records `performance.timeOrigin + performance.now()` immediately before `spawn`.
The application reports its own marks on the same absolute epoch scale over a loopback socket, which the
parent timestamps on arrival — so the headline number, `paint@parent`, involves **no cross-process clock
assumption**; the internal breakdown does, and the two agreed to within the resolution of interest on
every run. (A packaged Windows GUI binary writes nothing to the calling console, per `spike-base` gotcha
5.2, so a socket and a file were used, never stdout.)

---

## 4. Getting a genuinely cold cache on Windows, and proving it worked

No elevation was available, so `RAMMap`, `EmptyStandbyList` and the privileged
`NtSetSystemInformation(MemoryPurgeStandbyList)` route were all unavailable, and rebooting was not an
option. The procedure used instead is **memory pressure**: a short-lived child process allocates and
touches anonymous 128 MiB buffers until `os.freemem()` — which on Windows is `GlobalMemoryStatusEx`'s
`ullAvailPhys`, counting free + zeroed + **standby** — falls below 150 MB, then allocates a further
1,536 MB past that point so the standby list is drained well past the size of the file under test, then
exits, releasing everything.

**This was verified rather than assumed.** A 64 MiB canary of random bytes on the same volume was read
warm, the pressure applied, and the canary read again:

| run | warm read | after pressure | ratio | allocated | `ullAvailPhys` after |
|---|---|---|---|---|---|
| 1 | 24.24 ms (2,640 MB/s) | 81.56 ms (785 MB/s) | 3.4× | 4,864 MB | 26 MB |
| 2 | 25.74 ms (2,486 MB/s) | 77.05 ms (831 MB/s) | 3.0× | 6,656 MB | 121 MB |
| 3 | 32.57 ms (1,965 MB/s) | 58.27 ms (1,098 MB/s) | 1.8× | 7,936 MB | 344 MB |
| 4 | 27.69 ms (2,311 MB/s) | 79.53 ms (805 MB/s) | 2.9× | 9,088 MB | 20 MB |

The same canary read is taken **inside every cold run** as a per-run witness; those figures are in the
raw data and, over the 41 cold runs, ranged 826–2,020 MB/s.

**Two honest caveats.** First, the separation is only 1.8×–3.4×, not the order of magnitude one would
see on a spinning disk, because the storage here is a fast NVMe SSD: on this machine a cold read is
genuinely a disk read, but a disk read is cheap. Cold-versus-warm effects on slower storage will be
larger than anything reported here. Second, this drains the standby list; it does not clear a CPU
cache, a Windows **Prefetcher** trace, or Superfetch's learned file sets. Section 6.3 shows the
Prefetcher effect is real and measures around it.

For the portable, "cold" additionally means the `%TEMP%` extraction directory was deleted before the
run. It turned out that this makes no difference — see §6.2.

---

## 5. Results — verdict against `REQ-STARTUP-155`

First paint, milliseconds from `spawn`. **Budget: 5,000 ms.** Verdict is taken against the maximum.

| Build | Flavour | Cache | n | min | median | max | **Verdict** |
|---|---|---|---|---|---|---|---|
| `W000` (0 MB payload) | **onefile portable** | cold | 3 | 13,992.0 | 14,043.5 | 14,305.2 | **FAIL** |
| `W000` | **onefile portable** | warm | 3 | 13,287.2 | 13,388.5 | 13,760.2 | **FAIL** |
| `W000` | onedir | cold | 3 | 715.0 | 905.6 | 1,610.4 | PASS |
| `W000` | onedir | warm | 3 | 533.8 | 568.2 | 632.1 | PASS |
| `W050` (56 MB) | **onefile portable** | cold | 3 | 14,424.5 | 14,506.7 | 14,596.3 | **FAIL** |
| `W050` | **onefile portable** | warm | 3 | 13,566.8 | 13,864.6 | 13,913.3 | **FAIL** |
| `W050` | onedir | cold | 3 | 693.4 | 829.6 | 1,477.7 | PASS |
| `W050` | onedir | warm | 3 | 512.0 | 516.6 | 537.1 | PASS |
| **`W150` (154 MB, anchor)** | **onefile portable** | cold | 5 | 16,149.2 | 16,756.0 | 17,432.3 | **FAIL** |
| **`W150`** | **onefile portable** | warm | 5 | 15,342.0 | 15,409.8 | 16,054.4 | **FAIL** |
| **`W150`** | onedir | cold | 5 | 626.5 | 826.4 | 1,719.7 | PASS |
| **`W150`** | onedir | warm | 5 | 601.4 | 604.6 | 627.8 | PASS |
| **`W150`** | **NSIS, really installed** | cold | 4 | 789.1 | 904.3 | 1,560.7 | PASS |
| **`W150`** | **NSIS, really installed** | warm | 4 | 664.0 | 719.5 | 767.4 | PASS |
| `W150` | onedir, **never launched from this path** | cold | 3 | 1,231.7 | 1,277.0 | 1,592.8 | PASS |
| `W320` (327 MB) | **onefile portable** | cold | 3 | 18,782.1 | 19,515.8 | 19,580.1 | **FAIL** |
| `W320` | **onefile portable** | warm | 3 | 18,109.4 | 18,454.4 | 18,489.0 | **FAIL** |
| `W320` | onedir | cold | 3 | 652.0 | 838.8 | 1,926.7 | PASS |
| `W320` | onedir | warm | 3 | 566.3 | 578.5 | 608.5 | PASS |

Every individual measurement, per repetition:

```
W000-portable   cold  13992.0, 14043.5, 14305.2      W000-portable   warm  13760.2, 13388.5, 13287.2
W000-onedir     cold    715.0,   905.6,  1610.4      W000-onedir     warm    632.1,   568.2,   533.8
W050-portable   cold  14424.5, 14506.7, 14596.3      W050-portable   warm  13566.8, 13913.3, 13864.6
W050-onedir     cold   1477.7,   693.4,   829.6      W050-onedir     warm    537.1,   512.0,   516.6
W150-portable   cold  17432.3, 16149.2, 16868.7, 16177.5, 16756.0
W150-portable   warm  15409.8, 15606.7, 15342.0, 15361.8, 16054.4
W150-onedir     cold   1719.7,   955.3,   626.5,   745.7,   826.4
W150-onedir     warm    627.8,   604.6,   601.4,   603.4,   606.2
W150-installed  cold   1560.7,   995.5,   789.1,   813.0
W150-installed  warm    664.0,   751.2,   687.7,   767.4
W150-onedir-freshpath cold  1277.0, 1592.8, 1231.7
W320-portable   cold  19515.8, 18782.1, 19580.1      W320-portable   warm  18489.0, 18454.4, 18109.4
W320-onedir     cold   1926.7,   838.8,   652.0      W320-onedir     warm    608.5,   566.3,   578.5
```

**The portable is over budget by 2.7×–3.9× and the margin is not close.** The smallest portable number
ever observed, on an *empty* payload with a warm cache, is 13,287 ms — 2.66× the budget. There is no
bundle weight at which this artifact passes, because it fails with no bundle at all.

---

## 6. Where the time goes

### 6.1 The breakdown

Median offsets from `spawn`, in milliseconds. `timeOrigin` is the Electron main process's own perf
timeline origin — approximately when that process started — so **everything before it is machinery that
runs before any of our code exists**.

| Group | `timeOrigin` (process starts) | our first JS line | `app.ready` | window built | `ready-to-show` | `show()` | **first paint** |
|---|---|---|---|---|---|---|---|
| `W150` portable, cold | 15,502.4 | 15,677.8 | 15,799.8 | 15,864.5 | 16,683.0 | 16,724.2 | **16,733.6** |
| `W150` portable, warm | 14,184.7 | 14,374.6 | 14,503.4 | 14,568.1 | 15,337.3 | 15,387.0 | **15,395.4** |
| `W150` onedir, cold | 169.7 | 308.8 | 391.4 | 455.9 | 765.4 | 809.8 | **817.4** |
| `W150` onedir, warm | 37.4 | 168.7 | 236.8 | 292.5 | 510.9 | 574.6 | **578.0** |
| `W150` installed, cold | 164.0 | 309.4 | 406.0 | 477.3 | 816.9 | 874.5 | **880.5** |
| `W150` installed, warm | 42.4 | 183.7 | 260.8 | 320.3 | 606.6 | 678.8 | **687.3** |

Read across the portable rows: **92 % of the launch is over before our process starts.** The
median per-run cost from `timeOrigin` to first paint is 1,243 ms (portable warm) / 1,265 ms (portable
cold), 568 ms / 657 ms for the onedir, and 677 ms / 740 ms for the installed build — all small, all
inside budget, and none of them is where the problem is.

Subtracting the two flavours of the *same build*, which share an identical payload, isolates the
self-extraction:

| Point | tree extracted | extraction, warm | extraction, cold | implied throughput (warm) |
|---|---|---|---|---|
| `W000` | 367 MB | 12,221.7 ms | 12,640.3 ms | 30.0 MB/s |
| `W050` | 415 MB | 12,643.7 ms | 13,106.1 ms | 32.8 MB/s |
| `W150` | 509 MB | 14,147.3 ms | 15,332.7 ms | 36.0 MB/s |
| `W320` | 674 MB | 17,171.9 ms | 17,612.6 ms | 39.3 MB/s |

Two independent checks agree with the subtraction. A `ReadDirectoryChangesW` watcher on `%TEMP%` saw
writes under the unpack directory begin at 166.6 ms and 263.2 ms and the last write before paint land at
14,862.6 ms and 15,943.1 ms in two instrumented cold runs (those two runs are slower than the
un-watched ones — 15,741 ms and 16,834 ms to paint — so the watcher itself costs something and its
numbers are corroboration, not headline). And a plain recursive **file copy** of the identical 508 MB
tree into `%TEMP%`, source cache dropped first, took **684, 689 and 722 ms** — 704–743 MB/s.

That last figure is the important one. **Writing the tree costs 0.7 s; the portable takes 14 s to put
the same tree in the same place.** Combining it with the `store` variant of §7 — which extracts the same
tree with nothing to decompress, at a warm `timeOrigin` of 4,303 ms — splits the 14.1 s three ways:

| component | cost | how obtained |
|---|---|---|
| writing 508 MB into `%TEMP%` | ~0.70 s | measured directly, `fs.cpSync`, cold source (§6.1) |
| the NSIS stub's own overhead above a plain copy | ~3.6 s | `store` extraction (~4.27 s) minus the copy |
| LZMA decompression | ~9.9 s | `W150` extraction (14.15 s) minus `store` extraction |

So roughly 70 % of the portable's overhead is decompression and 25 % is the stub doing a file copy six to
seven times slower than the operating system does it. **Neither is disk-bound**, so neither improves on
faster storage; both scale with the size of the *uncompressed* tree. Whether the decompressor is
single-threaded was not measured — the throughput of 30–39 MB/s is consistent with one thread on this
CPU, but that is an inference and is not offered as a finding.

### 6.2 There is no warm path for the portable

`spike-base` gotcha 5.4 hypothesised that the stub might skip extraction on a repeat launch into the
same fixed directory. It does not, and the reason is stronger than "it does not skip": **the stub deletes
`%TEMP%\<unpackDirName>` when the application exits.** Verified directly — after a completed run the
directory is absent. So every launch of the portable extracts 100 % of the tree from scratch. The
"warm" portable rows above are warm only in the sense that the source `.exe` is in the file cache, which
is worth 0.6–1.4 s (the cold-minus-warm median at the four weights is 655, 642, 1,346 and 1,061 ms).
**There is no configuration in which a user gets a faster second launch.** This also corrects the
standing note in `README-FOR-SPIKES.md` §5.4.

### 6.3 A confound found and controlled

In every `onedir` cold group the first repetition is markedly slower than the rest (1,610.4 vs 715–906;
1,477.7 vs 693–830; 1,719.7 vs 627–955; 1,926.7 vs 652–839). The most plausible explanation is the
Windows Prefetcher, which learns a binary's file set after its first launches and pre-reads it
thereafter — the memory-pressure procedure drains the standby list but does not erase a prefetch trace.
**That explanation was not tested and is not a finding**; what was done instead was to control for the
effect, whatever causes it.

Controlled by copying the `W150` tree to three **fresh paths**, each launched exactly once, cold: **1,231.7,
1,592.8 and 1,277.0 ms.** So the genuinely-never-launched-before, cold-cache `onedir` figure is
~1.2–1.6 s, and the `onedir` flavour passes `REQ-STARTUP-155` with about **3.4 seconds of headroom** even
in its worst honest case. The equivalent control does not exist for the portable — its extraction target
name is baked into the build — but it does not matter, because the portable is over budget by 10 s.

---

## 7. Two remedies inside `electron-builder`, both measured, both insufficient

If the artifact form is fixed, the only lever left inside the tool is the compression of the payload the
stub carries. Both available settings were built at the `W150` payload and measured.

| Variant | Setting | Artifact size | first paint, cold (n=3) | first paint, warm | Verdict |
|---|---|---|---|---|---|
| `W150` baseline | LZMA (default) | 112,944,890 B (107.7 MiB) | 16,149–17,432 | 15,342–16,054 (n=5) | **FAIL** |
| `ZIP` | `portable.useZip: true` (deflate) | 187,242,583 B (178.6 MiB) | 7,577.9 / 8,084.6 / **13,390.8** | 7,432.6 / 7,473.3 / 7,790.7 | **FAIL** |
| `STORE` | `compression: store` (uncompressed) | **533,307,938 B (508.6 MiB)** | 5,900.4 / 5,912.1 / 6,072.4 | 5,307.3 – 6,087.0 (n=6) | **FAIL** |

Build wall time was 145 s for `ZIP` and 55 s for `STORE`; the other builds' timings were lost to a
missing `bc` in the harness and are **not** reported rather than reconstructed.

- **Deflate roughly halves the extraction** (`timeOrigin` median 6,844 ms warm vs 14,185 ms) at a 66 %
  size increase, and still lands at 7.4–7.8 s. One cold `ZIP` run came in at 13,390.8 ms; with n=3 that
  is an outlier I can report but not explain, and it is not load-bearing since the median already fails.
- **Uncompressed is the floor of this mechanism and the floor is still over.** A 508.6 MiB "single
  executable file" reaches paint at 5.3–6.1 s — 4,303 ms (warm median) to 4,673 ms (cold median) of it
  before our process starts, to place a tree that a plain `cp` places in 0.7 s. The NSIS stub is 6–7×
  slower than a file copy even with nothing to decompress. And a half-gigabyte "single executable file"
  is its own problem for `REQ-STARTUP-032`/`-038` and for the update path of `REQ-STARTUP-124`.

**Nothing available inside `electron-builder`'s portable target brings this artifact inside 5 seconds
at any bundle weight, including zero.**

---

## 8. Threats to validity

- **The machine was not quiet.** Other measurement agents were building and launching concurrently. CPU
  busy in the 400 ms before each launch is recorded per run and ranged 2.9 %–48.4 %. The portable's
  failure is 10 s wide and cannot be explained by scheduling noise; the `onedir` numbers are small and a
  quieter machine would make them smaller, not larger, so the PASS verdicts are conservative.
- **`spawn` is not a double-click.** The clock starts at `CreateProcess` from a Node parent. A user's
  launch from Explorer adds shell overhead this does not capture, so every number here is a **lower
  bound** on what a user experiences.
- **One machine, one architecture, one storage class.** n is 3–5 per cell. There is no cross-machine
  distribution here and none should be inferred. A slower single-core would move the portable's
  decompression figure proportionally.
- **The cold procedure drains the standby list, not everything.** See §4 and §6.3.
- **SmartScreen and Defender were left exactly as the machine has them** — not disabled, not enumerated,
  not measured. First-launch reputation checks on an unsigned binary (`REQ-STARTUP-021`) are a real,
  unmeasured cost that would land on top of these numbers, and plausibly lands harder on the portable.
- **Not byte-reproducible.** Per `spike-base` §5.5, identical inputs produce artifacts differing by a
  byte or two. Irrelevant to timing; noted so nobody tries to match a digest.

---

## 9. What this harness does **not** model

This is the section to read before quoting any number above as a prediction.

- **It contains no product.** The application under test creates one window, builds 80 `<div>`s, and
  exits. It has no renderer framework, no bundler output, no IPC contract, no preload, no persistence,
  no native module, no `better-sqlite3` (ADR-0058), no `node-pty` (ADR-0020), no MCP client, no theme
  system, no Markdown renderer. `REQ-STARTUP-040`'s icon, font registration and theme restore — all of
  which ADR-0055 requires *before any window exists* — are absent. Everything the product does before
  first paint is **additional** to these figures.
- **The bundle weight is real bytes but not the real bundle.** The payload is genuine npm package trees
  chosen for realistic size and compressibility, and `monaco-editor` is explicit ballast standing in for
  a component ADR-0035 has not yet chosen. Nothing was *loaded* from the payload at startup, so the
  curve isolates the cost of **carrying** weight (extraction, I/O) and says nothing about the cost of
  **executing** it — the TypeScript compiler API's start-up cost, which ADR-0001 consequence 1 flags,
  is not measured here at all.
- **The usable figure is the headroom, not the total.** On the `onedir`/installed flavours the
  packaging and runtime consume **~0.6–1.6 s** of the 5,000 ms, leaving the product roughly **3.4–4.4 s**
  for everything ADR-0055 puts in front of first paint. On the portable they consume 13.3–19.6 s,
  leaving nothing.
- **Only Windows was built.** No `.dmg`, no AppImage, no macOS, no Linux. `REQ-STARTUP-155` binds those
  too and ADR-0054's own escalation about the AppImage runtime is untouched by this spike.
- **No signing, no notarisation, no SmartScreen, no auto-update, no hand-over case, no
  `REQ-STARTUP-066` fast path, no setup pass.** The other two bounds `REQ-STARTUP-155` states — the
  100 ms empty-plan decision and the probe-sum bound on an already-satisfied setup pass — were not
  measured and no verdict is offered on them.

---

## 10. Verdicts

| Requirement | Bound and conditions | Measured | Verdict |
|---|---|---|---|
| `REQ-STARTUP-155` | main window painted within **5 s** of launch, **`onefile` Windows portable** (`REQ-STARTUP-013`, `REQ-STARTUP-031`), no per-flavour differential | 13,287–19,580 ms across four bundle weights including an empty one; best case with deflate 7,433 ms; best case uncompressed 5,307 ms | **FAIL** |
| `REQ-STARTUP-155` | same bound, **`onedir` payload of the Windows installer**, really installed and launched from `%LOCALAPPDATA%\Programs` | 664–1,561 ms | **PASS** |
| `REQ-STARTUP-155` | same bound, `onedir` tree, **never launched from that path, cold cache** | 1,232–1,593 ms | **PASS** |
| `REQ-STARTUP-155` | same bound, remaining clauses (100 ms empty-plan fast path; setup-pass wall time bounded by the probe-timeout sum) | not measured | **INCONCLUSIVE — not attempted** |
| `REQ-STARTUP-155` | same bound, macOS `.dmg` and Linux AppImage | not built | **INCONCLUSIVE — not attempted** |

---

## 11. ADR impact

**ADR-0054 is reopened by this result, and the obvious remedy is blocked by a requirement.**

1. **ADR-0054's choice of `electron-builder`'s `portable` target cannot satisfy `REQ-STARTUP-155`.** The
   ADR selected the target for its naming control, its shared machinery with the NSIS installer, and the
   rename-aside update strategy. All of that still holds. What does not hold is the unstated assumption
   that the resulting artifact starts in time. It does not, at any weight, and it does not even with an
   empty application. §7 shows the tool offers no setting that closes the gap.
2. **The natural remedy — change the bundle mode — runs straight into a hard requirement.**
   `REQ-STARTUP-013` states that the Windows portable "SHALL be the only artifact published in `onefile`
   mode — observable as a single executable file that runs with no support tree beside it", and
   `REQ-STARTUP-031` closes the artifact set to exactly four names including
   `Rotaris-{v}-windows-x64-portable.exe`. `REQ-STARTUP-155` then explicitly refuses that artifact a
   larger budget, and the resolution record gives the reason: *"a user cannot see which flavour they
   installed."* So making the portable a `onedir` tree, dropping it, or replacing it with an archive
   are each a **requirement change**, not an architecture decision. **This is the product owner's call**
   and it is the same class of escalation ADR-0054 already raised twice.
3. **The three options, with what each costs, stated so they can be decided rather than discovered.**
   **(a)** Keep `onefile` and amend `REQ-STARTUP-155` to give the portable its own budget — this is
   exactly what the requirement's own text was written to forbid, and the budget it would need is at least
   17.5 s at the anchor weight and at least 19.6 s at the heaviest weight measured.
   **(b)** Keep the 5 s bound and amend `REQ-STARTUP-013`/`REQ-STARTUP-031` so the Windows portable is
   not a `onefile` bundle — the measured `onedir` figures say this passes with 3.4 s of headroom, but
   "a single executable file that runs with no support tree beside it" is precisely the observable the
   requirement fixes. **(c)** Keep both and replace the extraction mechanism with something outside
   `electron-builder`'s portable target — the §6.1 copy baseline (0.7 s for the same 508 MB) says a
   mechanism at file-copy speed would fit, so this is not obviously impossible, but it is a
   build-toolchain change ADR-0056 does not currently contemplate and it needs its own spike before
   anyone relies on it.
4. **ADR-0055 is not contradicted but its budget arithmetic needs restating per flavour.** On the
   installed flavour, packaging and runtime cost ~0.6–1.6 s and the sequence ADR-0055 fixes —
   preference scoping, branded icon, bundled font registration, theme restore, all before any window
   exists — has roughly 3.4–4.4 s. That is a real budget, and it is not generous once ADR-0040's
   syntax-tree parser and ADR-0035's bundled runtime are in the process. On the portable flavour there
   is no budget at all, which is why point 1 is a reopening rather than a tuning note.
5. **ADR-0040 consequence 3 and ADR-0035 are not the cause.** Both say the 5 s budget "must absorb"
   their bundle-size cost. On the `onedir` flavour, 327 MB of extra payload changes first paint by
   **about 10 ms** — `W000` onedir warm median 568.2 ms against `W320` onedir warm median 578.5 ms, and
   in the cold groups `W320` is actually the faster of the two (838.8 vs 905.6). The effect is inside
   run-to-run scatter. Bundle weight is close to free on the flavour that passes and is the entire
   problem on the flavour that fails — which is a property of the packaging mechanism, not of what
   those ADRs decided to ship.
6. **One factual correction for the record.** The portable stub **deletes its `%TEMP%` extraction
   directory on exit** (§6.2), which is stronger than `README-FOR-SPIKES.md` §5.4's hypothesis. Any
   design that assumes a portable user gets a cheaper second launch, or that state may be cached in that
   directory between launches, is wrong. It is also worth carrying forward to `REQ-STARTUP-106` and
   `REQ-STARTUP-125`: the running executable is inside a directory that is about to be deleted.

---

## 12. Reproducing this

Harness, raw data and logs are in the session scratchpad under
`…\scratchpad\fp` — `main.js` and `index.html` (the app), `runner.js` (spawn/timing/reporting),
`pressure.js` (cache drop), `validate-cold.js`, `extract-watch.js`, `build.sh`, `curve.sh`,
`variant.sh`, `summarise.js`, and `runs/main.jsonl` (all 82 runs, every mark), `runs/raw.tsv`,
`runs/summary.txt`, `runs/validate-cold.json`, `runs/copy-baseline.json`, `runs/extract-watch.json`.
None of it is product code and none of it was written into this repository.
