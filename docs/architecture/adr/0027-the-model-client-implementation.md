# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** MODEL (ADR-MODEL-02)
- **Depends on:** ADR-0026, ADR-0031

## Parts

Since 2026-10-26 the rest of this document is in [`0027-the-model-client-implementation/`](0027-the-model-client-implementation/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0027-the-model-client-implementation/01-context.md) | Context |
| [02](0027-the-model-client-implementation/02-alternatives-considered.md) | Alternatives considered |
| [03](0027-the-model-client-implementation/03-decision.md) | Decision |
| [04](0027-the-model-client-implementation/04-consequences-accepted.md) | Consequences accepted |
| [05](0027-the-model-client-implementation/05-revisit-if.md) | Revisit if |
| [06](0027-the-model-client-implementation/06-first-execution-2026-09-03-the-adapter-and.md) | First execution — 2026-09-03, the adapter, and spike 6 in its structural half |
| [07](0027-the-model-client-implementation/07-second-execution-2026-09-05-the-first-real.md) | Second execution — 2026-09-05, the first real model call (Part K) |
| [08](0027-the-model-client-implementation/08-third-execution-2026-09-05-the-ladder-over-the.md) | Third execution — 2026-09-05, the ladder over the port (Part Q: REQ-ORCH-088/090/091/092, REQ-NOTIFY-081..093/263) |
| [09](0027-the-model-client-implementation/09-fourth-execution-2026-09-12-the-timeout-a-real.md) | Fourth execution — 2026-09-12, the timeout a real run found (REQ-CONFIG-115, REQ-ORCH-092) |
| [10](0027-the-model-client-implementation/10-fifth-execution-2026-09-16-the-rung-that-never.md) | Fifth execution — 2026-09-16, the rung that never left the process (REQ-ORCH-010, REQ-PROVIDER-089) |
| [11](0027-the-model-client-implementation/11-sixth-execution-2026-10-02-the-session-wide.md) | Sixth execution — 2026-10-02, the session-wide override taken by a second writer (REQ-NOTIFY-070, REQ-SESSION-026) |
| [12](0027-the-model-client-implementation/12-seventh-execution-2026-10-02-the-session-wide.md) | Seventh execution — 2026-10-02, the session-wide override followed from every agent's next call (REQ-ORCH-091 a/d, REQ-MONITOR-194) |
| [13](0027-the-model-client-implementation/13-eighth-execution-2026-10-02-an-explicit-choice.md) | Eighth execution — 2026-10-02, an explicit choice clears an exclusion (REQ-MONITOR-194) |
| [14](0027-the-model-client-implementation/14-ninth-execution-2026-10-02-the-exclusion-read.md) | Ninth execution — 2026-10-02, the exclusion read before every call (REQ-MONITOR-194, REQ-ORCH-091 a-c) |
| [15](0027-the-model-client-implementation/15-tenth-execution-2026-10-02-every-waiting-pairs.md) | Tenth execution — 2026-10-02, every waiting pair's override persisted (REQ-ORCH-091 d, REQ-SESSION-026/196) |
| [16](0027-the-model-client-implementation/16-eleventh-execution-2026-10-02-every-selectors.md) | Eleventh execution — 2026-10-02, every selector's choice clears an exclusion (REQ-MONITOR-194, REQ-MONITOR-146, REQ-NOTIFY-074) |
| [17](0027-the-model-client-implementation/17-twelfth-execution-2026-10-03-every-selector.md) | Twelfth execution — 2026-10-03, every selector annotates a pair held out of quota (REQ-MONITOR-194, REQ-NOTIFY-074) |
| [18](0027-the-model-client-implementation/18-thirteenth-execution-2026-10-07-a-tool-calls.md) | Thirteenth execution — 2026-10-07, a tool call's streamed arguments reach the run (REQ-ORCH-089, REQ-ORCH-090, REQ-CHAT-164) |
