# Architectural constraints extracted from the specification — 10. Lifecycle hooks

Part 12 of 22 of [the constraints](../constraints.md), which indexes every part.

## 10. Lifecycle hooks

| # | Constraint | Label | Requirements |
|---|---|---|---|
| H-01 | The interpreter is fixed by platform and **must not vary with the content of the command**; the working directory is the tree the run is changing while the payload reports the base workspace. | HARD | REQ-HOOKS-030, REQ-HOOKS-084 |
| H-02 | The payload is **exactly one UTF-8 JSON object on stdin, then closed**, with the last byte the closing brace and **no trailing newline**; no part may be placed on the command line or in the environment. | HARD | REQ-HOOKS-031, REQ-HOOKS-067 |
| H-03 | An invocation returns no later than the timeout plus **5.0 s** grace plus one process start; termination reaches **only the started process and must not be widened to its group**; **descendants may outlive the hook and the run**; collecting output **must not block on a stream a surviving descendant still holds open**. | HARD | REQ-HOOKS-033 |
| H-04 | Every applicable hook **runs, in declaration order, one after another, even after one has decided to stop the call**; the first stopping outcome takes effect, determined once all have finished. | HARD | REQ-HOOKS-040 |
| H-05 | Concurrent occurrences must not delay each other; the failure tally is per stable id for the whole session; one switch-off warning; one event pair and one timeline entry per invocation; **no maximum concurrency is fixed**. | HARD | REQ-HOOKS-042, REQ-HOOKS-055 |
| H-06 | Hooks **run in line with the run loop**; the iteration-end hook finishes before the next iteration and **before that iteration's checkpoint is taken**; the session-end hook runs on every exit path, after the final status is decided, with its status string **derived once and used for both destinations**. | HARD | REQ-HOOKS-080 – REQ-HOOKS-082, REQ-SESSION-088 |
| H-07 | The durable diagnostics entry is written **before** the corresponding completion event; where diagnostics cannot be written it degrades to a log line with no change to the outcome. | HARD | REQ-HOOKS-039, REQ-HOOKS-121 |
| H-08 | The hook set is **fixed when the run starts**; exactly two within-session changes exist. | HARD | REQ-HOOKS-069, REQ-HOOKS-131 |
| H-09 | **No hook-related condition may end a run**, alter its terminal status, or leave it waiting beyond the per-hook bound. | HARD | REQ-HOOKS-072, REQ-HOOKS-085, REQ-HOOKS-129 |
| H-10 | With no eligible hook for an occurrence, **nothing observable happens** — no process, no events, no timeline or issues entry, no file read or written. | HARD | REQ-HOOKS-041, REQ-HOOKS-127 |
| H-11 | Numeric bounds: 50 ms each to resolve the set, validate configuration, compute the workspace fingerprint and apply the trust gate at 100 entries; 10 ms to build one payload at 100 KB; under 1 ms to decide an occurrence has no applicable hook. Nothing bounds time inside the hook process. | HARD | REQ-HOOKS-135, REQ-HOOKS-139 |
| H-12 | H-03's never-widen rule is the **opposite** of the verification-skip path, which must signal the process group and tear down the terminal session. **Two paths, and they must not share a kill implementation.** | HARD (deliberate asymmetry) | REQ-HOOKS-033 vs REQ-ORCH-128 |
| H-13 | H-03's surviving descendants against "once the application has exited, nothing it started is still running". | CONFLICT | REQ-HOOKS-033 vs REQ-TOOLS-111 |

---
