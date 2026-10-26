# Spike — the run-host → main → renderer double hop — 9. Reproduction

Part 9 of 9 of [the spike report](../ipc-hop-latency.md), which indexes every part.

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
