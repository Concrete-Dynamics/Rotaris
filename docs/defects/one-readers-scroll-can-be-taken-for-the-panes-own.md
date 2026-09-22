## A reader's scroll that lands after the pane's own pin is taken for the pane's

`TranscriptPane` tells its own scrolls apart from the reader's with one boolean:

```ts
if (programmatic.current) { programmatic.current = false; return; }
```

The flag is set immediately before the pane pins itself to the bottom (`el.scrollTop = el.scrollHeight`,
REQ-CHAT-070) and is cleared by **the next scroll event, whoever caused it**. A scroll event carries no
origin, so a reader's scroll arriving between the pin and the pin's own event is consumed as the pane's:
`setFollowing` is not called, the follow is not released, and the pane pins again on its next render.

For a wheel or trackpad gesture this is one swallowed event out of many and the next one releases the
follow, which is why it has not been reported as a product complaint. It is nonetheless a real ambiguity,
and it is decisive for anything that scrolls once and expects it to hold: the capture seam's click steps
scrolled a row into view and found it back above the viewport two frames later, every time, until they
were made to nudge repeatedly (`releaseProbe` in `apps/desktop/src/main/capture/host.ts`).

## Specs

`REQ-CHAT-070` fixes the following behaviour and `REQ-CHAT-072` the unseen count that depends on it. Neither
says how the pane is to tell its own scroll from the reader's — the flag is an implementation choice, and the
requirement it serves ("only movement the reader causes may change it") is the one it can get wrong in this
window. No requirement is contradicted by the code as written; what is recorded here is that the mechanism
answers wrongly for one class of event and nothing detects it.

## Relevant files

- `packages/ui/src/transcript/TranscriptPane.tsx` — `programmatic`, `onScroll`, and the pin effect that sets
  the flag before scrolling.
- `apps/desktop/src/main/capture/host.ts` — `releaseProbe`, which works around it by nudging until the pane
  publishes `data-following="0"`.

Noticed 2026-09-22 while repairing the two driven transcript proofs, where it presented as a click landing
on nothing. Recorded rather than repaired: distinguishing the two origins properly (a sequence number, or
comparing against the position the pane itself set) is a change to how following is decided, and wants its
own evidence.
