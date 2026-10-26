# Spike — the cached launch of the Windows `onefile` portable — 4. Results — the number that decides the ruling

Part 4 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

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
