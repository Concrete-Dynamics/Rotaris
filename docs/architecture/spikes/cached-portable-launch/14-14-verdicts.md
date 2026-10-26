# Spike — the cached launch of the Windows `onefile` portable — 14. Verdicts

Part 14 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

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
