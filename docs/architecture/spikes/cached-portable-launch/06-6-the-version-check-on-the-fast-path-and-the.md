# Spike — the cached launch of the Windows `onefile` portable — 6. The version check on the fast path, and the alternatives

Part 6 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

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
