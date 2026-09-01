# Spike — the run-host → main → renderer double hop

- **Date:** 2026-09-01
- **Questions:**
  1. ADR-0002 puts the run host in an Electron `utilityProcess` and makes main a **relay** between it
     and a sandboxed renderer. ADR-0044 consequence 3 records that the two update channels therefore
     cross two boundaries and that "if measurement shows the double hop threatens the budgets, the
     remedy named in ADR-0043 is a direct message port". Does it threaten them?
     Specifically: `REQ-MONITOR-222`'s 250 ms p95, `REQ-MONITOR-223`'s ceiling of **twice** the
     empty-session cost at 10,000 recorded rows, and `REQ-ORCH-155`'s 100 ms.
  2. ADR-0044 puts terminal frames on their own named channel so "a high-volume stream cannot delay a
     transcript row". Does a separate channel name actually buy that?
  3. If the answer to either is no, is ADR-0002's stated remedy — a `MessagePort` transferred from the
     `utilityProcess` directly to the renderer — measurably better, and by how much?
- **Scope:** measurement only. No product code was written and none is authorised. Everything below was
  produced by a throwaway harness in the session scratchpad; nothing was written into this repository
  except this document.
- **Bearing on the record:** the headline answers are in section 6. Section 7 records three findings
  that bear on ADR-0044 and ADR-0002 independently of the verdicts, and section 8 states what the
  harness does not model. **No figure below is estimated, extrapolated or rounded up from something
  else; every number is a measurement taken in this session.**

---

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| CPU arch | x64 |
| Node (host) | v24.11.0 · npm 11.12.1 |
| Electron | 44.1.0 — reused from `spike-base`, not reinstalled |
| Chromium / Node / V8 inside Electron | `152.0.7977.65` / `24.19.0` / `15.2.124.18-electron.0` (read from `process.versions` at run time) |
| `process.platform` / `arch` at run time | `win32` / `x64` |
| Free space on `D:` | 660 GB |
| Harness location | session scratchpad on `C:` |
| Anti-malware | not disabled, not enumerated, not measured |

Same machine, same OS build and same Node build as ADR-0004's DATA spike and as `spike-base`, so these
figures are comparable with that record.

Nothing here was packaged. Every measurement is from `electron.exe <dir>` in development mode.

---

## 2. What was built

A four-process arrangement matching ADR-0002: Electron **main**; a **run host** forked with
`utilityProcess.fork` after `app.ready`; a **renderer** with `contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true` and a preload exposing one frozen namespace. The workspace
service of ADR-0002 is not part of this path and was not created.

Four transport topologies were measured:

| Name | Path | Main's role |
|---|---|---|
| `relay` | run host → `parentPort` → main → `webContents.send(<channel>)` → renderer | carries every payload |
| `direct` | run host ⇄ one transferred `MessagePort` ⇄ renderer | brokers the port at startup, then carries nothing |
| `direct2` | as `direct`, but **two** independent `MessagePort`s: transcript and snapshot on port A, terminal frames on port B | as above |

`relay` uses distinct Electron IPC channel names exactly as ADR-0044 specifies —
`transcript:increment`, `session:snapshot`, `terminal:frames`. `direct` and `direct2` were built with
`MessageChannelMain`: `child.postMessage(msg, [port1])` to the run host and
`webContents.postMessage('port', payload, [port2])` to the renderer, which pairs the two ends
directly. This is the arrangement ADR-0002's "Revisit if" names.

**Getting a port into a sandboxed, context-isolated renderer is not a `contextBridge` operation.**
A `MessagePort` cannot cross `contextBridge.exposeInMainWorld` — the first attempt produced
`port.postMessage is not a function` in the main world. The route that works is the one Electron's
`message-ports` tutorial documents: the preload receives the port on `ipcRenderer.on('port', …)` and
re-posts it into the main world with `window.postMessage(msg, '*', [e.ports[0]])`. This is load-bearing
for ADR-0002's remedy and is recorded here so it is not rediscovered.

### 2.1 Payloads

Modelled from `REQ-MONITOR-214`, `REQ-MONITOR-216` and the Data & Formats transcript-row shape in
domain 07, not from an integer.

**Transcript increment** — session id, sequence number, schema version, earliest-changed index, the
rows from that index onward, diffs, and the persona set. For an append that is one row, which is what
ADR-0044 calls "bounded by construction".

Rows are drawn 60 % `agent {name, persona, content, ts}`, 25 % `tool {name, persona, tool, content,
detail, full_text, full_detail, tool_event_key, tool_terminal, status, started_at, duration, stream_id,
ts}`, 15 % `thinking {name, persona, content, started_at, chars, duration, ts}`, with content sized to
the caps the specification states (`detail` ≤ 400, `full_text` ≤ 2000, thinking content ≤ 4000).

