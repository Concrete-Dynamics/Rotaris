## The driver's `type` and the capture seams' TYPE steps send a newline as a character

The capture seam's typed prompt dropped every `\n` because it sent each character as one `char` event, and a `\n` sent
that way inserts nothing in the composer (live-run finding H-e, repaired in
[`the-capture-seam-drops-newlines-from-a-typed-prompt.md`](the-capture-seam-drops-newlines-from-a-typed-prompt.md)).
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

## Outcome

Repaired 2026-09-29 under R-067. Confirmed first in the built app, before the repair: the text `first line\nsecond
line\nthird line`, typed into the composer without a submit, arrived as `first linesecond linethird line` through all
three sites. The driver's `type`, `ROTARIS_CAPTURE_TYPE` with `>>no-enter`, and `ROTARIS_CAPTURE_TYPE_AT` each lost both
breaks. None of them submitted early.

`capture/probe.ts` now has `textEvents(text, per)`, the one place a typed line break is decided. A `\n` is Shift+Enter
(`keyDown`, `char`, `keyUp`, each with `shift`), which REQ-CHAT-001 makes the composer's newline and never its submit. A
`\r` is dropped. `per` keeps each site's own shape for an ordinary character: `char` for the prompt and the TYPE seam,
`keyDown`/`char`/`keyUp` for the driver and TYPE_AT. `submitEvents` adds the one unmodified Enter. `promptEvents` is now
`submitEvents(prompt, 'char')`, with the same events as before. The driver's `type` and both seams now send these
events. A text with no line break sends exactly the events it sent before.

Pinned by two cases in `driver.test.ts`, three in `capture/seams.test.ts` (both files fail on the old code) and two in
`capture/probe.test.ts`. After the repair, the same three built-app launches left `first line\nsecond line\nthird line`
in the composer, with nothing submitted. `driver-proof`, `palette-proof`, `slash-proof` and `workspace-proof` passed on
the repaired build. `part-j-proof` went red once, in its steer-rest launch, where the Pause press raced the Steer press
(recorded as `part-j-proofs-steer-rest-presses-pause-as-soon-as-the-run-starts.md`). Its typed text has no line break,
so it sent the same events as before. The proof passed when re-run alone.
