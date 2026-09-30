## The capture seam drops every newline from the prompt it types

The capture seam types the prompt into the composer one `char` input event per character. A `\n` sent that way is
not a line break in the composer, so a multi-line prompt reaches the model with its lines run together. The duress
prompt is built with `join('\n')`, and the model received "in order,each waiting", "the other fivetouched", "what it
checked,what it found".

Live-run finding: H-e (live runs of 2026-09-29)

## Specs

- None; the capture seam is a test harness inside the product (`apps/desktop/src/main/capture/`). Every proof that
  types a multi-line prompt through it is affected.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`: transcript row 0 and traffic #1 carry the joined lines.

## Relevant files

- `apps/desktop/src/main/capture/probe.ts:32` — `for (const ch of prompt) wc.sendInputEvent({ type: 'char', keyCode: ch })`.
- `apps/desktop/scripts/live-run.mjs:1819-1841` — the duress prompt, joined with `'\n'`.

## Outcome

Repaired 2026-09-29 under R-067. `promptEvents` in `apps/desktop/src/main/capture/probe.ts` types a line break the way
the composer receives a typed one: REQ-CHAT-001's Shift+Enter, sent as `keyDown`, `char` and `keyUp`, each carrying
`shift`. That inserts a newline and never submits. A `\r` is dropped, and the one unmodified Enter at the end
submits. Pinned by `apps/desktop/src/main/capture/probe.test.ts` ("the capture seam types a multi-line prompt as a person
types it"). The tests check that no event carries a bare `\n`, that no unmodified Enter precedes the last line, that a
CRLF prompt equals an LF one, and that `installPromptSeam` sends exactly these events after Ctrl+2 and Ctrl+L.

The built app shows it with the scripted model: a five-line prompt holding a blank line, leading spaces and an em
dash, typed through `ROTARIS_CAPTURE_PROMPT`. It arrived as transcript row 0 character for character, and the launch
recorded one session, so nothing was submitted early.
