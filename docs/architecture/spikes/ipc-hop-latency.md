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

## Parts

Since 2026-10-26 the rest of this document is in [`ipc-hop-latency/`](ipc-hop-latency/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](ipc-hop-latency/01-1-environment.md) | 1. Environment |
| [02](ipc-hop-latency/02-2-what-was-built.md) | 2. What was built; 2.1 Payloads; 2.2 The renderer's apply stage; 2.3 The load model |
| [03](ipc-hop-latency/03-3-method.md) | 3. Method |
| [04](ipc-hop-latency/04-4-raw-results-no-terminal-traffic.md) | 4. Raw results — no terminal traffic; 4.1 Transcript increment (4,062–4,064 B), `push` apply; 4.2 Transcript increment, `copy-on-append` apply (relay); 4.3 Whole-session update, 10,000 resident rows; 4.4 To first paint |
| [05](ipc-hop-latency/05-5-raw-results-under-terminal-frame-load.md) | 5. Raw results — under terminal-frame load; 5.1 Relay; 5.2 Direct ports; 5.3 Whole-session update under load; 5.4 Component costs |
| [06](ipc-hop-latency/06-6-verdicts.md) | 6. Verdicts; `REQ-MONITOR-222` — 250 ms at the 95th percentile, at zero rows and at thousands — **PASS**; `REQ-MONITOR-223` — 10,000 rows must cost no more than twice 0 rows, p95, same content — **PASS**; `REQ-ORCH-155` — a state change reflected within 100 ms — **PASS at p95; the absolute reading is not reliably met on the relay**; Question 2 — does a separate channel name stop a terminal stream delaying a transcript row? — **No**; Question 3 — is ADR-0002's remedy better? — **Yes, and the margin is large** |
| [07](ipc-hop-latency/07-7-findings-that-bear-on-the-record.md) | 7. Findings that bear on the record; 7.1 ADR-0044's "terminal frames on their own lane" is not implemented by a channel name; 7.2 The relay's cost is per message, not per byte; 7.3 `REQ-MONITOR-223` passes for a reason that depends on the residency cap; 7.4 Structured-clone cost is nowhere near dominating the budget; 7.5 `performance.timeOrigin` is not a shared clock across Electron processes — §12.179 |
| [08](ipc-hop-latency/08-8-what-this-harness-does-not-model.md) | 8. What this harness does **not** model |
| [09](ipc-hop-latency/09-9-reproduction.md) | 9. Reproduction |
