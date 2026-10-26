# RUNTIME slice — architecture proposals — Part 3 — Candidate stack, assessed against this slice only

Part 6 of 10 of [the runtime proposal](../runtime.md), which indexes every part.

## Part 3 — Candidate stack, assessed against this slice only

| Candidate element | Verdict for RUNTIME | Evidence |
|---|---|---|
| **Electron** | Settled by product decision, and a good fit. C1.5–C1.7 need native modules and free process spawning; C1.3 needs a single application process lifetime; REQ-STARTUP-002 fixes one graphical entry point. | C1.3, C1.5, C1.6, C1.7, REQ-STARTUP-002 |
| **electron-vite** | No requirement in this slice bears on it. **FREE.** One note: the run host is a Node entry point, not a renderer bundle, and must keep native modules external. | — |
| **React + TypeScript** | Renderer-side; outside this slice. Two constraints reach into it: C5.2 (the store must accept a whole-session replacement carrying every displayable field) and C5.6 (a stage that cannot apply an increment must decline and re-render whole rather than approximating). | C5.2, C5.6 |
| **Zustand** | Outside this slice. Compatible with C5.1's two payload shapes. The one thing to avoid is deriving displayed state that a whole read would not produce (C5.6). | C5.1, C5.6 |
| **Vercel AI SDK Core behind an internal `LLM` abstraction** | The abstraction is settled by product decision. What this slice needs *from* the port is listed below and is unusually demanding — in particular REQ-ORCH-146. | see below |
| **Official MCP TypeScript SDK** | Fits. One runtime obligation: MCP server subprocesses are **session-scoped and torn down at lock release, before the lock file is removed** (C1.7). They are not application-scoped. | C1.7, REQ-SESSION-049 |
| **xterm.js + node-pty** | node-pty must load in the run host, which is one more reason a renderer cannot host the engine (C1.5). The check-skip path needs process-group signalling with a 5 s grace and terminal-session teardown (C1.5) — a discipline that must **not** be shared with the hook path (C8.3). | C1.5, C8.3 |
| **SQLite + Drizzle + better-sqlite3** | **No requirement in this slice needs it, and using it as the source of truth would violate the file contract.** See ADR-RUNTIME-03. | C3.1, C3.3, C4.1, C4.2, C7.8 |
| **A separate runtime process for run execution** | **Recommended** (ADR-RUNTIME-01), but for reasons other than the usual ones: not to parallelise, but because C1.8's synchronous durable flush and C4.3's per-event flush must not land on the window layer, and because C2.1 already requires a serializable control surface. | C1.8, C4.3, C2.1 |
| **"An event journal with projections"** | **Half true, and taking it literally would be a mistake.** The journal is fixed as JSONL, byte-identical to the wire (C4.1, C4.2). But only the *transcript* is projected from events; every other displayed field comes from a whole-state snapshot (C5.1, C5.2), and the catalog is closed at 23 types and deliberately excludes a decision that is durably recorded elsewhere (C4.17). Full event sourcing of session state is ruled out. | C4.1, C4.2, C4.17, C5.1, C5.2 |

### What the `LLM` port must provide, for this slice to be implementable

These are requirements on the *shape* of the model abstraction, raised here because they were
discovered from runtime requirements and belong to the model-providers slice to answer:

1. **Cancellation must propagate into an in-flight request**, and a graceful pause must await
   in-flight tool calls up to a 30 s deadline before force-closing — REQ-ORCH-132, REQ-ORCH-134.
2. **A structured-output degradation ladder of three rungs**, with a rung a given model has rejected
   remembered *per model for the session* — REQ-ORCH-010.
3. **Failure classification into transient / validation-class / neither**, with an exhaustive
   definition of each and rate-limit and context-window failures explicitly routed elsewhere first —
   REQ-ORCH-092.
4. **Retry-After surfacing** from the provider, and a distinction between generic rate limiting and
   structured quota exhaustion — REQ-ORCH-091.
5. **Context-window rejection detected as its own class**, recoverable by condensation and retry at
   most twice — REQ-ORCH-093.
6. **The ability to *not* drive the loop.** REQ-ORCH-146: for a provider that ships its own native
   agentic loop, children run under that loop by default, and disabling it degrades to single-shot
   with tool use and streaming discarded. An abstraction that only exposes "one call, streamed
   deltas, tools I dispatch" cannot express this. This is the single most shape-determining
   requirement on the port and should be resolved before the port is designed.

Correspondingly, REQ-ORCH-134 states explicitly that **the threading model, the shape of streamed
model events, and any retry below the classification of REQ-ORCH-092 are not constrained** and no
conformance claim depends on them. That is genuine freedom and should be used.

---
