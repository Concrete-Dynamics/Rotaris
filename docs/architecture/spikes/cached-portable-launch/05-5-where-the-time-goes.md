# Spike — the cached launch of the Windows `onefile` portable — 5. Where the time goes

Part 5 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

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
