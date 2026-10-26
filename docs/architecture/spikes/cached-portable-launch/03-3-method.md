# Spike — the cached launch of the Windows `onefile` portable — 3. Method

Part 3 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

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
