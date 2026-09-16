## A staging failure escapes `replaceAtomically`'s one declared failure shape

`tools/symbol-artifact/replace.mjs` documents exactly one way to fail: *"@throws {Error} on exhaustion,
naming the code and the attempts, with `target` left exactly as it stood"* — the sentence
`<name> could not be replaced (<code> after <n> attempt(s)); it was left exactly as it stood`.

The staging write sat **before** the retry loop and outside its `try`, so a refusal of the staging write
left the function as a raw `fs` error: `EACCES: permission denied, open '<dir>/.requirements.ts.staging-…'`.
That is a second failure shape, it names an internal file the caller never asked about, and it says nothing
about whether the artifact survived.

The condition is not exotic and it is the same condition the ladder exists for. On Windows the contended
replacement is refused at the **rename**, against an open handle (constraint D-06). On a POSIX host a
write-denied parent refuses the **staging write** first, and no POSIX permission can deny the rename while
allowing a write into the same directory — so on Linux and macOS the ladder was unreachable and the raw
error was the only outcome.

`packages/platform/src/document.ts` is **not** the same defect and is not repaired: `replaceDocument`
declares `document.stage`, `document.replace` and `document.parent` as three separate outcomes on purpose,
and a staging refusal reaching `document.stage` is that function behaving as specified.

## Specs

- `REQ-TRACE-061` — the retry ladder, and the recoverable refusal that names it.
- `REQ-TRACE-502` — the artifact is replaced whole or not at all; a reader never observes a partial one.

## Relevant files

- `tools/symbol-artifact/replace.mjs` — `replaceAtomically`; the staging write now sits inside the ladder.
- `tools/symbol-artifact/replace.test.ts` — the contended-replacement proof, which installs a real refusal
  (an open descriptor on Windows, a write-denied parent elsewhere) and which was red on Linux.
- `packages/platform/src/document.ts` — the primitive that is correct as it stands, for contrast.
- `packages/engine/src/session-actions.test.ts` — A9's destination-failure proof, which now says which of
  the two refusals it installed rather than assuming the Windows one.
