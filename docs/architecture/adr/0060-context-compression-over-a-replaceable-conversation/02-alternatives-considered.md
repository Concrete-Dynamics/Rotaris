# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing — Alternatives considered

Part 2 of 11 of [ADR-0060](../0060-context-compression-over-a-replaceable-conversation.md), which indexes every part.

## Alternatives considered

**A — Mutate the array in place.** `messages.splice(0, n, ...rebuilt)` at the moment compression finishes.
*Against:* the same array reference is already inside `backend.runTurn` for a call in flight
(`turn.ts`'s `step` passes `messages` straight through), so a replacement can rewrite a request body while
it is being serialised. The defect would be intermittent, provider-dependent and nearly untestable. This
also makes §10's manual path — which by `REQ-MONITOR-092` compresses live conversations concurrently —
unbuildable without revisiting the same seam.

**B — Compress between turns only.** Let a turn finish, condense `history`, start the next turn from it.
*Against:* `REQ-MONITOR-076` compresses "when a new model call is about to be made", and a turn is many
model calls; a tool loop that grows past the window inside one turn would never compress. `REQ-ORCH-093`'s
retry is per **call**, not per turn.

**C — A `Conversation` object whose array is swapped, never mutated.** The turn holds one; every step takes
a `snapshot()`; a replacement installs a new array, so an in-flight request keeps the one it was given and
the next step sees the new one. Chosen.
