# Spike — the run-host → main → renderer double hop — 2. What was built

Part 2 of 9 of [the spike report](../ipc-hop-latency.md), which indexes every part.

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