Measured over 2,000 generated rows, JSON bytes per row: **mean 2,238 · p50 2,101 · p95 4,068 · min 490
· max 4,605**. The persona set is 715 bytes. A one-row increment serialises to **4,062–4,064 bytes**.

**Whole-session update** — the `REQ-MONITOR-216` field list with unbounded collections emptied and
bounded collections in full: 20 agent states (`REQ-MONITOR-285`'s maximum supported agent count), 30
run todos, 5 todos per agent, 2 pending approvals, 2 pending questions with 3 questions and 4 options
each, a verification state with 12 checks, 3 queued follow-up prompts, token usage, **120 token-history
samples** (`REQ-MONITOR-166`) and per-agent metrics. Serialises to **68,858 bytes**. A ×4 variant
(80 agents, 480 samples) serialises to **283,438 bytes** and was measured to show the byte scaling.

*The field list is the specification's; the per-field sizes are this harness's plausible construction
and are not a measurement of the product.*

**Terminal frame** — `{streamId, seq, kind: 'data', payload}` with a payload of 4,096 or 65,536 bytes,
per `REQ-SHELL-104`'s per-stream sequence and ADR-0021's data frames.

### 2.2 The renderer's apply stage

Modelled on ADR-0046 steps 0–5 and ADR-0057: an integer sequence check, an applicability check against
the resident rows, per-row projection from the earliest-changed index, trailer rows recomputed, then a
hand-off to a **40-slot index-keyed recycler** (ADR-0045) that rewrites the slots' `textContent`.
Refused increments were counted; **`refused = 0` in every measured run**, so every quoted latency is a
latency of an increment that was actually applied.

Two store-write strategies were measured, because ADR-0057 requires `applyIncrement` to be the only
writer but does not fix how it appends:

- **`push`** — mutate the resident array in place. O(1) in resident rows.
- **`copy-on-append`** — `display.slice(0, eci).concat(projected)`, the idiomatic immutable-update
  form. O(N) in resident rows.

For the whole-session update the renderer **replaces** the state object rather than merging it, per
ADR-0057 and `REQ-MONITOR-217`.

### 2.3 The load model

`terminal_stream_interval_ms` has default 100 and range 20–2000 (`REQ-TOOLS-126`, `REQ-CONFIG-117`),
and ADR-0021 states that flush-triggered frames are coalesced so "the emitted frame rate never exceeds
what the bottom of `REQ-TOOLS-126`'s own range — 20 ms — already licenses". That is **≤ 50 frames per
second per stream**, so with `REQ-MONITOR-285`'s 20-agent maximum the architecture licenses at most
**≈ 1,000 frames per second in total**. The ladder was chosen around that number and carried well past
it so the cliff could be located. Achieved rates were measured, not assumed, and are quoted below
rather than the requested rates.

---

## 3. Method

**What is timed.** From the run host's `t_send`, taken immediately before the publish call, to the
renderer's `t_applied`, taken immediately after the store apply, the projection and the recycler's DOM
commit have all returned. A second stamp `t_post` is taken in a task scheduled after the
`requestAnimationFrame` that follows the commit, which is the earliest point at which the frame has
been handed to the compositor.

**This interval is a strict subset of what the requirements bound.** `REQ-MONITOR-222` starts at "run
activity"; `REQ-ORCH-155` starts at "the run recording it", and `REQ-MONITOR-221` requires the change to
be persisted before it is published. The database commit, the run host's own projection, and everything
upstream of the publish call are **outside** this measurement. Every figure below is therefore a lower
bound on the requirement's own interval, and is offered as the cost of the transport, not as the cost of
the product. `REQ-MONITOR-223`'s wording — "from the run emitting the change to the surface showing it"
— is the closest match to what was measured.

**Clocks.** All three processes stamp with `performance.timeOrigin + performance.now()`. That is not
adequate on its own: measured across 46 runs the run-host-to-renderer offset ranged from **−1.393 ms to
+0.041 ms**, which is larger than the whole one-way latency on the direct-port path. Each run therefore
performs **400 NTP-style ping-pong exchanges over the same transport it is about to measure**, before
any measurement begins, and takes θ from the median of the best 10 % by round-trip time
(θ = ((T₁−T₀) + (T₂−T₃))/2). The within-run spread of θ over that best decile had a **median of
0.125 ms and a worst case of 0.180 ms** across all runs, so the calibration is good to roughly ±0.09 ms.
This assumes the forward and return path delays are symmetric, which is the standard assumption and is
reasonable over an identical two-hop relay in both directions.

**Independent check on the calibration.** An early analysis applied θ with the wrong sign. Under the
correct sign the eight batch-1 runs — whose θ ranged over 1.27 ms — collapse to a **floor of
0.438–0.507 ms**, agreeing to within 70 µs. Under the wrong sign the same eight runs' floors spread over
0.415–2.958 ms. The agreement of the corrected floors across runs with widely different offsets is what
gives confidence that the correction is right.

**Resolution.** The renderer's `performance.now()` was measured in situ; its median tick is **100 µs**.
Single-operation renderer-side costs are therefore quantised at 0.1 ms and are not resolvable from the
end-to-end samples. Those costs are reported separately in section 5.4 from batched micro-benchmarks of
2,000 iterations each, run **after** the measured window so they cannot perturb it.

**Sampling.** Each condition is a **separate application launch**, so no heap or JIT state carries
between conditions. Each run: prefill the renderer's resident window with N rows → settle 600 ms →
two forced `global.gc()` passes (`--js-flags=--expose-gc`) → settle 400 ms → 400 calibration exchanges →
**400 warm-up publications, discarded** → 1,200–2,000 measured publications. 46 runs were completed;
none hit its watchdog; every one exited 0.

**Publish cadence.** The publish timer was nominally 5 ms but a Node `setInterval` on Windows fires at
the ~15.6 ms system timer granularity. Measured host-side publish interval: **p50 15.55 ms, p95
16.24–16.35 ms** — that is ~64 publications per second. The one exception is the unthrottled-load runs,
where the busy loop raised the effective timer resolution and the interval was **p50 5.00 ms**. The
end-to-end measurement is taken from `t_send` and so is not biased by the cadence, but the cadence
determines the arrival rate and is stated for reproduction.

**Window state.** The window is shown and `backgroundThrottling: false`. An occluded or throttled window
would have distorted every `requestAnimationFrame` figure.

---

## 4. Raw results — no terminal traffic

End-to-end, run host publish → renderer applied, in **milliseconds**. Percentiles are over the pooled
samples of all runs of that condition; the per-run p95 column shows every individual run so the
run-to-run spread is visible rather than hidden inside the pool.

### 4.1 Transcript increment (4,062–4,064 B), `push` apply

| Topology | resident rows | n | min | p50 | p90 | **p95** | p99 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|---|
| relay | 0 | 6700 | 0.438 | 0.779 | 1.015 | **1.133** | 1.632 | 28.041 | 1.100, 1.041, 1.519, 1.090 |
| relay | 5000 | 3200 | 0.500 | 0.822 | 1.123 | **1.353** | 3.723 | 31.466 | 1.277, 1.471 |
| relay | 10000 | 10200 | 0.474 | 0.811 | 1.102 | **1.291** | 2.196 | 47.839 | 1.231, 1.266, 1.373, 1.078, 1.369, 1.444 |
| direct port | 0 | 3500 | 0.242 | 0.410 | 0.533 | **0.583** | 0.747 | 2.184 | 0.589, 0.578 |
| direct port | 10000 | 4700 | 0.243 | 0.425 | 0.556 | **0.624** | 0.954 | 5.327 | 0.612, 0.816, 0.572 |
| two direct ports | 10000 | 1500 | 0.333 | 0.508 | 0.670 | **0.789** | 1.091 | 5.099 | 0.789 |

### 4.2 Transcript increment, `copy-on-append` apply (relay)

| resident rows | n | min | p50 | p90 | **p95** | p99 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|
| 0 | 3200 | 0.498 | 0.769 | 1.063 | **1.298** | 1.889 | 15.763 | 1.349, 1.211 |
| 5000 | 3200 | 0.500 | 0.783 | 1.049 | **1.242** | 1.969 | 5.324 | 1.443, 1.053 |
| 10000 | 3200 | 0.507 | 0.816 | 1.184 | **1.502** | 2.349 | 5.327 | 1.365, 1.690 |

### 4.3 Whole-session update, 10,000 resident rows

| Topology | payload | n | min | p50 | p90 | **p95** | p99 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|---|
| relay | 68,858 B | 3000 | 2.445 | 3.060 | 4.135 | **5.951** | 40.776 | 124.983 | 4.293, 17.722 |
| relay | 283,438 B | 1500 | 7.807 | 8.651 | 10.607 | **12.179** | 16.790 | 22.085 | 12.179 |
| direct port | 68,858 B | 1500 | 0.757 | 1.087 | 1.446 | **1.612** | 2.274 | 4.650 | 1.612 |
| two direct ports | 68,858 B | 1500 | 0.956 | 1.327 | 2.134 | **2.634** | 3.187 | 10.931 | 2.634 |

### 4.4 To first paint

`t_post` — the task after the animation frame that follows the commit — measured in every condition:
**p95 9.127–10.315 ms** with no terminal load, in every topology and at every resident row count. This
is one to two vsync intervals at 60 Hz and is a property of the display cadence, not of the transport:
it does not vary with topology or session length. Under 65.5 MB/s of relayed terminal traffic it rises
to 13.702 ms; at 49 MB/s in 12,000 frames per second it rises to 129.406 ms; under unthrottled load it
tracks the applied figure into the seconds.

---

## 5. Raw results — under terminal-frame load

10,000 resident rows, transcript increment payload, `push` apply. Terminal frames travel on
`terminal:frames` (relay), the shared port (`direct`) or their **own** port (`direct2`). Rates are the
**achieved** rates measured in the run host, not the requested ones.

### 5.1 Relay

| Terminal load (achieved) | n | min | p50 | p90 | **p95** | p99 | max |
|---|---|---|---|---|---|---|---|
| none | 10200 | 0.474 | 0.811 | 1.102 | **1.291** | 2.196 | 47.839 |
| 64 f/s × 4 KiB = 0.3 MB/s | 2000 | 0.444 | 0.785 | 1.059 | **1.193** | 4.076 | 30.638 |
| 322 f/s × 4 KiB = 1.3 MB/s | 2000 | 0.421 | 0.982 | 1.396 | **1.544** | 2.612 | 6.003 |
| 999 f/s × 4 KiB = 4.1 MB/s | 1500 | 0.516 | 0.853 | 1.238 | **1.514** | 11.317 | 42.056 |
| 321 f/s × 64 KiB = 21.0 MB/s | 2000 | 0.524 | 1.580 | 2.013 | **2.165** | 6.729 | 29.917 |
| 3,998 f/s × 4 KiB = 16.4 MB/s | 1500 | 0.470 | 0.756 | 1.065 | **1.402** | 2.089 | 6.248 |
| 1,000 f/s × 64 KiB = 65.5 MB/s | 1500 | 2.498 | 3.651 | 4.470 | **7.733** | 18.835 | 30.014 |
| 11,994 f/s × 4 KiB = 49.1 MB/s | 1500 | 0.420 | 0.774 | 80.929 | **126.207** | 206.198 | 232.783 |
| unthrottled, ~50k f/s × 4 KiB = 200–209 MB/s | 4000 | 5443.4 | 19335.1 | 30345.3 | **31716.7** | 32982.1 | 33572.7 |

### 5.2 Direct ports

| Topology | Terminal load (achieved) | n | min | p50 | p90 | **p95** | p99 | max |
|---|---|---|---|---|---|---|---|---|
| one shared port | none | 4700 | 0.243 | 0.425 | 0.556 | **0.624** | 0.954 | 5.327 |
| one shared port | 322 f/s × 64 KiB = 21.1 MB/s | 2000 | 0.363 | 0.652 | 0.883 | **1.015** | 8.741 | 26.731 |
| one shared port | unthrottled, ~46k f/s = 190 MB/s | 4000 | 1507.9 | 5261.4 | 8634.3 | **9056.5** | 9534.8 | 9705.9 |
| **terminal on its own port** | none | 1500 | 0.333 | 0.508 | 0.670 | **0.789** | 1.091 | 5.099 |
| **terminal on its own port** | 999 f/s × 64 KiB = 65.5 MB/s | 1500 | 0.331 | 0.590 | 1.128 | **1.521** | 6.649 | 15.040 |
| **terminal on its own port** | 11,993 f/s × 4 KiB = 49.1 MB/s | 1500 | 0.310 | 0.521 | 0.743 | **1.119** | 5.488 | 8.754 |
| **terminal on its own port** | unthrottled, ~40k f/s = 162.9 MB/s | 1500 | 1360.2 | 3461.4 | 5436.7 | **5682.3** | 5888.9 | 5948.3 |

Side by side at the two loads measured on both, with the same 10,000 resident rows:

| Load | relay p95 | own-port p95 | factor |
|---|---|---|---|
| 65.5 MB/s in 1,000 frames/s | 7.733 | 1.521 | **5.1×** |
| 49.1 MB/s in 12,000 frames/s | 126.207 | 1.119 | **113×** |
| unthrottled (~200 vs ~163 MB/s) | 31716.7 | 5682.3 | 5.6× |

### 5.3 Whole-session update under load

68,858 B whole-session update, 10,000 resident rows, against 999–1,000 f/s × 64 KiB = 65.5 MB/s of
terminal frames.

| Topology | n | min | p50 | p90 | **p95** | p99 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|
| relay | 6000 (4 runs) | 2.449 | 3.609 | 6.419 | **7.807** | 14.781 | 375.746 | 9.302, 7.516, 8.303, 7.432 |
| terminal on its own port | 3000 (2 runs) | 0.867 | 1.189 | 2.517 | **2.754** | 8.773 | 25.482 | 2.753, 2.760 |

### 5.4 Component costs

**Main's relay cost**, measured as the wall time of `webContents.send` in main, p95 unless stated:

| Payload | p95 (range over runs) | worst single call observed |
|---|---|---|
| 4.06 KB transcript increment | 72–151 µs (29 runs) | 24,481 µs |
| 68,858 B whole-session update | 528–1,057 µs (6 runs) | 88,263 µs |
| 283,438 B whole-session update | 1,569 µs (1 run) | — |
| 4 KiB terminal frame | 33.0–37.4 µs (mean over 29k–587k frames) | — |
| 64 KiB terminal frame | 163.0–195.0 µs (mean over ~30k frames) | — |

**Renderer-side per-operation costs**, batched over 2,000 iterations each:

| Resident rows | apply `push` (store + projection) | apply `copy-on-append` | apply + 40-slot DOM commit (`push`) | apply + DOM (`copy-on-append`) | `structuredClone` of the 4.06 KB increment |
|---|---|---|---|---|---|
| 1,600 | 2.85 µs | 7.75 µs | 44.65 µs | 38.75 µs | 43.75 / 20.00 µs |
| 6,600 | 2.20 µs | 18.05 µs | 34.95 µs | 46.20 µs | 27.50 / 19.80 µs |
| 11,600 | 1.20 µs | 36.05 µs | 28.95 µs | 56.80 µs | 22.60 / 19.65 µs |
| 11,900–12,400 (10 further runs) | 0.95–1.70 µs | — | 24.35–38.50 µs | — | 18.65–31.15 µs |

`push` is flat in resident rows. `copy-on-append` grows at **≈ 2.83 ns per resident row**
((36.05 − 7.75) µs / 10,000 rows).

*The resident counts in this table are `N + warm-up + measured` because the benchmark runs after the
measured window; the "0 rows" condition benchmarks at 1,600 resident, not at 0.*

**Tail excursions**, counted over every sample of every run:

| Group | runs | samples | > 10 ms | > 50 ms | > 100 ms | worst |
|---|---|---|---|---|---|---|
| transcript increment, relay, 10,000 rows | 6 | 10,200 | 11 | 0 | 0 | 47.8 ms |
| transcript increment, direct port, 10,000 rows | 4 | 6,200 | 0 | 0 | 0 | 5.3 ms |
| whole-session update, relay | 6 | 9,000 | 202 | 57 | **24** | 375.7 ms |
| whole-session update, direct port | 4 | 6,000 | 27 | 0 | 0 | 25.5 ms |

---

## 6. Verdicts

### `REQ-MONITOR-222` — 250 ms at the 95th percentile, at zero rows and at thousands — **PASS**

Measured p95, run host publish → renderer applied: **1.133 ms at 0 rows and 1.291 ms at 10,000 rows on
the relay topology.** Including the wait for the frame after the commit, the pooled p95 is 9.632 ms at
0 rows (n = 6,700) and 9.834 ms at 10,000 rows (n = 10,200).
The pooled p99 at 10,000 rows is 2.196 ms and the worst single sample over 10,200 samples is 47.839 ms.
The margin against 250 ms is roughly two orders of magnitude and it holds at both ends of the
requirement's "regardless of how long the session already is".

It also holds under every terminal load the architecture licenses (section 5.1): worst measured p95 at
or below 1,000 frames per second is **7.733 ms**, at 65.5 MB/s. It continues to hold at 12,000 frames
per second (p95 126.207 ms), which is twelve times the licensed rate. It **fails** only under
unthrottled load — p95 31.7 s at ~50,000 frames per second. Reaching that rate would need about a
thousand concurrently flushing streams at ADR-0021's 20 ms floor; it is fifty times what
`REQ-MONITOR-285`'s 20 agents can emit at that floor, and it is not reachable by any value of
`terminal_stream_interval_ms`, which only ever makes the rate lower. It is a stress ceiling, and it is
reported to locate the cliff rather than as a conformance failure. The caveat is that the harness
counts one foreground stream per agent; whether background terminal sessions (`REQ-TOOLS-107`) can push
the concurrent stream count materially above 20 was not established and is left as a question for the
record rather than answered here.

### `REQ-MONITOR-223` — 10,000 rows must cost no more than twice 0 rows, p95, same content — **PASS**

| Apply strategy | Topology | p95 @ 0 rows | p95 @ 10,000 rows | **ratio** | ceiling |
|---|---|---|---|---|---|
| `push` | relay | 1.133 | 1.291 | **1.14** | 2 |
| `copy-on-append` | relay | 1.298 | 1.502 | **1.16** | 2 |
| `push` | direct port | 0.583 | 0.624 | **1.07** | 2 |

At `REQ-SESSION-192`'s actual residency cap of 5,000 rows the relay ratio is 1.353 / 1.133 = **1.19**.
The 10,000-row condition holds all 10,000 rows resident, which is above that cap and therefore the
harder case; both readings pass.

The mechanism is confirmed independently by section 5.4: the increment on the wire is one row whatever
the session length, and an O(1) apply is flat in resident rows. `copy-on-append` is genuinely O(N) at
2.83 ns per row, but at the residency cap that is ~14 µs against a ~500 µs transport floor, so it does
not move the end-to-end ratio. See finding 7.3 — this passes today for a reason that would stop being
true if the residency cap were relaxed.

### `REQ-ORCH-155` — a state change reflected within 100 ms — **PASS at p95; the absolute reading is not reliably met on the relay**

The surfaces `REQ-ORCH-155` names — the child graph, the model-slot and rate-limit waits, verification
progress, the run-progress summary — are non-transcript state and therefore travel on the whole-session
update (`REQ-MONITOR-216`, ADR-0044 channel 2), so section 4.3 and section 5.3 are the relevant
measurements, not the increment figures.

**The requirement states no percentile.** It is quoted here in full because the reading changes the
verdict: "Each of these surfaces MUST reflect a state change the run has recorded within 100 ms of the
run recording it."

- **Read as a p95:** relay p95 is **5.951 ms** unloaded and **7.807 ms** under 65.5 MB/s of terminal
  frames, against a 68,858-byte payload. At 283,438 bytes it is 12.179 ms. **PASS**, with a margin of
  8× to 40×.
- **Read as an absolute bound on every update:** **24 of 9,000 relay samples exceeded 100 ms**, in 2 of
  6 runs — worst 124.983 ms in an *unloaded* run and 375.746 ms in a loaded one. On the direct-port
  path, 0 of 6,000 samples exceeded 50 ms and the worst was 25.482 ms. Under the absolute reading the
  relay **fails** and the direct port does not.

The excursions have two distinct causes, and both were caught in the instrumentation. In the unloaded
run a **single `webContents.send` of the 69 KB payload took 88.263 ms** while main's event loop was
otherwise idle. In the loaded run there was no single slow send (worst 10.234 ms) but a contiguous burst
of 32 samples over 50 ms — main falling behind the terminal stream and draining. Neither appears on the
transcript-increment payload: over 10,200 relay samples at 10,000 rows, **no sample exceeded 50 ms**.

This is recorded as a finding rather than resolved, because which reading is correct is a question for
the specification, not for a spike.

### Question 2 — does a separate channel name stop a terminal stream delaying a transcript row? — **No**

ADR-0044 gives terminal frames their own channel so "a high-volume stream cannot delay a transcript
row". A distinct Electron IPC **channel name does not create a distinct transport**: every
`webContents.send` for a given `webContents` is multiplexed onto one IPC pipe and is dispatched by one
main-process event loop and one renderer main thread. Measured on the relay against the no-load
baseline of p95 1.291 ms at 10,000 rows:

| Terminal load | transcript p95 | ratio to no load |
|---|---|---|
| 4.1 MB/s in 999 frames/s | 1.514 ms | 1.17× |
| 16.4 MB/s in 3,998 frames/s | 1.402 ms | 1.09× |
| 65.5 MB/s in 1,000 frames/s | 7.733 ms | 5.99× |
| 49.1 MB/s in 11,994 frames/s | 126.207 ms | **97.8×** |
| ~200 MB/s unthrottled | 31,716.7 ms | 24,568× |

The cost is **per message, not per byte**: 49.1 MB/s delivered in 12,000 frames/s is far worse than
65.5 MB/s delivered in 1,000 frames/s. Main spends 33.0–37.4 µs in `webContents.send` per 4 KiB frame,
so 12,000 frames/s is ~0.40 s of send time per second of wall clock, before the receive side from the
run host is counted. That is what puts the transcript row's p95 at 126 ms.

**A genuinely separate transport does buy the isolation.** With terminal frames on their own
transferred `MessagePort`, transcript p95 is 1.521 ms at 65.5 MB/s and 1.119 ms at 12,000 frames/s,
against a 0.789 ms no-load baseline — a 1.4×–1.9× effect where the relay showed 6×–98×.

The important qualification: **at the frame rate ADR-0021's own coalescing licenses — 50 frames/s per
stream, ≈1,000 frames/s across `REQ-MONITOR-285`'s 20 agents — no topology showed a problem.** The relay
at 999 f/s × 4 KiB measured p95 1.514 ms. The claim in ADR-0044 is therefore wrong about the mechanism
but is not, at the licensed rate, wrong about the outcome.

### Question 3 — is ADR-0002's remedy better? — **Yes, and the margin is large**

| Measurement | relay | direct port | improvement |
|---|---|---|---|
| increment p95, 0 rows | 1.133 ms | 0.583 ms | 1.94× |
| increment p95, 10,000 rows | 1.291 ms | 0.624 ms | 2.07× |
| increment floor (min) | 0.438 ms | 0.242 ms | 1.81× |
| 68,858 B whole-session p95 | 5.951 ms | 1.612 ms | 3.69× |
| 68,858 B whole-session worst sample | 124.983 ms | 4.650 ms | 26.9× |
| increment p95 at 65.5 MB/s terminal | 7.733 ms | 1.521 ms | 5.08× |
| increment p95 at 12,000 frames/s | 126.207 ms | 1.119 ms | 113× |

The remedy also discharges ADR-0044's cross-channel ordering obligation by removing the hop that could
violate it, as ADR-0044 consequence 3 anticipates. It was verified to work with `sandbox: true`,
`contextIsolation: true` and `nodeIntegration: false` intact — the port arrives in the sandboxed main
world through the preload's `window.postMessage` transfer, so none of ADR-0002's renderer posture is
given up to get it.

**It is not required by the measurements against `REQ-MONITOR-222` and `REQ-MONITOR-223`**, both of
which the relay meets with a large margin. It is the difference between passing and failing only on
`REQ-ORCH-155` read as an absolute bound, and only for the whole-session payload.

---

## 7. Findings that bear on the record

### 7.1 ADR-0044's "terminal frames on their own lane" is not implemented by a channel name

Consequence 5 of ADR-0044 already keeps the two sequence vocabularies distinct, and consequence 3
already anticipates the double hop. What is not in the record is that **`transcript:increment` and
`terminal:frames` are the same lane** under `webContents.send`. The isolation ADR-0044 attributes to
channel 3 exists only if channel 3 has its own transport. The measurements say the difference is 6× to
98× in transcript p95 at loads above ~4,000 frames/s or ~20 MB/s.

Two things follow, and both are cheap. First, if terminal frames stay on `webContents.send`, the
architecture's protection against this is entirely ADR-0021's coalescing cap, and that cap becomes
load-bearing for `REQ-MONITOR-222` rather than merely being a display concern. Second, if a direct port
is adopted for the update channels, giving terminal frames a **second** port costs one more
`MessageChannelMain` and recovers the isolation ADR-0044 claims.

### 7.2 The relay's cost is per message, not per byte

Main's `webContents.send` costs 33.0–37.4 µs for a 4 KiB frame and 163.0–195.0 µs for a 64 KiB frame —
a 16× payload for a 5× cost. The corollary is that the relay's capacity is a message rate, and that
message rate is the thing to instrument in diagnostics (ADR-0052). At 12,000 messages/s it is at ~40 %
utilisation in `send` alone and p95 has already risen 98×; unthrottled it collapses into an unbounded
backlog (main's event-loop lag reached 22,777 ms; the queue drained for tens of seconds after the run
host stopped publishing).

ADR-0044 consequence 4 asks diagnostics to "distinguish a gap caused by an overflowing subscriber queue
from one caused by the relay". Worth noting for that: in the collapse, **nothing was dropped and nothing
was reordered** — `refused = 0`, and the renderer received every one of the 586,960 frames the run host
sent. The relay degrades into unbounded latency, not into loss, so a gap counter would never fire and
the failure would present only as a stale interface.

### 7.3 `REQ-MONITOR-223` passes for a reason that depends on the residency cap

The idiomatic immutable store update, `[...rows, row]`, is O(N) at 2.83 ns per resident row. At the
5,000-row cap of `REQ-SESSION-192` that is ~14 µs and is invisible against the ~500 µs transport floor,
which is why the measured ratio is 1.16 rather than something alarming. The margin is being supplied by
the transport, not by the store. ADR-0057's "every selector carries an explicit equality function …
which breaks `REQ-MONITOR-223` under load and is invisible when idle" is the same hazard one level up;
this measurement gives it a number, and a test that measures the store apply in isolation would catch a
regression that an end-to-end p95 would not.

### 7.4 Structured-clone cost is nowhere near dominating the budget

ADR-0044's "Revisit if" names structured-clone cost dominating the 250 ms p95 for large snapshots. Two
measurements bear on it: `structuredClone` of a 4.06 KB increment costs **18.65–43.75 µs** in the
renderer, and a 283,438-byte whole-session update crosses both relay hops and is applied in a p95 of
**12.179 ms**. Quadrupling the snapshot from 68,858 to 283,438 bytes multiplied the p95 by 2.05, not by
4. On this evidence the revisit trigger is a long way off; the sporadic 88 ms `webContents.send` in
finding 6/`REQ-ORCH-155` is a much nearer hazard than the clone cost, and it is not a function of size
in any way this spike could reproduce on demand.

### 7.5 `performance.timeOrigin` is not a shared clock across Electron processes

Measured offset between the run host and the renderer ranged over **1.43 ms across 46 runs** — larger
than the entire one-way latency on the direct-port path. Any conformance test for `REQ-MONITOR-222`,
`REQ-MONITOR-223` or `REQ-ORCH-155` that stamps in one process and compares in another must calibrate,
or it will report a number whose error is the size of the thing it is measuring. `REQ-MONITOR-225`
already requires each snapshot load and each projection duration to be recorded in diagnostics; those
are single-process intervals and are unaffected. A cross-process one is not.

---

## 8. What this harness does **not** model

- **Everything upstream of the publish call.** The database commit `REQ-MONITOR-221` requires before
  publication, the run host's own projection, the 50 ms coalescing tick of `REQ-MONITOR-219`, and the
  model and tool work that produce the row are all outside the measured interval. `REQ-MONITOR-222`
  and `REQ-ORCH-155` both start earlier than `t_send` does. **Every figure here is a lower bound on
  the requirement's own interval.**
- **The renderer is otherwise empty.** No React, no Zustand, no Markdown renderer, no render cache, no
  virtualiser beyond a 40-slot `textContent` recycler, no fonts, no other views. ADR-0051's Markdown
  rendering and ADR-0045's real recycler are additional cost on the same thread and would consume part
  of the margin reported here.
- **The terminal-frame handler does almost nothing.** It stores the payload in a ring buffer. A real
  frame drives a VT emulator and a grid paint (ADR-0021, ADR-0047). The renderer's main thread would
  therefore saturate at a **lower** frame rate than measured, which makes the direct-port isolation
  figures in section 5.2 optimistic. The relay figures are less affected, because the relay's
  bottleneck was measured to be main, not the renderer.
- **One window.** `REQ-MONITOR-243` and `REQ-STARTUP-163` allow one session in several windows, so one
  publication may fan out to several renderers. That multiplies main's per-message relay cost by the
  window count and was not measured.
- **One session publishing.** Concurrent runs (`REQ-TOOLS-089`, `REQ-SANDBOX-038`) each publish on the
  same counter-per-session discipline into the same relay; the aggregate message rate was not measured.
- **No sequence gaps, no reconciles, no refusals.** `refused = 0` everywhere, so ADR-0046's step-0
  refusal path and `REQ-MONITOR-226`'s reconcile were exercised only in the sense that the integer
  check ran and passed. The cost of a reconcile — a whole read plus an index-0 increment over the
  resident window — was not measured.
- **No packaging.** Development mode only. `REQ-STARTUP-013`'s portable artifact and the ASAR read path
  were not exercised; `spike-base` section 5.4 flags separately that the portable stub's own
  extraction is a large fixed cost.
- **One machine, one architecture, no macOS, no Linux, one afternoon.** 46 runs; most conditions have
  1–6 replicates and the replicate spread is printed in every table so it is not hidden. The
  `REQ-ORCH-155` excursion finding rests on 2 anomalous runs out of 6 and should be replicated before
  it is treated as settled.
- **Anti-malware was active and unmeasured**, as were whatever else the machine was doing.

---

## 9. Reproduction

Harness (throwaway, in the session scratchpad, ~700 lines total):
`main.js` (relay, port brokering, event-loop and `webContents.send` instrumentation),
`runhost.js` (`utilityProcess` publisher, payload generation, rate-controlled terminal load),
`preload.js` (frozen namespace; `MessagePort` transfer into the main world),
`index.html` (replica store, ADR-0046 apply stage, 40-slot recycler, NTP calibration, micro-benchmarks),
`gen.js` (row and whole-session-update generators),
`drive.js` (one Electron launch per condition, config by `SPIKE_CFG` environment variable),
`pool.js` / `summary.js` / `analyse.js` (clock correction, percentiles, pooling).

Configuration is passed as JSON in `SPIKE_CFG` rather than as command-line switches, because Chromium
consumes unrecognised `--switches` before `process.argv` is read. Each condition is
`electron.exe <dir>` with `SPIKE_CFG` set; results are written to a JSON file per run holding every
individual sample, so the percentiles above can be recomputed from the raw data.

Two things will waste a re-runner's time if not known in advance. First, `contextBridge` cannot carry a
`MessagePort`; use the preload `window.postMessage` transfer (section 2). Second, a Node `setInterval`
in the run host fires at Windows' ~15.6 ms timer granularity, so any rate control must derive its owed
work from elapsed wall time rather than from an assumed tick length — the first version of this
harness's load generator produced 322 frames/s when asked for 1,000, and the discrepancy is visible in
the C-series rows of section 5.1, which are reported at their achieved rates.
