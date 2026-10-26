# Process view — five processes and what crosses each boundary — The wire bus (ADR-0010 #2) stays in the run host

Part 7 of 8 of [the process view](../02-process-view.md), which indexes every part.

## The wire bus (ADR-0010 #2) stays in the run host

Every event is recorded in the store before it is forwarded to any consumer (REQ-SESSION-147); the only
consumer today is the application itself (`run.result` → main's notice). No consumer in another process is
licensed.
