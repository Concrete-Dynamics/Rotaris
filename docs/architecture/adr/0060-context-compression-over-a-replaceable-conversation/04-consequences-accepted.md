# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing — Consequences accepted

Part 4 of 11 of [ADR-0060](../0060-context-compression-over-a-replaceable-conversation.md), which indexes every part.

## Consequences accepted

1. A compression sits on the agent's critical path for up to `timeout_seconds` (120 s by default). The agent
   is doing nothing else at that moment, and the alternative is a failed call.
2. Automatic compression fires between steps, so a single step whose own request already exceeds the window
   — one enormous tool result — is caught by the recovery path, not the trigger. Both exist for that reason.
3. Compression is per agent conversation. A run whose children each hold a large context compresses each of
   them separately, and the figures are per agent (`REQ-MONITOR-086`'s run-wide count is their sum).
4. §10's manual compression (`REQ-MONITOR-090..097`, `REQ-CHAT-078..081`) is **not built here**. Decision 1
   is what makes it buildable: a conversation registry over `Conversation` handles, addressed from the
   `forceCompression` control arm.
5. `preserve_recent_turns: 0` is accepted by the schema and leaves the conversation with no verbatim tail.
   It is not clamped, because `REQ-CONFIG-132` states its range and 0 is inside it.
