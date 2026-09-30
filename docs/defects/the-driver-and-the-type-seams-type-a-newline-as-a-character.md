## The driver's `type` and the capture seams' TYPE steps send a newline as a character

The capture seam's typed prompt dropped every `\n` because it sent each character as one `char` event, and a `\n` sent
that way inserts nothing in the composer (live-run finding H-e, repaired in
[`fixed/the-capture-seam-drops-newlines-from-a-typed-prompt.md`](fixed/the-capture-seam-drops-newlines-from-a-typed-prompt.md)).
Three other typing sites send text the same way and were left as they are, because they were outside that repair's scope:

- the driver's `type` operation (`pnpm app:drive`) sends `keyDown`, `char` and `keyUp` per character, so a `\n` goes out
  as a `keyDown` whose key code is `\n`;
- the `ROTARIS_CAPTURE_TYPE` seam sends one `char` per character, which is exactly the shape H-e measured;
- the `ROTARIS_CAPTURE_TYPE_AT` seam sends `keyDown`, `char` and `keyUp` per character.

A multi-line text typed through any of them is expected to lose its line breaks, or, where the `keyDown` of `\n` is
taken as Enter, to submit early. Neither outcome has been measured at these three sites. No proof in the repository
types a multi-line text through them today (the `;;`/`@` step grammar makes one awkward to write), so no run has been
affected yet. The repaired `promptEvents` (`capture/probe.ts`) is the shape to adopt.

Noticed 2026-09-29 while repairing H-e under R-067.

## Specs

- REQ-CHAT-001 (Enter submits, Shift+Enter inserts a newline), which these verification seams should type through
  as a person does. They are harness seams, not product behaviour.

## Relevant files

- `apps/desktop/src/main/driver.ts`: the `type` case, `keyDown`/`char`/`keyUp` per character.
- `apps/desktop/src/main/capture/seams.ts`: `ROTARIS_CAPTURE_TYPE` (one `char` per character) and
  `ROTARIS_CAPTURE_TYPE_AT` (`keyDown`/`char`/`keyUp` per character).
- `apps/desktop/src/main/capture/probe.ts`: `promptEvents`, the repaired shape.
