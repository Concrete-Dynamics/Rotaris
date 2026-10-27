# Spike — the cached launch of the Windows `onefile` portable — 9. Identity, and whether self-update still works

Part 9 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

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
