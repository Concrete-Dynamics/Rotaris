# ADR-0048 — Windows, views and the three modality levels — Consequences accepted

Part 5 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

## Consequences accepted

1. Several renderer processes, with their memory cost; **application-modality is our code** and must be
   tested across windows; a visibility signal threaded through every surface.
2. Windows created and destroyed immediately must not deliver deferred offers, so **every deferred timer
   is owned by the window registry and cancelled on close** (ADR-0055).
3. The acknowledgement stack is per window and is not the notice store (ADR-0049).
