# ADR-0039 — history

The passages of [ADR-0039](../../../architecture/adr/0039-checkpoints-via-a-private-index.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="struck-2026-10-13"></a>

**The struck text of 2026-10-13**, from [0039-checkpoints-via-a-private-index/07-first-execution-2026-09-05-the-mechanism-end-to.md](../../../architecture/adr/0039-checkpoints-via-a-private-index/07-first-execution-2026-09-05-the-mechanism-end-to.md), “First execution — 2026-09-05, the mechanism end to end (Part P)”:

~~*Capture position:* after `iteration.end` is recorded and BEFORE the hooks' `iteration_end`, so the
checkpoint records the iteration's work as the agent left it and a hook that later carries the checkpoint (REQ-HOOKS-082
with checkpoints — owed) can be handed it; awaited, so it precedes the next iteration and teardown (REQ-GIT-051).~~
