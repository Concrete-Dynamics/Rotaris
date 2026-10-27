# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing — Context

Part 1 of 11 of [ADR-0060](../0060-context-compression-over-a-replaceable-conversation.md), which indexes every part.

## Context

A model call rejected because the conversation no longer fits must be recovered by condensing and retrying
(`REQ-ORCH-093`), and an agent that has reached the effective threshold must compress **before** its next
call rather than after a failure (`REQ-MONITOR-076`). Part Q built the classification —
`classifyFailure` returns `context_window` for eight provider phrasings — and then routed it nowhere: the
ladder's comment says "context-window rejection and every other failure → the step fails as it did
(`REQ-ORCH-093` is left unbuilt)". Part AB's and Part AC's work above it made long sessions ordinary, so
the failure is now the first thing a real session hits.

Everything the reconstruction needs is decided already. `REQ-MONITOR-084` fixes the five parts and their
order; `REQ-MONITOR-082` fixes the three survivors and forbids sending them to the compressing model;
`REQ-CONFIG-134` fixes the capacity ladder and `compressionTrigger()` already computes it, uncalled.

What is **not** decided is where the conversation lives. Today it is a local array in `runTurn`
(`messages`, `turn.ts`), rebuilt from `history` at every turn and chained through `outcome.messages` by
`runWithChildren`. Nothing outside the turn can address it, and the array reference is handed straight to
`backend.runTurn`. Compression must replace that array — and one day §10's manual compression must replace
it from outside the turn entirely. This ADR decides the shape.

Two further things are undecided by the requirements and decided here because the code cannot proceed
without them: what a "conversation turn" is for `preserve_recent_turns`, and where a compression is
reported given that `REQ-EVENTS-041` closes the wire catalogue at 23 kinds and none of them reports one.
