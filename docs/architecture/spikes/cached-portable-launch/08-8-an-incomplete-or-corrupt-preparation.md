# Spike — the cached launch of the Windows `onefile` portable — 8. An incomplete or corrupt preparation

Part 8 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

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
