# Spike — the cached launch of the Windows `onefile` portable — 11. An anomaly that is not about the launch mechanism, and is decision-relevant

Part 11 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

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
